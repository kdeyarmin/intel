/**
 * Which state a CMS row belongs to when it has no state column: the state its CCN was issued in, or its geography.
 * The CCN table is the one in CMS's State Operations Manual (chapter 2, section 2779A1, Rev. 226), and is held to
 * the prefixes of the live Provider of Services file (tests/fixtures/cms/ccn_prefixes.json, October 2026); the rows
 * below are shaped like live ones.
 */
import { describe, expect, it } from "vitest";
import ccnPrefixes from "./fixtures/cms/ccn_prefixes.json";
import { CCN_PREFIX_STATE, CCN_STATE_CODES, STATE_PROBE_ROWS, derivedStateOf, stateOfCcn, stateProbe } from "../server/lib/rowState";
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

  it("reads the later codes a state is given when its first ones fill up, letter-and-digit codes included", () => {
    // The prefixes the review of this table named, and one of each kind besides.
    expect(stateOfCcn("691400")).toBe("FL");
    expect(stateOfCcn("A21400")).toBe("FL");
    expect(stateOfCcn("C11400")).toBe("FL");
    expect(stateOfCcn("A71400")).toBe("PA");
    expect(stateOfCcn("D31000")).toBe("PA");
    expect(stateOfCcn("B71400")).toBe("AL");
    expect(stateOfCcn("D11400")).toBe("NY");
    expect(stateOfCcn("731400")).toBe("PA");
    expect(stateOfCcn("541400")).toBe("ID");
    expect(stateOfCcn("E21400")).toBe("TX");
    expect(stateOfCcn("B81400")).toBe("MP");
    expect(stateOfCcn("C31400")).toBe("GU");
  });

  it("names no state for something that is not a CCN, or for a country other than ours", () => {
    for (const v of ["", null, undefined, "N/A", "ZZ1234", "9", "99xxxx"]) expect(stateOfCcn(v), String(v)).toBeNull();
    for (const v of ["561400", "591400", "991400"]) expect(stateOfCcn(v), `${v} is Canada, Mexico or abroad`).toBeNull();
  });

  it("only ever names a state or territory the app knows", () => {
    for (const [prefix, state] of Object.entries(CCN_PREFIX_STATE)) expect(STATE_FIPS[state], `${prefix} -> ${state}`).toBeDefined();
  });
});

describe("the CCN state-code table", () => {
  const entries = Object.entries(CCN_STATE_CODES);

  it("is the manual's table: 56 states and territories, 135 prefixes", () => {
    expect(entries.length).toBe(56);
    expect(entries.flatMap(([, codes]) => codes).length).toBe(135);
  });

  it("gives every state and territory the app knows at least one prefix, and no others", () => {
    expect(Object.keys(CCN_STATE_CODES).sort()).toEqual(Object.keys(STATE_FIPS).sort());
  });

  it("gives each prefix to exactly one state", () => {
    const owners = new Map<string, string>();
    for (const [state, codes] of entries) {
      for (const code of codes) {
        expect(owners.get(code), `${code} is listed for ${owners.get(code)} and ${state}`).toBeUndefined();
        owners.set(code, state);
      }
    }
    expect(Object.keys(CCN_PREFIX_STATE).length).toBe(owners.size);
  });

  it("starts each state's list with its original two-digit code", () => {
    const first: Record<string, string> = { AL: "01", AK: "02", PA: "39", TX: "45", CA: "05", FL: "10", NY: "33" };
    for (const [state, code] of Object.entries(first)) expect(CCN_STATE_CODES[state][0], state).toBe(code);
  });

  it("matches every prefix in use in the live Provider of Services file, state for state", () => {
    const live = ccnPrefixes.prefixes as Record<string, string>;
    expect(Object.keys(live).length).toBe(95);
    for (const [prefix, state] of Object.entries(live)) {
      const named = stateOfCcn(`${prefix}0000`);
      if (state === "CN" || state === "MX") expect(named, `${prefix} is ${state}`).toBeNull();
      else expect(named, `${prefix} is ${state} in the Provider of Services file`).toBe(state);
    }
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
