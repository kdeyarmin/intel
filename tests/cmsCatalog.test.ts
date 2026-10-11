/**
 * The CMS catalog parsers and the "newest version of the family" rule
 * (server/lib/cmsCatalog.ts), on slices of the live catalogs captured on
 * 2026-10-11 (tests/fixtures/cms/).
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  dataYearOf,
  datasetIdFromUrl,
  familyOf,
  indexCatalog,
  isNewer,
  newestOf,
  parseDcatCatalog,
  parseProviderDataCatalog,
  resolveImportUrl,
  sourceForUrl,
} from "../server/lib/cmsCatalog";
import { nextStatus } from "../server/lib/datasetRegistry";

const fixtures = path.join(import.meta.dirname, "fixtures", "cms");
const dcat = JSON.parse(fs.readFileSync(path.join(fixtures, "data_json_slice.json"), "utf8"));
const providerItems = JSON.parse(fs.readFileSync(path.join(fixtures, "provider_data_slice.json"), "utf8"));

const HSA_2025 = "https://data.cms.gov/data-api/v1/dataset/8708ca8b-8636-44ed-8303-724cbfaf78ad/data";
const HSA_2024 = "https://data.cms.gov/data-api/v1/dataset/22e11819-48e8-44a8-a036-fd6351f4173a/data";

describe("datasetIdFromUrl", () => {
  it("recognises both CMS endpoint shapes and nothing else", () => {
    expect(datasetIdFromUrl(HSA_2025)).toEqual({ source: "cms_data_api", id: "8708ca8b-8636-44ed-8303-724cbfaf78ad" });
    expect(datasetIdFromUrl("https://data.cms.gov/data-api/v1/dataset/8708CA8B-8636-44ED-8303-724CBFAF78AD/data-viewer")).toMatchObject({ id: "8708ca8b-8636-44ed-8303-724cbfaf78ad" });
    expect(datasetIdFromUrl("https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0")).toEqual({ source: "cms_provider_data", id: "xubh-q36u" });
    expect(datasetIdFromUrl("https://download.cms.gov/nppes/NPI_Files.html")).toBeNull();
    expect(datasetIdFromUrl("/api/storage/abc.csv")).toBeNull();
  });

  it("classifies import sources", () => {
    expect(sourceForUrl(HSA_2025)).toBe("cms_data_api");
    expect(sourceForUrl("/api/storage/x.csv")).toBe("manual_upload");
    expect(sourceForUrl("https://example.org/file.csv")).toBe("remote_file");
  });
});

describe("parseDcatCatalog", () => {
  const entries = parseDcatCatalog(dcat);

  it("reads every yearly version as its own entry with its family, period and data-api endpoint", () => {
    expect(entries.map((e) => e.title)).toEqual(expect.arrayContaining(["Hospital Service Area : 2024-01-01", "Hospital Service Area : 2025-01-01"]));
    const hsa25 = entries.find((e) => e.datasetId === "8708ca8b-8636-44ed-8303-724cbfaf78ad")!;
    expect(hsa25).toMatchObject({ source: "cms_data_api", family: "Hospital Service Area", modified: "2026-07-06", temporalStart: "2025-01-01", temporalEnd: "2025-12-31", accrualPeriodicity: "annually", dataUrl: HSA_2025 });
  });

  it("strips release-date suffixes to form families", () => {
    expect(familyOf("Hospital Service Area : 2025-01-01")).toBe("Hospital Service Area");
    expect(familyOf("Accountable Care Organization Skilled Nursing Facility Affiliates : 2019-07-31oc1")).toBe("Accountable Care Organization Skilled Nursing Facility Affiliates");
    expect(familyOf("Medicare Monthly Enrollment")).toBe("Medicare Monthly Enrollment");
  });

  it("reads the data year from the period", () => {
    expect(dataYearOf({ temporalStart: "2025-01-01", temporalEnd: "2025-12-31" })).toBe("2025");
    expect(dataYearOf({ temporalStart: "2026-06-01", temporalEnd: null })).toBe("2026");
    expect(dataYearOf(null)).toBeNull();
  });
});

describe("parseProviderDataCatalog", () => {
  it("keys Care Compare datasets by their stable id", () => {
    const entries = parseProviderDataCatalog(providerItems);
    const hospitals = entries.find((e) => e.datasetId === "xubh-q36u")!;
    expect(hospitals).toMatchObject({ source: "cms_provider_data", title: "Hospital General Information", family: "Hospital General Information", modified: "2026-07-22", released: "2026-08-13", dataUrl: "https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0" });
  });
});

describe("resolveImportUrl", () => {
  const index = indexCatalog([...parseDcatCatalog(dcat), ...parseProviderDataCatalog(providerItems)]);

  it("moves a URL pinned to last year's release to the newest version of the family", () => {
    const r = resolveImportUrl(HSA_2024, index)!;
    expect(r.pinned?.title).toBe("Hospital Service Area : 2024-01-01");
    expect(r.newest?.title).toBe("Hospital Service Area : 2025-01-01");
    expect(r.newest?.dataUrl).toBe(HSA_2025);
  });

  it("keeps a URL that already points at the newest version", () => {
    const r = resolveImportUrl(HSA_2025, index)!;
    expect(r.newest?.datasetId).toBe(r.pinned?.datasetId);
  });

  it("resolves Care Compare ids to themselves and unknown ids to nothing", () => {
    expect(resolveImportUrl("https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0", index)?.newest?.title).toBe("Hospital General Information");
    const unknown = resolveImportUrl("https://data.cms.gov/data-api/v1/dataset/00000000-0000-0000-0000-000000000000/data", index)!;
    expect(unknown.pinned).toBeNull();
    expect(unknown.newest).toBeNull();
    expect(resolveImportUrl("https://example.org/x", index)).toBeNull();
  });

  it("picks the latest period end, then the latest modified date", () => {
    const a = { temporalEnd: "2024-12-31", modified: "2026-01-01" } as any;
    const b = { temporalEnd: "2025-12-31", modified: "2025-06-01" } as any;
    const c = { temporalEnd: "2025-12-31", modified: "2026-07-06" } as any;
    expect(newestOf([a, b, c])).toBe(c);
    expect(newestOf([])).toBeNull();
  });
});

describe("registry status", () => {
  it("compares the catalog's modified date with what was imported", () => {
    expect(isNewer("2026-07-06", "2025-09-10")).toBe(true);
    expect(isNewer("2026-07-06", "2026-07-06")).toBe(false);
    expect(isNewer("2026-07-06", null)).toBe(true);
    expect(isNewer(null, "2026-07-06")).toBe(false);
  });

  it("keeps importing/failed states and flags newer releases", () => {
    const newest = { modified: "2026-07-06" } as any;
    expect(nextStatus(null, newest)).toBe("never_imported");
    expect(nextStatus({ status: "importing" }, newest)).toBe("importing");
    expect(nextStatus({ status: "failed", imported_modified: null }, newest)).toBe("failed");
    expect(nextStatus({ status: "current", imported_modified: "2025-09-10" }, newest)).toBe("update_available");
    expect(nextStatus({ status: "current", imported_modified: "2026-07-06" }, newest)).toBe("current");
  });
});
