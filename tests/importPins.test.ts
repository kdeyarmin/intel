/**
 * The datasets the typed CMS tables are read from. Each id below was checked against CMS's live catalogs
 * (data.json and the Care Compare catalog) on 2026-10-12, by title: the mappers read exactly these files'
 * columns. Medicare Geographic Variation was pinned to the Medicare Advantage national and state file for a
 * while (about 60 rows, no counties, none of the spending or readmission measures the county profile reads);
 * a changed id here should be a deliberate one.
 */
import { describe, expect, it } from "vitest";
import { IMPORT_TYPE_URLS, autoImportBlock, fileUrlProblem, getCMSDatasetCatalog } from "../server/functions/triggerImport";

const PINNED: Record<string, { id: string; title: string }> = {
  hospital_service_area: { id: "8708ca8b-8636-44ed-8303-724cbfaf78ad", title: "Hospital Service Area" },
  hospital_spending_by_claim: { id: "nrth-mfg3", title: "Medicare Hospital Spending by Claim" },
  medicare_snf_utilization: { id: "eaed338b-847e-41b1-a4d3-a206f40dc72b", title: "Medicare Post-Acute Care Utilization - Skilled Nursing Facility by Geography and Provider" },
  medicare_hha_utilization: { id: "43ef03ce-2b60-40a8-958e-146195b5fec7", title: "Medicare Post-Acute Care Utilization - Home Health Agency by Geography and Provider" },
  medicare_hospice_utilization: { id: "4e73f1b5-82cb-4682-8ad2-28493f0b6840", title: "Medicare Post-Acute Care Utilization - Hospice by Geography and Provider" },
  medicare_irf_utilization: { id: "0d9eebff-7e23-4b1e-8e29-362eea132df5", title: "Medicare Post-Acute Care Utilization - Inpatient Rehabilitation Facility by Geography and Provider" },
  medicare_ltch_utilization: { id: "2935c3fe-b18a-4e39-a0c5-e70573664f19", title: "Medicare Post-Acute Care Utilization - Long-Term Care Hospital by Geography and Provider" },
  market_saturation_county: { id: "8900b9c5-50b7-43de-9bdd-0d7113a8355e", title: "Market Saturation & Utilization State-County" },
  market_saturation_cbsa: { id: "9b0e7798-d945-48fc-9861-d38bb5083a74", title: "Market Saturation & Utilization Core-Based Statistical Areas" },
  medicare_monthly_enrollment: { id: "d7fabe1e-d19b-4333-9eff-e80e0643f2fd", title: "Medicare Monthly Enrollment" },
  medicare_geographic_variation: { id: "6219697b-8f6c-4164-bed4-cd9317c58ebc", title: "Medicare Geographic Variation - by National, State & County" },
  home_health_zip_data: { id: "m5eg-upu5", title: "Home Health Care - Zip Codes" },
  hospice_zip_data: { id: "95rg-2usp", title: "Hospice - Zip Data" },
  medicare_physician_by_provider: { id: "8889d81e-2ee7-448f-8713-f071038289b5", title: "Medicare Physician & Other Practitioners - by Provider" },
  facility_affiliation: { id: "27ea-46a8", title: "Facility Affiliation Data" },
  medicare_dme_by_referring: { id: "f8603e5b-9c47-4c52-9b47-a4ef92dfada4", title: "Medicare Durable Medical Equipment, Devices & Supplies - by Referring Provider" },
  medicare_dme_by_supplier: { id: "a2d56d3f-3531-4315-9d87-e29986516b41", title: "Medicare Durable Medical Equipment, Devices & Supplies - by Supplier" },
  medicare_dme_by_referring_service: { id: "dac96878-a0ee-4cca-8082-a8e11f6ac7ed", title: "Medicare Durable Medical Equipment, Devices & Supplies - by Referring Provider and Service" },
  medicare_dme_by_supplier_service: { id: "1dc6718a-e44b-403a-a735-ce01a6233822", title: "Medicare Durable Medical Equipment, Devices & Supplies - by Supplier and Service" },
  medicare_dme_by_geography_service: { id: "eb336619-c076-4d78-8aee-1a752e206bfa", title: "Medicare Durable Medical Equipment, Devices & Supplies - by Geography and Service" },
  physician_certifications: { id: "92396110-2aed-4d63-a6a2-5d6207d46a29", title: "Medicare Physician & Other Practitioners - by Provider and Service" },
  ltc_facility_characteristics: { id: "129a6503-c0f1-4132-b186-4c0232c2d894", title: "Long-Term Care Facility Characteristics" },
  cms_order_referring: { id: "c99b5865-1119-4436-bb80-c5af2773ea1f", title: "Order and Referring" },
};

describe("pinned CMS datasets", () => {
  for (const [type, { id, title }] of Object.entries(PINNED)) {
    it(`${type} reads "${title}"`, () => {
      expect(IMPORT_TYPE_URLS[type], type).toContain(`/${id}/`);
    });
  }

  it("does not read Medicare Advantage geographic variation for the county profile", () => {
    expect(IMPORT_TYPE_URLS.medicare_geographic_variation).not.toContain("8e989bc0");
  });

  it("does not auto-import the retired Provider & Supplier Ownership file", () => {
    expect(IMPORT_TYPE_URLS.provider_ownership).toBeUndefined();
    expect(getCMSDatasetCatalog().datasets.some(d => d.id === "provider_ownership")).toBe(false);
    expect(autoImportBlock("provider_ownership", null)).toMatch(/404/);
    expect(autoImportBlock("provider_ownership", "https://example.com/owners.csv")).toBeNull();
    expect(fileUrlProblem("provider_ownership", "/api/storage/owners.csv", 2024)).toBeNull();
    expect(fileUrlProblem("provider_ownership", "/api/storage/owners.csv", undefined)).toMatch(/year is required/);
  });

  it("offers only available, non-retired datasets and counts those datasets", () => {
    const catalog = getCMSDatasetCatalog();
    expect(catalog.datasets.some(d => d.id === "home_health_pdgm")).toBe(false);
    expect(catalog.datasets.every(d => d.available && !d.unavailable && !/\bretired\b/i.test(d.title))).toBe(true);
    expect(catalog.total).toBe(catalog.datasets.length);
    expect(catalog.categories).toEqual([...new Set(catalog.datasets.map(d => d.category))]);
    expect(catalog.datasets.some(d => d.id === "home_health_all_owners")).toBe(true);
    expect(catalog.datasets.some(d => d.id === "hha_utilization_geo_casemix")).toBe(true);
  });

  it("reads inpatient DRG from by Provider and Service, not the by-provider totals", () => {
    expect(IMPORT_TYPE_URLS.inpatient_drg).toContain("/690ddc6c-2767-4618-b277-420ffb2bf27c/");
    expect(IMPORT_TYPE_URLS.medicare_inpatient_by_provider).toContain("/ee6fb1a5-39b9-46b3-a980-a7284551a732/");
    expect(IMPORT_TYPE_URLS.inpatient_drg).not.toBe(IMPORT_TYPE_URLS.medicare_inpatient_by_provider);
  });
});
