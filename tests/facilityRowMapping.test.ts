/**
 * The generic facility mapper (mapMedicareFacilityRow) on one real row of each facility group's listing dataset
 * (tests/fixtures/cms/facility_rows, captured from the live CMS APIs on 2026-10-12). A row with no provider_id is
 * skipped by the Facilities list and has no Facility page; Care Compare's hospital file names a hospital only by
 * `facility_id`, so before it was mapped no imported hospital could be listed or opened.
 */
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { mapMedicareFacilityRow } from "../server/functions/triggerImport";
import { LISTING_PRIMARY_TYPES } from "../server/functions/facilityDetail";

const dir = path.join(import.meta.dirname, "fixtures", "cms", "facility_rows");
const row = (type: string) => (JSON.parse(fs.readFileSync(path.join(dir, `${type}.json`), "utf8")) as any[])[0];

const EXPECTED: Record<string, Record<string, string>> = {
  hospital_general_info: { provider_id: "390164", facility_name: "UPMC PRESBYTERIAN SHADYSIDE", address: "200 LOTHROP STREET", city: "PITTSBURGH", state: "PA", zip: "15213" },
  home_health_agencies: { provider_id: "397001", facility_name: "TOWER HEALTH AT HOME", address: "739 READING AVENUE VF BLDG 202", city: "WEST READING", state: "PA", zip: "19611" },
  hospice_general_info: { provider_id: "391501", facility_name: "PENN MEDICINE HOSPICE", address: "150 MONUMENT ROAD SUITE 600", city: "BALA CYNWYD", state: "PA", zip: "19004" },
  nursing_home_providers: { provider_id: "395001", facility_name: "PASSAVANT RETIREMENT AND HEALT", address: "105 BURGESS DRIVE", city: "ZELIENOPLE", state: "PA", zip: "16063" },
  inpatient_rehab_general_info: { provider_id: "393025", facility_name: "BRYN MAWR REHABILITATION HOSPITAL", address: "414 PAOLI PIKE", city: "MALVERN", state: "PA", zip: "19355" },
  long_term_care_general_info: { provider_id: "392025", facility_name: "PAM SPECIALTY HOSPITAL OF WILKES-BARRE", address: "575 NORTH RIVER STREET, 7TH FLOOR", city: "WILKES-BARRE", state: "PA", zip: "18764" },
  medical_equipment_suppliers: { provider_id: "34362858", facility_name: "SUMMIT PAIN AND WELLNESS PLLC", address: "501 MIDWESTERN PKWY E", city: "WICHITA FALLS", state: "TX", zip: "763022302" },
  fqhc_enrollments: { provider_id: "391851", facility_name: "KEYSTONE RURAL HEALTH CENTER", address: "820 FIFTH AVENUE", city: "CHAMBERSBURG", state: "PA", zip: "172014219" },
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
