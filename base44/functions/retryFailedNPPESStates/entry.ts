import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Fetch crawler config
        const configs = await base44.asServiceRole.entities.NPPESCrawlerConfig.filter({ config_key: 'default' });
        const config = configs[0] || {};
        
        // Check if auto-retry is enabled
        if (config.auto_retry_enabled === false) {
            return Response.json({ success: true, message: 'Auto-retry is disabled in crawler settings.' });
        }

        // Find failed NPPES batches
        const failedBatches = await base44.asServiceRole.entities.ImportBatch.filter({ 
            import_type: 'nppes_registry', 
            status: 'failed' 
        }, '-updated_date', 100);

        const now = Date.now();
        const COOL_OFF_MS = (config.retry_delay_minutes || 60) * 60 * 1000;
        const MAX_RETRIES = config.retry_escalation_threshold || 3;
        const escalationTags = config.escalation_tags || ['manual_review_required'];

        let retriedCount = 0;
        let escalatedCount = 0;

        for (const batch of failedBatches) {
            // Check if batch was updated recently (cool-off)
            const batchUpdated = new Date(batch.updated_date).getTime();
            if (now - batchUpdated < COOL_OFF_MS) continue;

            const retryCount = batch.retry_count || 0;

            if (retryCount < MAX_RETRIES) {
                console.log(`Retrying batch ${batch.id} (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                
                // Find failed items for this batch
                const failedItems = await base44.asServiceRole.entities.NPPESQueueItem.filter({
                    batch_id: batch.id,
                    status: 'failed'
                }, undefined, 1000);

                // If no failed items found, maybe we should retry pending ones that got stuck?
                // But normally a failed batch has failed items.
                // If the batch failed due to timeout/stall, items might still be pending/processing.
                
                const itemsToRetry = failedItems.length > 0 ? failedItems : 
                    await base44.asServiceRole.entities.NPPESQueueItem.filter({
                        batch_id: batch.id,
                        status: { $in: ['pending', 'processing', 'paused'] }
                    }, undefined, 1000);

                if (itemsToRetry.length > 0) {
                    // Reset items to pending
                    // Process in chunks of 50
                    for (let i = 0; i < itemsToRetry.length; i += 50) {
                        const chunk = itemsToRetry.slice(i, i + 50);
                        await Promise.all(chunk.map(item => 
                            base44.asServiceRole.entities.NPPESQueueItem.update(item.id, { 
                                status: 'pending',
                                retry_count: 0,
                                error_message: null
                            })
                        ));
                    }

                    // Update batch status to processing and increment retry count
                    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                        status: 'processing',
                        retry_count: retryCount + 1,
                        cancel_reason: null // Clear cancel reason
                    });
                    
                    retriedCount++;
                }
            } else {
                // Check if already escalated
                const existingErrors = await base44.asServiceRole.entities.ErrorReport.filter({
                    source: batch.id,
                    title: 'State Crawl Escalated'
                });

                if (existingErrors.length === 0) {
                    console.log(`Escalating batch ${batch.id} to manual review`);
                    
                    let aiSummary = "No AI analysis available.";
                    try {
                        const errorDetails = (batch.error_samples || []).slice(0, 10).map(e => `[${e.phase || 'unknown'}] ${e.message || e.detail || 'No detail'}`).join('\n');
                        const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
                            prompt: `Analyze this failed import batch. Batch: ${batch.file_name}\nErrors: ${errorDetails}\n\nCategorize the failure type (e.g., rate limit, data format issue, stalled process), suggest actionable fixes, and identify any common data formatting issues (e.g., incorrect date formats, invalid zip codes) with suggested data cleaning steps. Be concise.`
                        });
                        aiSummary = typeof res === 'string' ? res : (res.text || JSON.stringify(res));
                    } catch (err) {
                        console.error("AI Analysis failed during escalation:", err);
                    }
                    
                    await base44.asServiceRole.entities.ErrorReport.create({
                        title: 'State Crawl Escalated',
                        description: `State crawler batch ${batch.file_name} repeatedly failed after ${retryCount} automated retry attempts. Manual review required.\n\nAI Analysis:\n${aiSummary}`,
                        source: batch.id,
                        error_type: 'system_error',
                        severity: 'high',
                        status: 'new',
                        error_samples: batch.error_samples || [],
                        context: {
                            batch_id: batch.id,
                            file_name: batch.file_name,
                            retry_count: retryCount
                        }
                    });
                    
                    // Mark batch as requiring manual intervention
                    const newTags = new Set([...(batch.tags || []), ...escalationTags]);
                    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                        cancel_reason: `Escalated to manual review after ${retryCount} failed retries.`,
                        tags: Array.from(newTags)
                    });

                    escalatedCount++;
                }
            }
        }
        
        // If we retried any, trigger the worker (but respect stop flag)
        if (retriedCount > 0) {
            const latestConfigs = await base44.asServiceRole.entities.NPPESCrawlerConfig.filter({ config_key: 'default' });
            if (!latestConfigs[0]?.crawler_stopped) {
                base44.asServiceRole.functions.invoke('nppesCrawler', { action: 'process_queue' }).catch(e => console.error('[retryFailedNPPESStates] Failed to invoke crawler:', e.message));
            } else {
                console.log('[retryFailedNPPESStates] Crawler stop flag is set, not invoking worker.');
            }
        }

        return Response.json({ 
            success: true, 
            retried: retriedCount, 
            escalated: escalatedCount,
            message: `Retried ${retriedCount} batches, escalated ${escalatedCount} to manual review.` 
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});