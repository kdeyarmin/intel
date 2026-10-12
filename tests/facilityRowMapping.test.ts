/**
 * The generic facility mapper (mapMedicareFacilityRow) on one real row of each facility group's listing dataset
 * (tests/fixtures/cms/facility_rows, captured from the live CMS APIs on 2026-10-12). A row with no provider_id is
 * skipped by the Facilities list and has no Facility page; Care Compare's hospital file names a hospital only by
 * `facility_id`, so before it was mapped no imported hospital could be listed or opened.
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { hasStarRating, mapMedicareFacilityRow, starRatingOf } from "../server/functions/triggerImport";
import { LISTING_PRIMARY_TYPES } from "../server/functions/facilityDetail";

const dir = path.join(import.meta.dirname, "fixtures", "cms", "facility_rows");
const row = (type: string) => (JSON.parse(fs.readFileSync(path.join(dir, `${type}.json`), "utf8")) as any[])[0];

const EXPECTED: Record<string, Record<string, string | number | null>> = {
  hospital_general_info: { quality_rating: 4, provider_id: "390164", facility_name: "UPMC PRESBYTERIAN SHADYSIDE", address: "200 LOTHROP STREET", city: "PITTSBURGH", state: "PA", zip: "15213" },
  home_health_agencies: { quality_rating: null, provider_id: "397001", facility_name: "TOWER HEALTH AT HOME", address: "739 READING AVENUE VF BLDG 202", city: "WEST READING", state: "PA", zip: "19611" },
  hospice_general_info: { quality_rating: null, provider_id: "391501", facility_name: "PENN MEDICINE HOSPICE", address: "150 MONUMENT ROAD SUITE 600", city: "BALA CYNWYD", state: "PA", zip: "19004" },
  nursing_home_providers: { quality_rating: 2, provider_id: "395001", facility_name: "PASSAVANT RETIREMENT AND HEALT", address: "105 BURGESS DRIVE", city: "ZELIENOPLE", state: "PA", zip: "16063" },
  inpatient_rehab_general_info: { quality_rating: null, provider_id: "393025", facility_name: "BRYN MAWR REHABILITATION HOSPITAL", address: "414 PAOLI PIKE", city: "MALVERN", state: "PA", zip: "19355" },
  long_term_care_general_info: { quality_rating: null, provider_id: "392025", facility_name: "PAM SPECIALTY HOSPITAL OF WILKES-BARRE", address: "575 NORTH RIVER STREET, 7TH FLOOR", city: "WILKES-BARRE", state: "PA", zip: "18764" },
  medical_equipment_suppliers: { quality_rating: null, provider_id: "34362858", facility_name: "SUMMIT PAIN AND WELLNESS PLLC", address: "501 MIDWESTERN PKWY E", city: "WICHITA FALLS", state: "TX", zip: "763022302" },
  fqhc_enrollments: { quality_rating: null, provider_id: "391851", facility_name: "KEYSTONE RURAL HEALTH CENTER", address: "820 FIFTH AVENUE", city: "CHAMBERSBURG", state: "PA", zip: "172014219" },
};

describe("the listing dataset of each facility group", () => {
  it("has a captured row", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.values(LISTING_PRIMARY_TYPES).sort());
  });

  for (const [type, expected] of Object.entries(EXPECTED)) {
    it(`${type} maps to a facility the list can show and open`, () => {
      const mapped = mapMedicareFacilityRow(row(type), type, 5, 2026);
      expect(mapped).toMatchObject({ facility_type: type, data_year: "2026", import_batch_id: "5", ...expected });
    });
  }
});

describe("Care Compare hospital files", () => {
  it("name a hospital by its CCN (facility_id)", () => {
    for (const type of ["hospital_readmissions", "hospital_complications", "hospital_infections", "hospital_value_based_purchasing"]) {
      const mapped = mapMedicareFacilityRow({ facility_id: "390164", facility_name: "UPMC PRESBYTERIAN SHADYSIDE", state: "PA", measure_id: "X" }, type, 1, 2026);
      expect(mapped.provider_id, type).toBe("390164");
    }
  });

  it("leave other hospital-prefixed files that have no facility_id without one", () => {
    const owners = mapMedicareFacilityRow({ "ORGANIZATION NAME": "ACME HOSPITAL LLC", "ASSOCIATE ID": "123" }, "hospital_all_owners", 1, 2026);
    expect(owners.provider_id).toBeNull();
  });
});

describe("the overall star rating of a facility", () => {
  it("is the nursing home's or hospital's own rating, from the real rows", () => {
    expect(starRatingOf(row("nursing_home_providers"), "nursing_home_providers")).toBe(2);
    expect(starRatingOf(row("hospital_general_info"), "hospital_general_info")).toBe(4);
  });

  it("is nothing for a rating that is not one", () => {
    for (const v of ["Not Available", "", " ", "0", "6", "3.5", "four", null, undefined]) {
      expect(starRatingOf({ overall_rating: v }, "nursing_home_providers"), String(v)).toBeNull();
    }
    expect(starRatingOf({ overall_rating: " 5 " }, "nursing_home_providers")).toBe(5);
  });

  it("is not taken from datasets that are not the facility's own listing, nor from home health agencies' half stars", () => {
    expect(starRatingOf({ overall_rating: "4" }, "nursing_home_ownership")).toBeNull();
    expect(starRatingOf({ quality_of_patient_care_star_rating: "3" }, "home_health_agencies")).toBeNull();
    expect(starRatingOf({ overall_rating: "4" }, "toString")).toBeNull();
    expect(hasStarRating("nursing_home_providers")).toBe(true);
    expect(hasStarRating("hospice_general_info")).toBe(false);
    expect(hasStarRating(undefined)).toBe(false);
  });
});
