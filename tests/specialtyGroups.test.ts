import { describe, expect, it } from "vitest";
import * as server from "../server/lib/specialtyGroups";
// @ts-expect-error -- plain JS module
import * as client from "../src/lib/specialtyGroups.js";

const CASES: Array<[string | null, string | null, string]> = [
  ["207RC0000X", "Internal Medicine, Cardiovascular Disease", "cardiology"],
  ["207RI0011X", "Internal Medicine, Interventional Cardiology", "cardiology"],
  ["207R00000X", "Internal Medicine", "internal_medicine"],
  ["207RG0300X", "Internal Medicine, Geriatric Medicine", "geriatrics"],
  ["207RI0200X", "Internal Medicine, Infectious Disease", "infectious_disease"],
  ["207Q00000X", "Family Medicine", "family_medicine"],
  ["2084P0800X", "Psychiatry & Neurology, Psychiatry", "psychiatry"],
  ["2084N0400X", "Psychiatry & Neurology, Neurology", "neurology"],
  ["2085R0001X", "Radiology, Radiation Oncology", "oncology"],
  ["2085R0202X", "Radiology, Diagnostic Radiology", "radiology"],
  ["207X00000X", "Orthopaedic Surgery", "orthopedics"],
  ["208600000X", "Surgery", "general_surgery"],
  ["2080P0207X", "Pediatrics, Pediatric Hematology-Oncology", "pediatrics"],
  ["363L00000X", "Nurse Practitioner", "nurse_practitioner"],
  ["251E00000X", "Home Health", "home_health"],
  ["282N00000X", "General Acute Care Hospital", "hospital"],
  // No code: the specialization after the comma decides.
  [null, "Psychiatry & Neurology, Neurology", "neurology"],
  [null, "Internal Medicine, Cardiovascular Disease", "cardiology"],
  [null, "Internal Medicine", "internal_medicine"],
  [null, "Orthopaedic Surgery", "orthopedics"],
  ["999999999X", "Something Unusual", "other"],
  [null, null, "other"],
];

describe("specialtyGroupFor", () => {
  it.each(CASES)("%s / %s → %s", (code, description, key) => {
    expect(server.specialtyGroupFor(code, description).key).toBe(key);
  });

  it("labels unknown taxonomies with their own description", () => {
    expect(server.specialtyGroupFor(null, "Something Unusual")).toEqual({ key: "other", label: "Something Unusual" });
    expect(server.specialtyGroupFor(null, null)).toEqual({ key: "other", label: "Unknown" });
  });

  it("only lists key specialties that exist", () => {
    for (const key of server.KEY_SPECIALTY_GROUPS) expect(server.specialtyGroupLabel(key)).not.toBe("Other");
  });
});

describe("normalizeEntityType", () => {
  it("accepts the spellings imports use", () => {
    for (const v of ["Individual", "1", "NPI-1"]) expect(server.normalizeEntityType(v)).toBe("Individual");
    for (const v of ["Organization", "2", "npi-2"]) expect(server.normalizeEntityType(v)).toBe("Organization");
    expect(server.normalizeEntityType(null)).toBe("Unknown");
  });
});

describe("client mirror", () => {
  it("has the same groups, codes and patterns", () => {
    const shape = (groups: any[]) => groups.map((g) => ({ key: g.key, label: g.label, codes: g.codes, words: String(g.words) }));
    expect(shape(client.SPECIALTY_GROUPS)).toEqual(shape(server.SPECIALTY_GROUPS));
    expect(client.KEY_SPECIALTY_GROUPS).toEqual(server.KEY_SPECIALTY_GROUPS);
  });

  it.each(CASES)("agrees on %s / %s", (code, description) => {
    expect(client.specialtyGroupFor(code, description)).toEqual(server.specialtyGroupFor(code, description));
  });
});
