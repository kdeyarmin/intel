import { db } from "../db";
import { importScheduleConfigs, importBatches, auditEvents } from "../db/schema";
import { eq, and, inArray, desc, lt } from "drizzle-orm";
import { handleTriggerImport } from "./triggerImport";
import { handleNppesCrawler } from "./nppesCrawler";
import {
  MAX_SCHEDULES_PER_INVOCATION,
  MAX_AUTO_RETRY_ATTEMPTS,
  getImportFamily,
  computeNextRun,
  dependencyBlocked,
  shouldRetryBatch,
  extractErrorMessage,
  type Schedule,
} from "../lib/scheduling";

// Maintenance functions are driven by an external scheduler (see
// server/routes/maintenance.ts). They invoke the existing import functions
// in-process rather than over HTTP. handleTriggerImport / handleNppesCrawler
// both gate on user.role === "admin", so a synthetic admin principal is passed.
const ADMIN = { role: "admin" } as any;
const CLAIM_LEASE_MS = 10 * 60 * 1000;
const MAX_AUTO_RESUMES = 5;
const STALL_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// Import types the generic auto-retry/resume workers must NOT drive via
// triggerImport: the NPPES crawler resumes itself (batch_resume/watchdog), and
// flat-file imports resume from a byte offset that triggerImport's flat-file
// path doesn't honor (it would restart from 0) — they self-chain and are
// recovered on startup instead.
const SELF_RESUMING_IMPORT_TYPES = new Set(["nppes_registry", "nppes_flat_file", "nppes_registry_file"]);

function toScheduleShape(s: any): Schedule {
  return {
    schedule_time: s.schedule_time,
    schedule_frequency: s.schedule_frequency,
    last_run_at: s.last_run_at ?? null,
    last_successful_run_at: s.last_successful_run_at ?? null,
    last_run_status: s.last_run_status,
    consecutive_failures: s.consecutive_failures ?? 0,
    label: s.label || s.name,
    import_type: s.import_type,
    depends_on_import_type: s.depends_on_import_type,
  };
}

async function runOneSchedule(schedule: any): Promise<{ runStatus: string; runSummary: string }> {
  try {
    if (schedule.import_type === "nppes_registry") {
      const config = schedule.nppes_config || {};
      const payload: any = {
        action: "batch_start",
        dry_run: false,
        skip_completed: false,
        taxonomy_description: config.taxonomy_description || "",
        entity_type: config.entity_type || "",
      };
      if (!config.crawl_all_states) {
        if (!config.state) throw new Error("Scheduled NPPES run requires a state when crawl_all_states is disabled");
        payload.states = [config.state];
      }
      if (config.city) payload.city = config.city;
      if (config.postal_code) payload.postal_code = config.postal_code;
      const res: any = await handleNppesCrawler(payload, ADMIN);
      return {
        runStatus: res?.error ? "failed" : "success",
        runSummary: res?.message || `Queued ${res?.states_queued || 0} state(s) for crawling`,
      };
    }
    const res: any = await handleTriggerImport(
      {
        import_type: schedule.import_type,
        file_url: schedule.api_url || undefined,
        year: schedule.data_year ? Number(schedule.data_year) : undefined,
        dry_run: false,
      },
      ADMIN,
    );
    return { runStatus: "success", runSummary: res?.message || `Started import ${schedule.import_type}` };
  } catch (err: any) {
    // triggerImport throws {status:409, conflict:true} when an import of this
    // type is already running — treat that as "skipped", not a failure, so it
    // doesn't accrue backoff.
    if (err?.conflict || err?.status === 409) {
      return { runStatus: "skipped", runSummary: err.message || "Already running" };
    }
    return { runStatus: "failed", runSummary: `Error: ${err?.message || String(err)}` };
  }
}

export async function handleRunScheduledImports(_payload?: any, _user?: any) {
  const schedules = await db.select().from(importScheduleConfigs).where(eq(importScheduleConfigs.is_active, true));
  const now = new Date();
  const shapes = schedules.map(toScheduleShape);
  const results: any[] = [];
  const skipped: any[] = [];

  // Bucket due schedules by family so two same-family imports don't run in parallel.
  const dueByFamily = new Map<string, any[]>();
  for (let i = 0; i < schedules.length; i++) {
    const s = schedules[i];
    const nextRun = s.next_run_at ? new Date(s.next_run_at) : null;
    if (nextRun && nextRun > now) continue;
    const dep = dependencyBlocked(shapes[i], shapes);
    if (dep.blocked) {
      skipped.push({ id: s.id, label: shapes[i].label, reason: dep.reason });
      continue;
    }
    const family = getImportFamily(s.import_type);
    if (!dueByFamily.has(family)) dueByFamily.set(family, []);
    dueByFamily.get(family)!.push(s);
  }

  let processed = 0;
  for (const familySchedules of dueByFamily.values()) {
    if (processed >= MAX_SCHEDULES_PER_INVOCATION) break;
    familySchedules.sort(
      (a, b) =>
        (a.next_run_at ? new Date(a.next_run_at).getTime() : 0) -
        (b.next_run_at ? new Date(b.next_run_at).getTime() : 0),
    );
    const schedule = familySchedules[0];

    // Claim with a lease (push next_run_at out + mark running) to narrow the
    // window where an overlapping cron invocation picks the same schedule.
    // handleTriggerImport's own active-import guard is the final backstop.
    try {
      await db
        .update(importScheduleConfigs)
        .set({ next_run_at: new Date(now.getTime() + CLAIM_LEASE_MS), last_run_status: "running", updated_date: new Date() })
        .where(eq(importScheduleConfigs.id, schedule.id));
    } catch (e: any) {
      skipped.push({ id: schedule.id, reason: `claim failed: ${e.message}` });
      continue;
    }

    const { runStatus, runSummary } = await runOneSchedule(schedule);
    const priorFailures = schedule.consecutive_failures || 0;
    const newFailures = runStatus === "failed" ? priorFailures + 1 : 0;
    const nextRunDate = computeNextRun(toScheduleShape(schedule), now, newFailures);

    const update: Record<string, unknown> = {
      last_run_at: now,
      next_run_at: nextRunDate,
      last_run_status: runStatus,
      last_run_summary: (runSummary || "").slice(0, 500),
      consecutive_failures: newFailures,
      updated_date: new Date(),
    };
    if (runStatus === "success") update.last_successful_run_at = now;
    await db.update(importScheduleConfigs).set(update).where(eq(importScheduleConfigs.id, schedule.id));

    results.push({ import_type: schedule.import_type, status: runStatus, summary: runSummary, next_run_at: nextRunDate.toISOString() });
    processed++;
  }

  const maintenance = await runMaintenanceWorkers();

  try {
    await db.insert(auditEvents).values({
      event_type: "maintenance_fanout",
      user_email: "system",
      details: { workers: maintenance, results_count: results.length, processed },
    });
  } catch {
    /* heartbeat is best-effort */
  }

  return { success: true, checked: schedules.length, processed, results, skipped, maintenance };
}

async function runMaintenanceWorkers() {
  const out: Array<{ worker: string; ok: boolean; error?: string }> = [];
  const run = async (worker: string, fn: () => Promise<any>) => {
    try {
      const r = await fn();
      out.push(r?.error ? { worker, ok: false, error: String(r.error).slice(0, 200) } : { worker, ok: true });
    } catch (e: any) {
      out.push({ worker, ok: false, error: (e?.message || String(e)).slice(0, 200) });
    }
  };
  await Promise.all([
    run("autoResumePausedImports", handleAutoResumePausedImports),
    run("autoRetryFailedImports", handleAutoRetryFailedImports),
    run("cancelStalledImports", handleCancelStalledImports),
    run("manageCrawlerRetries", () => handleNppesCrawler({ action: "batch_resume" }, ADMIN)),
  ]);
  return out;
}

export async function handleAutoRetryFailedImports() {
  const failed = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.status, "failed"))
    .orderBy(desc(importBatches.updated_date))
    .limit(50);
  const now = new Date();
  const retried: any[] = [];
  const skipped: any[] = [];
  const errors: any[] = [];

  for (const batch of failed) {
    if (SELF_RESUMING_IMPORT_TYPES.has(batch.import_type || "")) {
      skipped.push({ id: batch.id, reason: "self_resuming_import_type" });
      continue;
    }
    const decision = shouldRetryBatch(batch as any, now);
    if (!decision.eligible) {
      skipped.push({ id: batch.id, reason: decision.reason });
      continue;
    }
    const nextAttempt = decision.attemptCount + 1;
    const params: any = batch.retry_params || {};
    try {
      await db
        .update(importBatches)
        .set({
          retry_params: {
            ...params,
            auto_retry_count: nextAttempt,
            last_auto_retry_at: now.toISOString(),
            last_auto_retry_reason: extractErrorMessage(batch as any).slice(0, 200),
          },
          updated_date: new Date(),
        })
        .where(eq(importBatches.id, batch.id));

      await handleTriggerImport(
        {
          import_type: batch.import_type,
          file_url: params.file_url,
          year: params.year,
          dry_run: !!batch.dry_run,
          resume_offset: params.resume_offset,
          retry_of: batch.id,
          retry_count: nextAttempt,
          retry_tags: ["auto_retry_failed"],
          batch_id: batch.id,
        },
        ADMIN,
      );
      retried.push({ id: batch.id, type: batch.import_type, attempt: nextAttempt });
    } catch (err: any) {
      errors.push({ id: batch.id, error: err?.message || String(err) });
    }
  }
  return { success: true, scanned: failed.length, retried_count: retried.length, retried, skipped, errors, max_attempts: MAX_AUTO_RETRY_ATTEMPTS };
}

export async function handleAutoResumePausedImports() {
  const paused = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.status, "paused"))
    .orderBy(desc(importBatches.updated_date))
    .limit(50);
  const resumed: any[] = [];
  const errors: any[] = [];
  const skipped: any[] = [];

  for (const batch of paused) {
    // The NPPES crawler and flat-file imports resume themselves; don't restart
    // them from scratch via triggerImport.
    if (SELF_RESUMING_IMPORT_TYPES.has(batch.import_type || "")) continue;
    const params: any = batch.retry_params || {};
    const autoResumeCount = params.auto_resume_count || 0;
    if (autoResumeCount >= MAX_AUTO_RESUMES) {
      skipped.push({ id: batch.id, reason: `max auto-resume attempts (${MAX_AUTO_RESUMES})` });
      continue;
    }
    const offset = params.resume_offset !== undefined ? params.resume_offset : params.row_offset;
    if (offset === undefined) {
      skipped.push({ id: batch.id, reason: "no saved offset" });
      continue;
    }
    try {
      await db
        .update(importBatches)
        .set({ retry_params: { ...params, auto_resume_count: autoResumeCount + 1 }, updated_date: new Date() })
        .where(eq(importBatches.id, batch.id));
      await handleTriggerImport(
        {
          import_type: batch.import_type,
          file_url: params.file_url,
          year: params.year,
          dry_run: !!batch.dry_run,
          resume_offset: offset,
          batch_id: batch.id,
        },
        ADMIN,
      );
      resumed.push({ id: batch.id, type: batch.import_type, offset, attempt: autoResumeCount + 1 });
    } catch (err: any) {
      errors.push({ id: batch.id, error: err?.message || String(err) });
    }
  }
  return { success: true, resumed_count: resumed.length, resumed, errors, skipped };
}

export async function handleCancelStalledImports() {
  const cutoff = new Date(Date.now() - STALL_THRESHOLD_MS);
  const stalled = await db
    .select()
    .from(importBatches)
    .where(and(inArray(importBatches.status, ["processing", "validating"]), lt(importBatches.updated_date, cutoff)))
    .limit(100);
  const cancelled: any[] = [];
  for (const b of stalled) {
    // Leave NPPES crawler batches to the crawler watchdog.
    if (b.import_type === "nppes_registry" && (b.file_name || "").startsWith("crawler_")) continue;
    const mins = Math.round(STALL_THRESHOLD_MS / 60000);
    await db
      .update(importBatches)
      .set({
        status: "failed",
        cancel_reason: `Auto-cancelled: stalled >${mins}m in "${b.status}"`,
        cancelled_at: new Date(),
        error_samples: [{ message: `Stalled in "${b.status}" with no progress for over ${mins} minutes`, phase: "stall_sweep" }],
        updated_date: new Date(),
      })
      .where(eq(importBatches.id, b.id));
    cancelled.push({ id: b.id, type: b.import_type });
  }
  return { success: true, cancelled_count: cancelled.length, cancelled };
}
