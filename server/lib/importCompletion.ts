// Scheduled imports settle when their batch finishes, not when it starts.
//
// The cron driver (server/functions/scheduledImports.ts) marks a schedule
// "running" and records the batch it started. The importer calls
// settleBatchCompletion when that batch reaches a terminal state, and the
// settleScheduledImports maintenance worker sweeps "running" schedules so a
// completion that happened during a restart is still recorded. Only then is
// last_successful_run_at set, so dependent schedules wait for real completion.
import { db } from "../db";
import { importBatches, importScheduleConfigs } from "../db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { computeNextRun, extractErrorMessage, type Schedule } from "./scheduling";

/** How long a started run may stay "running" before the sweep gives up on it. */
export const RUN_LEASE_MS = 6 * 60 * 60 * 1000;

export type BatchState = {
  id: number;
  status: string | null;
  completed_at?: Date | string | null;
  imported_rows?: number | null;
  skipped_rows?: number | null;
  cancel_reason?: string | null;
  error_samples?: unknown;
};

export type ScheduleState = Schedule & {
  id: number;
  last_batch_id?: number | null;
  next_run_at?: Date | string | null;
};

export type Settlement =
  | { action: "success" | "failed"; summary: string }
  | { action: "wait"; reason: string };

/** Pure: what a batch's state means for the schedule that started it. */
export function decideSettlement(batch: BatchState | null | undefined, now: Date, leaseExpiresAt?: Date | string | null): Settlement {
  const leaseExpired = !!leaseExpiresAt && now.getTime() >= new Date(leaseExpiresAt).getTime();
  if (!batch) {
    return leaseExpired ? { action: "failed", summary: "The started batch no longer exists" } : { action: "wait", reason: "batch_not_found" };
  }
  const counts = `${batch.imported_rows ?? 0} imported, ${batch.skipped_rows ?? 0} skipped`;
  switch (batch.status) {
    case "completed":
      return { action: "success", summary: `Completed batch #${batch.id}: ${counts}` };
    case "completed_with_errors":
      // The importer stopped at its page limit; the rows aren't all in.
      return { action: "failed", summary: `Batch #${batch.id} stopped early (${counts}); resume it to continue` };
    case "failed":
    case "cancelled": {
      const why = extractErrorMessage(batch as unknown as Record<string, unknown>);
      return { action: "failed", summary: `Batch #${batch.id} ${batch.status}${why ? `: ${why}` : ""}` };
    }
    default:
      return leaseExpired
        ? { action: "failed", summary: `Batch #${batch.id} was still ${batch.status ?? "open"} when the run lease expired` }
        : { action: "wait", reason: `batch_${batch.status ?? "open"}` };
  }
}

/** Pure: the schedule columns a success/failure settlement writes. */
export function settlementUpdate(
  schedule: ScheduleState,
  settlement: Extract<Settlement, { action: "success" | "failed" }>,
  batch: BatchState | null | undefined,
  now: Date,
  random: () => number = Math.random,
): Record<string, unknown> {
  const failures = settlement.action === "failed" ? (schedule.consecutive_failures || 0) + 1 : 0;
  const update: Record<string, unknown> = {
    last_run_status: settlement.action,
    last_run_summary: settlement.summary.slice(0, 500),
    consecutive_failures: failures,
    next_run_at: computeNextRun(schedule, now, failures, random),
    updated_date: now,
  };
  if (settlement.action === "success") {
    update.last_successful_run_at = batch?.completed_at ? new Date(batch.completed_at) : now;
  }
  return update;
}

/**
 * Pure: whether a schedule in `status` should be settled with `decision`.
 * "running" settles either way; "failed" only upgrades to success when an
 * auto-retry later completed the same batch (a second failure is not counted
 * again); anything else has already been settled.
 */
export function shouldApply(status: string | null | undefined, decision: Settlement): boolean {
  if (decision.action === "wait") return false;
  if (status === "running") return true;
  if (status === "failed") return decision.action === "success";
  return false;
}

export async function settleSchedule(schedule: ScheduleState & { last_run_status?: string | null }, batch: BatchState | null | undefined, now = new Date()): Promise<Settlement> {
  const decision = decideSettlement(batch, now, schedule.next_run_at);
  if (!shouldApply(schedule.last_run_status, decision)) {
    return decision.action === "wait" ? decision : { action: "wait", reason: "already_settled" };
  }
  await db.update(importScheduleConfigs)
    .set(settlementUpdate(schedule, decision as Extract<Settlement, { action: "success" | "failed" }>, batch, now))
    .where(eq(importScheduleConfigs.id, schedule.id));
  return decision;
}

/** Settles the schedule that started `batchId`, if that is still its latest run. Never throws. */
export async function settleBatchCompletion(batchId: number, now = new Date()): Promise<Settlement | null> {
  try {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
    if (!batch?.schedule_id) return null;
    const [schedule] = await db.select().from(importScheduleConfigs).where(eq(importScheduleConfigs.id, batch.schedule_id)).limit(1);
    if (!schedule || schedule.last_batch_id !== batch.id) return null;
    return await settleSchedule(schedule as unknown as ScheduleState, batch, now);
  } catch (e: any) {
    console.warn(`[importCompletion] couldn't settle batch ${batchId}:`, e?.message || e);
    return null;
  }
}

/** The sweep: settle every "running" schedule whose batch has finished (or whose lease has expired). */
export async function settleRunningSchedules(now = new Date()): Promise<{ scanned: number; settled: Array<{ id: number; action: string }>; waiting: number }> {
  const running = await db.select().from(importScheduleConfigs)
    .where(and(eq(importScheduleConfigs.last_run_status, "running"), isNotNull(importScheduleConfigs.last_batch_id)))
    .limit(100);
  const settled: Array<{ id: number; action: string }> = [];
  let waiting = 0;
  for (const schedule of running) {
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, schedule.last_batch_id!)).limit(1);
    const decision = await settleSchedule(schedule as unknown as ScheduleState, batch, now);
    if (decision.action === "wait") waiting++;
    else settled.push({ id: schedule.id, action: decision.action });
  }
  return { scanned: running.length, settled, waiting };
}
