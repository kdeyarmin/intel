import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
// Pure scheduling helpers live in helpers.ts so they can be unit-tested from
// Node without booting the Deno serve handler.
import {
    MAX_SCHEDULES_PER_INVOCATION,
    getImportFamily,
    computeNextRun,
    dependencyBlocked,
} from './helpers.ts';

const MAX_EXEC_MS = 45_000;
// Lease window for claiming a schedule before running it. If an invocation
// crashes mid-run, the schedule becomes eligible again after this long.
const CLAIM_LEASE_MS = 10 * 60 * 1000;

const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
    'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

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

            // Claim the schedule before running it. The base44 SDK has no
            // conditional update, so this lease-based claim (push next_run_at into
            // the future + mark it running) doesn't give true atomicity, but it
            // narrows the window in which an overlapping cron invocation could pick
            // the same schedule down to the brief read->claim gap. triggerImport's
            // own active-import guard is the final backstop against a double-fire.
            try {
                await base44.asServiceRole.entities.ImportScheduleConfig.update(schedule.id, {
                    next_run_at: new Date(now.getTime() + CLAIM_LEASE_MS).toISOString(),
                    last_run_status: 'running',
                });
            } catch (claimErr) {
                skipped.push({ id: schedule.id, label: schedule.label, reason: `claim failed: ${claimErr.message}` });
                continue;
            }

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
