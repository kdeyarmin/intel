import { describe, it, expect } from "vitest";
import { mapCMSUtilizationRow } from "../server/functions/triggerImport";

// A representative row from the CMS "Medicare Physician & Other Practitioners —
// by Provider and Service" dataset (one row per NPI + HCPCS code + place of service).
const ROW = {
  Rndrng_NPI: "1234567890",
  Rndrng_Prvdr_Type: "Cardiology",
  HCPCS_Cd: "99213",
  HCPCS_Desc: "Established patient office visit, 20-29 minutes",
  Place_Of_Srvc: "O",
  Tot_Srvcs: "200",
  Tot_Benes: "150",
  Avg_Sbmtd_Chrg: "180.00",
  Avg_Mdcr_Pymt_Amt: "75.50",
};

describe("mapCMSUtilizationRow", () => {
  it("captures the HCPCS service identity (preserving per-service granularity)", () => {
    const m = mapCMSUtilizationRow(ROW, 2024, 1);
    expect(m.npi).toBe("1234567890");
    expect(m.hcpcs_code).toBe("99213");
    expect(m.hcpcs_description).toContain("office visit");
    expect(m.place_of_service).toBe("O");
  });

  it("keeps the provider specialty in service_type for specialty rollups", () => {
    const m = mapCMSUtilizationRow(ROW, 2024, 1);
    expect(m.service_type).toBe("Cardiology");
  });

  it("stores the source average truthfully and derives the line total", () => {
    const m = mapCMSUtilizationRow(ROW, 2024, 1);
    // The source only publishes an average payment; store it as the average...
    expect(m.average_medicare_payment_amt).toBe("75.50");
    // ...and derive the true line total (avg × services), not the raw average.
    expect(m.total_medicare_payment_amt).toBe((200 * 75.5).toFixed(2)); // "15100.00"
    expect(m.average_submitted_chrg_amt).toBe("180.00");
  });

  it("does not put the average in the total column (regression guard)", () => {
    const m = mapCMSUtilizationRow(ROW, 2024, 1);
    expect(m.total_medicare_payment_amt).not.toBe("75.50");
  });

  it("falls back to lowercase CMS field aliases", () => {
    const m = mapCMSUtilizationRow(
      { npi: "999", hcpcs_cd: "93000", tot_srvcs: "4", avg_mdcr_pymt_amt: "10" },
      2023,
      1,
    );
    expect(m.npi).toBe("999");
    expect(m.hcpcs_code).toBe("93000");
    expect(m.total_medicare_payment_amt).toBe("40.00");
    expect(m.data_year).toBe("2023");
  });
});
