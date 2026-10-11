// getRollupStatus (public, read-only) and refreshRollups (admin).
import { pool } from "../db";
import { runRefreshRollupsWorker, writeMaintenanceHeartbeat } from "../lib/maintenance";
import { jobByName, rollupStatus } from "../lib/rollups/runner";

export async function handleGetRollupStatus() {
  return { jobs: await rollupStatus(pool) };
}

export async function handleRefreshRollups(payload: any, user?: { email?: string | null } | null) {
  let jobs: string[] | undefined;
  if (payload?.jobs !== undefined) {
    // Named jobs must all exist: a typo must not fall through to "every job"
    // (this runs forced, so that would start every full-table scan).
    const list = Array.isArray(payload.jobs) ? payload.jobs : [payload.jobs];
    const unknown = list.filter((j: unknown) => typeof j !== "string" || !jobByName(j));
    if (unknown.length || list.length === 0) {
      throw Object.assign(new Error(list.length ? `Unknown rollup job: ${unknown.map(String).join(", ")}.` : "Name at least one rollup job, or leave jobs out to run them all."), { status: 400 });
    }
    jobs = list;
  }
  // Queued through the maintenance worker and recorded in the
  // maintenance_fanout heartbeat, like the other maintenance tasks. A request
  // rejected above never ran, so it isn't recorded.
  const worker = await runRefreshRollupsWorker({ jobs, force: payload?.force !== false });
  await writeMaintenanceHeartbeat([worker], "admin_ui", { userEmail: user?.email ?? undefined });
  if (!worker.ok) throw Object.assign(new Error(`Couldn't queue the rollups: ${worker.error}`), { status: 500 });
  return { success: true, ...worker.details, worker, jobs: await rollupStatus(pool) };
}
