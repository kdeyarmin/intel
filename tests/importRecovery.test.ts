/**
 * Boot recovery of interrupted imports: the plan carries everything the rest
 * of the run needs, and an NPPES flat file is never read as a CMS CSV.
 */
import { describe, expect, it } from "vitest";
import { planRecovery } from "../server/lib/importRecovery";

const now = new Date("2026-10-11T12:00:00Z");

describe("planRecovery", () => {
  it("resumes a CMS import with the year, filters, release date and counters it started with", () => {
    const plan = planRecovery({
      id: 12,
      import_type: "medicare_hha_utilization",
      dry_run: false,
      total_rows: 4000,
      retry_params: { file_url: "https://data.cms.gov/data-api/v1/dataset/x/data", year: 2025, resume_offset: 5000, total_inserted: 4800, total_skipped: 200, state_filter: "PA", npi_filter: undefined, as_of: "2025-12-31" },
    }, now);
    expect(plan).toEqual({
      action: "cms",
      params: {
        import_type: "medicare_hha_utilization",
        file_url: "https://data.cms.gov/data-api/v1/dataset/x/data",
        year: 2025,
        batch_id: 12,
        dry_run: false,
        resume_offset: 5000,
        total_inserted: 4800,
        total_skipped: 200,
        npi_filter: undefined,
        state_filter: "PA",
        as_of: "2025-12-31",
        headers: undefined,
      },
    });
  });

  it("keeps a dry run a dry run, and a headerless CSV's column names", () => {
    const plan: any = planRecovery({ id: 3, import_type: "physician_shared_patient_patterns", dry_run: true, retry_params: { file_url: "/api/storage/pairs.csv", year: 2015, headers: ["a", "b"] } }, now);
    expect(plan.params).toMatchObject({ dry_run: true, year: 2015, headers: ["a", "b"], resume_offset: 0 });
  });

  it("falls back to the batch's row count for the offset and to the importer's usual year guess", () => {
    const plan: any = planRecovery({ id: 4, import_type: "x", total_rows: 1200, retry_params: { file_url: "https://data.cms.gov/x" } }, now);
    expect(plan.params).toMatchObject({ resume_offset: 1200, year: 2024 });
  });

  it("sends an NPPES flat file back to its own importer, from its byte offset", () => {
    const plan = planRecovery({ id: 9, import_type: "nppes_flat_file", retry_params: { file_url: "https://download.cms.gov/nppes/npidata.csv", byte_offset: 123456, headers: ["NPI"], total_rows: 800 } }, now);
    expect(plan).toEqual({ action: "nppes_flat_file", params: { batch_id: 9, file_url: "https://download.cms.gov/nppes/npidata.csv", byte_offset: 123456, headers: ["NPI"], total_rows: 800 } });
  });

  it("fails a batch that never recorded where its data comes from", () => {
    expect(planRecovery({ id: 1, import_type: "x", retry_params: null }, now)).toEqual({ action: "fail", reason: expect.stringMatching(/No file_url/) });
    expect(planRecovery({ id: 1, import_type: "x", retry_params: { file_url: "" } }, now).action).toBe("fail");
  });
});
