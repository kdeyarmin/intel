import { describe, expect, it } from "vitest";
import {
  enrollmentIds, summarizeOwnership, summarizeCostReports, summarizeAdditionalQuality,
} from "../server/lib/comprehensiveReportData";
import { mapMedicareFacilityRow } from "../server/functions/triggerImportRows";
import keyRows from "./fixtures/liveCmsKeyRows.json";

const row = (facility_type: string, raw_data: any, data_year = "2024") => ({ facility_type, raw_data, data_year });

describe("comprehensive report CMS summaries", () => {
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
});
