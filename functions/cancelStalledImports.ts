import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const STALL_THRESHOLD_HOURS = 1;
const MAX_AUTO_RETRIES = 2;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const thresholdHours = payload.threshold_hours || STALL_THRESHOLD_HOURS;
    const thresholdMs = thresholdHours * 60 * 60 * 1000;
    const now = Date.now();

    // Fetch all batches stuck in validating or processing
    const [validating, processing] = await Promise.all([
      base44.asServiceRole.entities.ImportBatch.filter({ status: 'validating' }, '-created_date', 100),
      base44.asServiceRole.entities.ImportBatch.filter({ status: 'processing' }, '-created_date', 100),
    ]);

    const stalledBatches = [...validating, ...processing].filter(batch => {
      const lastActivity = new Date(batch.updated_date || batch.created_date).getTime();
      return (now - lastActivity) > thresholdMs;
    });

    if (stalledBatches.length === 0) {
      return Response.json({ success: true, cancelled: 0, message: 'No stalled imports found.' });
    }

    const results = [];

    for (const batch of stalledBatches) {
      const retryCount = batch.retry_count || 0;

      if (retryCount >= MAX_AUTO_RETRIES) {
        // Already retried enough — mark as failed permanently
        await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
          status: 'failed',
          cancelled_at: new Date().toISOString(),
          cancel_reason: `Auto-failed: stalled in "${batch.status}" after ${retryCount} retries. Exceeded max auto-retries (${MAX_AUTO_RETRIES}).`,
          error_samples: [
            ...(batch.error_samples || []),
            { message: `Stalled timeout: batch was stuck in "${batch.status}" for over ${thresholdHours}h with ${retryCount} prior retries` }
          ],
        });

        // Create error report
        try {
          await base44.asServiceRole.entities.ErrorReport.create({
            error_type: 'import_failure',
            severity: 'high',
            source: batch.id,
            title: `Import stalled & failed: ${batch.import_type}`,
            description: `Batch was stuck in "${batch.status}" for over ${thresholdHours}h and exceeded ${MAX_AUTO_RETRIES} auto-retries. Manual intervention required.`,
            error_samples: [{ message: `Stalled in ${batch.status}`, retries: retryCount }],
            context: {
              import_type: batch.import_type,
              file_name: batch.file_name,
              batch_id: batch.id,
              imported_rows: batch.imported_rows,
              total_rows: batch.total_rows,
            },
            status: 'new',
          });
        } catch (e) {
          console.error('Failed to create error report:', e.message);
        }

        results.push({
          id: batch.id,
          import_type: batch.import_type,
          action: 'failed',
          retry_count: retryCount,
        });
      } else {
        // Auto-retry: mark as failed first, then re-trigger
        const newRetryCount = retryCount + 1;
        await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
          status: 'failed',
          cancel_reason: `Auto-cancelled (stalled in "${batch.status}" for ${thresholdHours}h). Will auto-retry (attempt ${newRetryCount}/${MAX_AUTO_RETRIES}).`,
        });

        // Create a new retry batch
        try {
          await base44.asServiceRole.entities.ImportBatch.create({
            import_type: batch.import_type,
            file_name: batch.file_name,
            file_url: batch.file_url,
            status: 'validating',
            dry_run: batch.dry_run || false,
            retry_of: batch.id,
            retry_count: newRetryCount,
            retry_params: {
              mode: 'full',
              auto_retry: true,
              previous_imported: batch.imported_rows || 0,
            },
            tags: [...(batch.tags || []), 'auto-retry'],
            category: batch.category,
          });

          // Trigger the import (fire-and-forget via service role)
          try {
            base44.asServiceRole.functions.invoke('autoImportCMSData', {
              import_type: batch.import_type,
              file_url: batch.file_url,
              year: new Date().getFullYear(),
              dry_run: batch.dry_run || false,
            }).catch(() => {});
          } catch (triggerErr) {
            console.error(`Failed to trigger retry for ${batch.id}:`, triggerErr.message);
          }
        } catch (createErr) {
          console.error(`Failed to create retry batch for ${batch.id}:`, createErr.message);
        }

        results.push({
          id: batch.id,
          import_type: batch.import_type,
          action: 'retried',
          retry_count: newRetryCount,
        });
      }
    }

    const retriedCount = results.filter(r => r.action === 'retried').length;
    const failedCount = results.filter(r => r.action === 'failed').length;

    return Response.json({
      success: true,
      total_stalled: stalledBatches.length,
      retried: retriedCount,
      permanently_failed: failedCount,
      details: results,
      message: `Found ${stalledBatches.length} stalled: ${retriedCount} retried, ${failedCount} permanently failed.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});