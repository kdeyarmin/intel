import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  buildGeoTables,
  fromCsv,
  parseCountyGazetteer,
  parseZctaCountyRelationship,
  parseZctaGazetteer,
  toCsv,
} from "../server/lib/census/parse";
import { CENSUS_DIR, CensusBundleError, loadCensusGeography, readCensusBundle } from "../server/lib/census/load";
import { buildGeoIndex, coordsFor, countiesForState, countyZctas, jitterUnit, resolveCounty, zipToCounty } from "../server/lib/geo";

const FIX = path.resolve(import.meta.dirname, "fixtures", "census");
const read = (f: string) => fs.readFileSync(path.join(FIX, f), "utf8");

function fixtureTables() {
  return buildGeoTables({
    counties: parseCountyGazetteer(read("counties.txt")),
    zctas: parseZctaGazetteer(read("zctas.txt")),
    relationships: parseZctaCountyRelationship(read("relationship.txt")),
  });
}

describe("Census parsers", () => {
  it("reads the county Gazetteer, trimming padded rows and keeping UTF-8 names", () => {
    const counties = parseCountyGazetteer(read("counties.txt"));
    expect(counties).toHaveLength(8);
    expect(counties.find((c) => c.fips === "35013")).toEqual({ fips: "35013", state: "NM", name: "Doña Ana County", lat: 32.35, lng: -106.835 });
    expect(counties.find((c) => c.fips === "72001")!.state).toBe("PR");
  });

  it("reads the ZCTA Gazetteer", () => {
    const zctas = parseZctaGazetteer(read("zctas.txt"));
    expect(zctas.map((z) => z.zcta)).toEqual(["00601", "15213", "16059", "88001", "00801", "15290", "63101"]);
    expect(zctas[1]).toEqual({ zcta: "15213", aland: 5513000, landSqmi: 2.129, lat: 40.44404, lng: -79.955247 });
  });

  it("reads the relationship file: strips the BOM, skips county land outside any ZCTA", () => {
    const rels = parseZctaCountyRelationship(read("relationship.txt"));
    expect(rels).toHaveLength(7);
    expect(rels.every((r) => /^\d{5}$/.test(r.zcta))).toBe(true);
    expect(rels.find((r) => r.zcta === "16059" && r.countyFips === "42019")).toMatchObject({ zcta: "16059", countyFips: "42019", landPart: 63000000, zctaLand: 90000000 });
  });

  it("names the missing column instead of producing garbage", () => {
    expect(() => parseZctaGazetteer("ZIP\tLAT\n15213\t40\n")).toThrow(/GEOID/);
  });
});

describe("buildGeoTables", () => {
  const t = fixtureTables();
  const zcta = (z: string) => t.zctas.find((r) => r.zcta === z)!;

  it("gives each ZCTA the county holding most of its land, and that county's state", () => {
    expect(zcta("16059")).toMatchObject({ primary_county_fips: "42019", state: "PA" });
    expect(t.zctaCounties.filter((r) => r.zcta === "16059")).toEqual([
      { zcta: "16059", county_fips: "42003", land_share: 0.3 },
      { zcta: "16059", county_fips: "42019", land_share: 0.7 },
    ]);
    expect(zcta("88001")).toMatchObject({ primary_county_fips: "35013", state: "NM" });
    expect(zcta("00601")).toMatchObject({ primary_county_fips: "72001", state: "PR" });
  });

  it("knows territories the county Gazetteer leaves out, county records included", () => {
    expect(zcta("00801")).toMatchObject({ primary_county_fips: "78030", state: "VI" });
    // Named from the relationship file, placed at its ZCTAs.
    expect(t.counties.find((c) => c.fips === "78030")).toEqual({ fips: "78030", state: "VI", name: "St. Thomas Island", lat: 18.349806, lng: -64.974001 });
  });

  it("gives a ZCTA without relationship rows the county of its nearest neighbour", () => {
    // 15290 (a single Pittsburgh building) is closest to 15213 in the fixture.
    expect(zcta("15290")).toMatchObject({ primary_county_fips: "42003", state: "PA" });
    expect(t.inferredCounties).toBe(1);
  });
});

describe("bundled CSV", () => {
  it("round-trips quotes and commas", () => {
    const rows = [{ fips: "01001", name: 'Odd, "Quoted" County', state: "AL" }];
    const back = fromCsv(toCsv(["fips", "name", "state"], rows));
    expect(back).toEqual(rows);
  });

  it("matches its manifest, and a changed file is rejected", () => {
    const bundle = readCensusBundle();
    expect(bundle.manifest.vintage).toBe("2020");
    expect(bundle.counties.length).toBeGreaterThan(3000);
    expect(bundle.zctas.length).toBeGreaterThan(30000);
    expect(bundle.zctas.every((z) => z.state !== "" && z.primary_county_fips !== "")).toBe(true);

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "census-"));
    for (const f of fs.readdirSync(CENSUS_DIR)) fs.copyFileSync(path.join(CENSUS_DIR, f), path.join(tmp, f));
    const target = path.join(tmp, bundle.manifest.outputs.geo_counties.file);
    const buf = fs.readFileSync(target);
    buf[buf.length - 5] ^= 0xff;
    fs.writeFileSync(target, buf);
    expect(() => readCensusBundle(tmp)).toThrow(CensusBundleError);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("records the dataset hash from the output hashes", () => {
    const { manifest } = readCensusBundle();
    const expected = crypto.createHash("sha256").update(Object.values(manifest.outputs).map((o) => o.sha256).join("")).digest("hex");
    expect(manifest.dataset_sha256).toBe(expected);
  });
});

describe("loadCensusGeography", () => {
  function fakePool(loadedSha: string | null, tablesFilled = true) {
    const statements: string[] = [];
    const client = {
      async query(sql: string) {
        statements.push(sql.split("(")[0].trim());
        if (sql.startsWith("SELECT dataset_sha256")) return { rows: loadedSha ? [{ dataset_sha256: loadedSha }] : [] };
        if (sql.startsWith("SELECT EXISTS")) return { rows: [{ ok: tablesFilled }] };
        return { rows: [] };
      },
      release() {},
    };
    return { statements, pool: { connect: async () => client } };
  }

  it("replaces all three tables in one transaction", async () => {
    const { pool, statements } = fakePool(null);
    const r = await loadCensusGeography(pool);
    expect(r.status).toBe("loaded");
    // The check runs inside the transaction, under the loader lock.
    expect(statements.slice(0, 5)).toEqual([
      "BEGIN",
      "SELECT pg_advisory_xact_lock",
      "SELECT dataset_sha256 FROM geo_meta WHERE key = $1",
      "SELECT EXISTS",
      "TRUNCATE geo_zcta_counties, geo_zctas, geo_counties",
    ]);
    expect(statements.filter((s) => s.startsWith("INSERT INTO geo_zctas")).length).toBe(Math.ceil(r.counts.zctas / 1000));
    expect(statements.at(-1)).toBe("COMMIT");
  });

  it("does nothing when the same data is already loaded", async () => {
    const { manifest } = readCensusBundle();
    const { pool, statements } = fakePool(manifest.dataset_sha256);
    expect((await loadCensusGeography(pool)).status).toBe("unchanged");
    expect(statements).not.toContain("TRUNCATE geo_zcta_counties, geo_zctas, geo_counties");
    expect(statements.at(-1)).toBe("COMMIT");
    expect((await loadCensusGeography(fakePool(manifest.dataset_sha256).pool, { force: true })).status).toBe("loaded");
  });

  it("reloads when the metadata matches but a table is empty", async () => {
    const { manifest } = readCensusBundle();
    expect((await loadCensusGeography(fakePool(manifest.dataset_sha256, false).pool)).status).toBe("loaded");
  });
});

describe("geo lookups", () => {
  const t = fixtureTables();
  const index = buildGeoIndex({ counties: t.counties, zctas: t.zctas, zctaCounties: t.zctaCounties, vintage: "2020" });

  it("lists a state's counties by name", () => {
    expect(countiesForState(index, "pa").map((c) => c.name)).toEqual(["Allegheny County", "Butler County"]);
  });

  it("resolves counties by FIPS or by name, with or without the suffix", () => {
    expect(resolveCounty(index, { fips: "42003" })!.name).toBe("Allegheny County");
    expect(resolveCounty(index, { state: "PA", name: "allegheny" })!.fips).toBe("42003");
    expect(resolveCounty(index, { state: "NM", name: "Doña Ana" })!.fips).toBe("35013");
    expect(resolveCounty(index, { state: "MO", name: "St. Louis city" })!.fips).toBe("29510");
    expect(resolveCounty(index, { state: "MO", name: "St Louis" })!.fips).toBe("29189");
    // An explicit "city" keeps its meaning however "St." is spelled.
    expect(resolveCounty(index, { state: "MO", name: "St Louis city" })!.fips).toBe("29510");
    expect(resolveCounty(index, { state: "MO", name: "Saint Louis city" })!.fips).toBe("29510");
    expect(resolveCounty(index, { state: "MO", name: "Saint Louis County" })!.fips).toBe("29189");
    expect(resolveCounty(index, { state: "MD", name: "Baltimore City" })!.fips).toBe("24510");
    expect(resolveCounty(index, { state: "MD", name: "Baltimore" })!.fips).toBe("24005");
    expect(resolveCounty(index, { state: "PA", name: "Nowhere" })).toBeNull();
  });

  it("lists a county's ZCTAs, optionally only those mostly inside it", () => {
    expect(countyZctas(index, "42003")).toEqual(["15213", "15290", "16059"]);
    expect(countyZctas(index, "42003", 0.5)).toEqual(["15213", "15290"]);
  });

  it("maps a ZIP (or ZIP+4) to its county", () => {
    expect(zipToCounty(index, "15213-1234")!.name).toBe("Allegheny County");
    expect(zipToCounty(index, "99999")).toBeNull();
  });

  it("places providers at the ZCTA, else the ZIP3 area, else the state, with stable jitter", () => {
    const a = coordsFor(index, { zip: "15213", key: "1234567890" })!;
    expect(a.precision).toBe("zcta");
    expect(Math.abs(a.lat - 40.44404)).toBeLessThan(0.01);
    expect(coordsFor(index, { zip: "15213", key: "1234567890" })).toEqual(a);
    expect(coordsFor(index, { zip: "15213", key: "1234567891" })).not.toEqual(a);
    expect(coordsFor(index, { zip: "15299", key: "x" })!.precision).toBe("zip3");
    expect(coordsFor(index, { zip: "99999", state: "NM", key: "x" })!.precision).toBe("state");
    expect(coordsFor(index, { zip: null, state: null, key: "x" })).toBeNull();
    for (const k of ["a", "b", "c", "npi"]) {
      const u = jitterUnit(k, 1);
      expect(u).toBeGreaterThanOrEqual(-1);
      expect(u).toBeLessThan(1);
    }
  });
});
