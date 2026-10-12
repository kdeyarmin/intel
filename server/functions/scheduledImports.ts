import { db } from "../db";
import { importBatches, importScheduleConfigs } from "../db/schema";
import { eq, and, lt, or, isNull, inArray, sql } from "drizzle-orm";
import { handleTriggerImport } from "./triggerImport";
import { handleNppesCrawler } from "./nppesCrawler";
import {
  MAX_SCHEDULES_PER_INVOCATION,
  getImportFamily,
  computeNextRun,
  dependencyBlocked,
  type Schedule,
} from "../lib/scheduling";
import { runMaintenanceFanout } from "../lib/maintenance";
import { RUN_LEASE_MS } from "../lib/importCompletion";

// The cron driver. An external scheduler POSTs /api/maintenance/runScheduledImports
// (see server/routes/maintenance.ts) every ~10 minutes; each tick claims the
// due import schedules, starts them in-process, and then runs the one
// maintenance fan-out in server/lib/maintenance.ts (FANOUT_WORKERS), which
// writes the maintenance_fanout heartbeat the Import Monitor reads.
// handleTriggerImport / handleNppesCrawler gate on user.role === "admin", so a
// synthetic admin principal is passed.
const ADMIN = { role: "admin" } as any;
const CLAIM_LEASE_MS = 10 * 60 * 1000;

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

/** Whether any state of an NPPES crawl is still queued, running or paused. */
async function crawlInProgress(): Promise<boolean> {
  const live = await db.select({ id: importBatches.id }).from(importBatches)
    .where(and(
      eq(importBatches.import_type, "nppes_registry"),
      sql`left(file_name, 8) = 'crawler_'`,
      inArray(importBatches.status, ["validating", "processing", "paused"]),
    ));
  return live.length > 0;
}

async function runOneSchedule(schedule: any): Promise<{ runStatus: string; runSummary: string; batchId?: number }> {
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
      if (config.crawl_all_states === false) {
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
    // The import runs in the background: the schedule stays "running" until
    // its batch completes (server/lib/importCompletion.ts settles it).
    const batchId = typeof res?.batch_id === "number" ? res.batch_id : undefined;
    return { runStatus: batchId != null ? "running" : "success", runSummary: res?.message || `Started import ${schedule.import_type}`, batchId };
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
  const schedules = await db
    .select()
    .from(importScheduleConfigs)
    .where(and(eq(importScheduleConfigs.is_active, true), eq(importScheduleConfigs.enabled, true)));
  const now = new Date();
  const shapes = schedules.map(toScheduleShape);
  const results: any[] = [];
  const skipped: any[] = [];

  // A schedule whose own batch is still processing is not due again, even once
  // its run lease has passed: re-claiming it would only meet the active-import
  // guard (a 409), record "skipped", and lose the real completion. The settle
  // sweep owns it until the batch finishes or goes quiet.
  const runningBatchIds = schedules
    .filter((s) => s.last_run_status === "running" && s.last_batch_id != null)
    .map((s) => s.last_batch_id as number);
  const liveBatchIds = new Set<number>(
    runningBatchIds.length === 0
      ? []
      : (await db.select({ id: importBatches.id }).from(importBatches)
          .where(and(inArray(importBatches.id, runningBatchIds), inArray(importBatches.status, ["validating", "processing"]))))
          .map((b) => b.id),
  );

  // Bucket due schedules by family so two same-family imports don't run in parallel.
  const dueByFamily = new Map<string, any[]>();
  for (let i = 0; i < schedules.length; i++) {
    const s = schedules[i];
    const nextRun = s.next_run_at ? new Date(s.next_run_at) : null;
    if (nextRun && nextRun > now) continue;
    if (s.last_run_status === "running" && s.last_batch_id != null && liveBatchIds.has(s.last_batch_id)) {
      skipped.push({ id: s.id, label: shapes[i].label, reason: `previous run (batch #${s.last_batch_id}) is still in progress` });
      continue;
    }
    // A crawl is one batch per state, queued in a single call and finishing days later, so the schedule can't wait
    // on one batch like the other imports do. Without this, the next cadence queued a second crawl on top of the
    // first one's states.
    if (s.import_type === "nppes_registry" && (await crawlInProgress())) {
      skipped.push({ id: s.id, label: shapes[i].label, reason: "a crawl is still in progress" });
      continue;
    }
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

    // Claim with a compare-and-set lease: only update the row if it is still
    // due (next_run_at IS NULL or < now), which prevents a second concurrent
    // invocation from double-claiming the same schedule.
    // handleTriggerImport's own active-import guard is the final backstop.
    try {
      const claimed = await db
        .update(importScheduleConfigs)
        .set({ next_run_at: new Date(now.getTime() + CLAIM_LEASE_MS), last_run_status: "running", updated_date: new Date() })
        .where(and(
          eq(importScheduleConfigs.id, schedule.id),
          or(isNull(importScheduleConfigs.next_run_at), lt(importScheduleConfigs.next_run_at, now)),
        ))
        .returning({ id: importScheduleConfigs.id });
      if (claimed.length === 0) {
        skipped.push({ id: schedule.id, reason: "claim lost (another invocation already claimed it)" });
        continue;
      }
    } catch (e: any) {
      skipped.push({ id: schedule.id, reason: `claim failed: ${e.message}` });
      continue;
    }

    const { runStatus, runSummary, batchId } = await runOneSchedule(schedule);
    const update: Record<string, unknown> = {
      last_run_at: now,
      last_run_status: runStatus,
      last_run_summary: (runSummary || "").slice(0, 500),
      updated_date: new Date(),
    };
    let nextRunDate: Date;
    if (runStatus === "running" && batchId != null) {
      // Hold the schedule until the batch settles; the lease is the latest the
      // completion sweep will wait before calling the run failed.
      nextRunDate = new Date(now.getTime() + RUN_LEASE_MS);
      update.next_run_at = nextRunDate;
      update.last_batch_id = batchId;
      await db.update(importBatches).set({ schedule_id: schedule.id }).where(eq(importBatches.id, batchId));
    } else {
      const priorFailures = schedule.consecutive_failures || 0;
      const newFailures = runStatus === "failed" ? priorFailures + 1 : 0;
      nextRunDate = computeNextRun(toScheduleShape(schedule), now, newFailures);
      update.next_run_at = nextRunDate;
      update.consecutive_failures = newFailures;
      if (runStatus === "success") update.last_successful_run_at = now;
    }
    await db.update(importScheduleConfigs).set(update).where(eq(importScheduleConfigs.id, schedule.id));

    results.push({ import_type: schedule.import_type, status: runStatus, summary: runSummary, next_run_at: nextRunDate.toISOString() });
    processed++;
  }

  // The fan-out writes the maintenance_fanout heartbeat, including what the
  // schedule loop did on this tick.
  const { workers: maintenance } = await runMaintenanceFanout("cron", {
    schedules: { checked: schedules.length, processed, started: results.length, skipped: skipped.length },
  });

  return { success: true, checked: schedules.length, processed, results, skipped, maintenance };
}
