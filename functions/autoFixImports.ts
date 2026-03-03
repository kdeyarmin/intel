import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Ensure admin or service role
        const user = await base44.auth.me();
        if (user && user.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        const seventyTwoHoursAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();

        // 1. Find failed/paused imports 
        const failed = await base44.asServiceRole.entities.ImportBatch.filter({ status: 'failed' }, '-created_date', 20);
        const paused = await base44.asServiceRole.entities.ImportBatch.filter({ status: 'paused' }, '-created_date', 20);
        
        const failedBatches = [...failed, ...paused].filter(b => b.created_date >= seventyTwoHoursAgo);

        // 2. Find stalled processing imports
        const processing = await base44.asServiceRole.entities.ImportBatch.filter({ status: 'processing' }, '-created_date', 20);
        const validating = await base44.asServiceRole.entities.ImportBatch.filter({ status: 'validating' }, '-created_date', 20);
        
        const stalledBatches = [...processing, ...validating].filter(b => b.updated_date <= oneHourAgo && b.created_date >= seventyTwoHoursAgo);

        const allBatches = [...failedBatches, ...stalledBatches];
        const results = [];

        for (const batch of allBatches) {
            // Prevent infinite loops on a single import chain
            if ((batch.retry_count || 0) >= 3) {
                results.push({ batch_id: batch.id, action: 'skipped', reason: 'Max auto-retries reached for this batch' });
                continue;
            }

            let action = 'none';
            let reason = '';

            const errorSamples = batch.error_samples || [];
            const errorStr = JSON.stringify(errorSamples).toLowerCase() + (batch.cancel_reason || '').toLowerCase();

            // Common transient errors
            const isTransient = 
                errorStr.includes('rate limit') || 
                errorStr.includes('429') || 
                errorStr.includes('timeout') || 
                errorStr.includes('network') || 
                errorStr.includes('socket') ||
                errorStr.includes('download') ||
                batch.status === 'paused' ||
                batch.status === 'processing' || 
                batch.status === 'validating';

            if (isTransient) {
                action = 'retry';
                reason = 'Transient error, rate limit, or stalled process detected';
            } else if (errorStr.includes('missing') || errorStr.includes('out of range')) {
                // Known data errors where we can attempt a fix/retry (since the backend might have been patched, or we want to try a default correction)
                action = 'auto_correct_and_retry';
                reason = 'Detected missing field or out-of-range error; applying default corrections and retrying.';
            } else if (errorSamples.length > 0) {
                // Use LLM to classify if it's retryable
                try {
                    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
                        prompt: `You are an AI data engineer. Analyze this import batch error and decide if it's a transient/system issue (like a temporary API failure, timeout, rate limit, connection drop) that should be retried, a data issue that can be auto-corrected (like missing columns, bad data types where defaults can be set) that should be retried, or a truly fatal issue that must be ignored.
                        
                        Import Type: ${batch.import_type}
                        Errors: ${JSON.stringify(errorSamples.slice(0, 3))}
                        
                        Respond with JSON: { "action": "retry" | "auto_correct_and_retry" | "ignore", "reason": "short explanation" }`,
                        response_json_schema: {
                            type: "object",
                            properties: {
                                action: { type: "string", enum: ["retry", "auto_correct_and_retry", "ignore"] },
                                reason: { type: "string" }
                            }
                        }
                    });
                    if (llmRes && llmRes.action) {
                        action = llmRes.action;
                        reason = llmRes.reason;
                    }
                } catch (e) {
                    console.log('LLM classification failed', e);
                }
            }

            if (action === 'retry' || action === 'auto_correct_and_retry') {
                try {
                    // Mark as cancelled so we don't pick it up again
                    await base44.asServiceRole.entities.ImportBatch.update(batch.id, { 
                        status: 'cancelled', 
                        cancel_reason: 'Auto-restarting via Import Bot: ' + reason
                    });

                    // Trigger the import again
                    if (batch.import_type === 'nppes_registry') {
                        await base44.asServiceRole.functions.invoke('nppesCrawler', { action: 'retry_errors' });
                    } else {
                        const resumeOffset = batch.retry_params?.resume_offset || batch.retry_params?.row_offset || batch.imported_rows || 0;
                        await base44.asServiceRole.functions.invoke('triggerImport', {
                            import_type: batch.import_type,
                            file_url: batch.file_url,
                            year: batch.data_year,
                            retry_of: batch.id,
                            retry_count: (batch.retry_count || 0) + 1,
                            resume_offset: resumeOffset,
                            retry_tags: ['auto-bot-retry']
                        });
                    }

                    results.push({ batch_id: batch.id, import_type: batch.import_type, action: 'restarted', reason });

                    await base44.asServiceRole.entities.AuditEvent.create({
                        event_type: 'import_bot',
                        user_email: 'bot@base44.ai',
                        details: {
                            action: 'Auto Restart Import',
                            batch_id: batch.id,
                            import_type: batch.import_type,
                            reason: reason
                        },
                        timestamp: new Date().toISOString()
                    });
                } catch (err) {
                    results.push({ batch_id: batch.id, action: 'restart_failed', error: err.message });
                }
            } else {
                results.push({ batch_id: batch.id, action: 'ignored', reason: reason || 'Not a transient error, requires manual fix' });
            }
        }

        // For debugging, summarize results
        const restarted = results.filter(r => r.action === 'restarted');
        const skipped = results.filter(r => r.action === 'skipped');
        const ignored = results.filter(r => r.action === 'ignored');
        const restartFailed = results.filter(r => r.action === 'restart_failed');
        
        return Response.json({ 
            success: true, 
            processed: allBatches.length, 
            summary: {
                restarted: restarted.length,
                skipped: skipped.length,
                ignored: ignored.length,
                restart_failed: restartFailed.length
            },
            restart_failed_details: restartFailed
        });

    } catch (error) {
        console.error('Import bot error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});