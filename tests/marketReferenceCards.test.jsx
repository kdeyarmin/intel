// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CostReportCard, CountyReferenceCard } from "../src/components/market/MarketReferenceCards";

afterEach(cleanup);

describe("county reference cards", () => {
  it("prints the periods that were loaded and skips Pennsylvania panels outside Pennsylvania", () => {
    render(
      <CountyReferenceCard
        reference={{
          state: "OH",
          ma_plans: [{ organization: "Acme", enrollment: 120 }],
          ma_stars: [{ contract_id: "H1234", marketing_name: "Acme Gold", overall_rating: 4, enrollment: 80 }],
          ma_penetration: { penetration: 0.42 },
          sdoh: [{ measure_id: "POV", measure: "Poverty", data_value: 12.5 }],
          svi: { year: "2022", rpl_themes: 0.61, rpl_theme1: 0.4, rpl_theme4: 0.2 },
          as_of: { ma: "2026-09", ma_stars: "2026", ma_penetration: "2026-09", sdoh: "2022", svi: "2022" },
        }}
      />,
    );
    expect(screen.getByText(/Enrollment is 2026-09/)).toBeTruthy();
    expect(screen.getByText(/Stars are the 2026 contract ratings/)).toBeTruthy();
    expect(screen.getByText(/42\.0%/)).toBeTruthy();
    expect(screen.getByText(/Pennsylvania all-payer reports cover Pennsylvania counties/)).toBeTruthy();
    expect(screen.getByText("Poverty")).toBeTruthy();
    expect(screen.queryByText(/Q4 2025/)).toBeNull();
    expect(screen.queryByText(/August 2026/)).toBeNull();
  });

  it("shows a home health cost-report margin for the fiscal year on file", () => {
    render(
      <CostReportCard
        report={{ year: "2023", lines: [{ setting: "hha", total_patient_revenue: 1000, medicare_share: 0.4, margin: 0.05 }] }}
      />,
    );
    expect(screen.getByText(/Cost report, 2023/)).toBeTruthy();
    expect(screen.getByText(/HHA:/)).toBeTruthy();
    expect(screen.getByText(/40\.0%/)).toBeTruthy();
    expect(screen.getByText(/5\.0%/)).toBeTruthy();
  });
});
