import { describe, it, expect } from "vitest";
import { makeKey, partition, distinctValues, deriveLineTotal, CMS_NATURAL_KEYS } from "../server/functions/cmsUpsert";

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
    expect(CMS_NATURAL_KEYS.provider_service_utilization.keyCols).toContain("npi");
  });

  it("keys utilization on the HCPCS service, not the provider specialty", () => {
    const cfg = CMS_NATURAL_KEYS.provider_service_utilization;
    expect(cfg.keyCols).toContain("hcpcs_code");
    expect(cfg.keyCols).toContain("place_of_service");
    // service_type (the provider specialty) must NOT be the dedup key, or every
    // service line for a provider collapses into a single stored row.
    expect(cfg.keyCols).not.toContain("service_type");
  });

  it("treats two HCPCS lines for the same provider/year as distinct rows", () => {
    const cfg = CMS_NATURAL_KEYS.provider_service_utilization;
    const rows = [
      { npi: "1", service_type: "Cardiology", hcpcs_code: "99213", place_of_service: "O", data_year: "2024" },
      { npi: "1", service_type: "Cardiology", hcpcs_code: "93000", place_of_service: "O", data_year: "2024" },
    ];
    const { toCreate, skipped } = partition(rows, [], cfg.keyCols);
    expect(toCreate).toHaveLength(2);
    expect(skipped).toBe(0);
  });
});

describe("deriveLineTotal", () => {
  it("multiplies average payment by service count", () => {
    expect(deriveLineTotal("10", "5")).toBe("50.00");
    expect(deriveLineTotal("3", "12.5")).toBe("37.50");
  });

  it("strips thousands separators before computing", () => {
    expect(deriveLineTotal("1,000", "2")).toBe("2000.00");
  });

  it("allows a zero average once there is at least one service", () => {
    expect(deriveLineTotal("5", "0")).toBe("0.00");
  });

  it("returns null when services is missing, zero, or negative", () => {
    expect(deriveLineTotal("", "5")).toBeNull();
    expect(deriveLineTotal(null, "5")).toBeNull();
    expect(deriveLineTotal("0", "5")).toBeNull();
    expect(deriveLineTotal("-2", "5")).toBeNull();
  });

  it("returns null when the average is missing or non-numeric", () => {
    expect(deriveLineTotal("10", "")).toBeNull();
    expect(deriveLineTotal("10", null)).toBeNull();
    expect(deriveLineTotal("10", "N/A")).toBeNull();
  });
});

describe("makeKey – edge cases", () => {
  it("handles numeric values by stringifying them", () => {
    expect(makeKey({ npi: 1234567890 as any, data_year: 2024 as any }, ["npi", "data_year"])).toBe("1234567890|2024");
  });

  it("lowercases string values", () => {
    expect(makeKey({ service_type: "CARDIOLOGY" }, ["service_type"])).toBe("cardiology");
  });

  it("trims internal whitespace is preserved (only leading/trailing trimmed)", () => {
    expect(makeKey({ name: "  Acme  Corp  " }, ["name"])).toBe("acme  corp");
  });

  it("produces the same key regardless of value casing", () => {
    const lower = makeKey({ t: "abc" }, ["t"]);
    const upper = makeKey({ t: "ABC" }, ["t"]);
    const mixed = makeKey({ t: "AbC" }, ["t"]);
    expect(lower).toBe(upper);
    expect(upper).toBe(mixed);
  });

  it("handles a single-column key (no separator)", () => {
    expect(makeKey({ npi: "999" }, ["npi"])).toBe("999");
  });

  it("handles a three-column key with separators", () => {
    const key = makeKey({ npi: "1", service_type: "PT", data_year: "2024" }, ["npi", "service_type", "data_year"]);
    expect(key).toBe("1|pt|2024");
  });
});

describe("partition – edge cases", () => {
  it("returns empty toCreate and zero skipped for empty input", () => {
    const { toCreate, skipped } = partition([], [], ["npi"]);
    expect(toCreate).toHaveLength(0);
    expect(skipped).toBe(0);
  });

  it("skips all rows when all match existing (all skipped)", () => {
    const rows = [{ npi: "1", data_year: "2024" }, { npi: "2", data_year: "2024" }];
    const existing = [{ npi: "1", data_year: "2024" }, { npi: "2", data_year: "2024" }];
    const { toCreate, skipped } = partition(rows, existing, ["npi", "data_year"]);
    expect(toCreate).toHaveLength(0);
    expect(skipped).toBe(2);
  });

  it("is case-insensitive when matching against existing", () => {
    const rows = [{ npi: "ALPHA", data_year: "2024" }];
    const existing = [{ npi: "alpha", data_year: "2024" }];
    const { toCreate, skipped } = partition(rows, existing, ["npi", "data_year"]);
    expect(toCreate).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("handles three-column key (npi + service_type + data_year)", () => {
    const rows = [
      { npi: "1", service_type: "PT", data_year: "2024" },
      { npi: "1", service_type: "OT", data_year: "2024" },
    ];
    const existing = [{ npi: "1", service_type: "PT", data_year: "2024" }];
    const { toCreate, skipped } = partition(rows, existing, ["npi", "service_type", "data_year"]);
    expect(toCreate).toHaveLength(1);
    expect(toCreate[0].service_type).toBe("OT");
    expect(skipped).toBe(1);
  });

  it("preserves order of surviving rows", () => {
    const rows = [
      { npi: "3", data_year: "2024" },
      { npi: "1", data_year: "2024" },
      { npi: "2", data_year: "2024" },
    ];
    const existing = [{ npi: "1", data_year: "2024" }];
    const { toCreate } = partition(rows, existing, ["npi", "data_year"]);
    expect(toCreate.map((r) => r.npi)).toEqual(["3", "2"]);
  });

  it("handles in-batch triplicate — only first copy survives", () => {
    const rows = [
      { npi: "X", data_year: "2024" },
      { npi: "X", data_year: "2024" },
      { npi: "X", data_year: "2024" },
    ];
    const { toCreate, skipped } = partition(rows, [], ["npi", "data_year"]);
    expect(toCreate).toHaveLength(1);
    expect(skipped).toBe(2);
  });
});

describe("distinctValues – edge cases", () => {
  it("returns an empty array for empty input", () => {
    expect(distinctValues([], "npi")).toEqual([]);
  });

  it("ignores missing keys (undefined col)", () => {
    const rows = [{ foo: "bar" }, { baz: "qux" }] as any;
    expect(distinctValues(rows, "npi")).toEqual([]);
  });

  it("converts numeric values to strings", () => {
    const rows = [{ year: 2024 }, { year: 2023 }] as any;
    const result = distinctValues(rows, "year").sort();
    expect(result).toEqual(["2023", "2024"]);
  });

  it("filters out whitespace-only values", () => {
    const rows = [{ npi: "  " }, { npi: "\t" }, { npi: "valid" }] as any;
    expect(distinctValues(rows, "npi")).toEqual(["valid"]);
  });

  it("returns each distinct value exactly once (no duplicates)", () => {
    const rows = Array.from({ length: 5 }, () => ({ npi: "same" }));
    expect(distinctValues(rows, "npi")).toHaveLength(1);
  });
});
