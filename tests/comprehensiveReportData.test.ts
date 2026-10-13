import { describe, expect, it } from "vitest";
import {
  enrollmentIds, summarizeOwnership, summarizeCostReports, summarizeAdditionalQuality,
  facilityDetails, summarizeFacilityUtilization, summarizeMarketProfile,
} from "../server/lib/comprehensiveReportData";
import { mapMedicareFacilityRow } from "../server/functions/triggerImportRows";
import keyRows from "./fixtures/liveCmsKeyRows.json";
import homeHealthRows from "./fixtures/cms/facility_rows/home_health_agencies.json";
import nursingHomeRows from "./fixtures/cms/facility_rows/nursing_home_providers.json";
import hospitalRows from "./fixtures/cms/facility_rows/hospital_general_info.json";

const row = (facility_type: string, raw_data: any, data_year = "2024") => ({ facility_type, raw_data, data_year });

describe("comprehensive report CMS summaries", () => {
  it("reads actual facility contact, ownership and bed fields without defaults", () => {
    expect(facilityDetails([row("nursing_home_providers", nursingHomeRows[0])])).toMatchObject({
      address: "105 BURGESS DRIVE", phone: "7244525400", ownershipType: "Non profit - Church related", beds: 102,
    });
    expect(facilityDetails([row("hospital_general_info", hospitalRows[0])]).ownershipType).toBe("Voluntary non-profit - Private");
    expect(facilityDetails([row("snf", {})])).toEqual({
      address: null, zip: null, phone: null, ownershipType: null, beds: null,
    });
    expect(facilityDetails([row("snf", { number_of_certified_beds: "0" })]).beds).toBe(0);
  });

  it("keeps each facility dataset's latest measurements and does not reuse older missing values", () => {
    const summary = summarizeFacilityUtilization([
      { ...row("inpatient", {}, "2023"), total_payments: 500, total_discharges: 20 },
      { ...row("inpatient", {}, "2024"), total_payments: 0, total_charges: 1000, total_discharges: null, avg_length_of_stay: 4.5, total_days_of_care: 30 },
      { ...row("other", {}, "2022"), total_payments: 80 },
    ]);
    expect(summary).toEqual([
      { dataset: "inpatient", dataYear: "2024", metric: "Medicare payments", value: 0, format: "money" },
      { dataset: "inpatient", dataYear: "2024", metric: "Submitted charges", value: 1000, format: "money" },
      { dataset: "inpatient", dataYear: "2024", metric: "Days of care", value: 30, format: "integer" },
      { dataset: "inpatient", dataYear: "2024", metric: "Average length of stay (days)", value: 4.5, format: "decimal" },
      { dataset: "other", dataYear: "2022", metric: "Medicare payments", value: 80, format: "money" },
    ]);
  });

  it("prefers typed post-acute metrics per setting without adding years or duplicate datasets", () => {
    const summary = summarizeFacilityUtilization([
      { ...row("medicare_snf_utilization", {}), total_payments: 999 },
    ], [
      { setting: "snf", data_year: "2024", bene_count: 25, stays: 30, medicare_payment: 0, charges: "Not Available" },
      { setting: "snf", data_year: "2023", bene_count: 100, medicare_payment: 900 },
      { setting: "hha", data_year: "2022", bene_count: 40 },
    ]);
    expect(summary.map((m) => m.value)).toEqual([25, 30, 0, 40]);
    expect(summary.map((m) => m.dataset)).toEqual([
      "cms_pac_utilization:snf", "cms_pac_utilization:snf", "cms_pac_utilization:snf", "cms_pac_utilization:hha",
    ]);
    expect(summarizeFacilityUtilization([row("snf", {})])).toEqual([]);
  });

  it("retains market units, real zero, and each setting's source year", () => {
    const metrics = summarizeMarketProfile({
      benes: "1200", ma_penetration: 0.31, snf_facilities: 0, hha_agencies: 2,
      snf_users_pct: 12.5, std_per_capita_snf: null,
      as_of: { enrollment: "2025-01", saturation: "2023", pac_utilization: "2024", pac_utilization_by_setting: { snf: "2024", hha: "2022" } },
    });
    expect(metrics).toEqual(expect.arrayContaining([
      { label: "Medicare beneficiaries", value: 1200, format: "integer", dataYear: "2025-01" },
      { label: "Medicare Advantage share", value: 0.31, format: "percent", dataYear: "2025-01" },
      { label: "Skilled nursing facilities in county", value: 0, format: "integer", dataYear: "2024" },
      { label: "Home health agencies in county", value: 2, format: "integer", dataYear: "2022" },
      { label: "Skilled nursing use (% of FFS)", value: 12.5, format: "pct_units", dataYear: "2023" },
    ]));
    expect(metrics).toHaveLength(5);
    expect(summarizeMarketProfile({})).toEqual([]);
    expect(summarizeMarketProfile({
      snf_facilities: 0, hha_agencies: 2, pop_65_plus: 0,
      as_of: { pac_utilization: "2024", pac_utilization_by_setting: { hha: "2024" }, acs: null },
    })).toEqual([{ label: "Home health agencies in county", value: 2, format: "integer", dataYear: "2024" }]);
  });

  it("reads real All Owners fields without mistaking associate IDs for NPIs", () => {
    const owners = summarizeOwnership([row("hospital_all_owners", keyRows.hospital_all_owners[0])]);
    expect(owners[0]).toMatchObject({
      ownerName: "LIFEPOINT HOLDINGS 2 LLC", percentage: 80, ownerType: "Organization",
      role: "5% OR GREATER INDIRECT OWNERSHIP INTEREST",
    });
    expect(owners[0]).not.toHaveProperty("npi");
  });

  it("keeps unknown percentages null, preserves zero, and bounds ownership details", () => {
    expect(summarizeOwnership([
      row("nursing_home_ownership", { owner_name: "A", ownership_percentage: "" }),
      row("snf_all_owners", { "PERCENTAGE OWNERSHIP": "0", "TYPE - OWNER": "I" }),
    ]).map((o) => o.percentage)).toEqual([null, 0]);
    expect(summarizeOwnership(Array.from({ length: 50 }, () => row("snf_all_owners", {})))).toHaveLength(30);
  });

  it("uses only explicit enrollment IDs from enrollment records", () => {
    expect(enrollmentIds([
      row("hospital_enrollments", { "ENROLLMENT ID": "O20020812000015" }),
      row("hospital_all_owners", { "ENROLLMENT ID": "unrelated" }),
      row("home_health_enrollments", { "ENROLLMENT ID": "bad_id" }),
    ])).toEqual(["O20020812000015"]);
  });

  it("summarizes financial metrics from the latest year of each dataset without inventing values", () => {
    const summary = summarizeCostReports([
      row("hospital_cost_report", { Total_Revenue: "$1,250,000", Total_Costs: "(12,000)", Number_of_Beds: "100", Total_Visits: "Not Available" }),
      row("hospital_cost_report", { Total_Revenue: "900000" }, "2023"),
      row("home_health_cost_report", { total_visits: "0", net_patient_revenue: "500", "FY BGN DT": "2023-07-01", "FY END DT": "2024-06-30" }),
    ]);
    expect(summary.map((s) => s.value)).toEqual([1250000, -12000, 100, 500, 0]);
    expect(summary.at(-1)?.period).toBe("2023-07-01 – 2024-06-30");
    expect(summarizeCostReports([row("snf_cost_report", {})])).toEqual([]);
  });

  it("curates quality scores, keeps source units, and excludes suppressed values", () => {
    const summary = summarizeAdditionalQuality([
      row("hospital_value_based_purchasing", { total_performance_score: "45.6", safety_domain_score: "0", arbitrary_metric: 100 }),
      row("snf_quality_reporting", { measure_name: "Discharge function score", score: "76.2%" }),
      row("nursing_home_mds_quality", { measure_description: "Suppressed", four_quarter_average_score: "Not Available" }),
      row("home_health_agencies", { "How often patients got better at walking or moving around": "90" }),
    ]);
    expect(summary.map((s) => s.value)).toEqual(["45.6", "0", "76.2%", "90"]);
    expect(summary.map((s) => s.metric)).not.toContain("arbitrary_metric");
    expect(summarizeAdditionalQuality(Array.from({ length: 30 }, () => row("snf_quality_reporting", { measure_name: "Measure", score: 1 })))).toHaveLength(20);
  });

  it("supports the imported nursing-home ownership field layout", () => {
    const mapped = mapMedicareFacilityRow({ federal_provider_number: "390111", owner_name: "Example Owner", owner_type: "Corporation" }, "nursing_home_ownership", 1, "2024");
    expect(summarizeOwnership([mapped])[0]).toMatchObject({ ownerName: "Example Owner", ownerType: "Corporation" });
  });

  it.each(["snf_quality_reporting", "nursing_home_mds_quality", "nursing_home_claims_quality"])(
    "uses the importer's exact CCN identity for %s rather than broad composite matching",
    (type) => {
      const mapped = mapMedicareFacilityRow({
        federal_provider_number: "390111", measure_code: "123", measure_description: "Reported quality measure", score: "76.2",
      }, type, 1, "2024");
      expect(mapped.provider_id).toBe("390111");
      expect(summarizeAdditionalQuality([mapped])[0]).toMatchObject({
        dataset: type, metric: "Reported quality measure", value: "76.2",
      });
    },
  );

  it("reads the actual Care Compare home-health measure keys, including CMS truncated aliases", () => {
    const mapped = mapMedicareFacilityRow(homeHealthRows[0], "home_health_agencies", 1, "2024");
    expect(summarizeAdditionalQuality([mapped])).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: "Timely initiation of care", value: "98.48" }),
      expect.objectContaining({ metric: "Improvement in walking", value: "83.82" }),
      expect.objectContaining({ metric: "Improvement in bed transfers", value: "88.68" }),
    ]));
  });
});
