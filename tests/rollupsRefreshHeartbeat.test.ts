/**
 * The admin "Refresh analytics rollups" entrypoint (refreshRollups) queues
 * through the maintenance worker and records its outcome in the
 * maintenance_fanout heartbeat that MaintenanceHealthPanel reads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ heartbeats: [] as any[], runsFail: false }));

vi.mock("../server/db", () => {
  const client = {
    async query(sql: string) {
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ ok: true }] };
      if (sql.startsWith("SELECT min(id)")) return { rows: [{ lo: null, hi: null }] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    async query(sql: string) {
      if (h.runsFail && sql.includes("FROM rollup_runs")) throw new Error("db down");
      return { rows: [] };
    },
    connect: async () => client,
  };
  const db = { insert: () => ({ values: async (row: any) => { h.heartbeats.push(row); } }) };
  return { pool, db };
});

import { handleRefreshRollups } from "../server/functions/rollups";
import { waitForRollups } from "../server/lib/rollups/runner";

beforeEach(() => {
  h.heartbeats.length = 0;
  h.runsFail = false;
});

describe("refreshRollups heartbeat", () => {
  it("records the queued refresh as a maintenance_fanout event", async () => {
    const r: any = await handleRefreshRollups({ jobs: ["facility_types"] }, { email: "admin@example.com" });
    await waitForRollups();
    expect(r).toMatchObject({ success: true, started: ["facility_types"], worker: { worker: "refreshRollups", ok: true } });
    expect(h.heartbeats).toHaveLength(1);
    expect(h.heartbeats[0]).toMatchObject({
      event_type: "maintenance_fanout",
      user_email: "admin@example.com",
      details: {
        invoked_by: "admin_ui",
        succeeded: 1,
        failed: 0,
        workers: [{ worker: "refreshRollups", ok: true, details: { started: ["facility_types"], running: [], notDue: [] } }],
      },
    });
  });

  it("records a refresh that unable to be queued, and still fails the request", async () => {
    h.runsFail = true;
    await expect(handleRefreshRollups({}, { email: "admin@example.com" })).rejects.toMatchObject({ status: 500, message: expect.stringMatching(/db down/) });
    expect(h.heartbeats).toHaveLength(1);
    expect(h.heartbeats[0].details).toMatchObject({ succeeded: 0, failed: 1, workers: [{ worker: "refreshRollups", ok: false, error: "db down" }] });
  });

  it("doesn't record a request it rejects", async () => {
    await expect(handleRefreshRollups({ jobs: ["typo"] })).rejects.toMatchObject({ status: 400 });
    expect(h.heartbeats).toHaveLength(0);
  });
});
