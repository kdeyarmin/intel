import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Find failed NPPES batches
        // Only look for nppes_registry type
        const failedBatches = await base44.asServiceRole.entities.ImportBatch.filter({ 
            import_type: 'nppes_registry', 
            status: 'failed' 
        }, '-updated_date', 100);

        const now = Date.now();
        const COOL_OFF_MS = 60 * 60 * 1000; // 1 hour
        const MAX_RETRIES = 3;

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
                    
                    await base44.asServiceRole.entities.ErrorReport.create({
                        title: 'State Crawl Escalated',
                        description: `State crawler batch ${batch.file_name} repeatedly failed after ${retryCount} automated retry attempts. Manual review required.`,
                        source: batch.id,
                        error_type: 'system_error',
                        severity: 'high',
                        status: 'new',
                        context: {
                            batch_id: batch.id,
                            file_name: batch.file_name,
                            retry_count: retryCount
                        }
                    });
                    
                    // Mark batch as requiring manual intervention if possible, or just leave as failed
                    // We can add a tag or update cancel_reason
                    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                        cancel_reason: `Escalated to manual review after ${retryCount} failed retries.`,
                        tags: [...(batch.tags || []), 'manual_review_required']
                    });

                    escalatedCount++;
                }
            }
        }
        
        // If we retried any, trigger the worker
        if (retriedCount > 0) {
            base44.asServiceRole.functions.invoke('nppesCrawler', { action: 'process_queue' }).catch(()=>{});
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