import { describe, expect, it, vi } from "vitest";

vi.mock("../server/functions/scheduledImports", () => ({
  handleRunScheduledImports: async () => ({ checked: 2, processed: 1, maintenance: [{ worker: "refreshRollups", ok: true }] }),
}));

import { MIN_TICK_MS, runTick, startMaintenanceTicker, tickerInterval } from "../server/lib/maintenanceTicker";

describe("tickerInterval", () => {
  it("is off unless MAINTENANCE_INPROCESS_INTERVAL_MS is set to a positive number", () => {
    expect(tickerInterval({})).toBe(0);
    expect(tickerInterval({ MAINTENANCE_INPROCESS_INTERVAL_MS: "" })).toBe(0);
    expect(tickerInterval({ MAINTENANCE_INPROCESS_INTERVAL_MS: "abc" })).toBe(0);
    expect(tickerInterval({ MAINTENANCE_INPROCESS_INTERVAL_MS: "0" })).toBe(0);
  });

  it("never ticks more often than once a minute", () => {
    expect(tickerInterval({ MAINTENANCE_INPROCESS_INTERVAL_MS: "5000" })).toBe(MIN_TICK_MS);
    expect(tickerInterval({ MAINTENANCE_INPROCESS_INTERVAL_MS: "600000" })).toBe(600_000);
  });
});

function poolWith(lockOk: boolean) {
  const calls: string[] = [];
  const client = {
    async query(sql: string) {
      calls.push(sql);
      if (sql.includes("pg_try_advisory_lock")) return { rows: [{ ok: lockOk }] };
      return { rows: [] };
    },
    release() { calls.push("release"); },
  };
  return { pool: { connect: async () => client }, calls };
}

describe("runTick", () => {
  it("runs the cron entrypoint under the advisory lock and releases it", async () => {
    const { pool, calls } = poolWith(true);
    const log = { log: vi.fn(), warn: vi.fn() };
    expect(await runTick(pool, log)).toBe("ran");
    expect(calls.some((c) => c.includes("pg_advisory_unlock"))).toBe(true);
    expect(calls.at(-1)).toBe("release");
    expect(log.log.mock.calls[0][0]).toMatch(/checked 2 schedule/);
  });

  it("skips when another instance holds the lock", async () => {
    const { pool, calls } = poolWith(false);
    expect(await runTick(pool, { log: vi.fn(), warn: vi.fn() })).toBe("skipped");
    expect(calls.some((c) => c.includes("pg_advisory_unlock"))).toBe(false);
    expect(calls.at(-1)).toBe("release");
  });

  it("starts no timer when the variable is unset", () => {
    expect(startMaintenanceTicker({}, {}, { log: vi.fn(), warn: vi.fn() })).toBeNull();
  });
});
