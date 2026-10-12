/**
 * Datasets the facility importer keys on columns they don't have. Against the rows data.cms.gov served on
 * 2026-10-12 (tests/fixtures/liveCmsKeyRows.json, personal fields removed) these mapped no provider_id and
 * no facility_name, so the import kept nothing (ACO REACH providers, ACO SNF affiliates, home infusion
 * suppliers, nursing home chains, MDS frequency, telehealth trends) or fell back to the organization's name
 * and kept one owner row per organization (the six All Owners files).
 */
import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/liveCmsKeyRows.json";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));

import { mapMedicareFacilityRow } from "../server/functions/triggerImport";

const { _about, ...DATASETS } = fixture as Record<string, any>;
const OWNER_TYPES = ["hospital_all_owners", "home_health_all_owners", "hospice_all_owners", "snf_all_owners", "fqhc_all_owners", "rural_health_clinic_all_owners"];
const map = (type: string, row: any) => mapMedicareFacilityRow(row, type, 1, 2026);

describe("facility rows of datasets with no single id column", () => {
  for (const [type, all] of Object.entries(DATASETS) as Array<[string, any[]]>) {
    // The chains file leads with one national summary row that has no chain id (see the test for it below).
    const rows = all.filter((r) => !(type === "nursing_home_chains" && !r["Chain ID"]));
    it(`${type}: every live row gets a provider_id and a name, and the ids differ`, () => {
      expect(rows.length).toBeGreaterThan(0);
      const mapped = rows.map((r) => map(type, r));
      for (const m of mapped) {
        expect(m.provider_id, "provider_id").toBeTruthy();
        expect(m.provider_id.length).toBeLessThanOrEqual(50);
        expect(m.facility_name, "facility_name").toBeTruthy();
      }
      expect(new Set(mapped.map((m) => m.provider_id)).size).toBe(rows.length);
      // The same row maps to the same key on the next release, so it is refreshed in place rather than added again.
      expect(rows.map((r) => map(type, { ...r }).provider_id)).toEqual(mapped.map((m) => m.provider_id));
    });
  }

  it("keeps every owner or manager of an organization, not one row per organization", () => {
    let sharedOrganizations = 0;
    for (const type of OWNER_TYPES) {
      const byOrganization = new Map<string, string[]>();
      for (const row of DATASETS[type]) {
        const ids = byOrganization.get(row["ORGANIZATION NAME"]) ?? [];
        ids.push(map(type, row).provider_id);
        byOrganization.set(row["ORGANIZATION NAME"], ids);
      }
      for (const ids of byOrganization.values()) {
        if (ids.length > 1) sharedOrganizations += 1;
        expect(new Set(ids).size, type).toBe(ids.length);
      }
    }
    // The fixture really does hold organizations with several owner rows, or this proves nothing.
    expect(sharedOrganizations).toBeGreaterThan(0);
  });

  it("keys an owner row by its enrollment, owner and role", () => {
    const row = DATASETS.hospice_all_owners[0];
    expect(map("hospice_all_owners", row).provider_id).toBe(`${row["ENROLLMENT ID"]}_${row["ASSOCIATE ID - OWNER"]}_${row["ROLE CODE - OWNER"]}`);
  });

  it("names a home infusion supplier by its legal business name and keeps its state", () => {
    const row = DATASETS.home_infusion_therapy[0];
    expect(map("home_infusion_therapy", row)).toMatchObject({ facility_name: row["Legal Business Name"], state: row.State });
  });

  it("keeps a home infusion supplier's street address and ZIP, which CMS names differently from the Care Compare files", () => {
    for (const row of DATASETS.home_infusion_therapy) {
      expect(map("home_infusion_therapy", row)).toMatchObject({ address: row["Street Address Line 1"], city: row.City, zip: row["ZIP Code"] });
    }
    expect(map("home_infusion_therapy", DATASETS.home_infusion_therapy[0])).toMatchObject({
      address: "5431 SW 35TH DR", city: "GAINESVILLE", state: "FL", zip: "32608-5277",
    });
  });

  it("keeps an ACO REACH participant's key when CMS revises its term date, elections or waivers", () => {
    const row = DATASETS.aco_reach_providers[0];
    const key = map("aco_reach_providers", row).provider_id;
    const revised = { ...row, term_date: "2024-06-30", capitation_arrangement: "Y", apo_election: "Y", telehealth_waiver: "N", aco_name: "Renamed ACO" };
    expect(map("aco_reach_providers", revised).provider_id).toBe(key);
    // Another participant, class, start date, performance year or ACO is another row.
    for (const other of [{ par_lbn: "SYNTHETIC PARTICIPANT C" }, { prvdr_class: "PREF" }, { start_date: "2024-02-01" }, { perf_year: "2025" }, { aco_id: "D0005" }]) {
      expect(map("aco_reach_providers", { ...row, ...other }).provider_id, JSON.stringify(other)).not.toBe(key);
    }
  });

  it("keys a nursing home chain by its chain id, under either import type", () => {
    const row = DATASETS.nursing_home_chains.find((r: any) => r["Chain ID"]);
    for (const type of ["nursing_home_chains", "nursing_home_chain_performance"]) {
      expect(map(type, row)).toMatchObject({ provider_id: String(row["Chain ID"]), facility_name: row.Chain });
    }
  });

  it("keeps the chains file's national summary row by name, since it has no chain id", () => {
    const national = DATASETS.nursing_home_chains.find((r: any) => !r["Chain ID"]);
    const mapped = map("nursing_home_chains", national);
    // The importer keeps a row with a provider_id or a facility_name.
    expect(mapped.provider_id).toBeNull();
    expect(mapped.facility_name).toBe("National");
  });

  it("still takes the old column layout of the SNF and FQHC owner files", () => {
    // Before CMS's current layout these carried NPI and ASSOCIATE_ID; a row with them and no ENROLLMENT ID keeps its old key.
    expect(map("snf_all_owners", { NPI: "1234567893", ASSOCIATE_ID: "A9", ORGANIZATION_NAME: "Old Layout SNF" }).provider_id).toBe("1234567893");
  });
});
