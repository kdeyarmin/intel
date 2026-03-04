import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const batches = await base44.asServiceRole.entities.ImportBatch.filter({ status: { $in: ['failed', 'paused', 'processing', 'validating'] } }, '-created_date', 50);

        const results = [];
        
        for (const batch of batches) {
            // Cancel it
            await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                status: 'cancelled',
                cancel_reason: 'Manual force restart'
            });

            // Start new one
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
                    retry_tags: ['manual-force-restart']
                });
            }
            results.push(batch.id);
        }

        return Response.json({ success: true, restarted: results.length, batches: results });
    } catch (e) {
        return Response.json({ error: e.message }, { status: 500 });
    }
});