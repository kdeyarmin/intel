/**
 * The market rollups are query jobs: one SELECT per result table over the
 * typed CMS tables and the Census geography, run by the rollup runner under
 * its lock, run row and swap transaction. Their SQL is checked against the
 * migration that creates the tables, so a column added to one side can't be
 * forgotten on the other.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { MARKET_JOBS } from "../server/lib/rollups/market";
import { ROLLUP_JOBS, jobByName, rollupStatus, runRollupJob } from "../server/lib/rollups/runner";

const DRIZZLE = path.resolve(import.meta.dirname, "..", "drizzle");
const migration = fs.readFileSync(path.join(DRIZZLE, "0018_market_rollups.sql"), "utf8");
// Columns later migrations add (ALTER TABLE … ADD COLUMN IF NOT EXISTS), in journal order.
const laterSql = fs.readdirSync(DRIZZLE).filter((f) => /^00(19|[2-9]\d)_.*\.sql$/.test(f)).sort().map((f) => fs.readFileSync(path.join(DRIZZLE, f), "utf8")).join("\n");

/** Column names of a rollup table: its CREATE TABLE in 0018 plus columns added since, in order. */
function tableColumns(table: string): string[] {
  const m = new RegExp(`CREATE TABLE IF NOT EXISTS "${table}" \\(([\\s\\S]*?)\\n\\);`).exec(migration);
  if (!m) throw new Error(`no CREATE TABLE for ${table}`);
  const created = m[1].split("\n").map((l) => /^\s*"(\w+)"/.exec(l)?.[1]).filter((c): c is string => !!c);
  const added = [...laterSql.matchAll(new RegExp(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "(\\w+)"`, "g"))].map((x) => x[1]);
  return [...created, ...added];
}

describe("market rollup jobs", () => {
  it("are registered as daily query jobs, with the county profile last", () => {
    const names = ROLLUP_JOBS.map((j) => j.name);
    expect(names.slice(-MARKET_JOBS.length)).toEqual([
      "hospital_catchment", "county_hospital_sources", "hospital_discharge_mix", "pac_market_share", "agency_coverage", "referral_sources", "county_market_profile",
    ]);
    for (const job of MARKET_JOBS) {
      const registered = jobByName(job.name)!;
      expect(registered.kind).toBe("query");
      expect(registered.intervalMs).toBe(24 * 60 * 60 * 1000);
      expect(registered.sql).toBe(job.sql);
    }
  });

  it("fill every column of their result tables, in the table's order", () => {
    for (const job of MARKET_JOBS) {
      expect(job.resultColumns, job.name).toEqual(tableColumns(job.resultTable));
      // One output expression per column: the SELECT list is checked by Postgres,
      // but a stray comma is caught here by counting top-level commas in the
      // final SELECT.
      const finalSelect = job.sql.slice(job.sql.lastIndexOf("\n      SELECT"));
      const list = finalSelect.slice("SELECT".length + 7, finalSelect.search(/\n\s+FROM /));
      let depth = 0;
      let commas = 0;
      for (const ch of list) {
        if (ch === "(") depth += 1;
        else if (ch === ")") depth -= 1;
        else if (ch === "," && depth === 0) commas += 1;
      }
      expect(commas + 1, `${job.name} select list`).toBe(job.resultColumns.length);
    }
  });

  it("read the typed tables and the geography, never the big tables", () => {
    for (const job of MARKET_JOBS) {
      expect(job.sql, job.name).toContain(`FROM ${job.source}`);
      expect(job.sql).not.toMatch(/\b(FROM|JOIN)\s+(medicare_facilities|provider_locations|providers)\b/);
    }
    expect(jobByName("hospital_catchment")!.sql).toContain("geo_zctas");
    expect(jobByName("county_market_profile")!.sql).toContain("rollup_county_hospital_sources");
    expect(jobByName("county_market_profile")!.sql).toContain("rollup_pac_market_share");
    expect(jobByName("referral_sources")!.sql).toContain("cms_order_referring");
    // A clinician with no county isn't ranked against the others with none.
    expect(jobByName("referral_sources")!.sql).toMatch(/CASE WHEN county_fips IS NOT NULL THEN rank\(\) OVER \(PARTITION BY county_fips/);
    expect(jobByName("referral_sources")!.sql).toContain("Bene_CC_PH_HF_NonIHD_V2_Pct");
  });

  it("store chronic-condition shares as fractions, like every other share (CMS publishes percent units)", () => {
    const sql = jobByName("referral_sources")!.sql;
    for (const col of ["cc_chf_pct", "cc_copd_pct", "cc_alzheimer_pct", "cc_ckd_pct", "cc_diabetes_pct"]) {
      expect(sql, col).toMatch(new RegExp(`\\)::float8[^\\n]*\\) / 100\\.0 AS ${col}`));
    }
  });

  it("leave a clinician's hospital affiliations unknown (NULL), not 0, until the Facility Affiliation file is imported", () => {
    // "No affiliations listed" is a statement about the file; with no file loaded every clinician would read 0.
    const sql = jobByName("referral_sources")!.sql;
    expect(sql).toMatch(/aff_loaded AS \(SELECT EXISTS \(SELECT 1 FROM cms_facility_affiliation\) AS loaded\)/);
    expect(sql).toMatch(/CASE WHEN \(SELECT loaded FROM aff_loaded\) THEN COALESCE\(a\.affiliations, 0\) END AS affiliations/);
  });

  it("rank on the patients a clinician certified for home health once that file is imported, and on volume alone before", () => {
    const sql = jobByName("referral_sources")!.sql;
    // The certification columns are unknown (NULL), never 0, until the file is loaded; a clinician CMS does not list reads 0 after.
    expect(sql).toMatch(/cert_loaded AS \(SELECT EXISTS \(SELECT 1 FROM cert_rows\) AS loaded\)/);
    expect(sql).toMatch(/CASE WHEN \(SELECT loaded FROM cert_loaded\) THEN COALESCE\(ce\.hh_cert_benes, 0\) END AS hh_cert_benes/);
    expect(sql).toMatch(/CASE WHEN \(SELECT loaded FROM cert_loaded\) THEN COALESCE\(ce\.hospice_oversight_benes, 0\) END AS hospice_oversight_benes/);
    // Only the latest data year counts, and only the two codes behind the columns (G0180 certification, G0182 hospice oversight).
    expect(sql).toMatch(/cert_year AS \(SELECT max\(data_year\) AS y FROM cert_rows\)/);
    expect(sql).toMatch(/FROM cert_rows c\s+JOIN cert_year l ON l\.y = c\.data_year/);
    expect(sql).toContain("FILTER (WHERE c.hcpcs_code = 'G0180')");
    expect(sql).toContain("FILTER (WHERE c.hcpcs_code = 'G0182')");
    expect(jobByName("referral_sources")!.resultColumns).toEqual(expect.arrayContaining(["hh_cert_benes", "hospice_oversight_benes", "hh_cert_year"]));
  });

  it("rank on certifications only from an import that completed, never from a running or failed one", () => {
    // The importer commits page by page and marks the batch completed at the end, so rows are read through their batch.
    const sql = jobByName("referral_sources")!.sql;
    expect(sql).toMatch(/cert_rows AS \(\s+SELECT c\.npi, c\.hcpcs_code, c\.data_year, c\.benes\s+FROM cms_physician_certifications c\s+WHERE c\.import_batch_id IN \(SELECT id FROM import_batches WHERE import_type = 'physician_certifications' AND status = 'completed'\)\)/);
    // Nothing reads the table any other way: the loaded flag, the year and the sums all come through cert_rows.
    expect(sql.match(/FROM cms_physician_certifications/g)).toHaveLength(1);
  });

  it("carry the year of the certification file, which is not the physician file's year", () => {
    const job = jobByName("referral_sources")!;
    expect(job.sql).toMatch(/\(SELECT y FROM cert_year\) AS hh_cert_year/);
    expect(job.sql).toMatch(/hh_cert_benes, hospice_oversight_benes, hh_cert_year, hospice_index/);
    // 0022 appends the certification year after the two counts; 0023 appends the hospice rank after that.
    expect(job.resultColumns.slice(-5)).toEqual(["hh_cert_benes", "hospice_oversight_benes", "hh_cert_year", "hospice_index", "hospice_rank_in_county"]);
  });

  it("count the county's post-acute providers at each setting's own latest year", () => {
    const sql = jobByName("county_market_profile")!.sql;
    expect(sql).toMatch(/latest_pac AS \(SELECT setting, max\(data_year\) AS year FROM rollup_pac_market_share WHERE geo_level = 'county' GROUP BY setting\)/);
    expect(sql).toMatch(/JOIN latest_pac l ON l\.setting = p\.setting AND l\.year = p\.data_year/);
    expect(sql).toContain("'pac_utilization_by_setting', py.by_setting");
  });

  it("count only residential-care licenses as licensed personal care / assisted living supply", () => {
    // Nursing homes are counted from the CMS files (snf_facilities), and an adult day center or an unrecognized
    // license type is not a bed of residential care: all of them would inflate the metric's label.
    const sql = jobByName("county_market_profile")!.sql;
    expect(sql).toContain("license_type IN ('personal_care_home', 'assisted_living', 'memory_care', 'domiciliary_care')");
    expect(sql).not.toMatch(/nursing_home|adult_day/);
  });

  it("run as one INSERT … SELECT inside the swap transaction under the results timeout", async () => {
    const statements: string[] = [];
    const client = {
      async query(sql: string) {
        statements.push(sql);
        if (sql.startsWith("SELECT pg_try_advisory_lock")) return { rows: [{ ok: true }] };
        if (sql.startsWith("INSERT INTO rollup_pac_market_share")) return { rows: [], rowCount: 1234 };
        return { rows: [] };
      },
      release() {},
    };
    const pool = { connect: async () => client, query: client.query };
    const r = await runRollupJob(pool, jobByName("pac_market_share")!, { log() {}, warn() {} });
    expect(r).toMatchObject({ status: "success", rows_scanned: 1234, result_rows: 1234 });
    expect(statements).toContain("SET statement_timeout = '300s'");
    expect(statements.some((s) => s.startsWith("SELECT min(id)"))).toBe(false);
    const begin = statements.indexOf("BEGIN");
    expect(statements[begin + 1]).toBe("DELETE FROM rollup_pac_market_share");
    expect(statements[begin + 2]).toMatch(/^INSERT INTO rollup_pac_market_share \(setting, data_year, geo_level, geo_code, ccn, [\s\S]*WITH p AS/);
    expect(statements[begin + 3]).toMatch(/UPDATE rollup_runs SET status = 'success'/);
    expect(statements[begin + 4]).toBe("COMMIT");
    expect(statements.at(-1)).toMatch(/pg_advisory_unlock/);
  });

  it("roll back a failed query and record the failure", async () => {
    const statements: string[] = [];
    const client = {
      async query(sql: string) {
        statements.push(sql);
        if (sql.startsWith("SELECT pg_try_advisory_lock")) return { rows: [{ ok: true }] };
        if (sql.startsWith("INSERT INTO rollup_referral_sources")) throw new Error("relation cms_dme_by_referring does not exist");
        return { rows: [] };
      },
      release() {},
    };
    const r = await runRollupJob({ connect: async () => client }, jobByName("referral_sources")!, { log() {}, warn() {} });
    expect(r).toMatchObject({ status: "failed", error: expect.stringMatching(/cms_dme_by_referring/) });
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
  });

  it("show up in the rollup status with their labels", async () => {
    const status = await rollupStatus({ query: async () => ({ rows: [] }) });
    const profile = status.find((s: any) => s.job === "county_market_profile");
    expect(profile).toMatchObject({ label: "County market profile", status: "never_run" });
  });
});
