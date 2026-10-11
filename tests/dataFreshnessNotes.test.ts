/**
 * getDataFreshness is public (the footer and the dataset catalog read it), but a dataset's import
 * notes carry raw importer error text and the names of uploaded files: only a platform admin gets them.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../server/lib/datasetRegistry", () => ({
  listDatasetVersions: async () => [{
    import_type: "hospital_service_area", source: "cms_data_api", source_title: "Hospital Service Area", status: "failed", data_year: "2025",
    notes: "HTTP 503 fetching https://data.cms.gov/data-api/v1/dataset/x/data; upload pa-homes-2025.csv",
    temporal_start: null, temporal_end: null, accrual_periodicity: null, catalog_modified: null, catalog_checked_at: null, imported_at: "2026-09-01T00:00:00Z", row_count: 1200,
  }],
}));
vi.mock("../server/functions/rollups", () => ({ handleGetRollupStatus: async () => ({ jobs: [] }) }));
vi.mock("../server/functions/geography", () => ({ handleGetGeoStatus: async () => ({ loaded: true }) }));

import { handleGetDataFreshness } from "../server/functions/dataFreshness";

const notesOf = (r: Awaited<ReturnType<typeof handleGetDataFreshness>>) => r.datasets.find((d) => d.import_type === "hospital_service_area")?.notes;

describe("getDataFreshness notes", () => {
  it("leaves out the import notes unless asked", async () => {
    const r = await handleGetDataFreshness();
    expect(notesOf(r)).toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/HTTP 503|pa-homes/);
    expect(notesOf(await handleGetDataFreshness({ includeNotes: false }))).toBeNull();
  });

  it("includes them for a platform admin", async () => {
    expect(notesOf(await handleGetDataFreshness({ includeNotes: true }))).toMatch(/HTTP 503 fetching/);
  });

  it("still tells everyone the dataset's status and vintage", async () => {
    const d = (await handleGetDataFreshness()).datasets.find((x) => x.import_type === "hospital_service_area")!;
    expect(d).toMatchObject({ status: "failed", data_year: "2025", row_count: 1200, label: expect.stringMatching(/Hospital Service Area/) });
  });
});
