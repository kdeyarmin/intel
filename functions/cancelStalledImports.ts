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
      return Response.json({ success: true, cancelled: 0, message: 'No stalled imports found.' });
    }

    const cancelledIds = [];
    const cancelTimestamp = new Date().toISOString();

    for (const batch of stalledBatches) {
      await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
        status: 'cancelled',
        cancelled_at: cancelTimestamp,
        cancel_reason: `Auto-cancelled: stalled in "${batch.status}" for over ${thresholdHours} hour(s) with no activity`,
      });
      cancelledIds.push({
        id: batch.id,
        import_type: batch.import_type,
        file_name: batch.file_name,
        status_was: batch.status,
        last_activity: batch.updated_date || batch.created_date,
      });
    }

    // Notify admins
    const allUsers = await base44.asServiceRole.entities.User.list();
    const admins = allUsers.filter(u => u.role === 'admin');

    const batchList = cancelledIds.map((b, i) =>
      `${i + 1}. ${b.import_type} - "${b.file_name}" (was ${b.status_was}, last activity: ${new Date(b.last_activity).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET)`
    ).join('\n');

    for (const admin of admins) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        from_name: 'CareMetric Lead Discovery',
        to: admin.email,
        subject: `[AUTO] ${cancelledIds.length} Stalled Import(s) Cancelled`,
        body: `The following import batch(es) were automatically cancelled after being stalled for over ${thresholdHours} hour(s):\n\n${batchList}\n\nThese jobs had no progress updates within the timeout window. You may retry them from the Import Monitoring page.\n\n---\nAutomated notification from CareMetric Lead Discovery.`,
      });
    }

    return Response.json({
      success: true,
      cancelled: cancelledIds.length,
      notified_admins: admins.length,
      details: cancelledIds,
      message: `Cancelled ${cancelledIds.length} stalled import(s), notified ${admins.length} admin(s).`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});