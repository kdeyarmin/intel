// getRollupStatus (public, read-only) and refreshRollups (admin).
import { pool } from "../db";
import { jobByName, rollupStatus, startDueRollups } from "../lib/rollups/runner";

export async function handleGetRollupStatus() {
  return { jobs: await rollupStatus(pool) };
}

export async function handleRefreshRollups(payload: any) {
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs.filter((j: unknown) => typeof j === "string" && jobByName(j)) : undefined;
  const result = await startDueRollups(pool, { jobs, force: payload?.force !== false });
  return { success: true, ...result, jobs: await rollupStatus(pool) };
}
