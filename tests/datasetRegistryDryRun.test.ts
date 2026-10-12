/**
 * A dry run reads a dataset and writes nothing, so it must not change what the
 * registry says is loaded. The guard is in the registry's own statements, on
 * the batch's dry_run flag.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ calls: [] as Array<{ sql: string; params: unknown[] }> }));
vi.mock("../server/db", () => ({
  db: {},
  pool: { async query(sql: string, params: unknown[] = []) { h.calls.push({ sql, params }); return { rows: [] }; } },
}));

import { dateOnly, markImportFinished, markImportStarted } from "../server/lib/datasetRegistry";

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

describe("dateOnly", () => {
  const zone = process.env.TZ;
  afterEach(() => {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  });

  it("reads the calendar day of a DATE column on a host east of UTC, where toISOString() gives the day before", () => {
    process.env.TZ = "Asia/Tokyo";
    // What the driver returns for 2025-01-01: local midnight.
    const day = new Date(2025, 0, 1);
    expect(day.toISOString().slice(0, 10)).toBe("2024-12-31");
    expect(dateOnly(day)).toBe("2025-01-01");
  });

  it("reads it on a host west of UTC too, takes strings as they are and nothing as null", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(dateOnly(new Date(2025, 11, 31))).toBe("2025-12-31");
    expect(dateOnly("2025-06-30T00:00:00.000Z")).toBe("2025-06-30");
    expect(dateOnly(null)).toBeNull();
    expect(dateOnly(undefined)).toBeNull();
    expect(dateOnly("")).toBeNull();
    expect(dateOnly(new Date("not a date"))).toBeNull();
  });
});
