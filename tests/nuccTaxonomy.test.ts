import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { nppesDescription, parseNuccTaxonomy } from "../server/lib/nucc/parse";
import { NUCC_DIR, NuccBundleError, loadNuccTaxonomies, readNuccBundle } from "../server/lib/nucc/load";
import { buildTaxonomyIndex, getTaxonomyIndex, resetTaxonomyCache } from "../server/lib/taxonomy";
import { specialtyGroupFor } from "../server/lib/specialtyGroups";

const sample = fs.readFileSync(path.resolve(import.meta.dirname, "fixtures", "nucc", "nucc_taxonomy_sample.csv"), "utf8");

describe("parseNuccTaxonomy", () => {
  const rows = parseNuccTaxonomy(sample);

  it("keeps one row per code, sorted, dropping notes and duplicates", () => {
    expect(rows.map((r) => r.code)).toEqual(["207R00000X", "207RC0000X", "251E00000X", "310400000X", "3104A0625X", "311ZA0620X", "313M00000X", "314000000X", "363L00000X"]);
  });

  it("reads the NUCC columns, including quoted definitions with commas and doubled quotes", () => {
    const snf = rows.find((r) => r.code === "314000000X")!;
    expect(snf).toMatchObject({ grouping: "Nursing & Custodial Care Facilities", classification: "Skilled Nursing Facility", specialization: "", display_name: "Skilled Nursing Facility", section: "Non-Individual" });
    expect(snf.definition).toMatch(/^\(1\) A skilled nursing facility is a facility or distinct part of an institution/);
    expect(snf.definition).not.toContain("\n");
    const al = rows.find((r) => r.code === "3104A0625X")!;
    expect(al).toMatchObject({ classification: "Assisted Living Facility", specialization: "Assisted Living, Mental Illness", display_name: "Assisted Living Facility (Mental Illness)" });
  });

  it("names a missing column instead of producing garbage", () => {
    expect(() => parseNuccTaxonomy("Code,Grouping\n207R00000X,Physicians\n")).toThrow(/classification/);
  });

  it("describes codes the way NPPES does", () => {
    expect(nppesDescription(rows.find((r) => r.code === "207RC0000X")!)).toBe("Internal Medicine, Cardiovascular Disease");
    expect(nppesDescription(rows.find((r) => r.code === "207R00000X")!)).toBe("Internal Medicine");
  });
});

describe("bundled NUCC taxonomy", () => {
  it("matches its manifest, and a changed file is rejected", () => {
    const bundle = readNuccBundle();
    expect(bundle.manifest.version).toMatch(/^\d\d\.\d$/);
    expect(bundle.manifest.source.url).toMatch(/^https:\/\/www\.nucc\.org\//);
    expect(bundle.taxonomies.length).toBeGreaterThan(800);
    expect(new Set(bundle.taxonomies.map((r) => r.code)).size).toBe(bundle.taxonomies.length);
    expect(bundle.taxonomies.every((r) => /^[0-9A-Z]{9}X$/.test(r.code) && r.classification && r.display_name)).toBe(true);
    // The codes the long-term-care specialty groups rely on exist in the code set.
    for (const code of ["310400000X", "3104A0625X", "3104A0630X", "311500000X", "311ZA0620X", "311Z00000X", "313M00000X", "314000000X", "251G00000X", "315D00000X"]) {
      expect(bundle.taxonomies.find((r) => r.code === code), code).toBeTruthy();
    }

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nucc-"));
    for (const f of fs.readdirSync(NUCC_DIR)) fs.copyFileSync(path.join(NUCC_DIR, f), path.join(tmp, f));
    const target = path.join(tmp, bundle.manifest.outputs.nucc_taxonomies.file);
    const buf = fs.readFileSync(target);
    buf[buf.length - 5] ^= 0xff;
    fs.writeFileSync(target, buf);
    expect(() => readNuccBundle(tmp)).toThrow(NuccBundleError);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("records the dataset hash from the output hashes", () => {
    const { manifest } = readNuccBundle();
    const expected = crypto.createHash("sha256").update(Object.values(manifest.outputs).map((o) => o.sha256).join("")).digest("hex");
    expect(manifest.dataset_sha256).toBe(expected);
  });

  it("puts every bundled code in a specialty group or 'other', never throws", () => {
    const { taxonomies } = readNuccBundle();
    const groups = new Map<string, number>();
    for (const r of taxonomies) {
      const g = specialtyGroupFor(r.code, nppesDescription(r));
      groups.set(g.key, (groups.get(g.key) || 0) + 1);
    }
    expect(groups.get("assisted_living")).toBe(3);
    expect(groups.get("alzheimer_center")).toBe(1);
    expect(groups.get("adult_care_home")).toBe(1);
    expect(groups.get("custodial_care")).toBe(1);
    expect(groups.get("nursing_facility")).toBe(1);
    expect(groups.get("skilled_nursing")).toBe(2);
  });
});

describe("loadNuccTaxonomies", () => {
  function fakePool(loadedSha: string | null, tableFilled = true) {
    const statements: string[] = [];
    const client = {
      async query(sql: string) {
        statements.push(sql.split("(")[0].trim());
        if (sql.startsWith("SELECT dataset_sha256")) return { rows: loadedSha ? [{ dataset_sha256: loadedSha }] : [] };
        if (sql.startsWith("SELECT EXISTS")) return { rows: [{ ok: tableFilled }] };
        return { rows: [] };
      },
      release() {},
    };
    return { statements, pool: { connect: async () => client } };
  }

  it("replaces the table in one transaction under the loader lock", async () => {
    const { pool, statements } = fakePool(null);
    const r = await loadNuccTaxonomies(pool);
    expect(r.status).toBe("loaded");
    expect(statements.slice(0, 5)).toEqual([
      "BEGIN",
      "SELECT pg_advisory_xact_lock",
      "SELECT dataset_sha256 FROM geo_meta WHERE key = $1",
      "SELECT EXISTS",
      "TRUNCATE nucc_taxonomies",
    ]);
    expect(statements.filter((s) => s.startsWith("INSERT INTO nucc_taxonomies")).length).toBe(Math.ceil(r.rows / 500));
    expect(statements.at(-2)).toBe("INSERT INTO geo_meta");
    expect(statements.at(-1)).toBe("COMMIT");
  });

  it("does nothing when the same version is already loaded, unless forced or the table is empty", async () => {
    const { manifest } = readNuccBundle();
    const { pool, statements } = fakePool(manifest.dataset_sha256);
    expect((await loadNuccTaxonomies(pool)).status).toBe("unchanged");
    expect(statements).not.toContain("TRUNCATE nucc_taxonomies");
    expect((await loadNuccTaxonomies(fakePool(manifest.dataset_sha256).pool, { force: true })).status).toBe("loaded");
    expect((await loadNuccTaxonomies(fakePool(manifest.dataset_sha256, false).pool)).status).toBe("loaded");
  });
});

describe("taxonomy index", () => {
  it("describes known codes and remembers unknown ones", () => {
    const index = buildTaxonomyIndex(parseNuccTaxonomy(sample), "26.1");
    expect(index.describe("207RC0000X")).toBe("Internal Medicine, Cardiovascular Disease");
    expect(index.describe(" 207rc0000x ")).toBe("Internal Medicine, Cardiovascular Disease");
    expect(index.describe("999999999X")).toBeNull();
    expect(index.describe("")).toBeNull();
    expect([...index.unknown]).toEqual(["999999999X"]);
    expect(index.version).toBe("26.1");
  });

  it("doesn't count unknown codes while the code set is empty", () => {
    const index = buildTaxonomyIndex([]);
    expect(index.describe("207RC0000X")).toBeNull();
    expect(index.unknown.size).toBe(0);
  });

  it("loads from the table once and serves the cached index", async () => {
    resetTaxonomyCache();
    let selects = 0;
    const pool = {
      async query(sql: string) {
        if (sql.includes("FROM geo_meta")) return { rows: [{ vintage: "26.1", stamp: "s1" }] };
        selects++;
        return { rows: parseNuccTaxonomy(sample) };
      },
    };
    const a = await getTaxonomyIndex(pool);
    const b = await getTaxonomyIndex(pool);
    expect(a).toBe(b);
    expect(selects).toBe(1);
    expect(a.describe("363L00000X")).toBe("Nurse Practitioner");
    resetTaxonomyCache();
    expect(await getTaxonomyIndex(pool)).not.toBe(a);
    expect(selects).toBe(2);
  });

  it("is empty, not broken, before the table exists", async () => {
    resetTaxonomyCache();
    const pool = { async query() { throw new Error("relation nucc_taxonomies does not exist"); } };
    const index = await getTaxonomyIndex(pool);
    expect(index.byCode.size).toBe(0);
    expect(index.describe("207RC0000X")).toBeNull();
    resetTaxonomyCache();
  });
});
