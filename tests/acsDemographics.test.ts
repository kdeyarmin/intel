import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { ACS_COLUMNS, ACS_MANIFEST, AcsBundleError, buildAcsRows, hasAcsBundle, loadAcsDemographics, readAcsBundle, readAcsTable } from "../server/lib/census/acs";
import { CENSUS_DIR } from "../server/lib/census/load";

const B01001 = [
  "GEO_ID|B01001_E001|B01001_M001|B01001_E020|B01001_M020|B01001_E025|B01001_M025|B01001_E044|B01001_M044|B01001_E049|B01001_M049",
  "0100000US|334000000|0|1|0|2|0|3|0|4|0",
  "0500000US42003|1238177|0|6000|10|20000|10|7000|10|30000|10",
  "0500000US42019|197254|0|1000|10|3000|10|1100|10|4000|10",
  "860Z200US15213|30000|0|300|5|700|5|350|5|900|5",
  "860Z200US99999|-666666666|0|-666666666|0|-666666666|0|-666666666|0|-666666666|0",
  "",
];
const B19013 = ["GEO_ID|B19013_E001|B19013_M001", "0500000US42003|78548|500", "860Z200US15213|-666666666|0"];

describe("readAcsTable", () => {
  it("keeps the wanted estimates for counties and ZCTAs, nulling ACS sentinels", async () => {
    const t = await readAcsTable(B01001, ["B01001_E001", "B01001_E025", "B01001_E049"]);
    expect([...t.counties.keys()]).toEqual(["42003", "42019"]);
    expect([...t.zctas.keys()]).toEqual(["15213", "99999"]);
    expect(t.counties.get("42003")!.get("B01001_E025")).toBe(20000);
    expect(t.zctas.get("99999")!.get("B01001_E001")).toBeNull();
  });

  it("names a missing column", async () => {
    await expect(readAcsTable(B19013, ["B19013_E001", "B19013_E002"])).rejects.toThrow(/B19013_E002/);
    await expect(readAcsTable(["X|Y", "1|2"], ["Y"])).rejects.toThrow(/GEO_ID/);
  });
});

describe("buildAcsRows", () => {
  it("sums the age bands into 65+ and 85+ per geography and keeps nulls honest", async () => {
    const pop = await readAcsTable(B01001, ["B01001_E001", "B01001_E020", "B01001_E025", "B01001_E044", "B01001_E049"]);
    const inc = await readAcsTable(B19013, ["B19013_E001"]);
    const counties = buildAcsRows([pop.counties, inc.counties], "fips");
    // Only the bands present in this fixture are summed (the real file has all twelve).
    expect(counties[0]).toMatchObject({ fips: "42003", pop_total: 1238177, pop_65_plus: 6000 + 20000 + 7000 + 30000, pop_85_plus: 50000, median_income: 78548, median_home_value: null, living_alone_65_plus: null });
    expect(counties[1]).toMatchObject({ fips: "42019", median_income: null });
    const zctas = buildAcsRows([pop.zctas, inc.zctas], "zcta");
    expect(zctas.find((z) => z.zcta === "99999")).toMatchObject({ pop_total: null, pop_65_plus: null, median_income: null });
    expect(Object.keys(counties[0])).toEqual(["fips", ...ACS_COLUMNS]);
  });
});

describe("bundled ACS data", () => {
  it("matches its manifest, covers every county and ZCTA, and a changed file is rejected", () => {
    expect(hasAcsBundle()).toBe(true);
    const bundle = readAcsBundle();
    expect(bundle.manifest.vintage).toMatch(/^\d{4}-\d{4}$/);
    expect(bundle.counties.length).toBeGreaterThan(3200);
    expect(bundle.zctas.length).toBeGreaterThan(33000);
    const allegheny = bundle.counties.find((c) => c.fips === "42003")!;
    expect(Number(allegheny.pop_65_plus)).toBeGreaterThan(200000);
    expect(Number(allegheny.pop_85_plus)).toBeLessThan(Number(allegheny.pop_65_plus));
    expect(Number(allegheny.median_income)).toBeGreaterThan(50000);
    expect(bundle.zctas.find((z) => z.zcta === "15213")).toBeTruthy();

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "acs-"));
    for (const f of fs.readdirSync(CENSUS_DIR)) fs.copyFileSync(path.join(CENSUS_DIR, f), path.join(tmp, f));
    const target = path.join(tmp, bundle.manifest.outputs.census_acs_county.file);
    const buf = fs.readFileSync(target);
    buf[buf.length - 5] ^= 0xff;
    fs.writeFileSync(target, buf);
    expect(() => readAcsBundle(tmp)).toThrow(AcsBundleError);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("records the dataset hash from the output hashes and leaves the geography manifest alone", () => {
    const { manifest } = readAcsBundle();
    const expected = crypto.createHash("sha256").update(Object.values(manifest.outputs).map((o) => o.sha256).join("")).digest("hex");
    expect(manifest.dataset_sha256).toBe(expected);
    const geo = JSON.parse(fs.readFileSync(path.join(CENSUS_DIR, "manifest.json"), "utf8"));
    expect(Object.keys(geo.outputs)).toEqual(["geo_counties", "geo_zctas", "geo_zcta_counties"]);
    expect(ACS_MANIFEST).not.toBe("manifest.json");
  });
});

describe("loadAcsDemographics", () => {
  function fakePool(loadedSha: string | null, filled = true) {
    const statements: string[] = [];
    const client = {
      async query(sql: string) {
        statements.push(sql.split("(")[0].trim());
        if (sql.startsWith("SELECT dataset_sha256")) return { rows: loadedSha ? [{ dataset_sha256: loadedSha }] : [] };
        if (sql.startsWith("SELECT EXISTS")) return { rows: [{ ok: filled }] };
        return { rows: [] };
      },
      release() {},
    };
    return { statements, pool: { connect: async () => client } };
  }

  it("replaces both tables in one transaction under the loader lock", async () => {
    const { pool, statements } = fakePool(null);
    const r = await loadAcsDemographics(pool);
    expect(r.status).toBe("loaded");
    expect(statements.slice(0, 5)).toEqual(["BEGIN", "SELECT pg_advisory_xact_lock", "SELECT dataset_sha256 FROM geo_meta WHERE key = $1", "SELECT EXISTS", "TRUNCATE census_acs_zcta, census_acs_county"]);
    expect(statements.filter((s) => s.startsWith("INSERT INTO census_acs_zcta")).length).toBe(Math.ceil(r.counts.zctas / 1000));
    expect(statements.at(-1)).toBe("COMMIT");
  });

  it("skips an unchanged bundle unless forced or a table is empty", async () => {
    const { manifest } = readAcsBundle();
    expect((await loadAcsDemographics(fakePool(manifest.dataset_sha256).pool)).status).toBe("unchanged");
    expect((await loadAcsDemographics(fakePool(manifest.dataset_sha256).pool, { force: true })).status).toBe("loaded");
    expect((await loadAcsDemographics(fakePool(manifest.dataset_sha256, false).pool)).status).toBe("loaded");
  });
});
