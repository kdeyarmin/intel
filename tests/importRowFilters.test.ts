import { describe, it, expect } from "vitest";
import { parseFilterList, buildImportRowFilter } from "../server/functions/triggerImport";

describe("parseFilterList", () => {
  it("returns [] for null/undefined/empty", () => {
    expect(parseFilterList(null)).toEqual([]);
    expect(parseFilterList(undefined)).toEqual([]);
    expect(parseFilterList("")).toEqual([]);
    expect(parseFilterList("   ")).toEqual([]);
  });

  it("splits on commas, whitespace, and semicolons", () => {
    expect(parseFilterList("PA, NJ; NY  DE")).toEqual(["PA", "NJ", "NY", "DE"]);
  });

  it("trims and de-duplicates", () => {
    expect(parseFilterList(" PA , PA ,NJ")).toEqual(["PA", "NJ"]);
  });

  it("accepts an array input", () => {
    expect(parseFilterList(["1234567890", " 9876543210 "])).toEqual(["1234567890", "9876543210"]);
  });
});

describe("buildImportRowFilter", () => {
  it("returns null when neither filter is set", () => {
    expect(buildImportRowFilter("", "")).toBeNull();
    expect(buildImportRowFilter(null, undefined)).toBeNull();
    expect(buildImportRowFilter("   ", "  ")).toBeNull();
  });

  it("filters by NPI across varying field names, digits-only", () => {
    const f = buildImportRowFilter("1234567890, 9876543210", null)!;
    expect(f).not.toBeNull();
    expect(f({ NPI: "1234567890" })).toBe(true);
    expect(f({ Rndrng_NPI: "9876543210" })).toBe(true);
    // formatted input still matches digits-only
    expect(f({ Prscrbr_NPI: "987-654-3210" })).toBe(true);
    expect(f({ npi: "0000000000" })).toBe(false);
    expect(f({ some_other_field: "x" })).toBe(false); // no NPI present
  });

  it("filters by state case-insensitively across field names", () => {
    const f = buildImportRowFilter(null, "pa, NJ")!;
    expect(f({ state: "PA" })).toBe(true);
    expect(f({ Rndrng_Prvdr_State_Abrvtn: "nj" })).toBe(true);
    expect(f({ BENE_STATE_ABRVTN: "NY" })).toBe(false);
    expect(f({ city: "Philadelphia" })).toBe(false); // no state present
  });

  it("matches the supplier/referring/practice state aliases the mapper reads", () => {
    const f = buildImportRowFilter(null, "PA")!;
    expect(f({ Suplr_Prvdr_State_Abrvtn: "PA" })).toBe(true);
    expect(f({ Rfrg_Prvdr_State_Abrvtn: "pa" })).toBe(true);
    expect(f({ practicestate: "PA" })).toBe(true);
    expect(f({ "ENROLLMENT STATE": "PA" })).toBe(true);
    expect(f({ Suplr_Prvdr_State_Abrvtn: "NJ" })).toBe(false);
  });

  it("requires BOTH npi and state to match when both are set", () => {
    const f = buildImportRowFilter("1234567890", "PA")!;
    expect(f({ NPI: "1234567890", state: "PA" })).toBe(true);
    expect(f({ NPI: "1234567890", state: "NJ" })).toBe(false);
    expect(f({ NPI: "0000000000", state: "PA" })).toBe(false);
  });
});
