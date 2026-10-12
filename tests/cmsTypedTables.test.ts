/**
 * Typed CMS datasets (server/functions/cmsTypedTables.ts): mappers on rows
 * captured from the live CMS APIs on 2026-10-11 (tests/fixtures/cms/rows/).
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { CERTIFICATION_HCPCS, TYPED_ROUTES, isoDate, mapPhysicianCertification, mapTypedRows, num, yn } from "../server/functions/cmsTypedTables";

const dir = path.join(import.meta.dirname, "fixtures", "cms", "rows");
const rows = (type: string) => JSON.parse(fs.readFileSync(path.join(dir, `${type}.json`), "utf8")) as any[];
const ctx = { year: 2024, asOf: "2024-12-31", batchId: 7 };
const mapAll = (type: string, c = ctx) => mapTypedRows(TYPED_ROUTES[type], rows(type), c);

describe("parsing", () => {
  it("reads CMS number formats and treats suppressed cells as null", () => {
    expect(num("1,234")).toBe(1234);
    expect(num("$3,731,546,031.63")).toBe(3731546031.63);
    expect(num("28.17%")).toBe(28.17);
    expect(num("*")).toBeNull();
    expect(num("")).toBeNull();
    expect(num(" ")).toBeNull();
    expect(yn("Yes")).toBe(true);
    expect(yn("N")).toBe(false);
    expect(yn(" ")).toBeNull();
    expect(isoDate("01/01/2024")).toBe("2024-01-01");
    expect(isoDate("2023-03-02")).toBe("2023-03-02");
  });
});

describe("Hospital Service Area", () => {
  it("keeps every ZIP of a hospital, with suppressed counts as null", () => {
    const { rows: out, dropped } = mapAll("hospital_service_area", { year: 2025, batchId: 7 });
    expect(dropped).toBe(0);
    expect(out).toHaveLength(4);
    expect(out[0]).toMatchObject({ ccn: "01M307", zip5: "01730", data_year: "2025", total_cases: null, total_days: null, total_charges: null, import_batch_id: 7 });
    expect(new Set(out.map((r) => `${r.ccn}|${r.zip5}`)).size).toBe(4);
  });
});

describe("Post-acute utilization", () => {
  it("keeps national and state summary rows beside provider rows, keyed by setting and level", () => {
    const { rows: out, dropped } = mapAll("medicare_snf_utilization");
    expect(dropped).toBe(0);
    expect(out[0]).toMatchObject({ setting: "snf", summary_level: "national", ccn: "", state: "", data_year: "2024", year_type: "FY", bene_count: 1171990, stays: 1586658, service_days: 44861806, medicare_payment: 25451696743, dual_pct: 35, avg_risk_score: 2.72 });
    expect(out[1]).toMatchObject({ setting: "snf", summary_level: "state", ccn: "", state: "AK", bene_count: 800 });
    expect(Object.keys(out[0].chronic_conditions as object).every((k) => k.startsWith("BENE_CC_"))).toBe(true);
    const provider = TYPED_ROUTES.medicare_snf_utilization.map({ ...rows("medicare_snf_utilization")[1], SMRY_CTGRY: "PROVIDER", PRVDR_ID: "015009", PRVDR_NAME: "BURNS NURSING HOME", PRVDR_ZIP: "35653" }, ctx)!;
    expect(provider).toMatchObject({ summary_level: "provider", ccn: "015009", state: "AK", provider_name: "BURNS NURSING HOME", zip5: "35653" });
  });

  it("maps hospice, home health, IRF and LTCH with their own settings", () => {
    expect(mapAll("medicare_hospice_utilization").rows[0]).toMatchObject({ setting: "hospice", summary_level: "national", bene_count: 1817315 });
    expect(mapAll("medicare_hha_utilization").rows[1]).toMatchObject({ setting: "hha", summary_level: "state", state: "AK", stays: 8408 });
    expect(mapAll("medicare_irf_utilization").rows[0].setting).toBe("irf");
    expect(mapAll("medicare_ltch_utilization").rows[0].setting).toBe("ltch");
  });
});

describe("Hospital Spending by Claim", () => {
  it("keys on hospital, period and claim type, with the period's year", () => {
    const { rows: out } = mapAll("hospital_spending_by_claim", { year: 2022, batchId: 1 });
    expect(out[0]).toMatchObject({ ccn: "010001", period: "1 to 3 days Prior to Index Hospital Admission", claim_type: "Home Health Agency", data_year: "2024", period_start: "2024-01-01", period_end: "2024-12-31", avg_spend_hospital: 25, pct_spend_hospital: 0.09, state: "AL" });
  });
});

describe("Market Saturation", () => {
  it("parses thousands separators, dollars and percentages and builds a geo code", () => {
    const { rows: out } = mapAll("market_saturation_county");
    expect(out[0]).toMatchObject({ reference_period: "2020-01-01 to 2020-12-31", geo_level: "NATION + TERRITORIES", geo_code: "", service: "Ambulance (Emergency & Non-Emergency)", state: null, ffs_benes: 36342691, providers: 8780, users: 4017592, users_pct: 11.05, total_payment: 3731546031.63, moratorium: null, providers_change_pct: -0.39 });
    const county = TYPED_ROUTES.market_saturation_county.map({ ...rows("market_saturation_county")[0], aggregation_level: "COUNTY", state: "PA", county: "Allegheny", state_fips: "42", county_fips: "3" }, ctx)!;
    expect(county).toMatchObject({ geo_level: "COUNTY", geo_code: "42003", state: "PA", geo_name: "Allegheny" });
    const cbsa = mapAll("market_saturation_cbsa").rows[0];
    expect(cbsa).toMatchObject({ geo_code: "", users_pct: 10.31 });
  });
});

describe("Monthly Enrollment", () => {
  it("keys the yearly row as YYYY-ALL and sums the 85+ bands", () => {
    const { rows: out } = mapAll("medicare_monthly_enrollment");
    expect(out[0]).toMatchObject({ period: "2013-ALL", geo_level: "National", geo_code: "", total_benes: 52425659, original_medicare: 37613096, ma_and_other: 14812563, age_85_plus: 3869249 + 1815059 + 632839 });
    const county = TYPED_ROUTES.medicare_monthly_enrollment.map({ ...rows("medicare_monthly_enrollment")[0], MONTH: "6", BENE_GEO_LVL: "County", BENE_STATE_ABRVTN: "PA", BENE_COUNTY_DESC: "Allegheny", BENE_FIPS_CD: "42003" }, ctx)!;
    expect(county).toMatchObject({ period: "2013-06", geo_level: "County", geo_code: "42003", state: "PA", county_name: "Allegheny" });
    expect(TYPED_ROUTES.medicare_monthly_enrollment.map({ ...rows("medicare_monthly_enrollment")[0], BENE_GEO_LVL: "County", BENE_FIPS_CD: "  " }, ctx)).toBeNull();
  });
});

describe("Geographic Variation", () => {
  it("maps the national, state and county rows of the Original Medicare file, reading the state from the geography", () => {
    const { rows: out, dropped } = mapAll("medicare_geographic_variation");
    expect(dropped).toBe(0);
    expect(out.map((r) => [r.geo_level, r.geo_code, r.state])).toEqual([["National", "", null], ["State", "42", "PA"], ["County", "42003", "PA"]]);
    expect(out[2]).toMatchObject({
      data_year: "2024", age_level: "All", geo_desc: "PA-Allegheny", benes: 290959, ma_benes: 188458, ma_participation_rate: 0.7484, dual_pct: 0.0944, avg_age: 73,
      std_per_capita_total: 11978.3, std_per_capita_snf: 606.26, std_per_capita_hha: 555.57, std_per_capita_hospice: 461.61,
      readmission_rate: 0.189, er_visits_per_1000: 583.4031, snf_stays_per_1000: 49.4246,
    });
    // The county file carries no risk score.
    expect(out[2].avg_hcc_score).toBeNull();
    expect((out[2].metrics as any).IP_MDCR_STDZD_PYMT_PC).toBeGreaterThan(0);
  });

  it("still reads the older Medicare Advantage layout: level from the code, state from its column", () => {
    const older = TYPED_ROUTES.medicare_geographic_variation.map({ YEAR: "2016", STATE: "AK", BENE_GEO_CD: "02", BENES_MA_CNT: "573", BENE_AVG_AGE: "74", BENE_DUAL_PCT: "0.1902", IP_STAYS_PER_1000_BENES: "209.4241", SNF_STAYS_PER_1000_BENES: "57.5916", ER_VISITS_PER_1000_BENES: "401.3962" }, ctx)!;
    expect(older).toMatchObject({ data_year: "2016", geo_level: "State", geo_code: "02", state: "AK", ma_benes: 573, avg_age: 74, dual_pct: 0.1902, snf_stays_per_1000: 57.5916, er_visits_per_1000: 401.3962 });
    expect((older.metrics as any).IP_STAYS_PER_1000_BENES).toBe(209.4241);
  });

  it("takes a county's state from its FIPS code when the description is missing or spaced differently", () => {
    const base = { YEAR: "2024", BENE_GEO_LVL: "County", BENE_AGE_LVL: "All", BENES_TOTAL_CNT: "250000" };
    expect(TYPED_ROUTES.medicare_geographic_variation.map({ ...base, BENE_GEO_CD: "42003", BENE_GEO_DESC: "PA - Allegheny" }, ctx)).toMatchObject({ geo_code: "42003", state: "PA" });
    expect(TYPED_ROUTES.medicare_geographic_variation.map({ ...base, BENE_GEO_CD: "39035" }, ctx)).toMatchObject({ geo_code: "39035", state: "OH" });
  });
});

describe("Zip service areas, affiliations, physicians, DME, LTC-671", () => {
  it("maps the Care Compare zip files per setting", () => {
    expect(mapAll("home_health_zip_data").rows[0]).toMatchObject({ setting: "hha", ccn: "027001", zip5: "99501", state: "AK", as_of: "2024-12-31" });
    expect(mapAll("hospice_zip_data").rows[0]).toMatchObject({ setting: "hospice", ccn: "001500", zip5: "85032" });
  });

  it("maps clinician → facility affiliations", () => {
    expect(mapAll("facility_affiliation").rows[0]).toMatchObject({ npi: "1003000126", facility_type: "Hospital", facility_ccn: "090012", ind_pac_id: "7517003643" });
  });

  it("maps Part B totals per physician with the resolved year", () => {
    const r = mapAll("medicare_physician_by_provider").rows[0];
    expect(r).toMatchObject({ npi: "1003000126", data_year: "2024", provider_type: "Internal Medicine", state: "MD", zip5: "20817", benes: 328, services: 399, medicare_payment: 35325.46, avg_age: 76, dual_count: 77 });
    expect((r.chronic_conditions as any).Bene_CC_PH_CKD_V2_Pct).toBe(55);
    expect((r.chronic_conditions as any).Bene_CC_BH_ADHD_OthCD_V1_Pct).toBeUndefined();
  });

  it("maps DME by referring provider, with suppressed beneficiary counts as null", () => {
    expect(mapAll("medicare_dme_by_referring").rows[0]).toMatchObject({ npi: "1003000126", specialty: "Internal Medicine", suppliers: 3, benes: null, claims: 19, medicare_payment: 2635.49 });
  });

  it("maps the LTC-671 census with the dataset's period end", () => {
    const r = mapAll("ltc_facility_characteristics", { year: 2026, asOf: "2026-06-30", batchId: 1 }).rows[0];
    expect(r).toMatchObject({ ccn: "015009", period_end: "2026-06-30", facility_name: "BURNS NURSING HOME, INC.", state: "AL", zip5: "35653", certification_date: "2023-03-02", medicare_census: 4, medicaid_census: 37, other_census: 9, total_residents: 50, hospital_based: false, ownership_type: "For Profit - Corporation", multi_facility: false, ccrc: false });
    expect((r.special_care_beds as any)["Alzheimer's Disease"]).toBe(0);
  });

  it("drops rows without a key and keeps the last of duplicates within a page", () => {
    const route = TYPED_ROUTES.hospital_service_area;
    const { rows: out, dropped } = mapTypedRows(route, [
      { MEDICARE_PROV_NUM: "010001", ZIP_CD_OF_RESIDENCE: "36301", TOTAL_CASES: "11" },
      { MEDICARE_PROV_NUM: "010001", ZIP_CD_OF_RESIDENCE: "36301", TOTAL_CASES: "12" },
      { MEDICARE_PROV_NUM: "", ZIP_CD_OF_RESIDENCE: "36301" },
    ], { year: 2025, batchId: 1 });
    expect(dropped).toBe(1);
    expect(out).toEqual([expect.objectContaining({ total_cases: 12 })]);
  });
});

describe("Home health certifications", () => {
  // Real rows of the four codes (G0180, G0179, G0181, G0182), captured from the live API on 2026-10-12 with the names and street
  // addresses left out. The same clinician bills a code at the office (O) and at a facility (F) as separate rows.
  const ctx2 = { year: 2024, batchId: 9 };

  it("keeps one row per clinician, code and place of service, with the patients and services", () => {
    const { rows: out, dropped } = mapTypedRows(TYPED_ROUTES.physician_certifications, rows("physician_certifications"), ctx2);
    expect(dropped).toBe(0);
    expect(out).toHaveLength(7);
    expect(out[0]).toMatchObject({ npi: "1174967715", hcpcs_code: "G0180", place_of_service: "O", data_year: "2024", provider_type: "Orthopedic Surgery", state: "PA", benes: 152, services: 154, import_batch_id: 9 });
    expect(out[1]).toMatchObject({ npi: "1063892255", hcpcs_code: "G0180", place_of_service: "F", benes: 128 });
    expect(new Set(out.map((r) => `${r.npi}|${r.hcpcs_code}|${r.place_of_service}`)).size).toBe(7);
    expect(new Set(out.map((r) => r.hcpcs_code))).toEqual(new Set(CERTIFICATION_HCPCS));
  });

  it("is keyed so a re-import of the year updates the rows and a new year adds its own", () => {
    expect(TYPED_ROUTES.physician_certifications.key).toEqual(["npi", "hcpcs_code", "place_of_service", "data_year"]);
  });

  it("drops what is not a certification: another code, a bad NPI, no place of service, no year", () => {
    const good = rows("physician_certifications")[0];
    expect(mapPhysicianCertification({ ...good, HCPCS_Cd: "99213" }, ctx2)).toBeNull();
    expect(mapPhysicianCertification({ ...good, Rndrng_NPI: "12345" }, ctx2)).toBeNull();
    expect(mapPhysicianCertification({ ...good, Place_Of_Srvc: "" }, ctx2)).toBeNull();
    expect(mapPhysicianCertification(good, { year: null, batchId: 9 })).toBeNull();
    expect(mapPhysicianCertification({ ...good, HCPCS_Cd: "g0180" }, ctx2)).toMatchObject({ hcpcs_code: "G0180" });
  });
});
