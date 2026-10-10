// getRollupStatus (public, read-only) and refreshRollups (admin).
import { pool } from "../db";
import { jobByName, rollupStatus, startDueRollups } from "../lib/rollups/runner";

export async function handleGetRollupStatus() {
  return { jobs: await rollupStatus(pool) };
}

export async function handleRefreshRollups(payload: any) {
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
  const result = await startDueRollups(pool, { jobs, force: payload?.force !== false });
  return { success: true, ...result, jobs: await rollupStatus(pool) };
}
