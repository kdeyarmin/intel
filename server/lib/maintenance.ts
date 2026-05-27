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
import { eq, sql } from "drizzle-orm";
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
const STALLED_AFTER_MS = 60 * 60 * 1000; // 1 hour matches base44 cancelStalledImports.

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
      if (batch.import_type === "nppes_registry") continue;

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
        // resume immediately re-pauses or fails.
        await db.update(importBatches).set({
          retry_params: { ...params, auto_resume_count: autoResumeCount + 1 },
          updated_date: new Date(),
        }).where(eq(importBatches.id, batch.id));

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
      const decision = shouldRetryBatch(batch as unknown as Record<string, unknown>, now);
      if (!decision.eligible) {
        skipped.push({ id: batch.id, reason: decision.reason });
        continue;
      }

      const nextAttempt = decision.attemptCount + 1;
      const params = (batch.retry_params as Record<string, unknown> | null) ?? {};

      try {
        await db.update(importBatches).set({
          retry_params: {
            ...params,
            auto_retry_count: nextAttempt,
            last_auto_retry_at: now.toISOString(),
            last_auto_retry_reason: extractErrorMessage(batch as unknown as Record<string, unknown>).substring(0, 200),
          },
          updated_date: now,
        }).where(eq(importBatches.id, batch.id));

        await handleTriggerImport({
          import_type: batch.import_type,
          file_url: (params.file_url as string | undefined) ?? undefined,
          year: params.year,
          dry_run: !!batch.dry_run,
          row_offset: params.row_offset ?? undefined,
          row_limit: params.row_limit ?? undefined,
          resume_offset: params.resume_offset ?? undefined,
          retry_of: batch.id,
          retry_count: nextAttempt,
          retry_tags: ["auto_retry_failed"],
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
// Long-running 'processing' batches that haven't been updated in
// STALLED_AFTER_MS are flagged failed so operators (and autoRetryFailedImports)
// can react. Idempotent — re-marking an already-failed batch is a no-op
// because we only target status='processing'.

export async function runCancelStalledImports(): Promise<WorkerResult> {
  const started = Date.now();
  try {
    const cutoff = new Date(Date.now() - STALLED_AFTER_MS);
    const stalled = await db.select({ id: importBatches.id, import_type: importBatches.import_type })
      .from(importBatches)
      .where(sql`status = 'processing' AND updated_date < ${cutoff}`)
      .limit(200);

    let cancelled = 0;
    for (const batch of stalled) {
      await db.update(importBatches).set({
        status: "failed",
        cancel_reason: `Auto-cancelled: stalled (no updates for ${Math.round(STALLED_AFTER_MS / 60000)}m)`,
        cancelled_at: new Date(),
        updated_date: new Date(),
      }).where(eq(importBatches.id, batch.id));
      cancelled++;
    }

    return {
      worker: "cancelStalledImports",
      ok: true,
      durationMs: Date.now() - started,
      details: { scanned: stalled.length, cancelled, threshold_ms: STALLED_AFTER_MS },
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
  opts: { userEmail?: string; skippedReason?: string | null; budgetMs?: number } = {},
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
      },
    });
  } catch (e) {
    // Heartbeat write failures are best-effort — they shouldn't take down the
    // calling worker. Log and move on.
    console.warn("[maintenance] heartbeat write failed:", (e as { message?: string })?.message);
  }
}

// ─── Umbrella: maintenance fanout ────────────────────────────────────────────
// Runs every non-destructive worker in parallel with a hard time budget, then
// writes the heartbeat. Mirrors the base44 runScheduledImports fanout but
// without the schedule-loop preamble — that part will be wired in a separate
// PR when the cron driver is fully ported to Express.

export const FANOUT_WORKERS: Array<{ name: string; run: () => Promise<WorkerResult>; destructive?: boolean }> = [
  { name: "autoResumePausedImports", run: runAutoResumePausedImports },
  { name: "autoRetryFailedImports", run: runAutoRetryFailedImports },
  { name: "cancelStalledImports", run: runCancelStalledImports },
];

export async function runMaintenanceFanout(
  invokedBy: InvokedBy,
  opts: { userEmail?: string; budgetMs?: number } = {},
): Promise<{ workers: WorkerResult[] }> {
  const budgetMs = opts.budgetMs ?? 45_000;
  const started = Date.now();

  const placeholders = new Map<string, WorkerResult>();
  for (const w of FANOUT_WORKERS) {
    placeholders.set(w.name, { worker: w.name, ok: false, durationMs: 0, error: "timeout" });
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
  await writeMaintenanceHeartbeat(workers, invokedBy, { userEmail: opts.userEmail, budgetMs });
  return { workers };
}
