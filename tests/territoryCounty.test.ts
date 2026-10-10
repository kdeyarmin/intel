import { beforeEach, describe, expect, it, vi } from "vitest";
import { countyDensity, pickScore, stateCountsFromStats, utilizationByNpi } from "../server/lib/territory";
import { buildGeoIndex, resetGeoCache } from "../server/lib/geo";

const GEO = {
  counties: [
    { fips: "42003", state: "PA", name: "Allegheny County", lat: 40.47, lng: -79.98 },
    { fips: "42019", state: "PA", name: "Butler County", lat: 40.91, lng: -79.92 },
    { fips: "39049", state: "OH", name: "Franklin County", lat: 39.97, lng: -83.01 },
  ],
  zctas: [
    { zcta: "15213", lat: 40.444, lng: -79.955, primary_county_fips: "42003", state: "PA", land_sqmi: 2 },
    { zcta: "15222", lat: 40.449, lng: -79.993, primary_county_fips: "42003", state: "PA", land_sqmi: 1 },
    { zcta: "16059", lat: 40.71, lng: -79.93, primary_county_fips: "42019", state: "PA", land_sqmi: 34 },
    { zcta: "43215", lat: 39.96, lng: -83.01, primary_county_fips: "39049", state: "OH", land_sqmi: 3 },
  ],
  zctaCounties: [
    { zcta: "15213", county_fips: "42003", land_share: 1 },
    { zcta: "15222", county_fips: "42003", land_share: 1 },
    { zcta: "16059", county_fips: "42019", land_share: 0.7 },
    { zcta: "16059", county_fips: "42003", land_share: 0.3 },
    { zcta: "43215", county_fips: "39049", land_share: 1 },
  ],
};

describe("territory helpers", () => {
  it("reads state counts from planner statistics, without a GROUP BY", () => {
    const states = stateCountsFromStats({ most_common_vals: "{PA,OH,XX,\"WV\"}", most_common_freqs: "{0.5,0.25,0.1,0.05}" }, 1000);
    expect(states.slice(0, 3)).toEqual([{ state: "PA", approx: 500 }, { state: "OH", approx: 250 }, { state: "WV", approx: 50 }]);
    expect(states.find((s) => s.state === "AK")).toEqual({ state: "AK", approx: null });
    expect(states.some((s) => s.state === "XX")).toBe(false);
    expect(stateCountsFromStats(null, 0).every((s) => s.approx === null)).toBe(true);
  });

  it("scores from lead scores, then AI outreach scores, else leaves them unscored", () => {
    expect(pickScore(81.6, 40)).toEqual({ score: 82, scoreSource: "lead_score" });
    expect(pickScore(null, 40.2)).toEqual({ score: 40, scoreSource: "ai_outreach" });
    expect(pickScore(undefined, null)).toEqual({ score: null, scoreSource: null });
    expect(pickScore(0, 99)).toEqual({ score: 0, scoreSource: "lead_score" });
  });

  it("totals Medicare utilization for each provider's latest year, parsing money safely", () => {
    const m = utilizationByNpi([
      { npi: "1", data_year: "2022", total_services: "100", total_unique_benes: "50", total_medicare_payment_amt: "$9,999" },
      { npi: "1", data_year: "2023", total_services: "10", total_unique_benes: "5", total_medicare_payment_amt: "$1,000.50" },
      { npi: "1", data_year: "2023", total_services: "4", total_unique_benes: "2", total_medicare_payment_amt: null, average_medicare_payment_amt: "25" },
      { npi: "2", data_year: "2023", total_services: "n/a", total_unique_benes: null, total_medicare_payment_amt: "oops" },
    ]);
    expect(m.get("1")).toEqual({ services: 14, beneficiaries: 7, payments: 1100.5, dataYear: "2023" });
    expect(m.get("2")).toEqual({ services: 0, beneficiaries: 0, payments: 0, dataYear: "2023" });
  });

  it("sums practice locations per county through the ZIP → county map", () => {
    const index = buildGeoIndex(GEO);
    expect(countyDensity(index, "PA", [
      { zip5: "15213", practice_locations: 10 },
      { zip5: "15222", practice_locations: 5 },
      { zip5: "16059", practice_locations: 3 },
      { zip5: "43215", practice_locations: 99 },
    ])).toEqual([
      { fips: "42003", name: "Allegheny County", practice_locations: 15 },
      { fips: "42019", name: "Butler County", practice_locations: 3 },
    ]);
  });
});

// ─── Handlers against a scripted database ────────────────────────────────────

const db = vi.hoisted(() => ({ queries: [] as Array<{ sql: string; params: any[] }>, answer: (_sql: string, _params: any[]): any[] | undefined => undefined }));

vi.mock("../server/db", () => {
  const run = async (sql: string, params: any[] = []) => {
    db.queries.push({ sql, params });
    return { rows: db.answer(sql, params) ?? [] };
  };
  const client = { query: run, release() {} };
  return { pool: { connect: async () => client, query: run }, db: {} };
});

function geoAnswers(sql: string): any[] | undefined {
  if (sql.startsWith("SELECT fips, state, name, lat, lng FROM geo_counties")) return GEO.counties;
  if (sql.startsWith("SELECT zcta, lat, lng, primary_county_fips, state FROM geo_zctas")) return GEO.zctas;
  if (sql.startsWith("SELECT zcta, county_fips, land_share FROM geo_zcta_counties")) return GEO.zctaCounties;
  if (sql.includes("FROM geo_meta")) return [{ vintage: "2020" }];
  return undefined;
}

describe("getCountyIntelligence", () => {
  beforeEach(() => {
    db.queries.length = 0;
    resetGeoCache();
    db.answer = (sql, params) => geoAnswers(sql) ?? (
      sql.includes("FROM provider_locations") ? [{ npi: "1000000001" }, { npi: "1000000002" }, { npi: "1000000001" }]
      : sql.includes("FROM rollup_zip_locations") ? [{ n: "40" }]
      : sql.includes("FROM providers WHERE npi = ANY") ? (params[0] as string[]).map((npi) => npi === "1000000002"
        ? { npi, entity_type: null, organization_name: "Mercy Hospital", last_name: null }
        : { npi, entity_type: "Individual", first_name: "Ann", last_name: "Chen", credential: "MD", ai_outreach_score: 55 })
      : sql.includes("FROM provider_taxonomies") ? [{ npi: "1000000001", taxonomy_code: "207RC0000X", taxonomy_description: "Internal Medicine, Cardiovascular Disease" }]
      : sql.includes("FROM cms_referrals") ? [
        { npi: "1000000001", referred_to_npi: "1000000002", total_referrals: "30", data_year: "2022" },
        { npi: "1000000001", referred_to_npi: "1000000002", total_referrals: "45", data_year: "2023" },
      ]
      : sql.includes("FROM provider_service_utilization") ? [
        { npi: "1000000001", hcpcs_code: "93306", hcpcs_description: "Echocardiogram", total_services: "10", total_medicare_payment_amt: "$1,200", data_year: "2023" },
      ]
      : sql.includes("FROM medicare_facilities") ? [
        { id: 7, facility_type: "hospital_general_info", facility_name: "Mercy", provider_id: "390001", city: "Pittsburgh", zip: "15213", quality_rating: 4, total_payments: 1000, total_discharges: 20 },
      ]
      : undefined);
  });

  it("resolves the county, matches providers by its ZIP areas, and reports real facilities", async () => {
    const { handleGetCountyIntelligence } = await import("../server/functions/countyIntelligence");
    const r: any = await handleGetCountyIntelligence({ state: "pa", county: "allegheny" });
    expect(r.county).toMatchObject({ fips: "42003", name: "Allegheny County" });
    const loc = db.queries.find((q) => q.sql.includes("FROM provider_locations"))!;
    expect(loc.sql).toMatch(/left\(zip, 5\) = ANY\(\$1\) AND state = \$2 AND location_type = 'Practice' LIMIT \$3/);
    // 16059 is mostly in Butler County, so it isn't Allegheny's.
    expect(loc.params[0]).toEqual(["15213", "15222"]);
    expect(r.summary).toMatchObject({ totalProviders: 2, providersExact: true, individualProviders: 1, orgProviders: 1, totalFacilities: 1, totalPayments: 1000 });
    expect(r.topSpecialties[0]).toEqual({ name: "Cardiology", count: 1 });
    expect(r.referrals).toEqual([expect.objectContaining({ fromName: "Ann Chen, MD", toName: "Mercy Hospital", totalReferrals: 45, dataYear: "2023" })]);
    expect(r.topServices).toEqual([{ code: "93306", name: "Echocardiogram", amount: 1200, services: 10 }]);
    expect(r.facilities[0]).toMatchObject({ group: "hospital", providerId: "390001" });
    expect(r.providers[0]).toMatchObject({ name: "Ann Chen, MD", score: 55, scoreSource: "ai_outreach" });
    const fac = db.queries.find((q) => q.sql.includes("FROM medicare_facilities"))!;
    expect(fac.sql).toContain("facility_type = ANY($1) AND state = $2 AND left(zip, 5) = ANY($3)");
    const ref = db.queries.find((q) => q.sql.includes("FROM cms_referrals"))!;
    expect(ref.sql).toContain("referred_to_npi IS NOT NULL");
  });

  it("lists the state's counties when none is chosen", async () => {
    const { handleGetCountyIntelligence } = await import("../server/functions/countyIntelligence");
    const r: any = await handleGetCountyIntelligence({ state: "PA" });
    expect(r).toEqual({ state: "PA", needsCounty: true, counties: [{ fips: "42003", name: "Allegheny County" }, { fips: "42019", name: "Butler County" }] });
  });
});

describe("getTerritoryData", () => {
  beforeEach(() => {
    db.queries.length = 0;
    resetGeoCache();
    db.answer = (sql, params) => geoAnswers(sql) ?? (
      sql.includes("FROM pg_stats") ? [{ most_common_vals: "{PA,OH}", most_common_freqs: "{0.6,0.4}" }]
      : sql.includes("FROM pg_class") ? [{ n: "1000" }]
      : sql.startsWith("SELECT npi FROM lead_scores") ? [{ npi: "1000000001" }, { npi: "1000000009" }]
      : sql.includes("SELECT DISTINCT npi FROM provider_locations") ? [{ npi: "1000000001" }]
      : sql.startsWith("SELECT npi FROM provider_locations") ? [{ npi: "1000000001" }, { npi: "1000000003" }]
      : sql.includes("FROM providers WHERE npi = ANY") ? (params[0] as string[]).map((npi) => ({ npi, entity_type: "Individual", first_name: "P", last_name: npi.slice(-1) }))
      : sql.includes("FROM provider_locations WHERE npi = ANY") ? [
        { npi: "1000000001", location_type: "Mailing", city: "Nowhere", state: "PA", zip: "16059" },
        { npi: "1000000001", location_type: "Practice", city: "Pittsburgh", state: "PA", zip: "15213-1234" },
        { npi: "1000000003", location_type: "Practice", city: "Pittsburgh", state: "PA", zip: "15299" },
      ]
      : sql.includes("FROM lead_scores WHERE npi = ANY") ? [{ npi: "1000000001", score: 88 }]
      : sql.includes("FROM rollup_zip_locations") ? [{ zip5: "15213", practice_locations: 12 }]
      : undefined);
  });

  it("puts the highest-scored providers in the state first, scores the rest honestly, and places them by ZIP", async () => {
    const { handleGetTerritoryData } = await import("../server/functions/territory");
    const r: any = await handleGetTerritoryData({ state: "PA", limit: 2 });
    expect(r.providers.map((p: any) => p.npi)).toEqual(["1000000001", "1000000003"]);
    const [a, b] = r.providers;
    expect(a).toMatchObject({ score: 88, scoreSource: "lead_score", city: "Pittsburgh", county: "Allegheny County", coordPrecision: "zcta" });
    expect(Math.abs(a.lat - 40.444)).toBeLessThan(0.01);
    expect(b).toMatchObject({ score: null, scoreSource: null, coordPrecision: "zip3" });
    expect(r.counties[0]).toEqual({ fips: "42003", name: "Allegheny County", practice_locations: 12 });
    expect(r.availableStates[0]).toEqual({ state: "PA", approx: 600 });
    expect(r.scope).toMatchObject({ state: "PA", sample_size: 2, approx_locations_in_state: 600 });
    // Never a GROUP BY over provider_locations.
    expect(db.queries.some((q) => /GROUP BY/i.test(q.sql))).toBe(false);
  });

  it("handles all states", async () => {
    const { handleGetTerritoryData } = await import("../server/functions/territory");
    const r: any = await handleGetTerritoryData({ state: "ALL", limit: 3 });
    expect(r.scope.state).toBe("ALL");
    expect(r.providers.length).toBeGreaterThan(0);
    expect(db.queries.some((q) => q.sql.includes("SELECT DISTINCT npi FROM provider_locations"))).toBe(false);
  });
});
