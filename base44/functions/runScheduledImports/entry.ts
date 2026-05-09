import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const MAX_EXEC_MS = 45_000;

// #4 — process multiple schedules per invocation when they don't conflict
const MAX_SCHEDULES_PER_INVOCATION = 5;

// #8 — exponential backoff cap (consecutive failures): 1h, 2h, 4h, 8h, capped at 24h
const FAILURE_BACKOFF_CAP_HOURS = 24;

// #10 — schedule jitter: spread schedules within ±N minutes to avoid thundering herd
const SCHEDULE_JITTER_MINUTES = 15;

const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
    'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

// Non-conflicting import_type families. Schedules from the same family run sequentially,
// schedules from different families can run in parallel within one invocation.
function getImportFamily(importType: string): string {
    if (!importType) return 'unknown';
    if (importType === 'nppes_registry') return 'nppes';
    if (importType.startsWith('medicare_')) return 'medicare';
    if (importType.startsWith('hospice_')) return 'hospice';
    if (importType.startsWith('snf_') || importType.startsWith('nursing_home_')) return 'snf';
    if (importType.startsWith('home_health_')) return 'hha';
    return 'cms_other';
}

function jitterMs(maxMinutes: number): number {
    // Symmetric jitter in ±maxMinutes range
    const range = maxMinutes * 60_000;
    return Math.floor((Math.random() - 0.5) * 2 * range);
}

function backoffHours(consecutiveFailures: number): number {
    if (consecutiveFailures <= 0) return 0;
    return Math.min(Math.pow(2, consecutiveFailures - 1), FAILURE_BACKOFF_CAP_HOURS);
}

function computeNextRun(schedule, now: Date, failures: number): Date {
    const next = new Date(now);
    const [hours, minutes] = (schedule.schedule_time || '02:00').split(':').map(Number);

    if (schedule.schedule_frequency === 'daily') {
        next.setDate(next.getDate() + 1);
    } else if (schedule.schedule_frequency === 'weekly') {
        next.setDate(next.getDate() + 7);
    } else if (schedule.schedule_frequency === 'monthly') {
        next.setMonth(next.getMonth() + 1);
    } else if (schedule.schedule_frequency === 'on_completion') {
        // No regular cadence — the dependency check handles it. Set to a sentinel ~1h out.
        next.setHours(next.getHours() + 1);
        return next;
    }
    next.setHours(hours, minutes, 0, 0);

    // #8 — push out further on consecutive failures
    if (failures > 0) {
        next.setTime(next.getTime() + backoffHours(failures) * 60 * 60_000);
    }

    // #10 — jitter to spread same-time schedules.
    // Clamp to at least `now + minBuffer` so a negative jitter near midnight (or
    // any case where the computed time lands close to now) can't push next_run_at
    // into the past and cause the scheduler to immediately re-run the same job.
    next.setTime(next.getTime() + jitterMs(SCHEDULE_JITTER_MINUTES));
    const minNext = now.getTime() + 5 * 60_000; // 5 minute buffer
    if (next.getTime() < minNext) {
        next.setTime(minNext);
    }

    return next;
}

// #4 — check whether a schedule's `depends_on_import_type` parent has completed successfully
// since the last *successful* run of this schedule. Tracking the child's last successful
// run (rather than its last_run_at) means failed children can still retry — without this
// distinction, a single child failure would block all retries until the parent ran again.
function dependencyBlocked(schedule, allSchedules): { blocked: boolean; reason?: string } {
    if (!schedule.depends_on_import_type) return { blocked: false };
    const parent = allSchedules.find(s => s.import_type === schedule.depends_on_import_type);
    if (!parent) {
        return { blocked: true, reason: `Dependency import_type=${schedule.depends_on_import_type} not configured` };
    }
    if (!parent.last_run_at) {
        return { blocked: true, reason: `Waiting for parent ${parent.label} to run at least once` };
    }
    if (parent.last_run_status && parent.last_run_status !== 'success') {
        return { blocked: true, reason: `Parent ${parent.label} last run was ${parent.last_run_status}` };
    }
    // Compare against this schedule's last *successful* completion, not its last_run_at.
    // last_successful_run_at is set on success and left alone on failure, so the child can
    // still retry against the same parent run after a transient failure.
    const childLastSuccess = schedule.last_successful_run_at
        ? new Date(schedule.last_successful_run_at)
        : null;
    if (childLastSuccess && childLastSuccess > new Date(parent.last_run_at)) {
        return { blocked: true, reason: `Already ran successfully since parent's last completion` };
    }
    return { blocked: false };
}

async function runOneSchedule(base44, schedule, now: Date) {
    let runStatus = 'success';
    let runSummary = '';

    try {
        if (schedule.import_type === 'nppes_registry') {
            const config = schedule.nppes_config || {};
            const crawlerPayload: any = {
                action: 'batch_start',
                dry_run: false,
                skip_completed: false,
                taxonomy_description: config.taxonomy_description || '',
                entity_type: config.entity_type || '',
            };

            if (!config.crawl_all_states) {
                if (!config.state) {
                    throw new Error('Scheduled NPPES crawler runs require a state when crawl_all_states is disabled');
                }
                crawlerPayload.states = [config.state];
            }
            if (config.city) crawlerPayload.city = config.city;
            if (config.postal_code) crawlerPayload.postal_code = config.postal_code;

            const res = await base44.asServiceRole.functions.invoke('nppesCrawler', crawlerPayload);
            const data = res.data || res;
            runSummary = data.message || `Queued ${data.states_queued || 0} state(s) for crawling`;
            runStatus = data.error ? 'failed' : 'success';
        } else {
            // CMS data import — use triggerImport which has built-in URLs
            // Resolve aliases: cms_utilization -> provider_service_utilization
            const ALIASES = { cms_utilization: 'provider_service_utilization' };
            const resolvedType = ALIASES[schedule.import_type] || schedule.import_type;
            // Honor schedule.data_year if configured. Falling back to current year only
            // when the schedule didn't pin one — otherwise we'd silently import the wrong
            // year for schedules built around historical CMS publications.
            const targetYear = schedule.data_year ?? now.getFullYear();
            const res = await base44.asServiceRole.functions.invoke('triggerImport', {
                import_type: resolvedType,
                file_url: schedule.api_url || undefined,
                year: targetYear,
                dry_run: false,
            });
            const data = res.data?.result || res.data || res;
            if (data.partial) {
                runSummary = `Partial: imported ${data.imported_rows || 0} rows, paused at offset ${data.next_offset}. Will resume on next run.`;
                runStatus = 'partial';
            } else {
                runSummary = `Imported ${data.imported_rows || 0} rows, updated ${data.updated_rows || 0}`;
                runStatus = 'success';
            }
        }
    } catch (err) {
        console.error(`Failed import ${schedule.import_type}:`, err.message);
        runStatus = 'failed';
        runSummary = `Error: ${err.message}`;
    }

    return { runStatus, runSummary };
}

Deno.serve(async (req) => {
    const startTime = Date.now();

    try {
        const base44 = createClientFromRequest(req);

        // Allow service role calls (from scheduled automations) or admin users
        let user = null;
        try { user = await base44.auth.me(); } catch (e) { /* service role call */ }
        const isService = user && user.email && user.email.includes('service+');
        if (user && user.role !== 'admin' && !isService) {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const schedules = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ is_active: true });
        const now = new Date();
        const results = [];
        const skipped = [];

        // Bucket due schedules by family to avoid running two same-family imports in parallel
        const dueByFamily = new Map<string, any[]>();
        for (const schedule of schedules) {
            const nextRun = schedule.next_run_at ? new Date(schedule.next_run_at) : null;
            if (nextRun && nextRun > now) continue;

            const dep = dependencyBlocked(schedule, schedules);
            if (dep.blocked) {
                skipped.push({ id: schedule.id, label: schedule.label, reason: dep.reason });
                continue;
            }

            const family = getImportFamily(schedule.import_type);
            if (!dueByFamily.has(family)) dueByFamily.set(family, []);
            dueByFamily.get(family)!.push(schedule);
        }

        // Run one schedule per family per invocation (sequentially — invocations are short).
        // This lets cross-family schedules progress in the same invocation without conflicts.
        let processed = 0;
        for (const familySchedules of dueByFamily.values()) {
            if (processed >= MAX_SCHEDULES_PER_INVOCATION) break;
            if (Date.now() - startTime > MAX_EXEC_MS) break;

            // Pick the most overdue schedule in this family
            familySchedules.sort((a, b) => {
                const aT = a.next_run_at ? new Date(a.next_run_at).getTime() : 0;
                const bT = b.next_run_at ? new Date(b.next_run_at).getTime() : 0;
                return aT - bT;
            });
            const schedule = familySchedules[0];

            console.log(`Running scheduled import: ${schedule.label} (${schedule.import_type})`);
            const { runStatus, runSummary } = await runOneSchedule(base44, schedule, now);

            // #8 — track consecutive failures for exponential backoff
            const priorFailures = schedule.consecutive_failures || 0;
            const newFailures = runStatus === 'failed' ? priorFailures + 1 : 0;
            const nextRunDate = computeNextRun(schedule, now, newFailures);

            const update: Record<string, unknown> = {
                last_run_at: now.toISOString(),
                next_run_at: nextRunDate.toISOString(),
                last_run_status: runStatus,
                last_run_summary: runSummary,
                consecutive_failures: newFailures,
            };
            // Only refresh last_successful_run_at on a clean success so children
            // can re-attempt against the same parent run after a transient failure.
            if (runStatus === 'success') {
                update.last_successful_run_at = now.toISOString();
            }
            await base44.asServiceRole.entities.ImportScheduleConfig.update(schedule.id, update);

            results.push({
                import_type: schedule.import_type,
                status: runStatus,
                summary: runSummary,
                consecutive_failures: newFailures,
                next_run_at: nextRunDate.toISOString(),
            });
            processed++;
        }

        return Response.json({
            success: true,
            results,
            skipped,
            checked: schedules.length,
            processed,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
