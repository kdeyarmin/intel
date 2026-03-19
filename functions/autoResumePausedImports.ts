import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Check for paused batches
    const pausedBatches = await base44.asServiceRole.entities.ImportBatch.filter(
        { status: 'paused' }, 
        '-updated_date', 
        50
    );

    const resumed = [];
    const errors = [];

    for (const batch of pausedBatches) {
      if (batch.import_type === 'nppes_registry') {
          // NPPES crawler has its own resume logic, skip here
          continue;
      }

      // We only auto-resume if it paused due to limits (which means it has a resume_offset or row_offset)
      const params = batch.retry_params || {};
      const offset = params.resume_offset !== undefined ? params.resume_offset : params.row_offset;
      
      if (offset !== undefined) {
         try {
             // Auto resume it using triggerImport
             await base44.asServiceRole.functions.invoke('triggerImport', {
                import_type: batch.import_type,
                file_url: batch.file_url,
                year: batch.data_year,
                dry_run: batch.dry_run,
                resume_offset: offset,
                row_offset: offset,
                batch_id: batch.id,
             });
             resumed.push({ id: batch.id, type: batch.import_type, offset });
         } catch (err) {
             errors.push({ id: batch.id, error: err.message });
         }
      }
    }

    return Response.json({ success: true, resumed_count: resumed.length, resumed, errors });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});