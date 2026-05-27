import { describe, it, expect } from "vitest";
import { makeKey, partition, distinctValues, CMS_NATURAL_KEYS } from "../server/functions/cmsUpsert";

describe("makeKey", () => {
  it("joins normalized key columns", () => {
    expect(makeKey({ npi: "123", data_year: "2024" }, ["npi", "data_year"])).toBe("123|2024");
  });
  it("is case-insensitive and trims", () => {
    expect(makeKey({ facility_name: "  Acme HOSPITAL " }, ["facility_name"])).toBe("acme hospital");
  });
  it("treats null/undefined as empty", () => {
    expect(makeKey({ npi: null }, ["npi", "missing"])).toBe("|");
  });
});

describe("partition", () => {
  it("keeps rows that don't already exist", () => {
    const rows = [{ npi: "1", data_year: "2024" }, { npi: "2", data_year: "2024" }];
    const existing = [{ npi: "1", data_year: "2024" }];
    const { toCreate, skipped } = partition(rows, existing, ["npi", "data_year"]);
    expect(toCreate).toEqual([{ npi: "2", data_year: "2024" }]);
    expect(skipped).toBe(1);
  });

  it("de-duplicates rows repeated within the same batch", () => {
    const rows = [
      { npi: "1", data_year: "2024" },
      { npi: "1", data_year: "2024" },
      { npi: "3", data_year: "2024" },
    ];
    const { toCreate, skipped } = partition(rows, [], ["npi", "data_year"]);
    expect(toCreate.map((r) => r.npi)).toEqual(["1", "3"]);
    expect(skipped).toBe(1);
  });

  it("treats different years as distinct rows", () => {
    const rows = [{ npi: "1", data_year: "2023" }];
    const existing = [{ npi: "1", data_year: "2024" }];
    const { toCreate, skipped } = partition(rows, existing, ["npi", "data_year"]);
    expect(toCreate).toHaveLength(1);
    expect(skipped).toBe(0);
  });

  it("returns everything when there is nothing existing", () => {
    const rows = [{ provider_id: "A" }, { provider_id: "B" }];
    const { toCreate, skipped } = partition(rows, [], ["provider_id"]);
    expect(toCreate).toHaveLength(2);
    expect(skipped).toBe(0);
  });
});

describe("distinctValues", () => {
  it("returns unique non-empty values", () => {
    const rows = [{ npi: "1" }, { npi: "1" }, { npi: "" }, { npi: null }, { npi: "2" }];
    expect(distinctValues(rows as any, "npi").sort()).toEqual(["1", "2"]);
  });
});

describe("CMS_NATURAL_KEYS", () => {
  it("includes the npi-keyed import types", () => {
    expect(CMS_NATURAL_KEYS.cms_order_referring.keyCols).toContain("npi");
    expect(CMS_NATURAL_KEYS.provider_service_utilization.keyCols).toContain("service_type");
  });
});
