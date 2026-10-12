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
    // Latest year per pair and heaviest first are chosen in SQL, before the cap.
    expect(ref.sql).toMatch(/DISTINCT ON \(npi, referred_to_npi\)[\s\S]*ORDER BY npi, referred_to_npi, data_year DESC NULLS LAST[\s\S]*ORDER BY total_referrals DESC NULLS LAST LIMIT \$2/);
    const svc = db.queries.find((q) => q.sql.includes("FROM provider_service_utilization"))!;
    expect(svc.sql).toContain("max(data_year)");
    expect(svc.sql).not.toMatch(/LIMIT/);
    expect(fac.sql).toMatch(/ORDER BY data_year DESC NULLS LAST, id DESC LIMIT \$4/);
    expect(r.sample.facilities_capped).toBe(false);
    expect(r.sample.providers_capped).toBe(false);
  });

  it("says when the facility list was capped", async () => {
    const base = db.answer;
    const fac = { id: 1, facility_type: "hospital_general_info", facility_name: "F", provider_id: "1", city: "X", zip: "15213", total_payments: 1 };
    db.answer = (sql, params) => (sql.includes("FROM medicare_facilities") ? Array.from({ length: (params[3] as number) }, (_, i) => ({ ...fac, id: i })) : base(sql, params));
    const { handleGetCountyIntelligence } = await import("../server/functions/countyIntelligence");
    const r: any = await handleGetCountyIntelligence({ state: "PA", county: "allegheny" });
    expect(r.sample).toMatchObject({ facilities_capped: true, facility_limit: 2000 });
    expect(r.summary.totalFacilities).toBe(2000);
  });

  it("says when the provider list was capped, below the detail sample", async () => {
    // 300 providers: under both samples, so only the list cap applies.
    const base = db.answer;
    const npis = Array.from({ length: 300 }, (_, i) => String(1000000100 + i));
    db.answer = (sql, params) => (sql.includes("FROM provider_locations") ? npis.map((npi) => ({ npi }))
      : sql.includes("FROM providers WHERE npi = ANY") ? (params[0] as string[]).map((npi) => ({ npi, entity_type: "Individual", first_name: "P", last_name: npi, ai_outreach_score: Number(npi.slice(-3)) }))
      : base(sql, params));
    const { handleGetCountyIntelligence } = await import("../server/functions/countyIntelligence");
    const r: any = await handleGetCountyIntelligence({ state: "PA", county: "allegheny" });
    expect(r.summary).toMatchObject({ totalProviders: 300, providersExact: true });
    expect(r.sample).toMatchObject({ sampled: false, details_cover_all: true, providers_capped: true, provider_limit: 200, providers_found: 300 });
    expect(r.providers).toHaveLength(200);
    expect(r.providers[0]).toMatchObject({ score: 399 }); // highest scored first
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
      : sql.startsWith("SELECT id, npi, score FROM lead_scores") ? (params.length === 1 ? [{ id: 2, npi: "1000000001", score: 88 }, { id: 1, npi: "1000000009", score: 70 }] : [])
      : sql.includes("SELECT DISTINCT npi FROM provider_locations") ? [{ npi: "1000000001" }]
      : sql.startsWith("SELECT npi FROM provider_locations") ? [{ npi: "1000000001" }, { npi: "1000000003" }]
      : sql.includes("FROM providers WHERE npi = ANY") ? (params[0] as string[]).map((npi) => ({ npi, entity_type: "Individual", first_name: "P", last_name: npi.slice(-1) }))
      : sql.includes("CROSS JOIN LATERAL") ? [
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
    expect(db.queries.some((q) => /GROUP BY/i.test(q.sql) && q.sql.includes("provider_locations"))).toBe(false);
    // One location per provider, practice-in-state first, with no shared cap.
    const loc = db.queries.find((q) => q.sql.includes("CROSS JOIN LATERAL"))!;
    expect(loc.sql).toMatch(/ORDER BY \(location_type = 'Practice' AND state IS NOT DISTINCT FROM \$2\) DESC NULLS LAST/);
    expect(loc.params).toEqual([["1000000001", "1000000003"], "PA"]);
  });

  it("keeps reading scores in order until the state's highest-scored providers are found", async () => {
    const base = db.answer;
    // Page 1 (national top) has nobody in PA; page 2 does.
    db.answer = (sql, params) => {
      if (sql.startsWith("SELECT id, npi, score FROM lead_scores")) {
        if (params.length === 1) return Array.from({ length: 5000 }, (_, i) => ({ id: 10_000 - i, npi: `20000${String(i).padStart(5, "0")}`, score: 99 }));
        return [{ id: 3, npi: "1000000001", score: 60 }];
      }
      if (sql.includes("SELECT DISTINCT npi FROM provider_locations")) return (params[0] as string[]).filter((n) => n === "1000000001").map((npi) => ({ npi }));
      return base(sql, params);
    };
    const { handleGetTerritoryData } = await import("../server/functions/territory");
    const r: any = await handleGetTerritoryData({ state: "PA", limit: 1, entity_type: "Individual" });
    expect(r.providers.map((p: any) => p.npi)).toEqual(["1000000001"]);
    const pages = db.queries.filter((q) => q.sql.startsWith("SELECT id, npi, score FROM lead_scores"));
    expect(pages[1].sql).toContain("(score, id) < ($2, $3)");
    expect(pages[1].params).toEqual([5000, 99, 5001]);
  });

  it("applies the entity filter while choosing, so a filtered sample isn't empty", async () => {
    const base = db.answer;
    // 1000000001 (the top score) is an individual; only 1000000003 is an organization.
    db.answer = (sql, params) => {
      if (sql.includes("AND entity_type = $2")) return (params[0] as string[]).filter((n) => n === "1000000003").map((npi) => ({ npi }));
      if (sql.includes("FROM providers WHERE npi = ANY")) {
        return (params[0] as string[]).map((npi) => ({ npi, entity_type: npi === "1000000003" ? "Organization" : "Individual", organization_name: "Mercy", last_name: "X" }));
      }
      return base(sql, params);
    };
    const { handleGetTerritoryData } = await import("../server/functions/territory");
    const r: any = await handleGetTerritoryData({ state: "PA", limit: 2, entity_type: "Organization" });
    expect(r.providers.map((p: any) => p.npi)).toEqual(["1000000003"]);
    expect(r.scope.label).toMatch(/the 0 highest-scored first/);
    // Stable ZIP choice when several practice addresses tie.
    expect(db.queries.find((q) => q.sql.includes("CROSS JOIN LATERAL"))!.sql).toMatch(/DESC NULLS LAST,\s+id\s+LIMIT 1/);
  });

  it("keeps a specialty sample to providers who practice in the state", async () => {
    const base = db.answer;
    // 1000000005's only PA address is a mailing one (it practices in OH); 1000000001 practices in PA.
    db.answer = (sql, params) => {
      if (sql.includes("FROM provider_taxonomies") && sql.includes("LIKE")) {
        return ["1000000005", "1000000001"].map((npi) => ({ npi, taxonomy_code: "207RC0000X", taxonomy_description: "Internal Medicine, Cardiovascular Disease" }));
      }
      if (sql.includes("SELECT DISTINCT npi FROM provider_locations")) {
        const inPa = sql.includes("location_type = 'Practice'") ? ["1000000001"] : ["1000000001", "1000000005"];
        return (params[0] as string[]).filter((n) => inPa.includes(n)).map((npi) => ({ npi }));
      }
      if (sql.includes("CROSS JOIN LATERAL")) {
        return [
          { npi: "1000000001", location_type: "Practice", city: "Pittsburgh", state: "PA", zip: "15213" },
          { npi: "1000000005", location_type: "Practice", city: "Columbus", state: "OH", zip: "43215" },
        ].filter((l) => (params[0] as string[]).includes(l.npi));
      }
      return base(sql, params);
    };
    const { handleGetTerritoryData } = await import("../server/functions/territory");
    const r: any = await handleGetTerritoryData({ state: "PA", specialty_group: "cardiology", limit: 10 });
    expect(r.providers.map((p: any) => p.npi)).toEqual(["1000000001"]);
    expect(r.providers.every((p: any) => p.state === "PA")).toBe(true);
  });

  it("handles all states", async () => {
    const { handleGetTerritoryData } = await import("../server/functions/territory");
    const r: any = await handleGetTerritoryData({ state: "ALL", limit: 3 });
    expect(r.scope.state).toBe("ALL");
    expect(r.providers.length).toBeGreaterThan(0);
    expect(db.queries.some((q) => q.sql.includes("SELECT DISTINCT npi FROM provider_locations"))).toBe(false);
  });

  describe("with a plan's territory", () => {
    const plan = (planCode: string, territory: { states: string[]; county_fips: string[] }, orgStatus = "active") => ({ role: "user", orgRole: "member", planCode, territory, orgStatus });

    it("keeps the all-states sample for plans that cover everything (national, platform admins, no user)", async () => {
      const { handleGetTerritoryData } = await import("../server/functions/territory");
      for (const user of [plan("national", { states: [], county_fips: [] }), { role: "admin" }, { role: "user", isPlatformAdmin: true }, null, undefined]) {
        expect(((await handleGetTerritoryData({ state: "ALL", limit: 3 }, user as any)) as any).scope.state, JSON.stringify(user)).toBe("ALL");
      }
    });

    it("refuses the all-states sample to a county pack or a state plan: it spans places they haven't bought", async () => {
      const { handleGetTerritoryData } = await import("../server/functions/territory");
      db.queries.length = 0;
      for (const user of [plan("county_pack", { states: [], county_fips: ["42003"] }), plan("state", { states: ["PA"], county_fips: [] })]) {
        await expect(handleGetTerritoryData({ state: "ALL", limit: 3 }, user)).rejects.toMatchObject({ status: 403, code: "outside_territory", message: expect.stringMatching(/National plan/) });
      }
      // No provider queries ran for the refused requests.
      expect(db.queries.filter((q) => /FROM provider_locations|FROM providers/.test(q.sql))).toEqual([]);
    });

    describe("a county pack, whose plan covers some of a state's counties", () => {
      const pack = plan("county_pack", { states: [], county_fips: ["42003"] });
      // Providers 1 and 3 practice in ZIP areas of the pack's county or Butler County's: 15213 is Allegheny's, 16059 is mostly Butler's.
      const located = (sql: string, params: any[]) => {
        if (sql.includes("CROSS JOIN LATERAL")) return [
          { npi: "1000000001", location_type: "Practice", city: "Pittsburgh", state: "PA", zip: "15213" },
          { npi: "1000000003", location_type: "Practice", city: "Butler", state: "PA", zip: "16059" },
        ];
        if (sql.includes("SELECT DISTINCT npi FROM provider_locations")) return (params[0] as string[]).map((npi) => ({ npi }));
        return undefined;
      };

      it("is answered from its counties' ZIP areas in SQL, not from the whole state", async () => {
        const base = db.answer;
        db.answer = (sql, params) => located(sql, params) ?? base(sql, params);
        const { handleGetTerritoryData } = await import("../server/functions/territory");
        const r: any = await handleGetTerritoryData({ state: "PA", limit: 2 }, pack);
        // Allegheny's ZIP areas are the ones mostly in it: 16059 is 30% Allegheny, 70% Butler.
        const zipFilter = db.queries.find((q) => q.sql.includes("left(zip, 5) = ANY($2)") && q.sql.includes("SELECT DISTINCT npi"));
        expect(zipFilter?.params[1]).toEqual(["15213", "15222"]);
        expect(db.queries.some((q) => q.sql.includes("AND state = $2 AND location_type = 'Practice'"))).toBe(false);
        // The provider the state-wide sample would have shown, in Butler County, isn't theirs.
        expect(r.providers.map((p: any) => p.npi)).toEqual(["1000000001"]);
        // The location shown is one in their ZIP areas when the provider has several.
        const loc = db.queries.find((q) => q.sql.includes("CROSS JOIN LATERAL"))!;
        expect(loc.sql).toMatch(/ORDER BY \(location_type = 'Practice' AND left\(zip, 5\) = ANY\(\$3::text\[\]\)\) DESC NULLS LAST/);
        expect(loc.params[2]).toEqual(["15213", "15222"]);
        // The density covers their counties only, read for their ZIP areas only.
        const density = db.queries.find((q) => q.sql.includes("FROM rollup_zip_locations"))!;
        expect(density.params[0]).toEqual(["15213", "15222"]);
        expect(r.counties.map((c: any) => c.fips)).toEqual(["42003"]);
        // And not the state's size.
        expect(r.scope.approx_locations_in_state).toBeNull();
      });

      it("narrows a specialty search and the fill-up of the sample to the same ZIP areas", async () => {
        const base = db.answer;
        db.answer = (sql, params) => {
          if (sql.includes("FROM provider_taxonomies") && sql.includes("LIKE")) return [{ npi: "1000000001", taxonomy_code: "207RC0000X", taxonomy_description: "Cardiology" }];
          return located(sql, params) ?? base(sql, params);
        };
        const { handleGetTerritoryData } = await import("../server/functions/territory");
        await handleGetTerritoryData({ state: "PA", specialty_group: "cardiology", limit: 5 }, pack);
        expect(db.queries.find((q) => q.sql.includes("left(zip, 5) = ANY($2)") && q.sql.includes("SELECT DISTINCT npi"))?.params[1]).toEqual(["15213", "15222"]);
        db.queries.length = 0;
        await handleGetTerritoryData({ state: "PA", limit: 50, entity_type: "Individual" }, pack);
        const fill = db.queries.find((q) => q.sql.startsWith("SELECT npi FROM provider_locations"))!;
        expect(fill.sql).toContain("AND left(zip, 5) = ANY($3)");
        expect(fill.params).toEqual([150, "PA", ["15213", "15222"]]);
      });

      it("never reads a state plan's cached, state-wide answer", async () => {
        const base = db.answer;
        db.answer = (sql, params) => located(sql, params) ?? base(sql, params);
        const { handleGetTerritoryData } = await import("../server/functions/territory");
        const whole: any = await handleGetTerritoryData({ state: "PA", limit: 2, entity_type: "Individual" }, plan("state", { states: ["PA"], county_fips: [] }));
        expect(whole.providers).toHaveLength(2);
        expect(whole.counties.map((c: any) => c.fips)).toEqual(["42003", "42019"]);
        const mine: any = await handleGetTerritoryData({ state: "PA", limit: 2, entity_type: "Individual" }, pack);
        expect(mine.providers.map((p: any) => p.npi)).toEqual(["1000000001"]);
        expect(mine.counties.map((c: any) => c.fips)).toEqual(["42003"]);
        // And the state plan's own answer is still there, whole.
        expect(((await handleGetTerritoryData({ state: "PA", limit: 2, entity_type: "Individual" }, plan("state", { states: ["PA"], county_fips: [] }))) as any).providers).toHaveLength(2);
      });

      it("covers nothing, not the state, while the Census geography isn't loaded", async () => {
        db.answer = (sql) => (sql.includes("geo_") || sql.includes("FROM geo_meta") ? [] : undefined);
        resetGeoCache();
        const { handleGetTerritoryData } = await import("../server/functions/territory");
        const r: any = await handleGetTerritoryData({ state: "PA", limit: 2 }, plan("county_pack", { states: [], county_fips: ["42019"] }));
        // No ZIP areas to search: the filters get an empty list, which matches nobody.
        const zipFilters = db.queries.filter((q) => q.sql.includes("left(zip, 5) = ANY("));
        expect(zipFilters.length).toBeGreaterThan(0);
        for (const q of zipFilters) {
          const lists = q.params.filter((p: unknown) => Array.isArray(p) && p.every((x) => /^\d{5}$/.test(String(x))));
          expect(lists).toEqual([[]]);
        }
        expect(r.providers).toEqual([]);
      });
    });

    it("still answers a state inside the plan, and refuses one outside it", async () => {
      const { handleGetTerritoryData } = await import("../server/functions/territory");
      const pack = plan("county_pack", { states: [], county_fips: ["42003"] });
      expect(((await handleGetTerritoryData({ state: "PA", limit: 2 }, pack)) as any).scope.state).toBe("PA");
      await expect(handleGetTerritoryData({ state: "OH", limit: 2 }, pack)).rejects.toMatchObject({ status: 403, code: "outside_territory" });
    });
  });
});
