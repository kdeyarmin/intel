/**
 * State licensing exports (personal care homes, assisted living) map to
 * licensed_facilities through the typed-route importer: columns by alias,
 * state and license type from the import's parameters when the file has
 * none, the county from the ZIP, and a stable key for homes without a
 * license number.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { LICENSE_TYPE_DEFAULT, TYPED_ROUTES, licensedSnapshotDate, mapLicensedFacility, mapTypedRows, normalizeLicenseType } from "../server/functions/cmsTypedTables";
import { RESIDENTIAL_LICENSE_TYPES } from "../server/lib/licenseTypes";

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
    expect(mapLicensedFacility({ name: "Bad State", state: "Narnia" }, { ...ctx, params: {} })).toBeNull();
    expect(mapLicensedFacility({ name: "Bad State", state: "P" }, { ...ctx, params: {} })).toBeNull();
  });

  it("reads a state spelled out, as portals export it, with or without a state_filter", () => {
    // 'Pennsylvania' used to be dropped, so a whole export came in as zero rows with no error.
    expect(mapLicensedFacility({ name: "Elm Court", state: "Pennsylvania", zip: "15213" }, { ...ctx, params: {} })!.state).toBe("PA");
    expect(mapLicensedFacility({ name: "Elm Court", state: "pennsylvania" }, ctx)!.state).toBe("PA");
    expect(mapLicensedFacility({ name: "Elm Court", state: "Pennsylvania" }, { ...ctx, params: { state_filter: "Pennsylvania" } })!.state).toBe("PA");
    // An unreadable value falls back to the import's state_filter.
    expect(mapLicensedFacility({ name: "Elm Court", state: "?" }, ctx)!.state).toBe("PA");
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

describe("licensedSnapshotDate", () => {
  const today = new Date("2026-10-11T12:00:00Z");

  it("is the end of the stated year, but never a day that hasn't happened", () => {
    expect(licensedSnapshotDate(2024, today)).toBe("2024-12-31");
    expect(licensedSnapshotDate("2025", today)).toBe("2025-12-31");
    // An export taken this October is not 'as of' December 31.
    expect(licensedSnapshotDate(2026, today)).toBe("2026-10-11");
    expect(licensedSnapshotDate(2027, today)).toBe("2026-10-11");
    expect(licensedSnapshotDate(2026, new Date("2027-01-02T00:00:00Z"))).toBe("2026-12-31");
  });

  it("is null without a usable year", () => {
    expect(licensedSnapshotDate(null)).toBeNull();
    expect(licensedSnapshotDate("later")).toBeNull();
    expect(licensedSnapshotDate(1999)).toBeNull();
  });

  describe("on a mapped home", () => {
    afterEach(() => vi.useRealTimers());

    it("stamps a file that states only its year with a date that has happened", () => {
      vi.useFakeTimers({ now: new Date("2026-10-11T12:00:00Z") });
      const row = { name: "Elm Court", license_number: "9" };
      expect(mapLicensedFacility(row, { ...ctx, asOf: undefined, year: 2026 })!.as_of).toBe("2026-10-11");
      expect(mapLicensedFacility(row, { ...ctx, asOf: undefined, year: 2025 })!.as_of).toBe("2025-12-31");
      // A date the file or the import states is used as given.
      expect(mapLicensedFacility(row, { ...ctx, asOf: "2026-09-30" })!.as_of).toBe("2026-09-30");
    });
  });
});

describe("the county profile's licensed supply", () => {
  it("counts the residential license types, each one a type the importer produces", () => {
    expect(RESIDENTIAL_LICENSE_TYPES).toEqual(["personal_care_home", "assisted_living", "memory_care", "domiciliary_care"]);
    const produced = new Set(["Personal Care Home", "Assisted Living Residence", "Memory Care Unit", "Domiciliary Care Home"].map(normalizeLicenseType));
    expect([...produced].sort()).toEqual([...RESIDENTIAL_LICENSE_TYPES].sort());
    // Not residential care supply: nursing homes (CMS counts them), adult day centers, anything unrecognized.
    for (const other of ["Skilled Nursing", "Adult Day Center", "Residential Hospice"]) expect(RESIDENTIAL_LICENSE_TYPES).not.toContain(normalizeLicenseType(other));
  });
});
