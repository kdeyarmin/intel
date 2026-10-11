/**
 * Scheduled imports settle on batch completion (server/lib/importCompletion.ts):
 * the pure decision and the columns it writes.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));

import { decideSettlement, settlementUpdate, shouldApply, RUN_LEASE_MS } from "../server/lib/importCompletion";

const now = new Date("2026-10-11T12:00:00.000Z");
const lease = new Date(now.getTime() + RUN_LEASE_MS);

describe("decideSettlement", () => {
  it("succeeds on a completed batch with its counts", () => {
    expect(decideSettlement({ id: 7, status: "completed", imported_rows: 120, skipped_rows: 3 }, now, lease))
      .toEqual({ action: "success", summary: "Completed batch #7: 120 imported, 3 skipped" });
  });

  it("fails on failed and cancelled batches, naming the error", () => {
    expect(decideSettlement({ id: 7, status: "failed", error_samples: [{ message: "HTTP 503" }] }, now, lease))
      .toEqual({ action: "failed", summary: "Batch #7 failed: HTTP 503" });
    expect(decideSettlement({ id: 8, status: "cancelled", cancel_reason: "stalled" }, now, lease).action).toBe("failed");
  });

  it("treats a batch that stopped at the page limit as not done", () => {
    const d = decideSettlement({ id: 9, status: "completed_with_errors", imported_rows: 5, skipped_rows: 0 }, now, lease);
    expect(d.action).toBe("failed");
    expect(d).toMatchObject({ summary: expect.stringMatching(/stopped early/) });
  });

  it("waits while the batch is still processing, paused or missing, until the lease expires", () => {
    expect(decideSettlement({ id: 1, status: "processing" }, now, lease)).toEqual({ action: "wait", reason: "batch_processing" });
    expect(decideSettlement({ id: 1, status: "paused" }, now, lease)).toEqual({ action: "wait", reason: "batch_paused" });
    expect(decideSettlement(null, now, lease)).toEqual({ action: "wait", reason: "batch_not_found" });
    const later = new Date(lease.getTime() + 1);
    expect(decideSettlement({ id: 1, status: "processing" }, later, lease).action).toBe("failed");
    expect(decideSettlement(null, later, lease).action).toBe("failed");
  });

  it("never waits forever when no lease is known: open batches just wait", () => {
    expect(decideSettlement({ id: 1, status: "processing" }, now, null).action).toBe("wait");
  });
});

describe("settlementUpdate", () => {
  const schedule = { id: 3, schedule_frequency: "daily", schedule_time: "02:00", consecutive_failures: 2 };

  it("records a success with the batch's completion time and resets failures", () => {
    const u = settlementUpdate(schedule, { action: "success", summary: "done" }, { id: 7, status: "completed", completed_at: "2026-10-11T11:55:00.000Z" }, now, () => 0.5);
    expect(u).toMatchObject({ last_run_status: "success", consecutive_failures: 0, last_run_summary: "done" });
    expect((u.last_successful_run_at as Date).toISOString()).toBe("2026-10-11T11:55:00.000Z");
    expect((u.next_run_at as Date).getTime()).toBeGreaterThan(now.getTime());
  });

  it("records a failure with backoff and no successful-run time", () => {
    const u = settlementUpdate(schedule, { action: "failed", summary: "boom" }, { id: 7, status: "failed" }, now, () => 0.5);
    expect(u).toMatchObject({ last_run_status: "failed", consecutive_failures: 3 });
    expect(u.last_successful_run_at).toBeUndefined();
    const ok = settlementUpdate({ ...schedule, consecutive_failures: 0 }, { action: "success", summary: "x" }, null, now, () => 0.5);
    // Three failures add backoffHours(3) = 4h to the next run.
    expect((u.next_run_at as Date).getTime() - (ok.next_run_at as Date).getTime()).toBe(4 * 60 * 60_000);
  });
});

describe("shouldApply", () => {
  it("settles running schedules either way and only upgrades failed ones", () => {
    expect(shouldApply("running", { action: "success", summary: "" })).toBe(true);
    expect(shouldApply("running", { action: "failed", summary: "" })).toBe(true);
    expect(shouldApply("failed", { action: "success", summary: "" })).toBe(true);
    expect(shouldApply("failed", { action: "failed", summary: "" })).toBe(false);
    expect(shouldApply("success", { action: "success", summary: "" })).toBe(false);
    expect(shouldApply("running", { action: "wait", reason: "batch_processing" })).toBe(false);
  });
});
