/**
 * A CSV import that runs out of rows must not mark a batch "completed" when the
 * user cancelled (or paused) it since the last check: a stalled remote file that
 * later resumes would otherwise finish a cancelled batch.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  batchStatus: "processing",
  updates: [] as Array<Record<string, unknown>>,
  finished: [] as unknown[],
  settled: [] as number[],
}));

vi.mock("../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 1, status: h.batchStatus }] }) }) }),
    update: () => ({ set: (values: Record<string, unknown>) => ({ where: async () => { h.updates.push(values); } }) }),
  },
  pool: { query: async () => ({ rows: [], rowCount: 0 }) },
}));
vi.mock("../server/lib/datasetRegistry", () => ({
  markImportStarted: async () => {},
  markImportFinished: async (...args: unknown[]) => { h.finished.push(args); },
  resolveImportVersion: async () => null,
}));
vi.mock("../server/lib/importCompletion", () => ({
  settleBatchCompletion: async (id: number) => { h.settled.push(id); },
}));
vi.mock("../server/lib/importSources", async (original) => ({
  ...(await original<typeof import("../server/lib/importSources")>()),
  csvSourceRecords: async function* () {
    yield { from_npi: "1003000126", to_npi: "1003000134" };
    yield { from_npi: "1003000126", to_npi: "1003000142" };
  },
}));

import { handleAutoImportCMSData } from "../server/functions/triggerImport";

const params = { import_type: "physician_shared_patient_patterns", file_url: "/api/storage/pairs.csv", year: 2015, dry_run: true, batch_id: 1 };

beforeEach(() => {
  h.batchStatus = "processing";
  h.updates.length = 0;
  h.finished.length = 0;
  h.settled.length = 0;
});

describe("CSV import completion", () => {
  it("completes a batch nobody stopped", async () => {
    await handleAutoImportCMSData(params);
    expect(h.updates.some((u) => u.status === "completed")).toBe(true);
  });

  it("leaves a batch cancelled while its rows were read as cancelled, and closes the registry row", async () => {
    h.batchStatus = "cancelled";
    await handleAutoImportCMSData(params);
    expect(h.updates.some((u) => u.status === "completed")).toBe(false);
    // endedWithoutFinishing: the dataset registry is closed as not-ok and the schedule settles.
    expect(h.finished).toHaveLength(1);
    expect(h.finished[0]).toMatchObject([ "physician_shared_patient_patterns", { batchId: 1, ok: false } ]);
    expect(h.settled).toContain(1);
  });

  it("does the same for a batch paused at the end", async () => {
    h.batchStatus = "paused";
    await handleAutoImportCMSData(params);
    expect(h.updates.some((u) => u.status === "completed")).toBe(false);
  });
});
