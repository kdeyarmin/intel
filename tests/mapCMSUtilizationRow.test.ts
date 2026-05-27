import { describe, it, expect } from "vitest";
import { mapCMSUtilizationRow } from "../server/functions/mapCMSUtilizationRow";

describe("mapCMSUtilizationRow", () => {
  it("maps CMS dataset field names to canonical columns", () => {
    const row = {
      Rndrng_NPI: "1234567890",
      Rndrng_Prvdr_Type: "Cardiology",
      Tot_Srvcs: 42,
      Tot_Benes: 30,
      Avg_Sbmtd_Chrg: "250.50",
      Avg_Mdcr_Pymt_Amt: "100.25",
    };
    const out = mapCMSUtilizationRow(row, 2024, 1);
    expect(out.npi).toBe("1234567890");
    expect(out.service_type).toBe("Cardiology");
    expect(out.total_services).toBe(42);
    expect(out.total_unique_benes).toBe(30);
    expect(out.average_submitted_chrg_amt).toBe("250.50");
    expect(out.total_medicare_payment_amt).toBe("100.25");
    expect(out.data_year).toBe("2024");
    expect(out.raw_data).toBe(row);
  });

  it("falls back to lower-case npi and HCPCS_Desc when Rndrng_* fields are absent", () => {
    const out = mapCMSUtilizationRow(
      { npi: "9999999999", HCPCS_Desc: "Office visit" },
      2023,
      7,
    );
    expect(out.npi).toBe("9999999999");
    expect(out.service_type).toBe("Office visit");
  });

  it("prefers Rndrng_NPI over npi when both are present", () => {
    const out = mapCMSUtilizationRow(
      { Rndrng_NPI: "1111111111", npi: "2222222222" },
      2024,
      1,
    );
    expect(out.npi).toBe("1111111111");
  });

  it("prefers Rndrng_Prvdr_Type over HCPCS_Desc when both are present", () => {
    const out = mapCMSUtilizationRow(
      { Rndrng_Prvdr_Type: "Internal Medicine", HCPCS_Desc: "Visit" },
      2024,
      1,
    );
    expect(out.service_type).toBe("Internal Medicine");
  });

  it("returns null for missing fields", () => {
    const out = mapCMSUtilizationRow({}, 2024, 1);
    expect(out.npi).toBeNull();
    expect(out.service_type).toBeNull();
    expect(out.total_services).toBeNull();
    expect(out.total_unique_benes).toBeNull();
    expect(out.average_submitted_chrg_amt).toBeNull();
    expect(out.total_medicare_payment_amt).toBeNull();
  });

  it("coerces numeric years to strings", () => {
    expect(mapCMSUtilizationRow({}, 2024, 1).data_year).toBe("2024");
    expect(mapCMSUtilizationRow({}, 2020, 1).data_year).toBe("2020");
  });

  it("preserves the original row in raw_data", () => {
    const row = { Rndrng_NPI: "1", extra_field: "kept", nested: { a: 1 } };
    const out = mapCMSUtilizationRow(row, 2024, 1);
    expect(out.raw_data).toBe(row);
    expect((out.raw_data as any).extra_field).toBe("kept");
  });

  it("treats falsy zero/empty-string values as null (current behavior)", () => {
    const out = mapCMSUtilizationRow(
      { Rndrng_NPI: "", Tot_Srvcs: 0, Avg_Sbmtd_Chrg: "" },
      2024,
      1,
    );
    expect(out.npi).toBeNull();
    expect(out.total_services).toBeNull();
    expect(out.average_submitted_chrg_amt).toBeNull();
  });
});
