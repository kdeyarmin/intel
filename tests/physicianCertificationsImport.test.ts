/**
 * The Home Health Certifications import reads the by-provider-and-service file (~10M rows) through a server-side
 * filter on four HCPCS codes, so it fetches about 27,000 rows. The filter is added to whatever URL the registry
 * resolves, so a new yearly release keeps it.
 */
import { describe, expect, it } from "vitest";
import { CERTIFICATION_HCPCS, TYPED_ROUTES } from "../server/functions/cmsTypedTables";
import { IMPORT_TYPE_URLS, getCMSDatasetCatalog, withImportQuery } from "../server/functions/triggerImport";
import { datasetIdFromUrl, dataApiUrl } from "../server/lib/cmsCatalog";

const BY_SERVICE = "92396110-2aed-4d63-a6a2-5d6207d46a29";
const queryOf = (url: string) => new URL(url).searchParams;

describe("the certification filter", () => {
  it("asks CMS for the four codes only, with an IN condition on HCPCS_Cd", () => {
    const q = queryOf(IMPORT_TYPE_URLS.physician_certifications);
    expect(q.get("filter[p][condition][path]")).toBe("HCPCS_Cd");
    expect(q.get("filter[p][condition][operator]")).toBe("IN");
    expect(q.getAll("filter[p][condition][value][]")).toEqual(["G0180", "G0179", "G0181", "G0182"]);
    expect(CERTIFICATION_HCPCS).toEqual(["G0180", "G0179", "G0181", "G0182"]);
  });

  it("is on the pinned URL and on the newest release the registry resolves, once", () => {
    expect(IMPORT_TYPE_URLS.physician_certifications).toContain(`/dataset/${BY_SERVICE}/data?`);
    const newer = dataApiUrl("11111111-2222-4333-8444-555555555555");
    const filtered = withImportQuery("physician_certifications", newer)!;
    expect(filtered.startsWith(`${newer}?filter`)).toBe(true);
    expect(queryOf(filtered).getAll("filter[p][condition][value][]")).toHaveLength(4);
    expect(withImportQuery("physician_certifications", filtered)).toBe(filtered);
  });

  it("is not added to any other import type, and passes a missing URL through", () => {
    const plain = dataApiUrl(BY_SERVICE);
    expect(withImportQuery("provider_service_utilization", plain)).toBe(plain);
    expect(withImportQuery("toString", plain)).toBe(plain);
    expect(withImportQuery("physician_certifications", null)).toBeNull();
    expect(withImportQuery("physician_certifications", undefined)).toBeNull();
    expect(IMPORT_TYPE_URLS.provider_service_utilization).toBe(plain);
  });

  it("leaves the dataset the catalog watcher follows the same one, filter or not", () => {
    expect(datasetIdFromUrl(IMPORT_TYPE_URLS.physician_certifications)).toEqual({ source: "cms_data_api", id: BY_SERVICE });
  });
});

describe("the dataset", () => {
  it("is listed in the catalog and has a typed destination", () => {
    const entry = getCMSDatasetCatalog().datasets.find((d: any) => d.id === "physician_certifications");
    expect(entry).toMatchObject({ category: "Physicians & Clinicians", available: true });
    expect(TYPED_ROUTES.physician_certifications.table).toBeDefined();
  });
});
