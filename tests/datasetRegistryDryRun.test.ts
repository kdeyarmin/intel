/**
 * A dry run reads a dataset and writes nothing, so it must not change what the
 * registry says is loaded. The guard is in the registry's own statements, on
 * the batch's dry_run flag.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ calls: [] as Array<{ sql: string; params: unknown[] }> }));
vi.mock("../server/db", () => ({
  db: {},
  pool: { async query(sql: string, params: unknown[] = []) { h.calls.push({ sql, params }); return { rows: [] }; } },
}));

import { markImportFinished, markImportStarted } from "../server/lib/datasetRegistry";

beforeEach(() => { h.calls.length = 0; });

const guard = (n: number) => `NOT EXISTS (SELECT 1 FROM import_batches WHERE id = $${n} AND dry_run IS TRUE)`;

describe("dataset registry writes and dry runs", () => {
  it("won't mark a dataset importing for a dry-run batch", async () => {
    await markImportStarted("hospital_service_area", 41, "cms_data_api");
    const { sql, params } = h.calls[0];
    expect(sql).toContain(`WHERE ${guard(3)}`);
    expect(sql).toMatch(/ON CONFLICT \(import_type\) DO UPDATE/);
    expect(params.slice(0, 3)).toEqual(["hospital_service_area", "cms_data_api", 41]);
  });

  it("won't mark a dataset current or failed for a dry-run batch", async () => {
    await markImportFinished("hospital_service_area", { batchId: 41, ok: true, rowCount: 10 });
    await markImportFinished("hospital_service_area", { batchId: 41, ok: false, note: "dry run" });
    expect(h.calls).toHaveLength(2);
    expect(h.calls[0].sql).toContain(`import_type = $1 AND ${guard(3)}`);
    expect(h.calls[0].params[2]).toBe(41);
    expect(h.calls[1].sql).toContain(`import_type = $1 AND ${guard(2)}`);
    expect(h.calls[1].params[1]).toBe(41);
  });
});
