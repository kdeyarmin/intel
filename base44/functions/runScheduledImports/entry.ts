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

// Maintenance workers fanned out at the end of every schedule cycle. Each is
// idempotent and self-throttling (its own backoff window / cap), so calling
// them every cycle is safe and bounds maintenance latency to one cron tick.
//
// Why fan out from here: only a few of these are wired to platform-side cron
// today and that wiring isn't visible in the repo, so a misconfigured cron
// silently kills maintenance. Driving them from runScheduledImports — which
// IS reliably scheduled — makes the wiring grep-able and means a single cron
// outage is the only failure mode.
const MAINTENANCE_WORKERS = [
    'autoResumePausedImports',  // resumes paused batches with a saved offset
    'autoRetryFailedImports',   // retries failed batches whose error is transient
    'manageCrawlerRetries',     // NPPES per-state retry loop
    'cancelStalledImports',     // marks long-running 'processing' batches as failed
];

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

        // Fan out to maintenance workers in parallel. We await them with a
        // hard time budget so a slow worker can't push the schedule loop past
        // its execution limit; any worker still in flight when we time out
        // will continue running on the platform side, just unobserved here.
        //
        // We pre-populate the worker map with `ok: false, error: 'timeout'`
        // so a worker that doesn't return inside the budget is recorded as
        // a timeout (not silently dropped) and the heartbeat reliably
        // describes every expected worker.
        const maintenanceBudgetMs = Math.max(0, MAX_EXEC_MS - (Date.now() - startTime) - 2_000);
        const maintenanceMap = new Map<string, { worker: string; ok: boolean; error?: string }>();
        for (const worker of MAINTENANCE_WORKERS) {
            maintenanceMap.set(worker, { worker, ok: false, error: 'timeout' });
        }
        let maintenanceSkipped: string | null = null;

        if (maintenanceBudgetMs > 1_000) {
            const invocations = MAINTENANCE_WORKERS.map(async (worker) => {
                try {
                    const res = await base44.asServiceRole.functions.invoke(worker, {});
                    // Several maintenance workers return HTTP 200 with an
                    // `errors` array instead of throwing on per-batch failures.
                    // Inspect the payload so the heartbeat reflects real outcomes.
                    const data = (res?.data ?? res) as Record<string, unknown> | undefined;
                    const inner = data?.errors;
                    const innerErrorCount = Array.isArray(inner) ? inner.length : 0;
                    if (data?.error) {
                        maintenanceMap.set(worker, { worker, ok: false, error: String(data.error).substring(0, 200) });
                    } else if (innerErrorCount > 0) {
                        maintenanceMap.set(worker, { worker, ok: false, error: `${innerErrorCount} inner error(s)` });
                    } else {
                        maintenanceMap.set(worker, { worker, ok: true });
                    }
                } catch (err) {
                    maintenanceMap.set(worker, { worker, ok: false, error: err.message?.substring(0, 200) });
                }
            });
            let timeoutId: ReturnType<typeof setTimeout> | undefined;
            const timeoutPromise = new Promise<void>((resolve) => {
                timeoutId = setTimeout(resolve, maintenanceBudgetMs);
            });
            try {
                await Promise.race([
                    Promise.all(invocations),
                    timeoutPromise,
                ]);
            } finally {
                if (timeoutId !== undefined) clearTimeout(timeoutId);
            }
        } else {
            maintenanceSkipped = `budget_exhausted (${maintenanceBudgetMs}ms remaining)`;
        }

        const maintenance = Array.from(maintenanceMap.values());

        // Always persist a heartbeat — even when maintenance was skipped due to
        // budget pressure — so the UI can distinguish "cron stopped" from
        // "schedule loop ran but maintenance got squeezed out." Best-effort:
        // a failure here shouldn't break the schedule response.
        try {
            await base44.asServiceRole.entities.AuditEvent.create({
                event_type: 'maintenance_fanout',
                user_email: 'system',
                details: {
                    workers: maintenance,
                    succeeded: maintenance.filter(m => m.ok).length,
                    failed: maintenance.filter(m => !m.ok).length,
                    skipped_reason: maintenanceSkipped,
                    budget_ms: maintenanceBudgetMs,
                },
                timestamp: new Date().toISOString(),
            });
        } catch (_e) { /* heartbeat is best-effort */ }

        return Response.json({
            success: true,
            results,
            skipped,
            checked: schedules.length,
            processed,
            maintenance,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
