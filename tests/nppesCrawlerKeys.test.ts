/**
 * Tests for the locationKey and taxonomyKey helper functions introduced in
 * server/functions/nppesCrawler.ts (lines 263–264, 305).
 *
 * These functions are module-private (not exported), so the logic is replicated
 * here verbatim. If the production code changes, update this test to match.
 *
 * locationKey: `${l.npi}|${l.location_type}|${(l.address_1 || "").trim().toLowerCase()}|${(l.zip || "").substring(0, 5)}`
 * taxonomyKey: `${t.npi}|${(t.taxonomy_code || "").trim()}`
 */
import { describe, it, expect } from "vitest";

// ─── Replicated helpers (kept in sync with nppesCrawler.ts) ─────────────────

const locationKey = (l: any): string =>
  `${l.npi}|${l.location_type}|${(l.address_1 || "").trim().toLowerCase()}|${(l.zip || "").substring(0, 5)}`;

const taxonomyKey = (t: any): string =>
  `${t.npi}|${(t.taxonomy_code || "").trim()}`;

// ─── locationKey ─────────────────────────────────────────────────────────────

describe("locationKey", () => {
  it("produces a pipe-delimited key from all four fields", () => {
    const loc = {
      npi: "1234567890",
      location_type: "practice",
      address_1: "123 Main St",
      zip: "10001",
    };
    expect(locationKey(loc)).toBe("1234567890|practice|123 main st|10001");
  });

  it("lowercases and trims address_1", () => {
    const loc = {
      npi: "111",
      location_type: "mailing",
      address_1: "  456 Oak Ave  ",
      zip: "90210",
    };
    expect(locationKey(loc)).toBe("111|mailing|456 oak ave|90210");
  });

  it("truncates zip to first 5 characters", () => {
    const loc = {
      npi: "222",
      location_type: "practice",
      address_1: "789 Elm St",
      zip: "90210-1234", // 9-digit ZIP+4
    };
    expect(locationKey(loc)).toBe("222|practice|789 elm st|90210");
  });

  it("handles null/undefined address_1 as empty string", () => {
    const loc = { npi: "333", location_type: "practice", address_1: null, zip: "10001" };
    expect(locationKey(loc)).toBe("333|practice||10001");
    const loc2 = { npi: "333", location_type: "practice", zip: "10001" }; // address_1 missing
    expect(locationKey(loc2)).toBe("333|practice||10001");
  });

  it("handles null/undefined zip as empty string", () => {
    const loc = { npi: "444", location_type: "practice", address_1: "100 A St", zip: null };
    expect(locationKey(loc)).toBe("444|practice|100 a st|");
    const loc2 = { npi: "444", location_type: "practice", address_1: "100 A St" }; // zip missing
    expect(locationKey(loc2)).toBe("444|practice|100 a st|");
  });

  it("two records with same NPI, type, and normalized address but different zip produce different keys", () => {
    const locA = { npi: "555", location_type: "practice", address_1: "10 Park", zip: "10001" };
    const locB = { npi: "555", location_type: "practice", address_1: "10 Park", zip: "20002" };
    expect(locationKey(locA)).not.toBe(locationKey(locB));
  });

  it("two records differing only in address case are treated as the same location", () => {
    const locA = { npi: "666", location_type: "practice", address_1: "100 MAIN ST", zip: "10001" };
    const locB = { npi: "666", location_type: "practice", address_1: "100 main st", zip: "10001" };
    expect(locationKey(locA)).toBe(locationKey(locB));
  });

  it("two records with same address but different location_type are distinct", () => {
    const locA = { npi: "777", location_type: "practice", address_1: "1 Dr Way", zip: "10001" };
    const locB = { npi: "777", location_type: "mailing", address_1: "1 Dr Way", zip: "10001" };
    expect(locationKey(locA)).not.toBe(locationKey(locB));
  });

  it("zip shorter than 5 chars is kept as-is (not padded)", () => {
    // substring(0,5) on a 3-char string just returns the 3-char string
    const loc = { npi: "888", location_type: "practice", address_1: "5 St", zip: "902" };
    expect(locationKey(loc)).toBe("888|practice|5 st|902");
  });

  it("produces consistent output for the same input (deterministic)", () => {
    const loc = { npi: "999", location_type: "mailing", address_1: "42 Answer Ave", zip: "12345" };
    expect(locationKey(loc)).toBe(locationKey(loc));
  });
});

// ─── taxonomyKey ─────────────────────────────────────────────────────────────

describe("taxonomyKey", () => {
  it("produces a pipe-delimited key from npi and trimmed taxonomy_code", () => {
    const tax = { npi: "1234567890", taxonomy_code: "207Q00000X" };
    expect(taxonomyKey(tax)).toBe("1234567890|207Q00000X");
  });

  it("trims whitespace from taxonomy_code", () => {
    const tax = { npi: "111", taxonomy_code: "  207Q00000X  " };
    expect(taxonomyKey(tax)).toBe("111|207Q00000X");
  });

  it("handles null taxonomy_code as empty string", () => {
    const tax = { npi: "222", taxonomy_code: null };
    expect(taxonomyKey(tax)).toBe("222|");
  });

  it("handles missing taxonomy_code as empty string", () => {
    const tax = { npi: "333" }; // no taxonomy_code key
    expect(taxonomyKey(tax)).toBe("333|");
  });

  it("two records with same NPI but different taxonomy codes produce different keys", () => {
    const taxA = { npi: "444", taxonomy_code: "207Q00000X" };
    const taxB = { npi: "444", taxonomy_code: "363L00000X" };
    expect(taxonomyKey(taxA)).not.toBe(taxonomyKey(taxB));
  });

  it("two records with same NPI and taxonomy_code but different whitespace are the same key", () => {
    const taxA = { npi: "555", taxonomy_code: "207Q00000X" };
    const taxB = { npi: "555", taxonomy_code: "  207Q00000X" };
    expect(taxonomyKey(taxA)).toBe(taxonomyKey(taxB));
  });

  it("different NPIs with the same taxonomy code produce different keys", () => {
    const taxA = { npi: "111", taxonomy_code: "207Q00000X" };
    const taxB = { npi: "999", taxonomy_code: "207Q00000X" };
    expect(taxonomyKey(taxA)).not.toBe(taxonomyKey(taxB));
  });

  it("preserves taxonomy code casing (does not lowercase)", () => {
    // The key preserves casing — de-dup relies on exact match from the DB
    const tax = { npi: "777", taxonomy_code: "207Q00000X" };
    expect(taxonomyKey(tax)).toContain("207Q00000X");
  });
});

// ─── cross-helper sanity checks ──────────────────────────────────────────────

describe("locationKey vs taxonomyKey", () => {
  it("same NPI with location data and taxonomy data produce different key shapes", () => {
    const loc = { npi: "123", location_type: "practice", address_1: "1 A St", zip: "10001" };
    const tax = { npi: "123", taxonomy_code: "207Q00000X" };
    // Keys have different number of pipe-separated segments
    expect(locationKey(loc).split("|").length).toBe(4);
    expect(taxonomyKey(tax).split("|").length).toBe(2);
  });
});