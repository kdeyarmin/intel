// Port of base44/functions/superviseNPPESCrawler/entry.ts
// Worker supervisor for the NPPES crawler.
//
// Workers are spawned fire-and-forget; if every worker for a batch dies
// (platform restart, unhandled exception, OOM), the batch sits in
// 'processing' with pending queue items but nobody picks them up. In-worker
// recovery only fires *while* a worker is alive, and cancelStalledImports
// only acts after a much longer stall window. This function bridges that
// gap: it runs on a 1–2 minute cadence, detects abandoned NPPES batches, and
// respawns the worker pool.
//
// NPPES queue items are typically updated when claimed (status='processing')
// and again on completion/failure. A long-running task can easily exceed 90s
// without any queue-item update, which would cause the supervisor to falsely
// declare workers dead and pile on extra workers (increasing rate-limit
// pressure). We use a generous 5-minute threshold AND require that the parent
// ImportBatch's updated_date is also stale, since the crawler's
// updateBatchStats refreshes it at every checkpoint. Both signals must agree
// before we conclude the worker pool is gone.
//
// Auth: the original enforced admin at the HTTP boundary (Deno.serve). This
// module is internal-only and carries no auth; manual triggering goes through
// POST /api/maintenance/superviseNppesCrawler (see the TASKS registry in
// server/routes/maintenance.ts), which enforces maintenanceAuth (the
// MAINTENANCE_TOKEN service token or a platform admin).

import { db, pool } from "../db";
import { importBatches, nppesQueueItems } from "../db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

const STALE_QUEUE_ACTIVITY_SECONDS = 5 * 60;
const STALE_BATCH_HEARTBEAT_SECONDS = 5 * 60;
const MAX_RESPAWNS_PER_BATCH = 5;                 // Hard cap so we don't restart forever
const RESPAWN_COOLDOWN_SECONDS = 60;              // Don't respawn faster than this

// Synthetic admin used when internally invoking the crawler. Real human admin
// credentials are enforced at the HTTP boundary (routes/maintenance.ts); this
// is just the internal call identity. Mirrors SYSTEM_ADMIN_USER in
// server/lib/maintenance.ts.
const SYSTEM_ADMIN_USER = { id: -1, email: "system@maintenance", role: "admin" } as const;

export type SupervisorResult = {
  checked: number;
  respawned: number;
  details: any[];
};

/**
 * Scan active NPPES batches and respawn dead worker pools. Never throws —
 * every failure (per-batch or fatal) is aggregated into `details`.
 */
export async function runSuperviseNppesCrawler(): Promise<SupervisorResult> {
  const decisions: any[] = [];
  try {
    const now = Date.now();
    const activeBatches = await db.select().from(importBatches)
      .where(and(
        eq(importBatches.import_type, "nppes_registry"),
        eq(importBatches.status, "processing"),
      ))
      .orderBy(desc(importBatches.created_date))
      .limit(50);

    // Import lazily so this module can be loaded without dragging the whole
    // crawler (API cache, worker state) into the import graph.
    const { handleNppesCrawler } = await import("./nppesCrawler");

    for (const batch of activeBatches) {
      try {
        const retryParams = (batch.retry_params as Record<string, any> | null) ?? {};
        const respawns = typeof retryParams.supervisor_respawns === "number" ? retryParams.supervisor_respawns : 0;
        const lastRespawnAt = retryParams.supervisor_last_respawn_at
          ? new Date(retryParams.supervisor_last_respawn_at).getTime()
          : 0;

        if (respawns >= MAX_RESPAWNS_PER_BATCH) {
          decisions.push({ batch_id: batch.id, action: "skipped_max_respawns", respawns });
          continue;
        }
        if (now - lastRespawnAt < RESPAWN_COOLDOWN_SECONDS * 1000) {
          decisions.push({ batch_id: batch.id, action: "skipped_cooldown" });
          continue;
        }

        // Get queue items for this batch and decide whether workers are alive
        const items: any[] = await db.select().from(nppesQueueItems)
          .where(eq(nppesQueueItems.batch_id, batch.id))
          .orderBy(desc(nppesQueueItems.updated_date))
          .limit(500)
          .catch(() => []);

        if (items.length === 0) {
          decisions.push({ batch_id: batch.id, action: "no_items" });
          continue;
        }

        const pending = items.filter((i) => i.status === "pending" || i.status === "processing");
        if (pending.length === 0) {
          decisions.push({ batch_id: batch.id, action: "no_runnable_items" });
          continue;
        }

        // Two heartbeat signals — newest queue-item update AND the batch's own
        // updated_date (refreshed by nppesCrawler.updateBatchStats at every
        // checkpoint). Require both to be stale before respawning, otherwise
        // long-running tasks that haven't yet emitted a queue-item update can
        // be misread as dead.
        const newestActivity = items.reduce((latest: number, i) => {
          const t = new Date(i.updated_date || i.created_date || 0).getTime();
          return t > latest ? t : latest;
        }, 0);
        const batchActivity = new Date(batch.updated_date || batch.created_date || 0).getTime();

        const secondsSinceQueueActivity = (now - newestActivity) / 1000;
        const secondsSinceBatchActivity = (now - batchActivity) / 1000;
        const queueLooksStale = secondsSinceQueueActivity >= STALE_QUEUE_ACTIVITY_SECONDS;
        const batchLooksStale = secondsSinceBatchActivity >= STALE_BATCH_HEARTBEAT_SECONDS;

        if (!queueLooksStale || !batchLooksStale) {
          decisions.push({
            batch_id: batch.id,
            action: "workers_alive",
            seconds_since_queue_activity: Math.round(secondsSinceQueueActivity),
            seconds_since_batch_activity: Math.round(secondsSinceBatchActivity),
          });
          continue;
        }
        const secondsSinceActivity = Math.min(secondsSinceQueueActivity, secondsSinceBatchActivity);

        // Workers look dead. Re-spawn one. nppesCrawler's own loop will fan out.
        //
        // The stamp is also the claim: it only applies while the batch is
        // still processing and the cooldown we read still holds, so of two
        // overlapping runs (a cron tick and an admin's manual trigger, or two
        // autoscaled instances) one wins and the other stands down instead of
        // double-spawning. Same pattern as the auto-resume/auto-retry workers
        // in server/lib/maintenance.ts.
        const claimed = await db.update(importBatches).set({
          retry_params: {
            ...retryParams,
            supervisor_respawns: respawns + 1,
            supervisor_last_respawn_at: new Date().toISOString(),
            supervisor_last_reason: `No queue activity for ${Math.round(secondsSinceActivity)}s, ${pending.length} pending`,
          },
          // Base44 auto-bumps the updated_date system field on every entity
          // update; mirror that explicitly here since Drizzle doesn't. It also
          // gives the respawned worker a grace window: the batch heartbeat
          // looks fresh, so the supervisor can't conclude "dead" again until
          // the 5-minute staleness threshold ages out (the 60s cooldown is
          // subsumed). Without this, a slow-to-checkpoint worker would get a
          // fresh respawn every cooldown tick — the pile-on this supervisor is
          // designed to avoid.
          updated_date: new Date(),
        }).where(and(
          eq(importBatches.id, batch.id),
          eq(importBatches.status, "processing"),
          sql`COALESCE((retry_params->>'supervisor_last_respawn_at')::timestamptz, 'epoch'::timestamptz) < NOW() - make_interval(secs => ${RESPAWN_COOLDOWN_SECONDS})`,
        )).returning({ id: importBatches.id });

        if (claimed.length === 0) {
          decisions.push({ batch_id: batch.id, action: "skipped_cooldown" });
          continue;
        }

        // Fire-and-forget, mirroring Base44's functions.invoke. The ported
        // crawler runs workers in-process (processQueueWorkerWithRestart
        // self-chains via setTimeout and self-throttles at
        // MAX_CONCURRENT_WORKERS), so we kick it off without awaiting —
        // awaiting would serialize up to ~120s per respawned batch and break
        // the supervisor's 1–2 minute cadence.
        handleNppesCrawler(
          { action: "process_queue", dry_run: !!batch.dry_run },
          SYSTEM_ADMIN_USER,
        ).catch((e: any) => console.error(
          `[superviseNPPESCrawler] respawned worker for batch ${batch.id} crashed:`,
          e?.message || e,
        ));

        decisions.push({
          batch_id: batch.id,
          action: "respawned",
          respawns: respawns + 1,
          seconds_since_activity: Math.round(secondsSinceActivity),
          pending_items: pending.length,
        });
      } catch (e: any) {
        console.error(`[superviseNPPESCrawler] Failed to evaluate/respawn batch ${batch.id}:`, e?.message || e);
        decisions.push({ batch_id: batch.id, action: "batch_error", error: e?.message || String(e) });
      }
    }

    return {
      checked: activeBatches.length,
      respawned: decisions.filter((d) => d.action === "respawned").length,
      details: decisions,
    };
  } catch (e: any) {
    console.error("[superviseNPPESCrawler] fatal:", e?.message || e);
    return {
      checked: 0,
      respawned: 0,
      details: [...decisions, { action: "fatal", error: e?.message || String(e) }],
    };
  }
}

// ─── In-process cadence (optional) ────────────────────────────────────────────
// The supervisor is designed for a 1–2 minute cadence — much faster than the
// 10-minute maintenance cron that drives runScheduledImports. Set
// NPPES_SUPERVISOR_INTERVAL_MS (>= 60000) to run it in-process, mirroring
// server/lib/maintenanceTicker.ts; a Postgres advisory lock lets several
// instances share one tick. An external cron hitting
// POST /api/maintenance/superviseNppesCrawler remains an option; leave the
// variable unset when one is wired.

export const SUPERVISOR_TICK_LOCK = 4206920; // arbitrary; distinct from maintenance TICK_LOCK (4206919)
export const MIN_SUPERVISOR_TICK_MS = 60_000;
export const DEFAULT_SUPERVISOR_TICK_MS = 90_000;

/** Pure: the tick interval an environment asks for, or 0 (off). */
export function supervisorTickInterval(env: Record<string, string | undefined> = process.env): number {
  const raw = env.NPPES_SUPERVISOR_INTERVAL_MS;
  if (!raw) return 0;
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(MIN_SUPERVISOR_TICK_MS, Math.floor(ms));
}

export async function runSupervisorTick(
  dbPool: typeof pool,
  log: Pick<Console, "log" | "warn"> = console,
): Promise<"ran" | "skipped" | "failed"> {
  let client: any;
  try {
    client = await dbPool.connect();
  } catch (e: any) {
    log.warn("[nppes supervisor tick] no database connection:", e?.message || e);
    return "failed";
  }
  let locked = false;
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [SUPERVISOR_TICK_LOCK]);
    locked = !!rows[0]?.ok;
    if (!locked) return "skipped"; // another instance is ticking
    const r = await runSuperviseNppesCrawler();
    const failed = r.details.filter((d) => d.action === "batch_error" || d.action === "fatal").length;
    log.log(`[nppes supervisor tick] checked ${r.checked} batch(es), respawned ${r.respawned}; ${failed} decision(s) errored`);
    return "ran";
  } catch (e: any) {
    log.warn("[nppes supervisor tick] failed:", e?.message || e);
    return "failed";
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock($1)", [SUPERVISOR_TICK_LOCK]).catch(() => {});
    client.release();
  }
}

export function startNppesSupervisorTicker(
  dbPool: typeof pool,
  env: Record<string, string | undefined> = process.env,
  log: Pick<Console, "log" | "warn"> = console,
): NodeJS.Timeout | null {
  const every = supervisorTickInterval(env);
  if (!every) return null;
  log.log(`[nppes supervisor] in-process supervisor every ${Math.round(every / 1000)}s (NPPES_SUPERVISOR_INTERVAL_MS)`);
  let running = false;
  const timer = setInterval(() => {
    if (running) return; // a slow tick never overlaps the next
    running = true;
    runSupervisorTick(dbPool, log).finally(() => { running = false; });
  }, every);
  timer.unref?.();
  return timer;
}
