import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const schedules = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ is_active: true });
    const now = new Date();
    const triggered = [];

    for (const schedule of schedules) {
      const nextRun = schedule.next_run_at ? new Date(schedule.next_run_at) : null;

      if (!nextRun || nextRun <= now) {
        // Trigger the import
        try {
          await base44.asServiceRole.functions.invoke('autoImportCMSData', {
            import_type: schedule.import_type,
            file_url: schedule.api_url,
            year: now.getFullYear(),
            dry_run: false,
          });
          triggered.push(schedule.import_type);
        } catch (err) {
          console.error(`Failed to run import for ${schedule.import_type}:`, err.message);
        }

        // Calculate next run
        const nextRunDate = new Date(now);
        const [hours, minutes] = (schedule.schedule_time || '02:00').split(':').map(Number);

        if (schedule.schedule_frequency === 'daily') {
          nextRunDate.setDate(nextRunDate.getDate() + 1);
        } else if (schedule.schedule_frequency === 'weekly') {
          nextRunDate.setDate(nextRunDate.getDate() + 7);
        } else if (schedule.schedule_frequency === 'monthly') {
          nextRunDate.setMonth(nextRunDate.getMonth() + 1);
        }
        nextRunDate.setHours(hours, minutes, 0, 0);

        await base44.asServiceRole.entities.ImportScheduleConfig.update(schedule.id, {
          last_run_at: now.toISOString(),
          next_run_at: nextRunDate.toISOString(),
        });
      }
    }

    return Response.json({ success: true, triggered, checked: schedules.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});