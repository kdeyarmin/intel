/**
 * Snapshot datasets (ZIP service areas, clinician facility affiliations) are
 * keyed without a period. After a complete, unfiltered import the rows the
 * release no longer lists are retired; anything that looks like a partial
 * import leaves the table alone.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));

import { decideRetire, retireStaleSnapshotRows, retiresSnapshot } from "../server/lib/snapshotRetire";
import { TYPED_ROUTES } from "../server/functions/cmsTypedTables";

const quiet = { log: vi.fn(), warn: vi.fn() };

function fakeDb(counts: { kept: number; stale: number }, deletes: number[]) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (sql.includes("count(*) FILTER")) return { rows: [counts], rowCount: 1 };
      if (sql.startsWith("DELETE")) return { rows: [], rowCount: deletes.shift() ?? 0 };
      return { rows: [], rowCount: 1 };
    },
  };
}

describe("which routes are snapshots", () => {
  it("covers the ZIP service areas (per setting) and the affiliations, and nothing keyed by a period", () => {
    expect(Object.entries(TYPED_ROUTES).filter(([, r]) => r.snapshot).map(([t, r]) => [t, r.snapshot!.table, r.snapshot!.scope?.value ?? null])).toEqual([
      ["home_health_zip_data", "cms_zip_service_area", "hha"],
      ["hospice_zip_data", "cms_zip_service_area", "hospice"],
      ["facility_affiliation", "cms_facility_affiliation", null],
    ]);
  });

  it("only a complete, unfiltered, real import may retire rows", () => {
    expect(retiresSnapshot("hospice_zip_data", {})).toBe(true);
    expect(retiresSnapshot("hospice_zip_data", { dry_run: true })).toBe(false);
    expect(retiresSnapshot("hospice_zip_data", { state_filter: "PA" })).toBe(false);
    expect(retiresSnapshot("facility_affiliation", { npi_filter: "1234567893" })).toBe(false);
    expect(retiresSnapshot("hospital_service_area", {})).toBe(false);
  });
});

describe("decideRetire", () => {
  it("retires when the batch wrote the larger share, and refuses anything that looks partial", () => {
    expect(decideRetire(900, 100)).toEqual({ retire: true });
    expect(decideRetire(500, 500)).toEqual({ retire: true });
    expect(decideRetire(0, 1000)).toEqual({ retire: false, reason: "the import wrote no rows" });
    expect(decideRetire(100, 900)).toEqual({ retire: false, reason: "would remove 900 rows and keep only 100" });
    expect(decideRetire(1000, 0)).toEqual({ retire: false, reason: "nothing stale" });
  });
});

describe("retireStaleSnapshotRows", () => {
  it("deletes, in chunks, the rows of one setting that the batch did not write, and leaves the other setting alone", async () => {
    const db = fakeDb({ kept: 50, stale: 5 }, [3, 2]);
    const r = await retireStaleSnapshotRows("hospice_zip_data", 77, { db, log: quiet, chunk: 3 });
    expect(r).toEqual({ retired: 5, kept: 50, stale: 5 });
    const [count, ...deletes] = db.calls;
    expect(count.sql).toMatch(/FROM cms_zip_service_area WHERE true AND setting = \$2/);
    expect(count.params).toEqual([77, "hospice"]);
    const chunked = deletes.filter((c) => c.sql.startsWith("DELETE"));
    expect(chunked).toHaveLength(2);
    expect(chunked[0].sql).toMatch(/import_batch_id IS DISTINCT FROM \$1 AND setting = \$2 LIMIT 3/);
    expect(chunked[0].params).toEqual([77, "hospice"]);
    // The count is recorded on the batch.
    expect(db.calls.at(-1)!.sql).toMatch(/UPDATE import_batches SET retry_params/);
    expect(db.calls.at(-1)!.params).toEqual([77, JSON.stringify({ retired_rows: 5 })]);
  });

  it("does not touch a table whose import wrote nothing, or less than the rows it would remove", async () => {
    for (const counts of [{ kept: 0, stale: 40 }, { kept: 10, stale: 40 }]) {
      const db = fakeDb(counts, []);
      const r = await retireStaleSnapshotRows("facility_affiliation", 5, { db, log: quiet });
      expect(r.retired).toBe(0);
      expect(r.skipped).toBeTruthy();
      expect(db.calls.some((c) => c.sql.startsWith("DELETE"))).toBe(false);
    }
  });

  it("ignores a dataset that isn't a snapshot", async () => {
    const db = fakeDb({ kept: 1, stale: 1 }, []);
    expect(await retireStaleSnapshotRows("hospital_service_area", 5, { db, log: quiet })).toMatchObject({ retired: 0, skipped: "not a snapshot dataset" });
    expect(db.calls).toHaveLength(0);
  });
});
