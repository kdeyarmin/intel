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

        // 1. Find failed/paused imports
        const failedBatches = await base44.asServiceRole.entities.ImportBatch.filter({
            status: { $in: ['failed', 'paused'] },
            created_date: { $gte: twentyFourHoursAgo }
        }, '-created_date', 20);

        // 2. Find stalled processing imports
        const stalledBatches = await base44.asServiceRole.entities.ImportBatch.filter({
            status: { $in: ['processing', 'validating'] },
            updated_date: { $lte: oneHourAgo },
            created_date: { $gte: twentyFourHoursAgo }
        }, '-created_date', 20);

        const allBatches = [...failedBatches, ...stalledBatches];
        const results = [];

        for (const batch of allBatches) {
            // Check recent retries to prevent infinite loops
            const recentSimilarBatches = await base44.asServiceRole.entities.ImportBatch.filter({
                import_type: batch.import_type,
                file_url: batch.file_url || null,
                created_date: { $gte: twentyFourHoursAgo }
            });

            if (recentSimilarBatches.length > 4) {
                results.push({ batch_id: batch.id, action: 'skipped', reason: 'Too many recent attempts for this import type/file' });
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
                        await base44.asServiceRole.functions.invoke('triggerImport', {
                            import_type: batch.import_type,
                            file_url: batch.file_url,
                            file_name: batch.file_name
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

        return Response.json({ success: true, processed: allBatches.length, results });

    } catch (error) {
        console.error('Import bot error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});