/**
 * State licensing exports (personal care homes, assisted living) map to
 * licensed_facilities through the typed-route importer: columns by alias,
 * state and license type from the import's parameters when the file has
 * none, the county from the ZIP, and a stable key for homes without a
 * license number.
 */
import { describe, expect, it } from "vitest";
import { LICENSE_TYPE_DEFAULT, TYPED_ROUTES, mapLicensedFacility, mapTypedRows, normalizeLicenseType } from "../server/functions/cmsTypedTables";

const ctx = { year: 2026, asOf: "2026-09-30", batchId: 7, params: { state_filter: "PA", license_type: "Personal Care Home", file_url: "https://www.pa.gov/dhs/pch.csv" }, countyForZip: (zip: string) => (zip === "15213" ? "42003" : null) };

describe("normalizeLicenseType", () => {
  it("maps the common state wordings to stable keys", () => {
    expect(normalizeLicenseType("Personal Care Home")).toBe("personal_care_home");
    expect(normalizeLicenseType("Assisted Living Residence")).toBe("assisted_living");
    expect(normalizeLicenseType("ALF")).toBe("assisted_living");
    expect(normalizeLicenseType("Memory Care Unit")).toBe("memory_care");
    expect(normalizeLicenseType("Skilled Nursing")).toBe("nursing_home");
    expect(normalizeLicenseType("Residential Hospice!")).toBe("residential_hospice");
    expect(normalizeLicenseType("")).toBe(LICENSE_TYPE_DEFAULT);
  });
});

describe("mapLicensedFacility", () => {
  it("reads a Pennsylvania DHS style row, filling the county from the ZIP", () => {
    const row = { facility_name: "Sunny Hill Personal Care", license_number: "PCH-1234", address_1: "1 Main St", city: "Pittsburgh", state: "PA", zip_code: "15213-1234", licensed_capacity: "48", license_status: "Regular", licensee: "Sunny Hill LLC", phone: "412-555-0100" };
    const m = mapLicensedFacility(row, ctx)!;
    expect(m).toMatchObject({
      state: "PA", license_type: "personal_care_home", facility_key: "PCH-1234", license_number: "PCH-1234", name: "Sunny Hill Personal Care",
      address: "1 Main St", city: "Pittsburgh", zip5: "15213", county_fips: "42003", capacity: 48, status: "Regular", licensee: "Sunny Hill LLC", phone: "412-555-0100",
      source_url: "https://www.pa.gov/dhs/pch.csv", as_of: "2026-09-30", import_batch_id: 7,
    });
    expect(m.raw_data).toBe(row);
  });

  it("takes the state and license type from the import when the file has none, and keys unlicensed rows by name and ZIP", () => {
    const a = mapLicensedFacility({ name: "Maple Manor", zip: "16001", type: "Assisted Living" }, ctx)!;
    expect(a).toMatchObject({ state: "PA", license_type: "assisted_living", license_number: null, county_fips: null, as_of: "2026-09-30" });
    expect(a.facility_key).toMatch(/^[0-9a-f]{32}$/);
    const b = mapLicensedFacility({ name: "maple manor", zip: "16001" }, { ...ctx, params: { state_filter: "pa" } })!;
    expect(b.license_type).toBe(LICENSE_TYPE_DEFAULT);
    expect(b.facility_key).toBe(a.facility_key);
    expect(mapLicensedFacility({ name: "Maple Manor", zip: "16002" }, ctx)!.facility_key).not.toBe(a.facility_key);
  });

  it("drops rows without a name or a usable state", () => {
    expect(mapLicensedFacility({ city: "Erie", state: "PA" }, ctx)).toBeNull();
    expect(mapLicensedFacility({ name: "No State Home" }, { ...ctx, params: {} })).toBeNull();
    expect(mapLicensedFacility({ name: "Bad State", state: "Pennsylvania" }, { ...ctx, params: {} })).toBeNull();
  });

  it("is a typed route keyed by state, license type and facility key, needing the geography", () => {
    const route = TYPED_ROUTES.licensed_facilities;
    expect(route.key).toEqual(["state", "license_type", "facility_key"]);
    expect(route.needsGeo).toBe(true);
    const { rows, dropped } = mapTypedRows(route, [
      { name: "A Home", license_number: "1", zip: "15213", state: "PA" },
      { name: "A Home", license_number: "1", zip: "15213", state: "PA", capacity: "20" },
      { name: "", license_number: "2" },
    ], ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0].capacity).toBe(20);
    expect(dropped).toBe(1);
  });
});
