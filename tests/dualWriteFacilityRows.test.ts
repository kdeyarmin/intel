/**
 * Unit tests for the dual-write helper used by triggerImport.insertCMSRows to
 * mirror medicare_facilities.raw_data into the new medicare_facilities_raw
 * side table (PR B, phase 1). The helper takes a tx-like object so we can
 * fully mock the Drizzle insert builder.
 */
import { describe, it, expect, vi } from "vitest";
import { dualWriteFacilityRows } from "../server/functions/triggerImport";
import { medicareFacilities, medicareFacilitiesRaw } from "../server/db/schema";

type Captured = {
  table: any;
  values: any;
  returning?: any;
  conflict?: any;
};

function makeTx(insertedIds: number[]) {
  const captured: Captured[] = [];
  const tx = {
    insert(table: any) {
      const cap: Captured = { table, values: undefined };
      captured.push(cap);
      const builder = {
        values(v: any) {
          cap.values = v;
          return {
            returning(spec: any) {
              cap.returning = spec;
              return Promise.resolve(insertedIds.map((id) => ({ id })));
            },
            onConflictDoUpdate(opts: any) {
              cap.conflict = opts;
              return Promise.resolve();
            },
            then(resolve: any) { return resolve(undefined); }, // for `await tx.insert().values()` paths
          };
        },
      };
      return builder;
    },
  };
  return { tx, captured };
}

describe("dualWriteFacilityRows", () => {
  it("inserts facility rows and mirrors raw_data into the side table", async () => {
    const { tx, captured } = makeTx([101, 102]);
    const chunk = [
      { provider_id: "a", facility_name: "A", raw_data: { x: 1 } },
      { provider_id: "b", facility_name: "B", raw_data: { y: 2 } },
    ];
    await dualWriteFacilityRows(tx as any, chunk);

    // Two inserts: facilities then raw side table
    expect(captured).toHaveLength(2);
    expect(captured[0].table).toBe(medicareFacilities);
    expect(captured[0].values).toEqual(chunk);
    expect(captured[0].returning).toEqual({ id: medicareFacilities.id });

    expect(captured[1].table).toBe(medicareFacilitiesRaw);
    expect(captured[1].values).toEqual([
      { facility_id: 101, raw_data: { x: 1 } },
      { facility_id: 102, raw_data: { y: 2 } },
    ]);
    // ON CONFLICT upsert so re-imports replace the blob in place.
    expect(captured[1].conflict?.target).toBe(medicareFacilitiesRaw.facility_id);
    expect(captured[1].conflict?.set).toBeDefined();
  });

  it("skips rows with no raw_data so the side table stays NOT NULL-clean", async () => {
    const { tx, captured } = makeTx([1, 2]);
    await dualWriteFacilityRows(tx as any, [
      { provider_id: "a", raw_data: { x: 1 } },
      { provider_id: "b" }, // no raw_data
    ]);
    expect(captured).toHaveLength(2);
    expect(captured[1].values).toEqual([{ facility_id: 1, raw_data: { x: 1 } }]);
  });

  it("does NOT call the side-table insert when no row has raw_data", async () => {
    const { tx, captured } = makeTx([1]);
    await dualWriteFacilityRows(tx as any, [{ provider_id: "a" }]);
    expect(captured).toHaveLength(1);
    expect(captured[0].table).toBe(medicareFacilities);
  });

  it("is a no-op for an empty chunk (no transaction work at all)", async () => {
    const insertFn = vi.fn();
    await dualWriteFacilityRows({ insert: insertFn } as any, []);
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("propagates failures from the side-table insert so the surrounding transaction rolls back", async () => {
    const tx = {
      insert(table: any) {
        if (table === medicareFacilities) {
          return {
            values: () => ({ returning: () => Promise.resolve([{ id: 7 }]) }),
          };
        }
        // medicareFacilitiesRaw — simulate a constraint error
        return {
          values: () => ({
            onConflictDoUpdate: () => Promise.reject(new Error("FK violation")),
          }),
        };
      },
    };
    await expect(
      dualWriteFacilityRows(tx as any, [{ provider_id: "x", raw_data: { z: 1 } }]),
    ).rejects.toThrow("FK violation");
  });
});
