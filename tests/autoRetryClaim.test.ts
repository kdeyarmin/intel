/**
 * The auto-retry and auto-resume workers claim a batch with the same statement that stamps its counter, and
 * that statement only applies while the batch is still failed (or paused) with the count the worker read.
 * Two overlapping runs (a cron tick and an admin's button) then can't both resume the same batch.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rows: [] as any[],
  claim: [{ id: 1 }] as any[],
  triggered: [] as any[],
}));

vi.mock("../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => h.rows }) }) }) }),
    update: () => ({ set: () => ({ where: () => ({ returning: async () => h.claim }) }) }),
  },
  pool: {},
}));
vi.mock("../server/functions/triggerImport", () => ({
  handleTriggerImport: async (payload: any) => { h.triggered.push(payload); return { success: true }; },
}));

import { runAutoResumePausedImports, runAutoRetryFailedImports } from "../server/lib/maintenance";

const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);

beforeEach(() => {
  h.rows = [];
  h.claim = [{ id: 1 }];
  h.triggered.length = 0;
});

describe("runAutoRetryFailedImports", () => {
  const failed = () => ({
    id: 7, status: "failed", import_type: "cms_order_referring", dry_run: false,
    error_samples: [{ message: "fetch failed: ETIMEDOUT" }], retry_params: { file_url: "https://data.cms.gov/x", year: 2024 },
    completed_at: hoursAgo(5), updated_date: hoursAgo(5), created_date: hoursAgo(6),
  });

  it("resumes the failed batch it claimed", async () => {
    h.rows = [failed()];
    const r = await runAutoRetryFailedImports();
    expect(r).toMatchObject({ ok: true, details: { retried_count: 1 } });
    expect(h.triggered).toHaveLength(1);
    expect(h.triggered[0]).toMatchObject({ batch_id: 7, retry_of: 7, retry_count: 1 });
  });

  it("leaves a batch alone when another run claimed it first", async () => {
    h.rows = [failed()];
    h.claim = []; // the conditional stamp matched nothing: the other run already moved the counter
    const r = await runAutoRetryFailedImports();
    expect(h.triggered).toHaveLength(0);
    expect(r).toMatchObject({ ok: true, details: { retried_count: 0, skipped: [{ id: 7, reason: "claimed_by_another_run" }] } });
  });
});

describe("runAutoResumePausedImports", () => {
  const paused = () => ({
    id: 8, status: "paused", import_type: "cms_order_referring", dry_run: false,
    retry_params: { file_url: "https://data.cms.gov/x", year: 2024, resume_offset: 2000 }, updated_date: hoursAgo(1),
  });

  it("resumes the paused batch it claimed", async () => {
    h.rows = [paused()];
    const r = await runAutoResumePausedImports();
    expect(r).toMatchObject({ ok: true, details: { resumed_count: 1 } });
    expect(h.triggered[0]).toMatchObject({ batch_id: 8, resume_offset: 2000 });
  });

  it("leaves a batch alone when another run claimed it first", async () => {
    h.rows = [paused()];
    h.claim = [];
    const r = await runAutoResumePausedImports();
    expect(h.triggered).toHaveLength(0);
    expect(r).toMatchObject({ ok: true, details: { resumed_count: 0, skipped: [{ id: 8, reason: "claimed_by_another_run" }] } });
  });
});
