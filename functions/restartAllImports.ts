import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const urlPrefix = `https://${req.headers.get("host")}/api/v1/functions`;
    
    // fetch all non-completed
    let allBatches = [];
    let hasMore = true;
    let skip = 0;
    while(hasMore) {
        const res = await base44.asServiceRole.entities.ImportBatch.filter({ status: { $ne: 'completed' } }, '-created_date', 50, skip);
        allBatches.push(...res);
        if (res.length < 50) hasMore = false;
        skip += 50;
    }
    
    let deletedCount = 0;
    let restartedCount = 0;
    let hasNppes = false;
    
    for (const batch of allBatches) {
        try {
            if (batch.import_type === 'nppes_registry') {
                hasNppes = true;
                
                // Set related queue items to pending so they can be re-run
                const qItems = await base44.asServiceRole.entities.NPPESQueueItem.filter({ batch_id: batch.id });
                for (const q of qItems) {
                    await base44.asServiceRole.entities.NPPESQueueItem.update(q.id, {
                        status: 'pending',
                        error_message: null
                    });
                }
                
                // Do not delete the NPPES batch if it has queue items attached, just change it back to processing
                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    status: 'processing',
                    cancel_reason: null,
                    cancelled_at: null
                });
                restartedCount++;
                continue; // Skip deletion for NPPES to preserve the batch_id link
            } else if (batch.file_url) {
                // restart regular ones
                const resumeOffset = batch.retry_params?.resume_offset || batch.retry_params?.row_offset || batch.imported_rows || 0;
                await fetch(`${urlPrefix}/triggerImport`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.get('authorization') },
                    body: JSON.stringify({
                        import_type: batch.import_type,
                        file_url: batch.file_url,
                        year: batch.data_year,
                        resume_offset: resumeOffset,
                        retry_tags: ['manual-force-restart']
                    })
                });
            }
            
            // Delete the regular batch
            await base44.asServiceRole.entities.ImportBatch.delete(batch.id);
            deletedCount++;
            restartedCount++;
        } catch (e) {
            console.error("Error processing batch", batch.id, e);
        }
    }
    
    if (hasNppes) {
        await fetch(`${urlPrefix}/nppesCrawler`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.get('authorization') },
            body: JSON.stringify({ action: 'process_queue' })
        });
    }
    
    return Response.json({ success: true, deletedCount, restartedCount });
});