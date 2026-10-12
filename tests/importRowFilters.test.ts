import { describe, it, expect } from "vitest";
import { parseFilterList, buildImportRowFilter, stateOfRow } from "../server/functions/triggerImport";

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

  it("keeps a state that is spelled out as one item instead of splitting it at its spaces", () => {
    expect(parseFilterList("New York")).toEqual(["New York"]);
    expect(parseFilterList("New York, Ohio; West Virginia")).toEqual(["New York", "Ohio", "West Virginia"]);
    expect(parseFilterList("District of Columbia")).toEqual(["District of Columbia"]);
    expect(parseFilterList("Northern Mariana Islands, Rhode Island")).toEqual(["Northern Mariana Islands", "Rhode Island"]);
  });

  it("still splits codes and numbers at spaces, next to a state spelled out", () => {
    expect(parseFilterList("PA OH")).toEqual(["PA", "OH"]);
    expect(parseFilterList("New York PA North Carolina")).toEqual(["New York", "PA", "North Carolina"]);
    expect(parseFilterList("1234567890 9876543210")).toEqual(["1234567890", "9876543210"]);
  });

  it("reads the longest state name: West Virginia is not West and Virginia", () => {
    expect(parseFilterList("West Virginia")).toEqual(["West Virginia"]);
    expect(parseFilterList("Virginia West Virginia")).toEqual(["Virginia", "West Virginia"]);
  });

  it("leaves a word that is no state alone", () => {
    expect(parseFilterList("New Jersey Newark")).toEqual(["New Jersey", "Newark"]);
    expect(parseFilterList("New")).toEqual(["New"]);
  });
});

describe("buildImportRowFilter with states spelled out", () => {
  it("matches a row of the state written as a code or a name, for a filter written as a name", () => {
    const f = buildImportRowFilter(null, "New York")!;
    expect(f({ state: "NY" })).toBe(true);
    expect(f({ state: "New York" })).toBe(true);
    expect(f({ state: "NJ" })).toBe(false);
    // Not the "NEW" and "YORK" the whitespace split used to make of it.
    expect(f({ state: "NEW" })).toBe(false);
  });

  it("does not take Virginia for West Virginia", () => {
    const f = buildImportRowFilter(null, "West Virginia, Ohio")!;
    expect(f({ state: "WV" })).toBe(true);
    expect(f({ state: "OH" })).toBe(true);
    expect(f({ state: "VA" })).toBe(false);
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

  it("keeps rows without a state column when the filter names the file's own state (licensing exports)", () => {
    // A state licensing export has no state column; state_filter says which state it is.
    const f = buildImportRowFilter(null, "PA", { stateOptional: true })!;
    expect(f({ name: "Sunrise Personal Care Home", zip: "15213" })).toBe(true);
    expect(f({ name: "Elm Court", state: "PA" })).toBe(true);
    expect(f({ name: "Ohio Home", state_code: "OH" })).toBe(false);
    expect(f({ name: "Jersey Home", State: "NJ" })).toBe(false);
    // The default stays strict: a feed row without a state can't be shown to match.
    const strict = buildImportRowFilter(null, "PA")!;
    expect(strict({ name: "Sunrise Personal Care Home", zip: "15213" })).toBe(false);
  });

  it("matches a state spelled out in the file (or in the filter) to its postal code", () => {
    // State portals often export "Pennsylvania", where the filter says PA.
    const f = buildImportRowFilter(null, "PA", { stateOptional: true })!;
    expect(f({ name: "Elm Court", state: "Pennsylvania" })).toBe(true);
    expect(f({ name: "Elm Court", State: "pennsylvania" })).toBe(true);
    expect(f({ name: "Ohio Home", state: "Ohio" })).toBe(false);
    expect(f({ name: "DC Home", state: "District of Columbia" })).toBe(false);
    expect(buildImportRowFilter(null, "Pennsylvania")!({ state: "PA" })).toBe(true);
    expect(buildImportRowFilter(null, "pa, ohio")!({ state: "Ohio" })).toBe(true);
    // Names of several words are matched as the file writes them (the filter itself is split on spaces).
    expect(buildImportRowFilter(null, "NY,DC")!({ state: "New York" })).toBe(true);
    expect(buildImportRowFilter(null, "NY,DC")!({ state: "District of Columbia" })).toBe(true);
  });

  it("requires BOTH npi and state to match when both are set", () => {
    const f = buildImportRowFilter("1234567890", "PA")!;
    expect(f({ NPI: "1234567890", state: "PA" })).toBe(true);
    expect(f({ NPI: "1234567890", state: "NJ" })).toBe(false);
    expect(f({ NPI: "0000000000", state: "PA" })).toBe(false);
  });
});

describe("buildImportRowFilter on feeds that have no state column", () => {
  it("keeps a Hospital Service Area row when its hospital is in the state, whatever state the patient's ZIP is in", () => {
    const f = buildImportRowFilter(null, "PA")!;
    expect(f({ MEDICARE_PROV_NUM: "390164", ZIP_CD_OF_RESIDENCE: "44444", TOTAL_CASES: "20" })).toBe(true);
    expect(f({ MEDICARE_PROV_NUM: "010001", ZIP_CD_OF_RESIDENCE: "15213", TOTAL_CASES: "20" })).toBe(false);
    expect(buildImportRowFilter(null, "Pennsylvania")!({ MEDICARE_PROV_NUM: "390050" })).toBe(true);
  });

  it("keeps a hospital whose CCN was issued under one of the state's later codes", () => {
    // Pennsylvania has 39 and 73, then A7 and D3; Florida has 10, 68, 69, A2 and C1.
    const pa = buildImportRowFilter(null, "PA")!;
    for (const ccn of ["390164", "730001", "A70001", "D30001"]) expect(pa({ MEDICARE_PROV_NUM: ccn }), ccn).toBe(true);
    for (const ccn of ["100001", "690001", "A20001", "C10001"]) expect(pa({ MEDICARE_PROV_NUM: ccn }), ccn).toBe(false);
    const fl = buildImportRowFilter(null, "FL")!;
    for (const ccn of ["100001", "680001", "690001", "A20001", "C10001"]) expect(fl({ MEDICARE_PROV_NUM: ccn }), ccn).toBe(true);
    expect(fl({ MEDICARE_PROV_NUM: "D30001" })).toBe(false);
  });

  it("keeps a Medicare Geographic Variation county or state row of the state, and drops the national row", () => {
    const f = buildImportRowFilter(null, "PA")!;
    expect(f({ BENE_GEO_LVL: "County", BENE_GEO_DESC: "PA-Allegheny", BENE_GEO_CD: "42003" })).toBe(true);
    expect(f({ BENE_GEO_LVL: "State", BENE_GEO_DESC: "PA", BENE_GEO_CD: "42" })).toBe(true);
    expect(f({ BENE_GEO_LVL: "County", BENE_GEO_DESC: "OH-Cuyahoga", BENE_GEO_CD: "39035" })).toBe(false);
    expect(f({ BENE_GEO_LVL: "National", BENE_GEO_DESC: "National", BENE_GEO_CD: "" })).toBe(false);
  });

  it("prefers a row's own state column over the state its CCN would name", () => {
    expect(stateOfRow({ state: "NJ", MEDICARE_PROV_NUM: "390164" })).toBe("NJ");
    expect(stateOfRow({ MEDICARE_PROV_NUM: "390164" })).toBe("PA");
    expect(stateOfRow({ NPI: "1003000126" })).toBeNull();
  });

  it("still drops a row that names no state, unless the filter names the file's own state", () => {
    expect(buildImportRowFilter(null, "PA")!({ NPI: "1003000126" })).toBe(false);
    expect(buildImportRowFilter(null, "PA", { stateOptional: true })!({ NPI: "1003000126" })).toBe(true);
  });
});
