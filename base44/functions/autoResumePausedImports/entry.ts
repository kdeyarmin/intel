import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Auto-resume bound: don't keep resuming the same batch indefinitely if every
// resume immediately re-pauses or fails.
const MAX_AUTO_RESUMES = 5;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow service role calls (from scheduled automations) or admin users.
    let user = null;
    try { user = await base44.auth.me(); } catch (_e) { /* service role */ }
    const isService = user && user.email && user.email.includes('service+');
    if (user && user.role !== 'admin' && !isService) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Check for paused batches
    const pausedBatches = await base44.asServiceRole.entities.ImportBatch.filter(
        { status: 'paused' },
        '-updated_date',
        50
    );

    const resumed = [];
    const errors = [];
    const skipped = [];

    for (const batch of pausedBatches) {
      if (batch.import_type === 'nppes_registry') {
          // NPPES crawler has its own resume logic, skip here
          continue;
      }

      // Cap auto-resumes per batch so a chronically-failing batch doesn't burn
      // through API/LLM credits in a tight loop.
      const autoResumeCount = batch.retry_params?.auto_resume_count || 0;
      if (autoResumeCount >= MAX_AUTO_RESUMES) {
          skipped.push({ id: batch.id, reason: `Reached max auto-resume attempts (${MAX_AUTO_RESUMES})` });
          continue;
      }

      // We only auto-resume if it paused due to limits (which means it has a resume_offset or row_offset)
      const params = batch.retry_params || {};
      const offset = params.resume_offset !== undefined ? params.resume_offset : params.row_offset;

      if (offset !== undefined) {
         try {
             // Stamp the auto-resume counter before invoking so the cap holds even
             // if the resume itself triggers a fresh pause.
             await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                retry_params: { ...params, auto_resume_count: autoResumeCount + 1 },
             });
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
             resumed.push({ id: batch.id, type: batch.import_type, offset, attempt: autoResumeCount + 1 });
         } catch (err) {
             errors.push({ id: batch.id, error: err.message });
         }
      }
    }

    return Response.json({ success: true, resumed_count: resumed.length, resumed, errors, skipped });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});