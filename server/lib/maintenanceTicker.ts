// Optional in-process maintenance tick for hosts without an external
// scheduler. Set MAINTENANCE_INPROCESS_INTERVAL_MS (>= 60000) and the server
// runs the same cron entrypoint (handleRunScheduledImports: due schedules,
// then the FANOUT_WORKERS) on that cadence. A Postgres advisory lock lets
// several instances share one tick, so enabling it on an autoscaled service
// doesn't multiply the work. An external cron hitting
// POST /api/maintenance/runScheduledImports remains the recommended setup;
// leave the variable unset when one is wired.

export const TICK_LOCK = 4206919; // arbitrary; distinct from the boot-index and migration locks
export const MIN_TICK_MS = 60_000;

/** Pure: the tick interval an environment asks for, or 0 (off). */
export function tickerInterval(env: Record<string, string | undefined> = process.env): number {
  const raw = env.MAINTENANCE_INPROCESS_INTERVAL_MS;
  if (!raw) return 0;
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(MIN_TICK_MS, Math.floor(ms));
}

export async function runTick(pool: any, log: Pick<Console, "log" | "warn"> = console): Promise<"ran" | "skipped" | "failed"> {
  let client: any;
  try {
    client = await pool.connect();
  } catch (e: any) {
    log.warn("[maintenance tick] no database connection:", e?.message || e);
    return "failed";
  }
  let locked = false;
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock($1) AS ok", [TICK_LOCK]);
    locked = !!rows[0]?.ok;
    if (!locked) return "skipped"; // another instance is ticking
    const { handleRunScheduledImports } = await import("../functions/scheduledImports");
    const r: any = await handleRunScheduledImports();
    // A worker that exceeded the reporting budget is still running (timedOut),
    // not broken: don't count it as a problem.
    log.log(`[maintenance tick] checked ${r?.checked ?? 0} schedule(s), started ${r?.processed ?? 0}; ${(r?.maintenance || []).filter((w: any) => !w.ok && !w.timedOut).length} worker(s) reported a problem`);
    return "ran";
  } catch (e: any) {
    log.warn("[maintenance tick] failed:", e?.message || e);
    return "failed";
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock($1)", [TICK_LOCK]).catch(() => {});
    client.release();
  }
}

export function startMaintenanceTicker(pool: any, env: Record<string, string | undefined> = process.env, log: Pick<Console, "log" | "warn"> = console): NodeJS.Timeout | null {
  const every = tickerInterval(env);
  if (!every) return null;
  log.log(`[maintenance tick] in-process maintenance every ${Math.round(every / 1000)}s (MAINTENANCE_INPROCESS_INTERVAL_MS)`);
  let running = false;
  const timer = setInterval(() => {
    if (running) return; // a slow tick never overlaps the next
    running = true;
    runTick(pool, log).finally(() => { running = false; });
  }, every);
  timer.unref?.();
  return timer;
}
