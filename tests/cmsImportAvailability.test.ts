import { describe, expect, it } from "vitest";
import {
  CMS_IMPORT_TYPES, SCHEDULABLE_CMS_IMPORT_TYPE_IDS, isAvailableCmsDataset, buildImportTypeLabels,
} from "../src/lib/cmsImportTypes";
import { IMPORT_CATEGORIES } from "../src/components/dataCenter/ImportCategoryCards";

describe("CMS import availability", () => {
  it.each(["provider_ownership", "home_health_pdgm"])("does not offer retired %s for import", id => {
    expect(isAvailableCmsDataset({ id })).toBe(false);
    expect(CMS_IMPORT_TYPES.some(type => type.id === id)).toBe(false);
    expect(SCHEDULABLE_CMS_IMPORT_TYPE_IDS).not.toContain(id);
    expect(IMPORT_CATEGORIES.flatMap(category => category.types).some(type => type.id === id)).toBe(false);
    expect(buildImportTypeLabels()[id]).toBeTruthy();
  });

  it("excludes unavailable and explicitly retired catalog entries", () => {
    expect(isAvailableCmsDataset({ id: "example", unavailable: true })).toBe(false);
    expect(isAvailableCmsDataset({ id: "example", available: false })).toBe(false);
    expect(isAvailableCmsDataset({ id: "example", retired: true })).toBe(false);
    expect(isAvailableCmsDataset({ id: "example", title: "Example (Retired)" })).toBe(false);
  });

  it("keeps available replacements and file uploads selectable", () => {
    for (const id of ["home_health_all_owners", "hha_utilization_geo_casemix", "licensed_facilities"]) {
      expect(isAvailableCmsDataset({ id })).toBe(true);
      expect(SCHEDULABLE_CMS_IMPORT_TYPE_IDS).toContain(id);
    }
  });
});
