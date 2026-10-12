/**
 * Which state a CMS row belongs to when it has no state column: the state its CCN was issued in, or its geography.
 * The CCN table was read from CMS's own Care Compare files (hospitals, nursing homes, home health agencies and
 * hospices, October 2026); the rows below are shaped like live ones.
 */
import { describe, expect, it } from "vitest";
import { CCN_PREFIX_STATE, STATE_PROBE_ROWS, derivedStateOf, stateOfCcn, stateProbe } from "../server/lib/rowState";
import { STATE_FIPS, stateOfFips } from "../server/lib/stateFips";

describe("stateOfCcn", () => {
  it("reads the state from the first two characters of a CCN", () => {
    expect(stateOfCcn("390164")).toBe("PA");
    expect(stateOfCcn("  393045 ")).toBe("PA");
    expect(stateOfCcn("01M307")).toBe("AL");
    expect(stateOfCcn("10T258")).toBe("FL");
    expect(stateOfCcn("a01234")).toBe("CA");
    expect(stateOfCcn("676001")).toBe("TX");
  });

  it("names no state for something that is not a CCN", () => {
    for (const v of ["", null, undefined, "N/A", "ZZ1234", "9", "99xxxx"]) expect(stateOfCcn(v), String(v)).toBeNull();
  });

  it("only ever names a state or territory the app knows", () => {
    for (const [prefix, state] of Object.entries(CCN_PREFIX_STATE)) expect(STATE_FIPS[state], `${prefix} -> ${state}`).toBeDefined();
  });
});

describe("stateOfFips", () => {
  it("reads a two-digit state code or a five-digit county code", () => {
    expect(stateOfFips("42")).toBe("PA");
    expect(stateOfFips("42003")).toBe("PA");
    expect(stateOfFips("72001")).toBe("PR");
    expect(stateOfFips(" 39035 ")).toBe("OH");
  });

  it("names no state for anything else", () => {
    for (const v of ["", null, undefined, "4", "420", "4200", "99", "99999", "ab", "PA"]) expect(stateOfFips(v), String(v)).toBeNull();
  });
});

describe("derivedStateOf", () => {
  it("reads a Hospital Service Area row from its hospital's CCN", () => {
    expect(derivedStateOf({ MEDICARE_PROV_NUM: "390164", ZIP_CD_OF_RESIDENCE: "15213", TOTAL_CASES: "12" })).toBe("PA");
    expect(derivedStateOf({ MEDICARE_PROV_NUM: "01M307", ZIP_CD_OF_RESIDENCE: "30240" })).toBe("AL");
  });

  it("reads a facility affiliation from the CCN of its facility", () => {
    expect(derivedStateOf({ npi: "1003000126", facility_type: "Hospital", facility_affiliations_certification_number: "390050" })).toBe("PA");
  });

  it("reads Medicare Geographic Variation from the description or the FIPS code", () => {
    expect(derivedStateOf({ BENE_GEO_LVL: "County", BENE_GEO_DESC: "PA-Allegheny", BENE_GEO_CD: "42003" })).toBe("PA");
    expect(derivedStateOf({ BENE_GEO_LVL: "County", BENE_GEO_DESC: "PA - Allegheny", BENE_GEO_CD: "42003" })).toBe("PA");
    expect(derivedStateOf({ BENE_GEO_LVL: "State", BENE_GEO_DESC: "PA", BENE_GEO_CD: "42" })).toBe("PA");
    expect(derivedStateOf({ BENE_GEO_LVL: "County", BENE_GEO_CD: "39035" })).toBe("OH");
  });

  it("names no state for the national row, or for a feed keyed by NPI alone", () => {
    expect(derivedStateOf({ BENE_GEO_LVL: "National", BENE_GEO_DESC: "National", BENE_GEO_CD: "" })).toBeNull();
    expect(derivedStateOf({ NPI: "1003000126", LAST_NAME: "SMITH", PARTB: "Y", HOSPICE: "N" })).toBeNull();
    expect(derivedStateOf({})).toBeNull();
  });
});

describe("stateProbe", () => {
  const stateOf = (row: any) => derivedStateOf(row);
  const npiOnly = (n: number) => Array.from({ length: n }, (_, i) => ({ NPI: String(i) }));

  it("is satisfied by the first row that names a state", () => {
    const probe = stateProbe(stateOf);
    expect(probe.page([...npiOnly(10), { MEDICARE_PROV_NUM: "390164" }])).toBe("ok");
    expect(probe.page(npiOnly(STATE_PROBE_ROWS * 2))).toBe("ok");
  });

  it("gives up only after enough rows without one", () => {
    const probe = stateProbe(stateOf);
    expect(probe.page(npiOnly(STATE_PROBE_ROWS - 1))).toBe("unknown");
    expect(probe.page(npiOnly(1))).toBe("unsupported");
  });

  it("reports a dataset that ended without naming a state", () => {
    const probe = stateProbe(stateOf);
    expect(probe.exhaustedWithoutState()).toBe(false);
    probe.page(npiOnly(300));
    expect(probe.exhaustedWithoutState()).toBe(true);
  });
});
