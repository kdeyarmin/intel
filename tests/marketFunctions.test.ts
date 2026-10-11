/**
 * The market functions read the market rollups with bounded, index-backed
 * queries and resolve names from the typed CMS tables before the facility
 * records. The pool is faked by SQL shape; the geography is a small built index.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ queries: [] as Array<{ sql: string; params?: any[] }>, answers: [] as Array<[RegExp, any]> }));

vi.mock("../server/db", () => {
  const client = {
    async query(sql: string, params?: any[]) {
      h.queries.push({ sql, params });
      const hit = h.answers.find(([re]) => re.test(sql));
      const rows = hit ? (typeof hit[1] === "function" ? hit[1](params) : hit[1]) : [];
      return { rows };
    },
    release() {},
  };
  return { pool: { connect: async () => client, query: client.query } };
});

vi.mock("../server/lib/geo", async (orig) => {
  const real: any = await orig();
  const index = real.buildGeoIndex({
    counties: [
      { fips: "42003", state: "PA", name: "Allegheny County", lat: 40.47, lng: -79.98 },
      { fips: "42019", state: "PA", name: "Butler County", lat: 40.91, lng: -79.91 },
      { fips: "39095", state: "OH", name: "Lucas County", lat: 41.68, lng: -83.47 },
    ],
    zctas: [
      { zcta: "15213", lat: 40.44, lng: -79.95, primary_county_fips: "42003", state: "PA" },
      { zcta: "16001", lat: 40.86, lng: -79.9, primary_county_fips: "42019", state: "PA" },
    ],
    zctaCounties: [],
    vintage: "2020",
  });
  return { ...real, getGeoIndex: async () => index };
});

import {
  LAYER_METRICS,
  handleGetCountyMarket,
  handleGetCountyMarketLayer,
  handleGetFacilityMarket,
  handleGetHospitalCatchment,
  handleGetReferralSources,
  handleGetServiceAreaOverlap,
} from "../server/functions/market";
import { PUBLIC_FUNCTIONS } from "../server/lib/functionAcl";

const sql = () => h.queries.map((q) => q.sql);

beforeEach(() => {
  h.queries.length = 0;
  h.answers = [
    [/FROM rollup_runs/, [{ job: "county_market_profile", status: "success", last_success_at: "2026-10-10T03:00:00Z" }, { job: "cms_service_types", status: "success" }]],
    [/DISTINCT ON \(ccn\) ccn, provider_name, city, state FROM cms_pac_utilization/, (p: any[]) => p[0].filter((c: string) => /^39[5-8]/.test(c)).map((ccn: string) => ({ ccn, provider_name: `PAC ${ccn}`, city: "Pittsburgh", state: "PA" }))],
    [/FROM rollup_hospital_discharge_mix WHERE ccn = ANY/, (p: any[]) => p[0].filter((c: string) => c === "390001").map((ccn: string) => ({ ccn, facility_name: "UPMC PRESBYTERIAN", state: "PA", data_year: "2024", pct_snf: 12.5, pct_hha: 8.1, pct_hospice: 1.2, pct_inpatient: 30, pct_outpatient: 10, pct_snf_state: 11, pct_hha_state: 7, pct_hospice_state: 1, pct_snf_national: 10, pct_hha_national: 6, pct_hospice_national: 1, avg_episode_spend: 21000 }))],
    [/FROM medicare_facilities/, (p: any[]) => p[0].filter((c: string) => c === "390002").map((ccn: string) => ({ provider_id: ccn, facility_name: "ALLEGHENY GENERAL", city: "Pittsburgh", state: "PA" }))],
  ];
});

describe("public functions", () => {
  it("lists the six market functions as read-only", () => {
    for (const f of ["getCountyMarket", "getHospitalCatchment", "getFacilityMarket", "getCountyMarketLayer", "getReferralSources", "getServiceAreaOverlap"]) {
      expect(PUBLIC_FUNCTIONS.has(f), f).toBe(true);
    }
  });
});

describe("getCountyMarket", () => {
  it("asks for a county when none matches, listing the state's counties", async () => {
    const r: any = await handleGetCountyMarket({ state: "PA", county: "Narnia" });
    expect(r.needsCounty).toBe(true);
    expect(r.counties.map((c: any) => c.name)).toEqual(["Allegheny County", "Butler County"]);
    await expect(handleGetCountyMarket({})).rejects.toMatchObject({ status: 400 });
  });

  it("returns the profile, hospital sources with discharge mix, competitors by setting, trends and coverage", async () => {
    h.answers.push(
      [/FROM rollup_county_market_profile WHERE county_fips/, [{ county_fips: "42003", state: "PA", county_name: "Allegheny County", benes: 310000, ma_penetration: 0.62, as_of: { enrollment: "2026-06", hospital_service_area: "2025" } }]],
      [/FROM rollup_county_hospital_sources s/, [{ ccn: "390001", data_year: "2025", cases: 12000, days: 60000, share_of_county: 0.31, rank: 1, total: 23 }, { ccn: "390002", data_year: "2025", cases: 8000, days: 40000, share_of_county: 0.2, rank: 2, total: 23 }]],
      [/SELECT p\.\* FROM rollup_pac_market_share p/, [
        { setting: "snf", data_year: "2024", geo_level: "county", geo_code: "42003", ccn: "395001", provider_name: "KANE REGIONAL", city: "Pittsburgh", state: "PA", zip5: "15213", benes: 900, stays: 1200, days: 30000, payment: 20000000, dual_pct: 40, risk_score: 2.4, share_benes: 0.12, rank: 1, providers_in_market: 70 },
        { setting: "hha", data_year: "2024", geo_level: "county", geo_code: "42003", ccn: "397001", provider_name: null, city: "Pittsburgh", state: "PA", zip5: "15213", benes: 2500, stays: 4000, days: 90000, payment: 15000000, dual_pct: 20, risk_score: 2.1, share_benes: 0.2, rank: 1, providers_in_market: 40 },
      ]],
      [/sum\(benes\)::bigint AS benes, sum\(stays\)::bigint AS stays, count\(\*\)::int AS providers/, [{ setting: "snf", data_year: "2023", benes: "7000", stays: "9000", providers: 72 }, { setting: "snf", data_year: "2024", benes: "7400", stays: "9500", providers: 70 }]],
      [/FROM rollup_agency_coverage\s+WHERE county_fips/, [{ setting: "hha", ccn: "397001", zips_served: 40, county_zips: 50, share_of_county_zips: 0.8 }, { setting: "hospice", ccn: "398001", zips_served: 25, county_zips: 50, share_of_county_zips: 0.5 }]],
      [/FROM cms_ltc_facility_characteristics WHERE ccn = ANY/, (p: any[]) => p[0].filter((c: string) => c === "395001").map((ccn: string) => ({ ccn, period_end: "2026-06-30", medicare_census: 30, medicaid_census: 60, other_census: 30, total_residents: 120, ownership_type: "For profit", multi_facility_org_name: "KANE SYSTEM", ccrc: false, special_care_beds: null }))],
      [/FROM licensed_facilities WHERE county_fips = \$1 ORDER BY capacity/, [{ license_type: "personal_care_home", license_number: "PCH-1234", name: "Sunny Hill Personal Care", address: "1 Main St", city: "Pittsburgh", state: "PA", zip5: "15213", capacity: 48, status: "Regular", licensee: "Sunny Hill LLC", phone: null, as_of: "2026-09-30" }]],
      [/FROM licensed_facilities WHERE county_fips = \$1 GROUP BY/, [{ license_type: "personal_care_home", homes: 2, beds: 90, as_of: "2026-09-30" }]],
    );
    const r: any = await handleGetCountyMarket({ state: "PA", county_fips: "42003" });
    expect(r.county).toEqual({ fips: "42003", name: "Allegheny County", state: "PA" });
    expect(r.profile).toMatchObject({ available: true, benes: 310000 });
    expect(r.hospital_sources.data_year).toBe("2025");
    // The rows are the top TOP of the county's hospitals; the total says how many there are, so the table can say so.
    expect(r.hospital_sources.total).toBe(23);
    expect(h.queries.find((q) => /FROM rollup_county_hospital_sources s/.test(q.sql))!.sql).toMatch(/count\(\*\) OVER \(\)::int AS total/);
    expect(r.hospital_sources.rows[0]).toMatchObject({ ccn: "390001", name: "UPMC PRESBYTERIAN", share: 0.31, rank: 1, discharge_mix: { pct_snf: 12.5, state: { pct_snf: 11 }, national: { pct_hha: 6 } } });
    // A hospital the typed files don't name falls back to the facility records.
    expect(r.hospital_sources.rows[1]).toMatchObject({ ccn: "390002", name: "ALLEGHENY GENERAL", city: "Pittsburgh", discharge_mix: null });
    expect(r.competitors.snf.rows[0]).toMatchObject({ ccn: "395001", name: "KANE REGIONAL", share: 0.12, rank: 1, providers_in_market: 70, facility_group: "snf", census: { total_residents: 120, medicare_pct: 0.25, medicaid_pct: 0.5, chain: "KANE SYSTEM" } });
    expect(r.competitors.hha.rows[0].census).toBeUndefined();
    expect(r.licensed).toEqual({ as_of: "2026-09-30", totals: [{ license_type: "personal_care_home", homes: 2, beds: 90 }], rows: [expect.objectContaining({ name: "Sunny Hill Personal Care", capacity: 48, license_type: "personal_care_home" })] });
    expect(r.competitors.hha.rows[0]).toMatchObject({ ccn: "397001", name: "PAC 397001", facility_group: "home_health" });
    expect(r.competitors.hospice.rows).toEqual([]);
    expect(r.trends.snf).toEqual([{ data_year: "2023", benes: 7000, stays: 9000, providers: 72 }, { data_year: "2024", benes: 7400, stays: 9500, providers: 70 }]);
    expect(r.coverage.hha[0]).toMatchObject({ ccn: "397001", name: "PAC 397001", share_of_county_zips: 0.8 });
    expect(r.coverage.hospice[0]).toMatchObject({ ccn: "398001", share_of_county_zips: 0.5 });
    // One limit across both settings would let a county's many home health agencies push every hospice out.
    const coverageQuery = h.queries.find((q) => /FROM rollup_agency_coverage/.test(q.sql))!;
    expect(coverageQuery.sql).toMatch(/row_number\(\) OVER \(PARTITION BY setting ORDER BY share_of_county_zips DESC, ccn\)/);
    expect(coverageQuery.sql).toMatch(/WHERE rn <= \$2/);
    expect(coverageQuery.params).toEqual(["42003", 25]);
    expect(r.vintages).toEqual({ enrollment: "2026-06", hospital_service_area: "2025" });
    expect(r.rollups.county_market_profile).toEqual({ status: "success", refreshed_at: "2026-10-10T03:00:00Z", error: null });
    expect(r.rollups.cms_service_types).toBeUndefined();
    // Every rollup read is keyed by the county; the facility table is only consulted by CCN list.
    expect(sql().filter((s) => /FROM medicare_facilities/.test(s))).toHaveLength(1);
    expect(sql().some((s) => /FROM provider_locations|FROM cms_hospital_service_area/.test(s))).toBe(false);
  });

  it("reports an unprofiled county honestly", async () => {
    const r: any = await handleGetCountyMarket({ state: "PA", county: "Butler" });
    expect(r.profile).toEqual({ available: false, county_fips: "42019" });
    expect(r.hospital_sources).toEqual({ data_year: null, total: 0, rows: [] });
    expect(r.competitors.snf.rows).toEqual([]);
    expect(r.licensed).toEqual({ as_of: null, totals: [], rows: [] });
  });
});

describe("getHospitalCatchment", () => {
  it("adds up the hospital's ZIP areas by county, newest year first", async () => {
    h.answers.push(
      [/SELECT DISTINCT data_year FROM rollup_hospital_catchment/, [{ data_year: "2025" }, { data_year: "2024" }]],
      [/SELECT zip5, county_fips, cases, days, charges, share_of_hospital FROM rollup_hospital_catchment/, (p: any[]) => (p[1] === "2025" ? [
        { zip5: "15213", county_fips: "42003", cases: 600, days: 3000, charges: 9e6, share_of_hospital: 0.3 },
        { zip5: "15212", county_fips: "42003", cases: 300, days: 1500, charges: 4e6, share_of_hospital: 0.15 },
        { zip5: "16001", county_fips: "42019", cases: 100, days: 500, charges: 1e6, share_of_hospital: 0.05 },
      ] : [])],
      [/AS zips FROM rollup_hospital_catchment WHERE ccn/, [{ cases: "1000", zips: 3 }]],
      [/GROUP BY county_fips ORDER BY sum\(cases\)/, [
        { county_fips: "42003", cases: "900", days: "4500", zips: 2 },
        { county_fips: "42019", cases: "100", days: "500", zips: 1 },
      ]],
      [/FROM rollup_hospital_discharge_mix WHERE ccn = \$1/, [{ ccn: "390001", data_year: "2024", facility_name: "UPMC PRESBYTERIAN", state: "PA", pct_snf: 12.5 }]],
    );
    const r: any = await handleGetHospitalCatchment({ ccn: " 390001 " });
    expect(r).toMatchObject({ ccn: "390001", name: "UPMC PRESBYTERIAN", data_year: "2025", years: ["2025", "2024"], total_cases: 1000 });
    expect(r.counties).toEqual([
      { county_fips: "42003", name: "Allegheny County", state: "PA", cases: 900, days: 4500, zips: 2, share: 0.9 },
      { county_fips: "42019", name: "Butler County", state: "PA", cases: 100, days: 500, zips: 1, share: 0.1 },
    ]);
    expect(r.zips[0]).toMatchObject({ zip5: "15213", county_name: "Allegheny County", share: 0.3 });
    expect(r.discharge_mix.pct_snf).toBe(12.5);
    await expect(handleGetHospitalCatchment({})).rejects.toMatchObject({ status: 400 });
  });

  it("takes the total and the county split from every ZIP area, not just the ones listed", async () => {
    h.answers.push(
      [/SELECT DISTINCT data_year FROM rollup_hospital_catchment/, [{ data_year: "2025" }]],
      [/SELECT zip5, county_fips, cases, days, charges, share_of_hospital FROM rollup_hospital_catchment/, [
        { zip5: "15213", county_fips: "42003", cases: 600, days: 3000, charges: 9e6, share_of_hospital: 0.12 },
        { zip5: "15212", county_fips: "42003", cases: 300, days: 1500, charges: 4e6, share_of_hospital: 0.06 },
      ]],
      // The hospital has 800 ZIP areas and 5,000 cases; the list only shows the busiest two.
      [/AS zips FROM rollup_hospital_catchment WHERE ccn/, [{ cases: "5000", zips: 800 }]],
      [/GROUP BY county_fips ORDER BY sum\(cases\)/, [{ county_fips: "42003", cases: "3000", days: "15000", zips: 300 }, { county_fips: "42019", cases: "1000", days: "5000", zips: 120 }]],
    );
    const r: any = await handleGetHospitalCatchment({ ccn: "390001" });
    expect(r).toMatchObject({ total_cases: 5000, zips_total: 800, zips_truncated: true });
    expect(r.zips).toHaveLength(2);
    expect(r.counties[0]).toMatchObject({ county_fips: "42003", cases: 3000, zips: 300, share: 0.6 });
    expect(r.counties[1]).toMatchObject({ county_fips: "42019", cases: 1000, share: 0.2 });
    // The aggregates run in SQL over the hospital's rows, keyed by CCN and year.
    const agg = h.queries.filter((q) => /sum\(cases\)/.test(q.sql));
    expect(agg).toHaveLength(2);
    for (const q of agg) expect(q.params).toEqual(["390001", "2025"]);
  });
});

describe("getFacilityMarket", () => {
  it("validates the setting and says when a provider isn't in the rollup", async () => {
    await expect(handleGetFacilityMarket({ ccn: "395001", setting: "clinic" })).rejects.toMatchObject({ status: 400 });
    expect(await handleGetFacilityMarket({ ccn: "395001", setting: "snf" })).toMatchObject({ found: false, label: "Skilled nursing" });
  });

  it("gives the provider's county and state position, the market and its trend", async () => {
    h.answers.push(
      [/FROM rollup_pac_market_share WHERE ccn = \$1 AND setting = \$2/, [
        { setting: "snf", data_year: "2024", geo_level: "county", geo_code: "42003", ccn: "395001", provider_name: "KANE REGIONAL", benes: 900, share_benes: 0.12, rank: 2, providers_in_market: 70 },
        { setting: "snf", data_year: "2024", geo_level: "state", geo_code: "PA", ccn: "395001", provider_name: "KANE REGIONAL", benes: 900, share_benes: 0.01, rank: 15, providers_in_market: 680 },
        { setting: "snf", data_year: "2023", geo_level: "county", geo_code: "42003", ccn: "395001", provider_name: "KANE REGIONAL", benes: 850, share_benes: 0.11, rank: 3, providers_in_market: 72 },
      ]],
      [/geo_level = 'county' AND geo_code = \$2 AND data_year = \$3 ORDER BY rank/, [
        { ccn: "395009", provider_name: "ST BARNABAS", benes: 1000, share_benes: 0.13, rank: 1, providers_in_market: 70, data_year: "2024" },
        { ccn: "395001", provider_name: "KANE REGIONAL", benes: 900, share_benes: 0.12, rank: 2, providers_in_market: 70, data_year: "2024" },
      ]],
      [/sum\(benes\)::bigint AS benes, count\(\*\)::int AS providers FROM rollup_pac_market_share/, [{ data_year: "2023", benes: "7000", providers: 72 }, { data_year: "2024", benes: "7400", providers: 70 }]],
    );
    h.answers.push([/FROM cms_ltc_facility_characteristics WHERE ccn = ANY/, (p: any[]) => p[0].filter((c: string) => c === "395001").map((ccn: string) => ({ ccn, period_end: "2026-06-30", medicare_census: 30, medicaid_census: 60, other_census: 30, total_residents: 120, ownership_type: "For profit", multi_facility_org_name: null, ccrc: true, special_care_beds: { Alzheimer: 20 } }))]);
    const r: any = await handleGetFacilityMarket({ ccn: "395001", setting: "snf" });
    expect(r).toMatchObject({ found: true, name: "KANE REGIONAL", county: { fips: "42003", name: "Allegheny County" }, data_year: "2024" });
    expect(r.census).toEqual({ period_end: "2026-06-30", total_residents: 120, medicare_census: 30, medicaid_census: 60, other_census: 30, medicare_pct: 0.25, medicaid_pct: 0.5, ownership_type: "For profit", chain: null, ccrc: true, special_care_beds: { Alzheimer: 20 } });
    expect(r.market.find((m: any) => m.ccn === "395009").census).toBeNull();
    expect(r.position).toMatchObject({ rank: 2, share: 0.12, providers_in_market: 70, state_rank: 15, state_providers: 680 });
    expect(r.market.map((m: any) => [m.ccn, m.is_this])).toEqual([["395009", false], ["395001", true]]);
    expect(r.trend).toEqual([
      { data_year: "2023", benes: 850, share: 0.11, rank: 3, market_benes: 7000, market_providers: 72 },
      { data_year: "2024", benes: 900, share: 0.12, rank: 2, market_benes: 7400, market_providers: 70 },
    ]);
    expect(r.coverage).toEqual([]);
  });
});

describe("getFacilityMarket without a county", () => {
  it("doesn't put the state's rank and share in the county position", async () => {
    h.answers.push(
      [/FROM rollup_pac_market_share WHERE ccn = \$1 AND setting = \$2/, [
        { setting: "snf", data_year: "2024", geo_level: "state", geo_code: "PA", ccn: "395001", provider_name: "KANE REGIONAL", benes: 900, stays: 1200, share_benes: 0.01, rank: 15, providers_in_market: 680 },
      ]],
    );
    const r: any = await handleGetFacilityMarket({ ccn: "395001", setting: "snf" });
    expect(r.county).toBeNull();
    expect(r.position).toMatchObject({ rank: null, share: null, providers_in_market: null, state_rank: 15, state_providers: 680, state_share: 0.01, benes: 900 });
  });
});

describe("getCountyMarketLayer", () => {
  it("only serves the allowlisted metrics, with the vintage the metric comes from", async () => {
    await expect(handleGetCountyMarketLayer({ state: "PA", metric: "benes; DROP TABLE" })).rejects.toMatchObject({ status: 400 });
    h.answers.push([/FROM rollup_county_market_profile WHERE state = \$1/, [
      { county_fips: "42003", county_name: "Allegheny County", value: "0.62", as_of: { enrollment: "2026-06", saturation: "2025-01-01 to 2025-12-31" } },
      { county_fips: "42019", county_name: "Butler County", value: null, as_of: null },
    ]]);
    const r: any = await handleGetCountyMarketLayer({ state: "pa", metric: "ma_penetration" });
    expect(r).toMatchObject({ state: "PA", metric: "ma_penetration", label: "Medicare Advantage share", format: "percent", vintage: "2026-06" });
    expect(r.counties).toEqual([{ fips: "42003", name: "Allegheny County", value: 0.62 }, { fips: "42019", name: "Butler County", value: null }]);
    expect(r.metrics.map((m: any) => m.key)).toEqual(Object.keys(LAYER_METRICS));
    expect(Object.keys(LAYER_METRICS)).toEqual(expect.arrayContaining(["pop_65_plus", "pop_85_plus", "median_income", "licensed_beds"]));
    expect(h.queries.find((q) => q.sql.includes("rollup_county_market_profile"))!.sql).toContain("ma_penetration AS value");
  });
});

describe("getReferralSources", () => {
  const SOURCES = [
    { npi: "1000000001", data_year: "2024", county_fips: "42003", state: "PA", zip5: "15213", specialty: "Internal Medicine", benes: 620, services: 8000, avg_risk_score: 2.1, dual_pct: 0.3, cc_chf_pct: 0.2, cc_copd_pct: 0.15, cc_alzheimer_pct: 0.12, cc_ckd_pct: 0.25, cc_diabetes_pct: 0.3, hha_eligible: true, hospice_eligible: true, dme_eligible: true, dme_benes: 40, hospital_ccns: ["390001"], affiliations: 2, referral_index: 96, rank_in_county: 1 },
    { npi: "1000000002", data_year: "2024", county_fips: "42003", state: "PA", zip5: "15213", specialty: "Cardiology", benes: 500, services: 3000, avg_risk_score: 1.9, dual_pct: null, cc_chf_pct: null, cc_copd_pct: null, cc_alzheimer_pct: null, cc_ckd_pct: null, cc_diabetes_pct: null, hha_eligible: false, hospice_eligible: false, dme_eligible: false, dme_benes: null, hospital_ccns: [], affiliations: 0, referral_index: 69, rank_in_county: 2 },
  ];

  it("lists a county's top sources with names, groups, components and lead scores", async () => {
    h.answers.push(
      [/FROM rollup_referral_sources WHERE county_fips = \$1 ORDER BY referral_index DESC/, SOURCES],
      [/FROM providers WHERE npi = ANY/, [{ npi: "1000000001", first_name: "Ada", last_name: "Lovelace", credential: "MD" }, { npi: "1000000002", first_name: "Bo", last_name: "Hart", credential: null }]],
      [/FROM provider_taxonomies WHERE npi = ANY/, [{ npi: "1000000002", taxonomy_code: "207RC0000X", taxonomy_description: "Internal Medicine, Cardiovascular Disease" }]],
      [/FROM lead_scores WHERE npi = ANY/, [{ npi: "1000000001", score: 88 }]],
    );
    const r: any = await handleGetReferralSources({ state: "PA", county_fips: "42003", limit: 500 });
    expect(r).toMatchObject({ county: { fips: "42003" }, limit: 200, setting: null, data_year: "2024", truncated: false });
    expect(r.rows[0]).toMatchObject({
      npi: "1000000001", name: "Ada Lovelace, MD", specialty: "Internal Medicine", specialty_group: "internal_medicine", county_name: "Allegheny County",
      benes: 620, chronic: { chf: 0.2, alzheimer: 0.12 }, eligible: { hha: true, hospice: true, dme: true }, hospital_ccns: ["390001"], referral_index: 96, rank_in_county: 1, lead_score: 88,
    });
    expect(r.rows[1]).toMatchObject({ name: "Bo Hart", specialty_group: "cardiology", lead_score: null, eligible: { hha: false, hospice: false, dme: false } });
    expect(r.index_note).toMatch(/50 points/);
  });

  it("filters to a setting's eligible sources and to a specialty group, over-fetching for the group", async () => {
    h.answers.push([/FROM rollup_referral_sources WHERE state = \$1 AND hospice_eligible = true/, SOURCES]);
    const r: any = await handleGetReferralSources({ state: "PA", setting: "hospice", specialty_group: "internal_medicine", limit: 5 });
    const q = h.queries.find((x) => x.sql.includes("rollup_referral_sources"))!;
    expect(q.params).toEqual(["PA", 26]); // 5 x 5 to search, plus one to see whether the list goes on
    expect(r.county).toBeNull();
    expect(r.rows.map((x: any) => x.npi)).toEqual(["1000000001"]);
  });

  describe("says when there are more clinicians than it returned", () => {
    // The rollup holds `total` ranked clinicians in the county; the query honours its LIMIT.
    const ranked = (total: number, only?: string) => Array.from({ length: total }, (_, i) => ({
      ...SOURCES[i % 2 === 0 ? 0 : 1], npi: String(1000000100 + i), referral_index: 100 - i, specialty: only ?? (i % 2 === 0 ? "Internal Medicine" : "Cardiology"),
    }));
    // Replaces any earlier answer for the rollup (the first match wins).
    const serve = (total: number, only?: string) => {
      h.answers = h.answers.filter(([re]) => !/rollup_referral_sources/.test(re.source));
      h.answers.push([/FROM rollup_referral_sources WHERE county_fips = \$1/, (p: any[]) => ranked(total, only).slice(0, p[1])]);
    };

    it("without a specialty, from a row past the limit", async () => {
      serve(30);
      const r: any = await handleGetReferralSources({ state: "PA", county_fips: "42003", limit: 10 });
      expect(r.rows).toHaveLength(10);
      expect(r.truncated).toBe(true);
      serve(10);
      expect((await handleGetReferralSources({ state: "PA", county_fips: "42003", limit: 10 })).truncated).toBe(false);
    });

    it("with a specialty, when the window searched was full even though fewer than the limit matched", async () => {
      serve(60);
      // Top 10 asked: 50 are searched, 25 of them cardiologists, so 10 shown and more matched.
      const more: any = await handleGetReferralSources({ state: "PA", county_fips: "42003", specialty_group: "cardiology", limit: 10 });
      expect(more.rows).toHaveLength(10);
      expect(more).toMatchObject({ truncated: true, searched: 50 });
      // Top 100 asked: the window is the whole 60, so it was exhausted and nothing is hidden.
      const all: any = await handleGetReferralSources({ state: "PA", county_fips: "42003", specialty_group: "cardiology", limit: 100 });
      expect(all).toMatchObject({ truncated: false, searched: 60 });
      expect(all.rows).toHaveLength(30);
    });

    it("with a specialty nobody in the window has, still reports that the list goes on", async () => {
      serve(400, "Internal Medicine");
      const r: any = await handleGetReferralSources({ state: "PA", county_fips: "42003", specialty_group: "cardiology", limit: 10 });
      expect(r.rows).toHaveLength(0);
      expect(r).toMatchObject({ truncated: true, searched: 50 });
    });
  });

  it("asks for a real county when the one named isn't in the state", async () => {
    const r: any = await handleGetReferralSources({ state: "PA", county: "Lucas" });
    expect(r.needsCounty).toBe(true);
  });
});

describe("getServiceAreaOverlap", () => {
  it("lists the agencies serving a county with their county footprint and market share", async () => {
    h.answers.push(
      [/FROM rollup_agency_coverage a WHERE a\.setting = \$1 AND a\.county_fips = \$2/, [{ ccn: "397001", zips_served: 40, county_zips: 50, share_of_county_zips: 0.8, counties_served: 6 }]],
      [/DISTINCT ON \(ccn\) ccn, data_year, benes, share_benes, rank FROM rollup_pac_market_share/, [{ ccn: "397001", data_year: "2024", benes: 2500, share_benes: 0.2, rank: 1 }]],
    );
    const r: any = await handleGetServiceAreaOverlap({ state: "PA", county_fips: "42003", setting: "hha" });
    expect(r).toMatchObject({ setting: "hha", label: "Home health", county_zips: 50 });
    expect(r.rows[0]).toMatchObject({ ccn: "397001", name: "PAC 397001", zips_served: 40, share_of_county_zips: 0.8, counties_served: 6, benes: 2500, market_share: 0.2, market_rank: 1, facility_group: "home_health" });
    await expect(handleGetServiceAreaOverlap({ state: "PA", county_fips: "42003", setting: "snf" })).rejects.toMatchObject({ status: 400 });
  });
});
