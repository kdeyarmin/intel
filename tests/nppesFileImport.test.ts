/**
 * NPPES V.2 dissemination files: the row mapper (server/lib/nppesWrite.ts),
 * the zip reader (server/functions/importNPPESFile.ts) and the write
 * statements, on a small weekly-file fixture (tests/fixtures/nppes/).
 */
import { describe, expect, it, vi } from "vitest";
import path from "path";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));

import { csvRecords } from "../server/lib/csv";
import { nppesDate, nppesRowToRecords, writeNppesRecords } from "../server/lib/nppesWrite";
import { openNpiDataStream, NPPES_FILE_TYPES } from "../server/functions/importNPPESFile";

const ZIP = path.join(import.meta.dirname, "fixtures", "nppes", "NPPES_Data_Dissemination_092826_100426_Weekly_V2.zip");

async function fixtureRows() {
  const { stream, entryName, close } = await openNpiDataStream(ZIP);
  const rows: Record<string, string>[] = [];
  for await (const r of csvRecords(stream, { normalizeHeaders: false })) rows.push(r);
  close();
  return { rows, entryName };
}

describe("zip reader", () => {
  it("streams the npidata_pfile entry, not the header or other files", async () => {
    const { rows, entryName } = await fixtureRows();
    expect(entryName).toBe("npidata_pfile_20260928-20261004.csv");
    expect(rows).toHaveLength(4);
    expect(rows[0].NPI).toBe("1526018159");
  });

  it("knows the two file import types", () => {
    expect(NPPES_FILE_TYPES).toEqual({ nppes_weekly_incremental: "weekly", nppes_monthly_full: "monthly" });
  });
});

describe("nppesRowToRecords", () => {
  it("maps an individual with both addresses and two taxonomies", async () => {
    const { rows } = await fixtureRows();
    const rec = nppesRowToRecords(rows[0])!;
    expect(rec.provider).toMatchObject({ npi: "1526018159", entity_type: "Individual", first_name: "JANE", last_name: "DOE", credential: "M.D.", gender: "F", status: "Active", enumeration_date: "2006-05-23", last_updated_date: "2026-09-30", sole_proprietor: "N", deactivated_only: false });
    expect(rec.locations).toEqual([
      { npi: "1526018159", location_type: "Practice", address_1: "100 MAIN ST", address_2: "STE 2", city: "PITTSBURGH", state: "PA", zip: "15213", country: "US", phone: "412-555-1212", fax: "" },
      { npi: "1526018159", location_type: "Mailing", address_1: "PO BOX 1", address_2: "", city: "PITTSBURGH", state: "PA", zip: "152191234", country: "US", phone: "4125551212", fax: "" },
    ]);
    expect(rec.taxonomies).toEqual([
      { npi: "1526018159", taxonomy_code: "207Q00000X", is_primary: true, license_number: "MD123", license_state: "PA" },
      { npi: "1526018159", taxonomy_code: "208D00000X", is_primary: false, license_number: "", license_state: "" },
    ]);
  });

  it("maps an organization and a deactivation-only row, and rejects a bad NPI", async () => {
    const { rows } = await fixtureRows();
    const org = nppesRowToRecords(rows[1])!;
    expect(org.provider).toMatchObject({ entity_type: "Organization", organization_name: "SUNRISE PERSONAL CARE HOME LLC", first_name: null, status: "Active" });
    expect(org.locations).toHaveLength(1);
    expect(org.taxonomies[0]).toMatchObject({ taxonomy_code: "310400000X", is_primary: true });
    const gone = nppesRowToRecords(rows[2])!;
    expect(gone.provider).toMatchObject({ npi: "1786666176", entity_type: null, status: "Deactivated", npi_deactivation_date: "2026-09-29", deactivated_only: true });
    expect(gone.locations).toEqual([]);
    expect(gone.taxonomies).toEqual([]);
    expect(nppesRowToRecords(rows[3])).toBeNull();
    expect(nppesDate("9/5/2026")).toBe("2026-09-05");
  });

  it("treats a reactivated NPI as active", () => {
    const rec = nppesRowToRecords({ NPI: "1385280841", "Entity Type Code": "1", "Provider Last Name (Legal Name)": "X", "NPI Deactivation Date": "01/01/2020", "NPI Reactivation Date": "02/01/2021" })!;
    expect(rec.provider.status).toBe("Active");
  });
});

describe("writeNppesRecords", () => {
  function fakeClient() {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    return {
      calls,
      async query(sql: string, params: unknown[] = []) {
        calls.push({ sql, params });
        if (sql.includes("RETURNING id")) return { rows: (params[0] as unknown[]).map((_, i) => ({ id: i + 1 })), rowCount: (params[0] as unknown[]).length };
        return { rows: [], rowCount: sql.startsWith("DELETE") ? 1 : 0 };
      },
    };
  }

  it("upserts providers, then replaces locations and taxonomies for NPIs that carry demographics", async () => {
    const { rows } = await fixtureRows();
    const records = [rows[0], rows[1], rows[2]].map((r) => nppesRowToRecords(r)!);
    const client = fakeClient();
    const stats = await writeNppesRecords(client, records, { describeTaxonomy: (code) => (code === "207Q00000X" ? "Family Medicine" : null) });
    expect(stats).toEqual({ providers: 3, locations: 3, locations_removed: 1, taxonomies: 3, taxonomies_removed: 1 });
    expect(client.calls.map((c) => c.sql.trim().split(/\s+/).slice(0, 3).join(" "))).toEqual([
      "INSERT INTO providers", "INSERT INTO provider_locations", "DELETE FROM provider_locations", "INSERT INTO provider_taxonomies", "DELETE FROM provider_taxonomies",
    ]);
    // Providers: all three NPIs, deactivation carried, blanks as NULL so they don't overwrite.
    expect(client.calls[0].params[0]).toEqual(["1526018159", "1471049746", "1786666176"]);
    expect(client.calls[0].params[12]).toEqual(["Active", "Active", "Deactivated"]);
    expect(client.calls[0].params[1]).toEqual(["Individual", "Organization", null]);
    // Locations/taxonomies: only the two NPIs with demographics are replaced.
    expect(client.calls[2].params[0]).toEqual(["1526018159", "1471049746"]);
    expect(client.calls[2].params[1]).toEqual([1, 2, 3]);
    expect(client.calls[3].params[2]).toEqual(["Family Medicine", null, null]);
    expect(client.calls[0].sql).toMatch(/ON CONFLICT \(npi\) DO UPDATE/);
    expect(client.calls[1].sql).toMatch(/md5\(lower\(btrim\(coalesce\(address_1,''\)\)\)\)\) DO UPDATE/);
  });

  it("only touches providers for a page of deactivation-only rows", async () => {
    const { rows } = await fixtureRows();
    const client = fakeClient();
    const stats = await writeNppesRecords(client, [nppesRowToRecords(rows[2])!]);
    expect(stats).toEqual({ providers: 1, locations: 0, locations_removed: 0, taxonomies: 0, taxonomies_removed: 0 });
    expect(client.calls).toHaveLength(1);
  });
});
