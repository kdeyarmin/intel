import { beforeEach, describe, expect, it, vi } from "vitest";

const queries: string[] = [];
let rowsFor: (sql: string) => any[] = () => [];
const parameters: any[][] = [];

vi.mock("../server/db", () => ({
  db: {},
  pool: {
    connect: async () => ({
      query: async (sql: string, params: any[] = []) => {
        queries.push(sql.replace(/\s+/g, " ").trim());
        parameters.push(params);
        return { rows: rowsFor(sql) };
      },
      release: () => {},
    }),
  },
}));

const assertTerritory = vi.fn();
vi.mock("../server/lib/entitlements", () => ({
  assertTerritory: (...args: any[]) => assertTerritory(...args),
  isUnrestricted: (user: any) => !user || user.role === "admin",
}));

import {
  facilityProfile,
  handleGetComprehensiveReport,
  latestQualityRatings,
  normalizeReportSections,
  REPORT_SECTION_KEYS,
} from "../server/functions/comprehensiveReport";

const admin = { id: 1, role: "admin" } as any;
const ran = (fragment: string) => queries.some((q) => q.includes(fragment));

beforeEach(() => {
  queries.length = 0;
  parameters.length = 0;
  rowsFor = () => [];
  assertTerritory.mockReset();
});

describe("normalizeReportSections", () => {
  it("builds every section when no list is given", () => {
    expect([...normalizeReportSections(undefined)]).toEqual([...REPORT_SECTION_KEYS]);
    expect([...normalizeReportSections("profile")]).toEqual([...REPORT_SECTION_KEYS]);
  });

  it("keeps only known keys, and treats a list naming none as the whole report", () => {
    expect([...normalizeReportSections(["locations", "nope", 3, "quality"])]).toEqual(["locations", "quality"]);
    expect([...normalizeReportSections([])]).toEqual([...REPORT_SECTION_KEYS]);
    expect([...normalizeReportSections(["DROP TABLE"])]).toEqual([...REPORT_SECTION_KEYS]);
  });
});

describe("facility helpers", () => {
  const rows = [
    { provider_id: "390111", facility_type: "snf", facility_name: "Erie Manor", city: "Erie", state: "PA", quality_rating: 3, data_year: "2023" },
    { provider_id: "390111", facility_type: "snf", facility_name: "Erie Manor", city: "Erie", state: "PA", quality_rating: 4, data_year: "2024" },
    { provider_id: "390111", facility_type: "snf_cost_report", facility_name: null, city: null, state: null, quality_rating: null, data_year: "2024" },
  ];

  it("keeps the newest rating of each dataset that has one", () => {
    expect(latestQualityRatings(rows)).toEqual([
      { facilityType: "snf", name: "Erie Manor", qualityRating: 4, dataYear: "2024" },
    ]);
  });

  it("describes the facility from its rows", () => {
    expect(facilityProfile(rows)).toMatchObject({
      providerId: "390111", name: "Erie Manor", city: "Erie", state: "PA",
      facilityTypes: ["snf", "snf_cost_report"], latestYear: "2024", recordCount: 3,
    });
  });
});

describe("handleGetComprehensiveReport sections", () => {
  it("runs every query when no sections are named (existing callers)", async () => {
    const report = await handleGetComprehensiveReport({ npi: "1234567893" }, admin);
    expect(report.sections).toEqual([...REPORT_SECTION_KEYS]);
    for (const table of ["provider_locations", "provider_taxonomies", "provider_service_utilization", "cms_referrals", "cms_order_referring", "provider_affiliations", "lead_scores", "enrichment_records", "medicare_facilities"]) {
      expect(ran(table)).toBe(true);
    }
  });

  it("skips the queries behind sections that weren't asked for", async () => {
    rowsFor = (sql) => (sql.includes("FROM cms_referrals WHERE npi") ? [{ referred_to_npi: "1", total_referrals: "12" }] : []);
    const report = await handleGetComprehensiveReport({ npi: "1234567893", sections: ["referrals"] }, admin);
    expect(report.sections).toEqual(["referrals"]);
    expect(report.referralsFrom).toHaveLength(1);
    for (const table of ["provider_taxonomies", "provider_service_utilization", "provider_affiliations", "lead_scores", "enrichment_records", "medicare_facilities", "provider_locations"]) {
      expect(ran(table)).toBe(false);
    }
  });

  it("reads referral totals for the profile without returning the lists", async () => {
    rowsFor = (sql) => (sql.includes("FROM cms_referrals WHERE npi") ? [{ referred_to_npi: "1", total_referrals: "12" }] : []);
    const report = await handleGetComprehensiveReport({ npi: "1234567893", sections: ["profile"] }, admin);
    expect(report.summary.totalReferralsOut).toBe(12);
    expect(report.referralsFrom).toEqual([]);
    expect(ran("cms_order_referring")).toBe(false);
  });

  it("still checks the territory from the address when locations are left out", async () => {
    const member = { id: 2, role: "user", orgRole: "member" } as any;
    rowsFor = (sql) => (sql.includes("SELECT location_type, state FROM provider_locations") ? [{ location_type: "Practice", state: "PA" }] : []);
    await handleGetComprehensiveReport({ npi: "1234567893", sections: ["leadScore"] }, member);
    expect(assertTerritory).toHaveBeenCalledWith(member, { state: "PA" });
    expect(ran("medicare_facilities")).toBe(false);
  });

  it("falls back to the facility's state when the provider has no located address", async () => {
    const member = { id: 2, role: "user", orgRole: "member" } as any;
    rowsFor = (sql) => (sql.includes("FROM medicare_facilities") ? [{ id: 1, provider_id: "1234567893", facility_type: "hha", state: "OH", data_year: "2024" }] : []);
    await handleGetComprehensiveReport({ npi: "1234567893", sections: ["leadScore"] }, member);
    expect(assertTerritory).toHaveBeenCalledWith(member, { state: "OH" });
  });

  it("describes a facility by CCN with its quality ratings", async () => {
    rowsFor = (sql) => (sql.includes("FROM medicare_facilities")
      ? [{ id: 1, provider_id: "390111", facility_type: "snf", facility_name: "Erie Manor", city: "Erie", state: "PA", quality_rating: 5, data_year: "2024" }]
      : []);
    const report = await handleGetComprehensiveReport({ provider_id: "390111", sections: ["profile", "quality"] }, admin);
    expect(report.facility).toMatchObject({ name: "Erie Manor", providerId: "390111" });
    expect(report.quality).toEqual([{ facilityType: "snf", name: "Erie Manor", qualityRating: 5, dataYear: "2024" }]);
    expect(report.facilities).toEqual([]);
  });

  it("queries only requested additional datasets and reads side-table raw data", async () => {
    rowsFor = (sql) => sql.includes("WHERE f.provider_id = ANY")
      ? [{ facility_type: "snf_cost_report", data_year: "2024", raw_data: { Total_Revenue: "500000" } }] : [];
    const report = await handleGetComprehensiveReport({ provider_id: "390111", sections: ["costReports"] }, admin);
    expect(report.costReports[0]).toMatchObject({ metric: "Total revenue", value: 500000 });
    expect(report.ownership).toEqual([]);
    expect(report.additionalQuality).toEqual([]);
    expect(queries.find((q) => q.includes("WHERE f.provider_id = ANY"))).toContain("COALESCE(r.raw_data, f.raw_data)");
    expect(parameters.find((p) => p[0]?.[0] === "390111")).toEqual([
      ["390111"], ["hospital_cost_report", "home_health_cost_report", "snf_cost_report"],
    ]);
    expect(ran("LIMIT 200")).toBe(true);
    expect(ran("provider_service_utilization")).toBe(false);
  });

  it("links All Owners via enrollment IDs using bounded index-range queries", async () => {
    rowsFor = (sql) => sql.includes("WHERE f.provider_id = ANY")
      ? [{ facility_type: "hospital_enrollments", raw_data: { "ENROLLMENT ID": "O20020812000015" } }]
      : sql.includes("WHERE f.provider_id >=")
        ? [{ facility_type: "hospital_all_owners", data_year: "2024", raw_data: { "ORGANIZATION NAME - OWNER": "Example Holdings", "PERCENTAGE OWNERSHIP": "80" } }] : [];
    const report = await handleGetComprehensiveReport({ npi: "1234567893", sections: ["ownership"] }, admin);
    expect(report.ownership[0]).toMatchObject({ ownerName: "Example Holdings", percentage: 80 });
    expect(parameters.some((p) => p[0] === "O20020812000015" && p[1] === "O20020812000015z")).toBe(true);
    expect(queries.find((q) => q.includes("WHERE f.provider_id >="))).toContain("left(f.provider_id, length($1) + 1) = $1 || '_'");
  });

  it("denies additional sections outside the territory before resolving ownership", async () => {
    const member = { id: 2, role: "user", orgRole: "member" } as any;
    rowsFor = (sql) => sql.includes("WHERE f.provider_id = ANY")
      ? [{ facility_type: "hospital_enrollments", state: "OH", raw_data: { "ENROLLMENT ID": "O1" } }] : [];
    assertTerritory.mockImplementation(() => { throw { status: 403 }; });
    await expect(handleGetComprehensiveReport({ provider_id: "390111", sections: ["ownership", "costReports", "additionalQuality"] }, member)).rejects.toMatchObject({ status: 403 });
    expect(assertTerritory).toHaveBeenCalledWith(member, { state: "OH" });
    expect(ran("WHERE f.provider_id >=")).toBe(false);
  });

  it("does not use an in-territory NPI to authorize an unrelated facility", async () => {
    const member = { id: 2, role: "user", orgRole: "member" } as any;
    rowsFor = (sql) => sql.includes("FROM provider_locations")
      ? [{ location_type: "Practice", state: "PA" }]
      : sql.includes("WHERE f.provider_id = ANY")
        ? [{ provider_id: "390111", facility_type: "hospital_cost_report", state: "OH", raw_data: { Total_Revenue: "500" } }] : [];
    assertTerritory.mockImplementation((_user, place) => {
      if (place.state === "OH") throw { status: 403 };
    });
    await expect(handleGetComprehensiveReport({ npi: "1234567893", provider_id: "390111", sections: ["costReports"] }, member)).rejects.toMatchObject({ status: 403 });
    expect(assertTerritory).toHaveBeenCalledWith(member, { state: "PA" });
    expect(assertTerritory).toHaveBeenCalledWith(member, { state: "OH" });
  });

  it("fails closed for restricted members when new dataset territory cannot be resolved", async () => {
    const member = { id: 2, role: "user", orgRole: "member" } as any;
    rowsFor = (sql) => sql.includes("WHERE f.provider_id = ANY")
      ? [{ provider_id: "390111", facility_type: "hospital_cost_report", state: null, raw_data: { Total_Revenue: "500" } }] : [];
    await expect(handleGetComprehensiveReport({ provider_id: "390111", sections: ["costReports"] }, member)).rejects.toMatchObject({ status: 403 });
    // Missing optional data remains an empty section, not an authorization failure.
    rowsFor = () => [];
    expect((await handleGetComprehensiveReport({ provider_id: "390111", sections: ["costReports"] }, member)).costReports).toEqual([]);
  });

  it("does not retrieve additional datasets by arbitrary statistical composite keys", async () => {
    await handleGetComprehensiveReport({ provider_id: "O20020812000015_0244144871_35", sections: ["ownership"] }, admin);
    const i = queries.findIndex((q) => q.includes("WHERE f.provider_id = ANY"));
    expect(parameters[i][0]).toEqual([]);
    expect(ran("WHERE f.provider_id >=")).toBe(false);
  });
});
