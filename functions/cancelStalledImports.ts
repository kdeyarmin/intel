import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const STALL_THRESHOLD_HOURS = 2;

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
      return Response.json({ success: true, retried: 0, message: 'No stalled imports found.' });
    }

    const retriedBatches = [];

    for (const batch of stalledBatches) {
      const retryCount = (batch.retry_count || 0) + 1;

      // Reset the batch back to validating so the import pipeline picks it up again
      await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
        status: 'validating',
        retry_count: retryCount,
        cancel_reason: `Auto-retried (attempt ${retryCount}): was stalled in "${batch.status}" for over ${thresholdHours} hour(s)`,
      });

      retriedBatches.push({
        id: batch.id,
        import_type: batch.import_type,
        file_name: batch.file_name,
        status_was: batch.status,
        retry_count: retryCount,
      });
    }

    return Response.json({
      success: true,
      retried: retriedBatches.length,
      details: retriedBatches,
      message: `Retried ${retriedBatches.length} stalled import(s).`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});