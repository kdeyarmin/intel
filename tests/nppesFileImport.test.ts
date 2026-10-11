/**
 * NPPES V.2 dissemination files: the row mapper (server/lib/nppesWrite.ts),
 * the zip reader (server/functions/importNPPESFile.ts) and the write
 * statements, on a small weekly-file fixture (tests/fixtures/nppes/).
 */
import { describe, expect, it, vi } from "vitest";
import path from "path";

vi.mock("../server/db", () => ({ db: {}, pool: {} }));

import { csvRecords } from "../server/lib/csv";
import { NPPES_REQUIRED_INDEXES, missingNppesIndexes, nppesDate, nppesRowToRecords, writeNppesRecords } from "../server/lib/nppesWrite";
import { BOOT_INDEXES } from "../server/lib/bootIndexes";
import { openNpiDataStream, NPPES_FILE_TYPES, resolveNppesDir } from "../server/functions/importNPPESFile";
import { UPLOAD_DIR } from "../server/lib/importSources";

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

  describe("taxonomies", () => {
    const base = { NPI: "1385280841", "Entity Type Code": "1", "Provider Last Name (Legal Name)": "X" };
    const slot = (n: number, code: string, primary: string, license = "") => ({
      [`Healthcare Provider Taxonomy Code_${n}`]: code,
      [`Healthcare Provider Primary Taxonomy Switch_${n}`]: primary,
      [`Provider License Number_${n}`]: license,
      [`Provider License Number State Code_${n}`]: license ? "PA" : "",
    });

    it("keeps the primary flag when the primary slot repeats an earlier code", () => {
      const rec = nppesRowToRecords({ ...base, ...slot(1, "208D00000X", "N"), ...slot(2, "207Q00000X", "N"), ...slot(3, "207Q00000X", "Y", "L3") })!;
      expect(rec.taxonomies).toEqual([
        { npi: "1385280841", taxonomy_code: "208D00000X", is_primary: false, license_number: "", license_state: "" },
        { npi: "1385280841", taxonomy_code: "207Q00000X", is_primary: true, license_number: "L3", license_state: "PA" },
      ]);
    });

    it("ends with exactly one primary: the first flagged, else the first listed", () => {
      const twoFlagged = nppesRowToRecords({ ...base, ...slot(1, "207Q00000X", "Y"), ...slot(2, "208D00000X", "Y") })!;
      expect(twoFlagged.taxonomies.map((x) => x.is_primary)).toEqual([true, false]);
      const noneFlagged = nppesRowToRecords({ ...base, ...slot(1, "207Q00000X", "N"), ...slot(2, "208D00000X", "N") })!;
      expect(noneFlagged.taxonomies.map((x) => x.is_primary)).toEqual([true, false]);
    });
  });
});

describe("writeNppesRecords", () => {
  function fakeClient(opts: { stale?: string[]; unknownDeactivations?: string[] } = {}) {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    return {
      calls,
      async query(sql: string, params: unknown[] = []) {
        calls.push({ sql, params });
        if (sql.startsWith("INSERT INTO providers")) {
          // A stale row is skipped by the upsert's WHERE, so RETURNING doesn't list it.
          const written = (params[0] as string[]).filter((n) => !(opts.stale ?? []).includes(n));
          return { rows: written.map((npi) => ({ npi })), rowCount: written.length };
        }
        if (sql.startsWith("UPDATE providers")) {
          const known = (params[0] as string[]).filter((n) => !(opts.unknownDeactivations ?? []).includes(n));
          return { rows: [], rowCount: known.length };
        }
        if (sql.includes("RETURNING id")) return { rows: (params[0] as unknown[]).map((_, i) => ({ id: i + 1 })), rowCount: (params[0] as unknown[]).length };
        return { rows: [], rowCount: sql.startsWith("DELETE") ? 1 : 0 };
      },
    };
  }
  const verbs = (client: { calls: Array<{ sql: string }> }) => client.calls.map((c) => c.sql.trim().split(/\s+/).slice(0, 3).join(" "));

  it("upserts providers, then replaces locations and taxonomies for NPIs that carry demographics", async () => {
    const { rows } = await fixtureRows();
    const records = [rows[0], rows[1], rows[2]].map((r) => nppesRowToRecords(r)!);
    const client = fakeClient();
    const stats = await writeNppesRecords(client, records, { describeTaxonomy: (code) => (code === "207Q00000X" ? "Family Medicine" : null) });
    expect(stats).toEqual({ providers: 3, providers_stale: 0, deactivations_unmatched: 0, locations: 3, locations_removed: 1, taxonomies: 3, taxonomies_removed: 1 });
    expect(verbs(client)).toEqual([
      "INSERT INTO providers", "UPDATE providers AS", "INSERT INTO provider_locations", "DELETE FROM provider_locations", "INSERT INTO provider_taxonomies", "DELETE FROM provider_taxonomies",
    ]);
    // Providers: the two full rows, blanks as NULL so they don't overwrite.
    expect(client.calls[0].params[0]).toEqual(["1526018159", "1471049746"]);
    expect(client.calls[0].params[12]).toEqual(["Active", "Active"]);
    expect(client.calls[0].params[1]).toEqual(["Individual", "Organization"]);
    expect(client.calls[0].sql).toMatch(/ON CONFLICT \(npi\) DO UPDATE/);
    // The deactivation-only row updates a provider we hold; it never inserts one.
    expect(client.calls[1].params[0]).toEqual(["1786666176"]);
    expect(client.calls[1].params[1]).toEqual(["Deactivated"]);
    expect(client.calls[1].params[2]).toEqual(["2026-09-29"]);
    // Locations/taxonomies: only the two NPIs with demographics are replaced.
    expect(client.calls[3].params[0]).toEqual(["1526018159", "1471049746"]);
    expect(client.calls[3].params[1]).toEqual([1, 2, 3]);
    expect(client.calls[4].params[2]).toEqual(["Family Medicine", null, null]);
    expect(client.calls[2].sql).toMatch(/md5\(lower\(btrim\(coalesce\(address_1,''\)\)\)\)\) DO UPDATE/);
  });

  it("a page of deactivation-only rows updates the providers we hold and creates nothing", async () => {
    const { rows } = await fixtureRows();
    const client = fakeClient();
    const stats = await writeNppesRecords(client, [nppesRowToRecords(rows[2])!]);
    expect(stats).toMatchObject({ providers: 1, deactivations_unmatched: 0, locations: 0, taxonomies: 0 });
    expect(verbs(client)).toEqual(["UPDATE providers AS"]);
  });

  it("does not insert a nameless stub for a deactivated NPI the database has never held", async () => {
    const { rows } = await fixtureRows();
    const client = fakeClient({ unknownDeactivations: ["1786666176"] });
    const stats = await writeNppesRecords(client, [nppesRowToRecords(rows[2])!]);
    expect(stats).toMatchObject({ providers: 0, deactivations_unmatched: 1 });
    expect(client.calls.some((c) => c.sql.startsWith("INSERT INTO providers"))).toBe(false);
  });

  it("a reactivation recorded since the deactivation wins over an older deactivation row", async () => {
    const { rows } = await fixtureRows();
    const client = fakeClient();
    await writeNppesRecords(client, [nppesRowToRecords(rows[2])!]);
    const update = client.calls[0].sql;
    expect(update).toMatch(/CASE WHEN pr\.npi_reactivation_date IS NOT NULL AND pr\.npi_reactivation_date >= v\.dd THEN pr\.status ELSE v\.status END/);
  });

  it("leaves a provider alone, locations and taxonomies included, when the stored record is newer than the file's", async () => {
    const { rows } = await fixtureRows();
    const records = [rows[0], rows[1]].map((r) => nppesRowToRecords(r)!);
    const client = fakeClient({ stale: ["1526018159"] });
    const stats = await writeNppesRecords(client, records);
    expect(client.calls[0].sql).toMatch(/WHERE excluded\.last_updated_date IS NULL OR providers\.last_updated_date IS NULL\s+OR excluded\.last_updated_date >= providers\.last_updated_date\s+RETURNING npi/);
    expect(stats).toMatchObject({ providers: 1, providers_stale: 1, locations: 1, taxonomies: 1 });
    // Only the NPI that was applied has its addresses and taxonomies replaced.
    const del = client.calls.find((c) => c.sql.startsWith("DELETE FROM provider_locations"))!;
    expect(del.params[0]).toEqual(["1471049746"]);
    const delTax = client.calls.find((c) => c.sql.startsWith("DELETE FROM provider_taxonomies"))!;
    expect(delTax.params[0]).toEqual(["1471049746"]);
  });

  it("writes nothing further when every row in the page is stale", async () => {
    const { rows } = await fixtureRows();
    const client = fakeClient({ stale: ["1526018159"] });
    const stats = await writeNppesRecords(client, [nppesRowToRecords(rows[0])!]);
    expect(stats).toMatchObject({ providers: 0, providers_stale: 1, locations: 0, taxonomies: 0 });
    expect(verbs(client)).toEqual(["INSERT INTO providers"]);
  });
});

describe("the unique indexes the upserts conflict on", () => {
  it("are boot indexes, by the names the importer checks for", () => {
    for (const name of NPPES_REQUIRED_INDEXES) {
      expect(BOOT_INDEXES.find((i) => i.name === name)?.ddl).toMatch(/CREATE UNIQUE INDEX/);
    }
  });

  it("are reported when missing or invalid, so the import can stop before it downloads anything", async () => {
    const present = (names: string[]) => ({ query: async () => ({ rows: names.map((relname) => ({ relname })) }) });
    expect(await missingNppesIndexes(present([...NPPES_REQUIRED_INDEXES]))).toEqual([]);
    expect(await missingNppesIndexes(present(["uq_prov_loc_natural"]))).toEqual(["uq_prov_tax_natural"]);
    expect(await missingNppesIndexes(present([]))).toEqual([...NPPES_REQUIRED_INDEXES]);
  });
});

describe("download folder", () => {
  // /api/storage serves uploads/ to every signed-in user: a 1.1 GB zip kept there is a download for any member.
  it("is not inside the uploads folder that is served to signed-in users", () => {
    const dir = resolveNppesDir(""); // not configured
    expect(path.relative(UPLOAD_DIR, dir).startsWith("..")).toBe(true);
    expect(dir).toBe(path.resolve("downloads", "nppes"));
  });

  it("takes NPPES_DOWNLOAD_DIR, unless it points into uploads", () => {
    expect(resolveNppesDir("/var/data/nppes", "/srv/app/uploads")).toBe("/var/data/nppes");
    expect(() => resolveNppesDir("/srv/app/uploads/nppes", "/srv/app/uploads")).toThrow(/served to signed-in users/);
    expect(() => resolveNppesDir("/srv/app/uploads", "/srv/app/uploads")).toThrow(/served to signed-in users/);
    // A sibling with the same prefix is outside.
    expect(resolveNppesDir("/srv/app/uploads-nppes", "/srv/app/uploads")).toBe("/srv/app/uploads-nppes");
  });
});
