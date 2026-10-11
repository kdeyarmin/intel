/**
 * The cron driver (handleRunScheduledImports) has exactly one maintenance
 * path: after its schedule loop it calls runMaintenanceFanout from
 * server/lib/maintenance.ts, which runs FANOUT_WORKERS and writes the
 * maintenance_fanout heartbeat. It must not keep private worker copies.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fanoutCalls: [] as any[],
  batches: [] as any[],
  schedules: [] as any[],
  updates: [] as any[],
  triggered: [] as any[],
}));

vi.mock("../server/db", () => {
  const db = {
    // select() reads the schedules; select({ id }) is the lookup of live batches.
    select: (fields?: unknown) => ({ from: () => ({ where: async () => (fields ? h.batches : h.schedules) }) }),
    update: () => ({
      set: (values: any) => ({
        where: () => {
          h.updates.push(values);
          const result: any = Promise.resolve(undefined);
          result.returning = async () => [{ id: 1 }];
          return result;
        },
      }),
    }),
    insert: () => { throw new Error("the cron driver must not write audit events itself"); },
  };
  return { db, pool: {} };
});

vi.mock("../server/functions/triggerImport", () => ({
  handleTriggerImport: async (payload: any) => {
    h.triggered.push(payload);
    return { success: true, batch_id: 42, message: "started" };
  },
}));

vi.mock("../server/functions/nppesCrawler", () => ({
  handleNppesCrawler: async () => ({ success: true }),
}));

vi.mock("../server/lib/maintenance", () => ({
  runMaintenanceFanout: async (invokedBy: string, opts: any) => {
    h.fanoutCalls.push({ invokedBy, opts });
    return { workers: [{ worker: "refreshRollups", ok: true, durationMs: 1 }] };
  },
}));

import { handleRunScheduledImports } from "../server/functions/scheduledImports";

beforeEach(() => {
  h.fanoutCalls.length = 0;
  h.batches.length = 0;
  h.schedules.length = 0;
  h.updates.length = 0;
  h.triggered.length = 0;
});

describe("handleRunScheduledImports fan-out", () => {
  it("runs the shared maintenance fan-out once per tick, as cron, even with nothing due", async () => {
    const r: any = await handleRunScheduledImports();
    expect(h.fanoutCalls).toHaveLength(1);
    expect(h.fanoutCalls[0].invokedBy).toBe("cron");
    expect(h.fanoutCalls[0].opts.schedules).toEqual({ checked: 0, processed: 0, started: 0, skipped: 0 });
    expect(r).toMatchObject({ success: true, checked: 0, processed: 0, maintenance: [{ worker: "refreshRollups", ok: true }] });
  });

  it("reports what the schedule loop did to the fan-out", async () => {
    h.schedules.push({
      id: 1,
      import_type: "hospice_provider_data",
      label: "Hospice",
      is_active: true,
      enabled: true,
      schedule_frequency: "daily",
      schedule_time: "02:00",
      next_run_at: new Date(Date.now() - 60_000),
      consecutive_failures: 0,
    });
    const r: any = await handleRunScheduledImports();
    expect(h.triggered).toHaveLength(1);
    expect(h.triggered[0]).toMatchObject({ import_type: "hospice_provider_data", dry_run: false });
    expect(h.fanoutCalls[0].opts.schedules).toEqual({ checked: 1, processed: 1, started: 1, skipped: 0 });
    expect(r.results[0]).toMatchObject({ import_type: "hospice_provider_data" });
  });

  it("leaves a schedule alone while its own batch is still running, even past its lease", async () => {
    h.schedules.push({
      id: 5,
      import_type: "medicare_facilities",
      label: "Facilities",
      is_active: true,
      enabled: true,
      schedule_frequency: "daily",
      schedule_time: "02:00",
      last_run_status: "running",
      last_batch_id: 77,
      // The six-hour lease ran out; the batch is still going.
      next_run_at: new Date(Date.now() - 60_000),
      consecutive_failures: 0,
    });
    h.batches.push({ id: 77 });
    const r: any = await handleRunScheduledImports();
    expect(h.triggered).toHaveLength(0);
    expect(r.skipped).toEqual([expect.objectContaining({ id: 5, reason: expect.stringMatching(/batch #77\) is still in progress/) })]);
    expect(h.fanoutCalls[0].opts.schedules).toEqual({ checked: 1, processed: 0, started: 0, skipped: 1 });
  });

  it("starts a schedule again when the batch it was waiting on is gone", async () => {
    h.schedules.push({
      id: 6,
      import_type: "hospice_provider_data",
      label: "Hospice",
      is_active: true,
      enabled: true,
      schedule_frequency: "daily",
      schedule_time: "02:00",
      last_run_status: "running",
      last_batch_id: 78,
      next_run_at: new Date(Date.now() - 60_000),
      consecutive_failures: 0,
    });
    // No live batch 78: the process died after the claim, so the schedule is due.
    const r: any = await handleRunScheduledImports();
    expect(h.triggered).toHaveLength(1);
    expect(r.skipped).toEqual([]);
  });

  it("no longer exports private maintenance workers", async () => {
    const mod: any = await import("../server/functions/scheduledImports");
    expect(mod.handleAutoRetryFailedImports).toBeUndefined();
    expect(mod.handleAutoResumePausedImports).toBeUndefined();
    expect(mod.handleCancelStalledImports).toBeUndefined();
  });
});
