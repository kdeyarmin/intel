import { beforeEach, describe, expect, it, vi } from "vitest";

const queries: string[] = [];
let rowsFor: (sql: string) => any[] = () => [];

vi.mock("../server/db", () => ({
  db: {},
  pool: {
    connect: async () => ({
      query: async (sql: string) => {
        queries.push(sql.replace(/\s+/g, " ").trim());
        return { rows: rowsFor(sql) };
      },
      release: () => {},
    }),
  },
}));

const assertTerritory = vi.fn();
vi.mock("../server/lib/entitlements", () => ({ assertTerritory: (...args: any[]) => assertTerritory(...args) }));

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
});
