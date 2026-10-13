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
vi.mock("../server/lib/geo", async (importOriginal) => ({
  ...await importOriginal<typeof import("../server/lib/geo")>(),
  getGeoIndex: vi.fn(),
}));
import { buildGeoIndex, getGeoIndex } from "../server/lib/geo";

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
  vi.mocked(getGeoIndex).mockReset();
  vi.mocked(getGeoIndex).mockResolvedValue(buildGeoIndex({
    counties: [{ fips: "42049", name: "Erie County", state: "PA", lat: 42, lng: -80 }],
    zctas: [{ zcta: "16501", primary_county_fips: "42049", state: "PA", lat: 42, lng: -80 }],
    zctaCounties: [],
  }));
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
  it("returns facility fields and latest typed utilization without summing sources", async () => {
    rowsFor = (sql) => sql.includes("FROM medicare_facilities f") ? [{
      id: 1, provider_id: "390111", facility_type: "snf", facility_name: "Erie Manor", state: "PA",
      address: "1 Main St", zip: "16501", total_payments: 99, total_charges: 120, total_discharges: 10,
      total_days_of_care: 30, avg_length_of_stay: 3, data_year: "2024",
      raw_data: { telephone_number: "1234567890", ownership_type: "Nonprofit", number_of_certified_beds: "12" },
    }] : sql.includes("FROM cms_pac_utilization") ? [{
      setting: "snf", ccn: "390111", provider_name: "Erie Manor", state: "PA", zip5: "16501",
      data_year: "2024", bene_count: 25, stays: 30, medicare_payment: 500,
    }] : [];
    const report = await handleGetComprehensiveReport({ provider_id: "390111", sections: ["profile", "facilities", "utilization"] }, admin);
    expect(report.facility).toMatchObject({
      address: "1 Main St", zip: "16501", phone: "1234567890", ownershipType: "Nonprofit", beds: 12,
    });
    expect(report.facilities[0]).toMatchObject({
      totalCharges: 120, totalDischarges: 10, totalDaysOfCare: 30, avgLengthOfStay: 3,
    });
    expect(report.facilityUtilization.map((m: any) => m.value)).toEqual([25, 30, 500]);
    expect(report.unavailableSections).toEqual([]);
    expect(ran("summary_level = 'provider'")).toBe(true);
  });

  it("reads facility facts for an NPI utilization-only report", async () => {
    rowsFor = (sql) => sql.includes("FROM medicare_facilities f") ? [{
      provider_id: "1234567893", facility_type: "medicare_inpatient_by_provider",
      data_year: "2024", total_payments: 100, total_discharges: 2,
    }] : [];
    const report = await handleGetComprehensiveReport({ npi: "1234567893", sections: ["utilization"] }, admin);
    expect(report.facilityUtilization).toEqual([
      { dataset: "medicare_inpatient_by_provider", dataYear: "2024", metric: "Medicare payments", value: 100, format: "money" },
      { dataset: "medicare_inpatient_by_provider", dataYear: "2024", metric: "Discharges", value: 2, format: "integer" },
    ]);
    expect(report.facilities).toEqual([]);
    expect(report.facility).toBeNull();
    expect(ran("cms_referrals")).toBe(false);
  });

  it("provides facility metrics for the profile summary even when the utilization section is off", async () => {
    rowsFor = (sql) => sql.includes("FROM medicare_facilities f") ? [{
      provider_id: "390111", facility_type: "medicare_inpatient_by_provider",
      data_year: "2024", total_payments: 0, total_discharges: 3,
    }] : [];
    const report = await handleGetComprehensiveReport({ provider_id: "390111", sections: ["profile"] }, admin);
    expect(report.facilityUtilization.map((m: any) => m.value)).toEqual([0, 3]);
    expect(report.sections).toEqual(["profile"]);
    expect(report.facilities).toEqual([]);
    expect(report.utilization).toEqual([]);
    expect(ran("provider_service_utilization")).toBe(false);
  });

  it("returns null provider headline metrics when no utilization rows exist, but preserves measured zero", async () => {
    rowsFor = (sql) => sql.includes("SUM(")
      ? [{ total_payments: null, total_services: null, total_benes: null }] : [];
    const missing = await handleGetComprehensiveReport({ npi: "1234567893", sections: ["profile"] }, admin);
    expect(missing.summary).toMatchObject({ totalPayments: null, totalServices: null, totalBeneficiaries: null });
    rowsFor = (sql) => sql.includes("SUM(")
      ? [{ total_payments: "0", total_services: "0", total_benes: "0" }] : [];
    const zero = await handleGetComprehensiveReport({ npi: "1234567893", sections: ["profile"] }, admin);
    expect(zero.summary).toMatchObject({ totalPayments: 0, totalServices: 0, totalBeneficiaries: 0 });
    expect(zero.summary.beneficiaryNote).toContain("same person more than once");
    expect(queries.find((q) => q.includes("SUM("))).not.toContain("COALESCE");
    expect(queries.find((q) => q.includes("SUM("))).toContain("SELECT MAX(data_year)");
  });

  it("does not turn missing patient-sharing counts into a measured zero", async () => {
    rowsFor = (sql) => sql.includes("FROM cms_referrals WHERE npi")
      ? [{ total_referrals: null }] : [];
    const missing = await handleGetComprehensiveReport({ npi: "1234567893", sections: ["profile"] }, admin);
    expect(missing.summary.totalReferralsOut).toBeNull();
    rowsFor = (sql) => sql.includes("FROM cms_referrals WHERE npi")
      ? [{ total_referrals: 0 }] : [];
    const zero = await handleGetComprehensiveReport({ npi: "1234567893", sections: ["profile"] }, admin);
    expect(zero.summary.totalReferralsOut).toBe(0);
  });

  it("resolves a market-only facility report and authorizes its exact county before reading the rollup", async () => {
    const owner = { id: 2, role: "user", orgRole: "owner" } as any;
    rowsFor = (sql) => {
      if (sql.includes("FROM medicare_facilities f")) return [{ provider_id: "390111", state: "PA", zip: "16501", data_year: "2024" }];
      if (sql.includes("FROM rollup_county_market_profile")) {
        expect(assertTerritory).toHaveBeenCalledWith(owner, { state: "PA", county_fips: "42049", county_name: "Erie County" });
        return [{ benes: 100, as_of: { enrollment: "2024-12" } }];
      }
      return [];
    };
    const report = await handleGetComprehensiveReport({ provider_id: "390111", sections: ["market"] }, owner);
    expect(report.marketContext).toEqual({
      countyName: "Erie County", countyFips: "42049", state: "PA",
      metrics: [{ label: "Medicare beneficiaries", value: 100, format: "integer", dataYear: "2024-12" }],
    });
    expect(report.facility).toBeNull();
    expect(ran("provider_service_utilization")).toBe(false);
    expect(parameters[queries.findIndex((q) => q.includes("FROM rollup_county_market_profile"))]).toEqual(["42049"]);
  });

  it("uses the provider practice ZIP for market-only reports without exposing unrequested locations", async () => {
    rowsFor = (sql) => sql.includes("FROM provider_locations")
      ? [{ location_type: "Practice", zip: "16501", state: "PA" }]
      : sql.includes("FROM rollup_county_market_profile") ? [{ benes: 0 }] : [];
    const report = await handleGetComprehensiveReport({ npi: "1234567893", sections: ["market"] }, admin);
    expect(report.marketContext.countyFips).toBe("42049");
    expect(report.marketContext.metrics[0].value).toBe(0);
    expect(report.locations).toEqual([]);
    expect(ran("provider_taxonomies")).toBe(false);
  });

  it("uses typed facility geography when no legacy facility rows are available", async () => {
    rowsFor = (sql) => sql.includes("FROM cms_pac_utilization")
      ? [{ setting: "hha", ccn: "390111", zip5: "16501", state: "PA", provider_name: "Agency", data_year: "2023" }]
      : sql.includes("FROM rollup_county_market_profile") ? [{ hha_agencies: 2 }] : [];
    const report = await handleGetComprehensiveReport({ provider_id: "390111", sections: ["market", "profile"] }, admin);
    expect(report.marketContext.countyFips).toBe("42049");
    expect(report.facility).toMatchObject({ name: "Agency", zip: "16501", latestYear: "2023" });
  });

  it("rejects a disallowed exact county before querying market or resolving owners", async () => {
    const owner = { id: 2, role: "user", orgRole: "owner" } as any;
    rowsFor = (sql) => sql.includes("FROM medicare_facilities f")
      ? [{ provider_id: "390111", state: "PA", zip: "16501", facility_type: "hospital_enrollments", raw_data: { "ENROLLMENT ID": "O1" } }] : [];
    assertTerritory.mockImplementation((_user, place) => {
      if (place.county_fips) throw { status: 403 };
    });
    await expect(handleGetComprehensiveReport({ provider_id: "390111", sections: ["market", "ownership"] }, owner)).rejects.toMatchObject({ status: 403 });
    expect(ran("rollup_county_market_profile")).toBe(false);
    expect(ran("WHERE f.provider_id >=")).toBe(false);
  });

  it("omits unresolved market geography without failing a restricted provider report", async () => {
    const owner = { id: 2, role: "user", orgRole: "owner" } as any;
    const restricted = await handleGetComprehensiveReport({ provider_id: "390111", sections: ["market", "profile"] }, owner);
    expect(restricted.marketContext).toBeNull();
    expect(restricted.unavailableSections).toEqual(["market"]);
    const report = await handleGetComprehensiveReport({ provider_id: "390111", sections: ["market"] }, admin);
    expect(report.marketContext).toBeNull();
    expect(report.unavailableSections).toEqual([]);
    expect(ran("rollup_county_market_profile")).toBe(false);
  });

  it("retains available profile data when a restricted full report cannot resolve the county", async () => {
    const member = { id: 2, role: "user", orgRole: "member" } as any;
    rowsFor = (sql) => sql.includes("FROM providers WHERE npi") ? [{
      npi: "1234567893", first_name: "Pat", last_name: "Lee", entity_type: "Individual",
    }] : sql.includes("FROM provider_locations") ? [{ state: "PA", location_type: "Practice" }] : [];
    const report = await handleGetComprehensiveReport({ npi: "1234567893" }, member);
    expect(report.provider.displayName).toBe("Pat Lee");
    expect(report.marketContext).toBeNull();
    expect(report.unavailableSections).toEqual(["market"]);
    expect(ran("rollup_county_market_profile")).toBe(false);
  });

  it("reports sanitized query failures separately from successful empty sections", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      rowsFor = (sql) => {
        if (sql.includes("FROM provider_service_utilization")) throw new Error("private SQL connection details");
        return [];
      };
      const report = await handleGetComprehensiveReport({ npi: "1234567893", sections: ["profile", "utilization", "quality"] }, admin);
      expect(report.unavailableSections).toEqual(["profile", "utilization"]);
      expect(report.summary.totalPayments).toBeNull();
      expect(report.quality).toEqual([]);
      expect(JSON.stringify(report)).not.toContain("private");
    } finally {
      errorLog.mockRestore();
    }
  });

  it("marks failed market and ownership reads without claiming that no source records exist", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      rowsFor = (sql) => {
        if (sql.includes("FROM rollup_county_market_profile") || sql.includes("WHERE f.provider_id >=")) throw new Error("internal");
        if (sql.includes("FROM medicare_facilities f")) return [{
          provider_id: "390111", zip: "16501", state: "PA", facility_type: "hospital_enrollments",
          raw_data: { "ENROLLMENT ID": "O1" },
        }];
        return [];
      };
      const report = await handleGetComprehensiveReport({ provider_id: "390111", sections: ["market", "ownership"] }, admin);
      expect(report.unavailableSections).toEqual(["ownership", "market"]);
      expect(report.marketContext).toBeNull();
      expect(report.ownership).toEqual([]);
    } finally {
      errorLog.mockRestore();
    }
  });

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
