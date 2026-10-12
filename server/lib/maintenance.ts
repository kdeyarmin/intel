// Server-side maintenance workers, ported from base44/functions/ so they can be
// invoked from the admin UI (and, eventually, from an in-Express cron driver
// that replaces base44/functions/runScheduledImports).
//
// Each worker is idempotent and self-throttling — runScheduledImports calls
// these on every cron tick, and a misclick on the admin UI shouldn't be worse
// than a cron tick.
//
// All worker entrypoints record their outcome via the maintenance_fanout
// AuditEvent that MaintenanceHealthPanel polls, with an `invoked_by` field so
// operators can distinguish a scheduled run from a manual one.

import { db } from "../db";
import { importBatches, auditEvents } from "../db/schema";
import { and, eq, sql } from "drizzle-orm";
import { SELF_RESUMING_IMPORT_TYPES, STALLED_AFTER_MS } from "./scheduling";
import {
  MAX_AUTO_RESUMES,
  MAX_AUTO_RETRY_ATTEMPTS,
  extractErrorMessage,
  shouldRetryBatch,
  type InvokedBy,
} from "./maintenanceHelpers";

const MAX_ERROR_MSG_LENGTH = 200;
const PAUSED_BATCH_LIMIT = 50;
const FAILED_BATCH_LIMIT = 50;
// A processing/validating batch with no progress for STALLED_AFTER_MS (defined with
// the retry policy in scheduling.ts, which triggerImport's active-import guard uses
// too) is cancelled so operators (and autoRetryFailedImports) can react.
export { STALLED_AFTER_MS };

// Import types the generic auto-retry/resume workers must NOT drive via
// triggerImport: the NPPES crawler resumes itself (batch_resume/watchdog), and
// flat-file imports resume from a byte offset that triggerImport's flat-file
// path doesn't honor (it would restart from 0). They self-chain and are
// recovered on startup instead.
export { SELF_RESUMING_IMPORT_TYPES };

// Synthetic admin used when an internal worker calls handleTriggerImport. Real
// human admin credentials are still enforced at the HTTP boundary
// (functions.ts) before any worker fires; this is just so the downstream
// admin-role assertion inside handleTriggerImport doesn't reject us.
const SYSTEM_ADMIN_USER = { id: -1, email: "system@maintenance", role: "admin" } as const;

export type WorkerResult = {
  worker: string;
  ok: boolean;
  durationMs: number;
  // Per-worker structured detail. Shape is worker-specific; callers should
  // treat it as opaque except for displaying counts to the UI.
  details?: Record<string, unknown>;
  error?: string;
};

function truncErr(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  return msg.substring(0, MAX_ERROR_MSG_LENGTH);
}

// ─── Worker: auto-resume paused imports ──────────────────────────────────────
// Mirrors base44/functions/autoResumePausedImports/entry.ts. Paused batches
// that carry a saved offset get re-fed to triggerImport, up to MAX_AUTO_RESUMES
// per batch so a chronically-failing batch can't loop forever.

export async function runAutoResumePausedImports(): Promise<WorkerResult> {
  const started = Date.now();
  const resumed: Array<{ id: number; type: string | null; offset: number; attempt: number }> = [];
  const skipped: Array<{ id: number; reason: string }> = [];
  const errors: Array<{ id: number; error: string }> = [];

  try {
    const paused = await db.select().from(importBatches)
      .where(eq(importBatches.status, "paused"))
      .orderBy(sql`updated_date DESC`)
      .limit(PAUSED_BATCH_LIMIT);

    // Import lazily so this module can be imported by tests without dragging
    // the full triggerImport surface area.
    const { handleTriggerImport } = await import("../functions/triggerImport");

    for (const batch of paused) {
      if (SELF_RESUMING_IMPORT_TYPES.has(batch.import_type || "")) {
        skipped.push({ id: batch.id, reason: "self_resuming_import_type" });
        continue;
      }

      const params = (batch.retry_params as Record<string, unknown> | null) ?? {};
      const autoResumeCount = typeof params.auto_resume_count === "number" ? params.auto_resume_count : 0;
      if (autoResumeCount >= MAX_AUTO_RESUMES) {
        skipped.push({ id: batch.id, reason: `max_resumes_reached (${MAX_AUTO_RESUMES})` });
        continue;
      }

      const offset = (params.resume_offset ?? params.row_offset) as number | undefined;
      if (offset === undefined) {
        skipped.push({ id: batch.id, reason: "no_offset" });
        continue;
      }

      try {
        // Stamp the counter BEFORE invoking so the cap holds even if the
        // resume immediately re-pauses or fails. The stamp is also the claim: it
        // only applies while the batch is still paused with the count we read, so
        // of two overlapping runs (a cron tick and an admin's button) one wins and
        // the other leaves the batch alone instead of resuming it a second time.
        const claimed = await db.update(importBatches).set({
          retry_params: { ...params, auto_resume_count: autoResumeCount + 1 },
          updated_date: new Date(),
        }).where(and(
          eq(importBatches.id, batch.id),
          eq(importBatches.status, "paused"),
          sql`COALESCE((retry_params->>'auto_resume_count')::int, 0) = ${autoResumeCount}`,
        )).returning({ id: importBatches.id });
        if (claimed.length === 0) {
          skipped.push({ id: batch.id, reason: "claimed_by_another_run" });
          continue;
        }

        await handleTriggerImport({
          import_type: batch.import_type,
          file_url: (params.file_url as string | undefined) ?? undefined,
          year: params.year,
          dry_run: batch.dry_run,
          resume_offset: offset,
          batch_id: batch.id,
        }, SYSTEM_ADMIN_USER);

        resumed.push({ id: batch.id, type: batch.import_type, offset, attempt: autoResumeCount + 1 });
      } catch (err) {
        errors.push({ id: batch.id, error: truncErr(err) });
      }
    }

    return {
      worker: "autoResumePausedImports",
      ok: errors.length === 0,
      durationMs: Date.now() - started,
      details: {
        scanned: paused.length,
        resumed_count: resumed.length,
        resumed,
        skipped,
        errors,
      },
    };
  } catch (e) {
    return {
      worker: "autoResumePausedImports",
      ok: false,
      durationMs: Date.now() - started,
      error: truncErr(e),
    };
  }
}

// ─── Worker: auto-retry failed imports ───────────────────────────────────────
// Mirrors base44/functions/autoRetryFailedImports/entry.ts. Failed batches
// whose error categorization marks them as transient get re-dispatched via
// triggerImport, bounded by MAX_AUTO_RETRY_ATTEMPTS with exponential backoff.

export async function runAutoRetryFailedImports(): Promise<WorkerResult> {
  const started = Date.now();
  const retried: Array<{ id: number; type: string | null; attempt: number }> = [];
  const skipped: Array<{ id: number; reason: string }> = [];
  const errors: Array<{ id: number; error: string }> = [];

  try {
    const failed = await db.select().from(importBatches)
      .where(eq(importBatches.status, "failed"))
      .orderBy(sql`updated_date DESC`)
      .limit(FAILED_BATCH_LIMIT);
    const now = new Date();
    const { handleTriggerImport } = await import("../functions/triggerImport");

    for (const batch of failed) {
      if (SELF_RESUMING_IMPORT_TYPES.has(batch.import_type || "")) {
        skipped.push({ id: batch.id, reason: "self_resuming_import_type" });
        continue;
      }
      const decision = shouldRetryBatch(batch as unknown as Record<string, unknown>, now);
      if (!decision.eligible) {
        skipped.push({ id: batch.id, reason: decision.reason });
        continue;
      }

      const nextAttempt = decision.attemptCount + 1;
      const params = (batch.retry_params as Record<string, unknown> | null) ?? {};
      const storedCount = typeof params.auto_retry_count === "number" ? params.auto_retry_count : 0;

      try {
        // The stamp is also the claim, as in the resume worker: it only applies while the batch is still
        // failed with the retry count we read, so overlapping runs can't both resume the same batch.
        const claimed = await db.update(importBatches).set({
          retry_params: {
            ...params,
            auto_retry_count: nextAttempt,
            last_auto_retry_at: now.toISOString(),
            last_auto_retry_reason: extractErrorMessage(batch as unknown as Record<string, unknown>).substring(0, 200),
          },
          updated_date: now,
        }).where(and(
          eq(importBatches.id, batch.id),
          eq(importBatches.status, "failed"),
          sql`COALESCE((retry_params->>'auto_retry_count')::int, 0) = ${storedCount}`,
        )).returning({ id: importBatches.id });
        if (claimed.length === 0) {
          skipped.push({ id: batch.id, reason: "claimed_by_another_run" });
          continue;
        }

        // Resume the failed batch in place (batch_id) rather than opening a
        // second batch: the failed row keeps its history and the per-type
        // active-import guard sees one batch, not two.
        await handleTriggerImport({
          import_type: batch.import_type,
          file_url: (params.file_url as string | undefined) ?? undefined,
          year: params.year,
          dry_run: !!batch.dry_run,
          resume_offset: params.resume_offset ?? undefined,
          retry_of: batch.id,
          retry_count: nextAttempt,
          retry_tags: ["auto_retry_failed"],
          batch_id: batch.id,
        }, SYSTEM_ADMIN_USER);

        retried.push({ id: batch.id, type: batch.import_type, attempt: nextAttempt });
      } catch (err) {
        errors.push({ id: batch.id, error: truncErr(err) });
      }
    }

    return {
      worker: "autoRetryFailedImports",
      ok: errors.length === 0,
      durationMs: Date.now() - started,
      details: {
        scanned: failed.length,
        retried_count: retried.length,
        retried,
        skipped,
        errors,
        max_attempts: MAX_AUTO_RETRY_ATTEMPTS,
      },
    };
  } catch (e) {
    return {
      worker: "autoRetryFailedImports",
      ok: false,
      durationMs: Date.now() - started,
      error: truncErr(e),
    };
  }
}

// ─── Worker: cancel stalled imports ──────────────────────────────────────────
// 'processing' / 'validating' batches that haven't been updated in
// STALLED_AFTER_MS are flagged failed so operators (and autoRetryFailedImports)
// can react. NPPES crawler batches are left to the crawler watchdog, which
// re-queues and restarts them itself. Idempotent — re-marking an already-failed
// batch is a no-op because we only target the two live statuses.

export async function runCancelStalledImports(): Promise<WorkerResult> {
  const started = Date.now();
  try {
    const cutoff = new Date(Date.now() - STALLED_AFTER_MS);
    const stalled = await db.select({ id: importBatches.id, import_type: importBatches.import_type, status: importBatches.status, file_name: importBatches.file_name })
      .from(importBatches)
      .where(sql`status IN ('processing', 'validating') AND updated_date < ${cutoff}`)
      .limit(200);

    const mins = Math.round(STALLED_AFTER_MS / 60000);
    const cancelledBatches: Array<{ id: number; type: string | null }> = [];
    let skippedCrawler = 0;
    for (const batch of stalled) {
      if (batch.import_type === "nppes_registry" && (batch.file_name || "").startsWith("crawler_")) {
        skippedCrawler++;
        continue;
      }
      await db.update(importBatches).set({
        status: "failed",
        cancel_reason: `Auto-cancelled: stalled >${mins}m in "${batch.status}"`,
        cancelled_at: new Date(),
        error_samples: [{ message: `Stalled in "${batch.status}" with no progress for over ${mins} minutes`, phase: "stall_sweep" }],
        updated_date: new Date(),
      }).where(eq(importBatches.id, batch.id));
      cancelledBatches.push({ id: batch.id, type: batch.import_type });
    }

    return {
      worker: "cancelStalledImports",
      ok: true,
      durationMs: Date.now() - started,
      details: { scanned: stalled.length, cancelled: cancelledBatches.length, cancelled_batches: cancelledBatches, skipped_crawler: skippedCrawler, threshold_ms: STALLED_AFTER_MS },
    };
  } catch (e) {
    return {
      worker: "cancelStalledImports",
      ok: false,
      durationMs: Date.now() - started,
      error: truncErr(e),
    };
  }
}

// ─── Worker: manage crawler retries ────────────────────────────────────────────
// Resumes paused/failed crawler-owned NPPES batches, mirroring the old
// scheduledImports maintenance worker.

export async function runManageCrawlerRetries(): Promise<WorkerResult> {
  const started = Date.now();
  try {
    const { handleNppesCrawler } = await import("../functions/nppesCrawler");
    const result = await handleNppesCrawler({ action: "batch_resume" }, SYSTEM_ADMIN_USER) as {
      success?: boolean;
      message?: string;
      error?: unknown;
    };
    const failed = result?.success === false || result?.error != null;
    return {
      worker: "manageCrawlerRetries",
      ok: !failed,
      durationMs: Date.now() - started,
      details: {
        success: result?.success ?? null,
        message: result?.message ?? null,
      },
      ...(failed ? { error: truncErr(result?.error ?? result?.message ?? "Crawler retry failed") } : {}),
    };
  } catch (e) {
    return {
      worker: "manageCrawlerRetries",
      ok: false,
      durationMs: Date.now() - started,
      error: truncErr(e),
    };
  }
}

// ─── Worker: cleanup all imports ─────────────────────────────────────────────
// Wraps the destructive cleanup already exposed at functions/cleanupAllImports.
// Re-exported as a worker so it can be invoked via the same fanout/UI surface
// and recorded in the same AuditEvent stream.

export async function runCleanupAllImports(): Promise<WorkerResult> {
  const started = Date.now();
  try {
    await db.execute(sql`UPDATE import_batches SET status = 'cancelled', updated_date = NOW() WHERE status IN ('processing', 'validating', 'paused', 'failed')`);
    await db.execute(sql`DELETE FROM import_batches WHERE status = 'cancelled'`);
    await db.execute(sql`DELETE FROM nppes_queue_items`);
    const remaining = await db.execute(sql`SELECT status, count(*)::int as cnt FROM import_batches GROUP BY status ORDER BY status`);
    const rows = Array.isArray(remaining) ? remaining : (remaining as { rows?: unknown[] })?.rows ?? [];
    return {
      worker: "cleanupAllImports",
      ok: true,
      durationMs: Date.now() - started,
      details: { remaining: rows },
    };
  } catch (e) {
    return {
      worker: "cleanupAllImports",
      ok: false,
      durationMs: Date.now() - started,
      error: truncErr(e),
    };
  }
}

// ─── Heartbeat ───────────────────────────────────────────────────────────────
// Writes the maintenance_fanout AuditEvent that MaintenanceHealthPanel polls.
// Mirrors the payload base44/functions/runScheduledImports writes so the panel
// renders identically regardless of which side produced the heartbeat.

export async function writeMaintenanceHeartbeat(
  workers: WorkerResult[],
  invokedBy: InvokedBy,
  opts: { userEmail?: string; skippedReason?: string | null; budgetMs?: number; schedules?: Record<string, unknown> } = {},
): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      event_type: "maintenance_fanout",
      user_email: opts.userEmail ?? (invokedBy === "cron" ? "system" : "admin"),
      details: {
        invoked_by: invokedBy,
        workers: workers.map(w => ({
          worker: w.worker,
          ok: w.ok,
          duration_ms: w.durationMs,
          error: w.error,
          details: w.details,
        })),
        succeeded: workers.filter(w => w.ok).length,
        failed: workers.filter(w => !w.ok).length,
        skipped_reason: opts.skippedReason ?? null,
        budget_ms: opts.budgetMs,
        // What the schedule loop did on this tick (cron only): how many
        // schedules were checked, started, and skipped.
        ...(opts.schedules ? { schedules: opts.schedules } : {}),
      },
    });
  } catch (e) {
    // Heartbeat write failures are best-effort — they shouldn't take down the
    // calling worker. Log and move on.
    console.warn("[maintenance] heartbeat write failed:", (e as { message?: string })?.message);
  }
}

// ─── Umbrella: maintenance fanout ────────────────────────────────────────────
// Runs every non-destructive worker in parallel with a time budget for the
// *heartbeat/reporting*. Note: the current implementation does not cancel
// in-flight workers when the budget elapses.
// This is the one fan-out: the cron driver (handleRunScheduledImports) calls it
// after its schedule loop, and the admin UI calls it directly.

// ─── Worker: email scheduled reports that are due ─────────────────────────────

export async function runDueScheduledReportsWorker(): Promise<WorkerResult> {
  const started = Date.now();
  try {
    const { handleRunDueScheduledReports } = await import("../functions/scheduledReports");
    const result = await handleRunDueScheduledReports();
    return { worker: "runDueScheduledReports", ok: true, durationMs: Date.now() - started, details: result.details };
  } catch (e) {
    return { worker: "runDueScheduledReports", ok: false, durationMs: Date.now() - started, error: truncErr(e) };
  }
}

// ─── Worker: start background rollups that are due ────────────────────────────
// The fan-out queues the due jobs; the admin refresh (refreshRollups) passes
// its validated job list and force flag.

export async function runRefreshRollupsWorker(opts: { jobs?: string[]; force?: boolean } = {}): Promise<WorkerResult> {
  const started = Date.now();
  try {
    const { pool } = await import("../db");
    const { startDueRollups } = await import("./rollups/runner");
    const result = await startDueRollups(pool, opts);
    return { worker: "refreshRollups", ok: true, durationMs: Date.now() - started, details: result };
  } catch (e) {
    return { worker: "refreshRollups", ok: false, durationMs: Date.now() - started, error: truncErr(e) };
  }
}

// ─── Worker: weekly lead scoring ─────────────────────────────────────────────
// Re-scores the providers in the configured territory when the last
// successful run is older than LEAD_SCORING_INTERVAL_MS (imports land in
// between, so scores would otherwise go stale). Starts in the background.

export async function runRefreshLeadScoresWorker(): Promise<WorkerResult> {
  const started = Date.now();
  try {
    const { pool } = await import("../db");
    const { leadScoringStatus, leadScoringDue, startLeadScoring } = await import("./leadScoringJob");
    const { territoryFromRows } = await import("./leadScoring");
    const status = await leadScoringStatus(pool);
    if (!leadScoringDue(status)) {
      return { worker: "refreshLeadScores", ok: true, durationMs: Date.now() - started, details: { started: false, reason: status.running ? "running" : "not due", last_success_at: status.last_success_at } };
    }
    const { ensureScoringRules } = await import("../functions/leadScoring");
    const rows = await ensureScoringRules();
    const territory = territoryFromRows(rows as any);
    if (territory.states.length === 0) {
      return { worker: "refreshLeadScores", ok: true, durationMs: Date.now() - started, details: { started: false, reason: "no states configured" } };
    }
    const result = startLeadScoring(pool, rows as any);
    return { worker: "refreshLeadScores", ok: true, durationMs: Date.now() - started, details: { ...result, states: territory.states } };
  } catch (e) {
    return { worker: "refreshLeadScores", ok: false, durationMs: Date.now() - started, error: truncErr(e) };
  }
}

// ─── Worker: settle scheduled imports whose batch has finished ────────────────
// A schedule is "running" from the moment its batch starts until the batch
// completes or fails. The importer settles it on completion; this sweep covers
// completions that happened during a restart and runs that outlived their lease.

export async function runSettleScheduledImports(): Promise<WorkerResult> {
  const started = Date.now();
  try {
    const { settleRunningSchedules } = await import("./importCompletion");
    const result = await settleRunningSchedules(new Date());
    return { worker: "settleScheduledImports", ok: true, durationMs: Date.now() - started, details: result };
  } catch (e) {
    return { worker: "settleScheduledImports", ok: false, durationMs: Date.now() - started, error: truncErr(e) };
  }
}

// ─── Worker: check the CMS catalogs for newer dataset releases ────────────────
// At most daily (the registry throttles itself). data.json is ~18 MB, so the
// check can outlive the fan-out's reporting budget: it keeps running in the
// background and the next heartbeat shows its result in dataset_versions.

const CATALOG_REPORT_WAIT_MS = 40_000;

export async function runCheckCmsCatalog(): Promise<WorkerResult> {
  const started = Date.now();
  try {
    const [{ refreshCatalog }, { IMPORT_TYPE_URLS }] = await Promise.all([import("./datasetRegistry"), import("../functions/triggerImport")]);
    const refresh = refreshCatalog({ urls: IMPORT_TYPE_URLS });
    const result = await Promise.race([
      refresh.then((r) => ({ done: true as const, r })),
      new Promise<{ done: false }>((resolve) => setTimeout(() => resolve({ done: false }), CATALOG_REPORT_WAIT_MS).unref?.()),
    ]);
    if (!result.done) {
      refresh.catch((e) => console.warn("[checkCmsCatalog] failed:", (e as { message?: string })?.message));
      return { worker: "checkCmsCatalog", ok: true, durationMs: Date.now() - started, details: { still_running: true } };
    }
    return { worker: "checkCmsCatalog", ok: result.r.errors.length === 0, durationMs: Date.now() - started, details: result.r as unknown as Record<string, unknown> };
  } catch (e) {
    return { worker: "checkCmsCatalog", ok: false, durationMs: Date.now() - started, error: truncErr(e) };
  }
}

export const FANOUT_WORKERS: Array<{ name: string; run: () => Promise<WorkerResult>; destructive?: boolean }> = [
  { name: "settleScheduledImports", run: runSettleScheduledImports },
  { name: "checkCmsCatalog", run: runCheckCmsCatalog },
  { name: "autoResumePausedImports", run: runAutoResumePausedImports },
  { name: "autoRetryFailedImports", run: runAutoRetryFailedImports },
  { name: "manageCrawlerRetries", run: runManageCrawlerRetries },
  { name: "cancelStalledImports", run: runCancelStalledImports },
  { name: "runDueScheduledReports", run: runDueScheduledReportsWorker },
  { name: "refreshRollups", run: runRefreshRollupsWorker },
  { name: "refreshLeadScores", run: runRefreshLeadScoresWorker },
];

export async function runMaintenanceFanout(
  invokedBy: InvokedBy,
  opts: { userEmail?: string; budgetMs?: number; schedules?: Record<string, unknown> } = {},
): Promise<{ workers: WorkerResult[] }> {
  const budgetMs = opts.budgetMs ?? 45_000;
  const started = Date.now();

  const placeholders = new Map<string, WorkerResult>();
  for (const w of FANOUT_WORKERS) {
    // Honest default: if a worker hasn't reported by the budget it has exceeded
    // the *reporting* window — it is not cancelled and may still complete (the
    // workers are idempotent). Don't label it a hard "timeout"/failure.
    placeholders.set(w.name, { worker: w.name, ok: false, durationMs: 0, error: "exceeded reporting budget (still running)" });
  }

  const invocations = FANOUT_WORKERS.map(async w => {
    try {
      const result = await w.run();
      placeholders.set(w.name, result);
    } catch (e) {
      placeholders.set(w.name, { worker: w.name, ok: false, durationMs: Date.now() - started, error: truncErr(e) });
    }
  });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<void>(resolve => {
    timeoutId = setTimeout(resolve, budgetMs);
  });
  try {
    await Promise.race([Promise.all(invocations), timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }

  const workers = Array.from(placeholders.values());
  await writeMaintenanceHeartbeat(workers, invokedBy, { userEmail: opts.userEmail, budgetMs, schedules: opts.schedules });
  return { workers };
}
