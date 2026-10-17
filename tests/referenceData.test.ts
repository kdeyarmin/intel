import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REFERENCE_DATASETS } from "../server/lib/reference/catalog";
import {
  parseCertificateOfNeed,
  parseCdcPlaces,
  parseHcris,
  parseHud,
  parseOigLeie,
  parseOpenPayments,
  parseReferenceDataset,
} from "../server/lib/reference/parse";
import { posSignals, type PosFacility } from "../server/lib/reference/pos";
import { referenceApplyEnabled, referenceLoadPlan } from "../server/lib/reference/schedule";
import { upsertSql } from "../server/lib/reference/refresh";
import { assignZipCounties } from "../server/lib/reference/zipCounty";
import { MARKET_JOBS } from "../server/lib/rollups/market";

const facility = (ccn: string, extra: Partial<PosFacility> = {}): PosFacility => ({
  ccn,
  period: extra.period || "2026Q1",
  name: extra.name ?? ccn,
  state: "PA",
  category_code: null,
  control_type: null,
  certification_date: null,
  termination_date: extra.termination_date ?? null,
  chow_date: extra.chow_date ?? null,
});

describe("reference file parsers", () => {
  it("reads CDC PLACES county rows and keeps the newer year", () => {
    const rows = parseCdcPlaces("Year,LocationID,MeasureId,Measure,Data_Value\n2023,42003,CASTHMA,Asthma,9.1\n2024,42003,CASTHMA,Asthma,9.4\n2024,003,SKIP,No,1\n");
    expect(rows).toEqual([{ county_fips: "42003", measure_id: "CASTHMA", measure: "Asthma", data_value: 9.4, year: "2024" }]);
  });

  it("keeps OIG rows that have an NPI and names a business", () => {
    const rows = parseOigLeie("NPI,BUSNAME,LASTNAME,FIRSTNAME,EXCLTYPE,EXCLDATE,STATE\n,Smith,Ann,1128a1,20240101,PA\n1234567893,Acme Home Health,,,1128b4,20240202,pa\n");
    expect(rows).toEqual([{ npi: "1234567893", name: "Acme Home Health", excl_type: "1128b4", excl_date: "20240202", state: "PA" }]);
  });

  it("totals Open Payments on the latest program year for each NPI", () => {
    const rows = parseOpenPayments("Covered_Recipient_NPI,Program_Year,Total_Amount_of_Payment_USDollars,Covered_Recipient_State\n1234567893,2023,10,PA\n1234567893,2024,15.5,PA\n1234567893,2024,4.5,PA\n");
    expect(rows).toEqual([{ npi: "1234567893", recipient_state: "PA", program_year: 2024, payment_count: 2, total_amount: 20 }]);
  });

  it("computes HCRIS Medicare share and margin", () => {
    const rows = parseHcris("provider_id,fiscal_year,total_patient_revenue,medicare_revenue,medicaid_revenue,total_cost,net_income\n397001,2024,1000,400,100,900,50\n", "hha");
    expect(rows[0]).toMatchObject({ setting: "hha", provider_id: "397001", fiscal_year: "2024", medicare_share: 0.4, margin: 0.05 });
  });

  it("leaves margin blank when patient revenue is zero", () => {
    const rows = parseHcris("provider_id,fiscal_year,total_patient_revenue,net_income\n397001,2024,0,10\n", "snf");
    expect(rows[0].margin).toBeNull();
  });

  it("flags POS openings, closures, and a new change-of-ownership date", () => {
    const previous = [facility("111111", { period: "2025Q4" }), facility("222222", { period: "2025Q4", chow_date: "2020-01-01" })];
    const current = [
      facility("222222", { chow_date: "2026-02-01" }),
      facility("333333"),
      facility("111111", { termination_date: "2026-03-01" }),
    ];
    const signals = posSignals(previous, current).map((row) => `${row.ccn}:${row.signal}`);
    expect(signals).toEqual(["222222:change_of_ownership", "333333:open", "111111:close"]);
    expect(posSignals([], current)).toEqual([]);
  });

  it("assigns a split ZIP to the county with the higher residential share", () => {
    const assigned = assignZipCounties(parseHud("ZIP,COUNTY,RES_RATIO,TOT_RATIO\n19104,42101,0.2,0.9\n19104,42003,0.8,0.1\n19019,42045,1,1\n") as never);
    expect(assigned).toEqual([
      { zip5: "19019", county_fips: "42045" },
      { zip5: "19104", county_fips: "42003" },
    ]);
  });

  it("rejects a certificate-of-need row that does not name its source", () => {
    expect(parseCertificateOfNeed("state,con_status,services,source_url,source_as_of\nPA,none,,,\n")).toEqual([]);
  });
});

describe("certificate of need seed", () => {
  const csv = readFileSync("server/data/reference/certificate_of_need.csv", "utf8");
  const rows = parseCertificateOfNeed(csv);

  it("covers every state and the District from the NCSL page", () => {
    expect(rows).toHaveLength(51);
    expect(new Set(rows.map((row) => row.state)).size).toBe(51);
    expect(rows.every((row) => row.source_url === "https://www.ncsl.org/health/certificate-of-need-state-laws")).toBe(true);
    expect(rows.every((row) => row.source_as_of === "2025-04-29")).toBe(true);
    expect(rows.find((row) => row.state === "PA")?.con_status).toBe("none");
    expect(rows.find((row) => row.state === "AZ")?.con_status).toBe("similar");
    expect(rows.find((row) => row.state === "AL")?.con_status).toBe("active");
  });
});

describe("reference refresh plan", () => {
  const now = new Date("2026-10-16T00:00:00Z");

  it("stays a dry run unless apply is explicitly enabled", () => {
    expect(referenceApplyEnabled({ REFERENCE_LOAD_APPLY: "1" })).toBe(false);
    expect(referenceApplyEnabled({ REFERENCE_LOAD_APPLY: "1", REFERENCE_DATA_DIR: "/tmp/ref" })).toBe(true);
    const plan = referenceLoadPlan({
      now,
      versions: [],
      fileNames: ["cdc_places.csv"],
      apply: false,
    });
    expect(plan.mode).toBe("dry-run");
    expect(plan.loads).toEqual([]);
    expect(plan.due.find((item) => item.id === "cdc_places")?.reason).toBe("never_imported");
  });

  it("loads only a due dataset that has a local file", () => {
    const plan = referenceLoadPlan({
      now,
      versions: [
        { import_type: "cdc_places", imported_at: "2026-10-01T00:00:00Z", status: "current" },
        { import_type: "hrsa_shortage", imported_at: "2026-01-01T00:00:00Z", status: "current" },
      ],
      fileNames: ["cdc_places.csv", "hrsa_shortage.csv"],
      apply: true,
    });
    expect(plan.loads).toEqual(["hrsa_shortage"]);
    expect(plan.due.find((item) => item.id === "cdc_places")?.due).toBe(false);
  });

  it("builds one upsert statement for a dataset", () => {
    const parsed = parseReferenceDataset("cdc_places", "Year,LocationID,MeasureId,Data_Value\n2024,42003,CASTHMA,9\n");
    expect(upsertSql(parsed, 1)).toContain('ON CONFLICT ("county_fips", "measure_id") DO UPDATE SET');
    expect(REFERENCE_DATASETS.map((dataset) => dataset.id)).toContain("cms_pos");
  });
});

describe("market reference wiring", () => {
  it("uses the HUD crosswalk for service-area counties and falls back to Census", () => {
    const job = MARKET_JOBS.find((item) => item.name === "agency_coverage");
    expect(job?.sql).toContain("hud_zip_county");
    expect(job?.sql).toContain("residential_ratio DESC");
    expect(job?.sql).toContain("geo_zctas");
    expect(job?.sql).toContain("NOT EXISTS (SELECT 1 FROM hud_zip_county)");
  });

  it("does not pin market periods to a calendar date", () => {
    const source = readFileSync("server/functions/marketReference.ts", "utf8");
    expect(source).not.toMatch(/2025Q4|2026-08|2026-09|SFY2025|CY2025|DME_YEAR/);
    expect(source).toContain("max(period)");
    expect(source).toContain("state !== \"PA\"");
  });
});
