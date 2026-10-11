/**
 * retry_params is shared with the auto-retry and auto-resume workers, which
 * keep their attempt counters in it: the importers must merge into it.
 */
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import fs from "fs";
import path from "path";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));
const registry = vi.hoisted(() => ({ finished: [] as any[], settled: [] as number[] }));
vi.mock("../server/lib/datasetRegistry", () => ({
  markImportFinished: async (type: string, opts: any) => { registry.finished.push({ type, ...opts }); },
  markImportStarted: async () => {},
  resolveImportVersion: async () => null,
}));
vi.mock("../server/lib/importCompletion", () => ({ settleBatchCompletion: async (id: number) => { registry.settled.push(id); } }));

import { endedWithoutFinishing, mergeRetryParams } from "../server/functions/triggerImport";

describe("mergeRetryParams", () => {
  it("renders a JSONB merge, so keys written by other workers survive a progress write", () => {
    const { sql, params } = new PgDialect().sqlToQuery(mergeRetryParams({ resume_offset: 5000, headers: undefined, state_filter: "PA" }));
    expect(sql).toMatch(/COALESCE\(.*"retry_params".*'\{\}'::jsonb\) \|\| \$1::jsonb/);
    // undefined keys are not sent, so they can't clear what is stored.
    expect(JSON.parse(params[0] as string)).toEqual({ resume_offset: 5000, state_filter: "PA" });
  });
});

describe("importers that update an existing batch", () => {
  it("the NPPES file importer merges into retry_params on every write", () => {
    const src = fs.readFileSync(path.join(import.meta.dirname, "..", "server", "functions", "importNPPESFile.ts"), "utf8");
    const writes = src.split("\n").filter((l) => l.includes("retry_params:"));
    expect(writes.length).toBeGreaterThan(0);
    for (const line of writes) expect(line).toContain("mergeRetryParams(");
  });
});

describe("endedWithoutFinishing", () => {
  it("tells the registry and the schedule when a run is cancelled or its source keeps failing", async () => {
    registry.finished.length = 0;
    registry.settled.length = 0;
    await endedWithoutFinishing("medicare_hha_utilization", 31, "failed", "Fetch failed at offset 5000: ECONNRESET");
    await endedWithoutFinishing("hospice_provider_data", 32, "cancelled");
    expect(registry.finished).toEqual([
      { type: "medicare_hha_utilization", batchId: 31, ok: false, note: "Fetch failed at offset 5000: ECONNRESET" },
      { type: "hospice_provider_data", batchId: 32, ok: false, note: "cancelled" },
    ]);
    expect(registry.settled).toEqual([31, 32]);
  });

  it("leaves a paused batch alone: it will be resumed", async () => {
    registry.finished.length = 0;
    registry.settled.length = 0;
    await endedWithoutFinishing("medicare_hha_utilization", 33, "paused");
    expect(registry.finished).toEqual([]);
    expect(registry.settled).toEqual([]);
  });
});
