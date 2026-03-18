import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const payload = await req.json();
        const { event } = payload;
        
        if (!event) return Response.json({ message: 'No event data' });

        // Find recent failed imports (limit to 10 most recent)
        const failedBatches = await base44.asServiceRole.entities.ImportBatch.filter({
             status: 'failed',
        }, '-created_date', 10);
        
        const retried = [];
        for (const batch of failedBatches) {
            const errorSamples = batch.error_samples || [];
            
            // Check if failure involved 'missing_category' error
            const hasMissingCategory = errorSamples.some(e => e.rule === 'missing_category' || e.detail?.includes('missing_category'));
            
            if (hasMissingCategory) {
                 await base44.asServiceRole.functions.invoke('triggerImport', {
                     import_type: batch.import_type,
                     file_url: batch.file_url,
                     retry_of: batch.id
                 });
                 
                 // Update batch to indicate it was auto-retried
                 await base44.asServiceRole.entities.ImportBatch.update(batch.id, { 
                     notes: `Auto-retried due to new ${event.entity_name} creation` 
                 });
                 retried.push(batch.id);
            }
        }
        
        return Response.json({ success: true, retried });
    } catch (error) {
        console.error('Error in onRuleCreated:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});