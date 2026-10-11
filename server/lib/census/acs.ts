// Census ACS 5-year demand data: population aged 65+ and 85+, median
// household income, median home value and people 65+ living alone, by
// county and ZIP area, from the Census Bureau's table-based summary files
// (no API key needed). The builder (scripts/census/build-acs.ts) filters the
// national files to counties and ZCTAs and writes compact bundles under
// server/data/census; the loader replaces census_acs_county and
// census_acs_zcta at boot. Pure parsing lives here so tests run from Node.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fromCsv } from "./parse";
import { CENSUS_DIR } from "./load";

export const ACS_META_KEY = "acs";
export const ACS_MANIFEST = "acs.manifest.json";
const BATCH = 1000;

/** The ACS variables each output column sums (E = estimate columns of the table-based files). */
export const ACS_VARIABLES: Record<string, string[]> = {
  // B01001 Sex by Age: total, male 65-66 … 85+, female 65-66 … 85+.
  pop_total: ["B01001_E001"],
  pop_65_plus: ["B01001_E020", "B01001_E021", "B01001_E022", "B01001_E023", "B01001_E024", "B01001_E025", "B01001_E044", "B01001_E045", "B01001_E046", "B01001_E047", "B01001_E048", "B01001_E049"],
  pop_85_plus: ["B01001_E025", "B01001_E049"],
  median_income: ["B19013_E001"],
  median_home_value: ["B25077_E001"],
  // B11007 Households by presence of people 65+: with one or more 65+, and one-person households 65+.
  hh_65_plus: ["B11007_E002"],
  living_alone_65_plus: ["B11007_E003"],
};
export const ACS_COLUMNS = Object.keys(ACS_VARIABLES);
export const ACS_COUNTY_COLUMNS = ["fips", ...ACS_COLUMNS];
export const ACS_ZCTA_COLUMNS = ["zcta", ...ACS_COLUMNS];

// GEO_ID prefixes in the 2024 table-based files: summary level 050 (county)
// and 860 (2020 ZIP Code Tabulation Area).
const COUNTY_PREFIX = "0500000US";
const ZCTA_PREFIX = "860Z200US";

export type AcsValues = Map<string, number | null>;

/**
 * Reads one table-based file (GEO_ID|B01001_E001|B01001_M001|…, pipe
 * separated) line by line and keeps the wanted estimate columns for
 * counties and ZCTAs. ACS marks suppressed or inapplicable cells with large
 * negative sentinels (-666666666, -999999999), kept here as null.
 */
export async function readAcsTable(lines: AsyncIterable<string> | Iterable<string>, wanted: string[]): Promise<{ counties: Map<string, AcsValues>; zctas: Map<string, AcsValues> }> {
  const counties = new Map<string, AcsValues>();
  const zctas = new Map<string, AcsValues>();
  let index: Map<string, number> | null = null;
  for await (const raw of lines as AsyncIterable<string>) {
    const line = raw.replace(/\r$/, "");
    if (!line) continue;
    if (!index) {
      const header = line.split("|");
      if (header[0] !== "GEO_ID") throw new Error(`ACS file must start with a GEO_ID column (got ${header[0]})`);
      index = new Map(header.map((h, i) => [h.trim(), i]));
      for (const w of wanted) if (!index.has(w)) throw new Error(`ACS file is missing the ${w} column`);
      continue;
    }
    let target: Map<string, AcsValues> | null = null;
    let key = "";
    if (line.startsWith(COUNTY_PREFIX)) {
      target = counties;
      key = line.slice(COUNTY_PREFIX.length, COUNTY_PREFIX.length + 5);
    } else if (line.startsWith(ZCTA_PREFIX)) {
      target = zctas;
      key = line.slice(ZCTA_PREFIX.length, ZCTA_PREFIX.length + 5);
    }
    if (!target || !/^\d{5}$/.test(key)) continue;
    const cells = line.split("|");
    const values: AcsValues = new Map();
    for (const w of wanted) {
      const cell = cells[index.get(w)!];
      const n = cell == null || cell === "" ? NaN : Number(cell);
      values.set(w, Number.isFinite(n) && n >= 0 ? n : null);
    }
    target.set(key, values);
  }
  if (!index) throw new Error("ACS file is empty");
  return { counties, zctas };
}

export type AcsRow = Record<string, number | string | null>;

/** Sums each output column's variables per geography; a geography with every variable missing gets null. */
export function buildAcsRows(tables: Array<Map<string, AcsValues>>, keyColumn: "fips" | "zcta"): AcsRow[] {
  const keys = new Set<string>();
  for (const t of tables) for (const k of t.keys()) keys.add(k);
  const rows: AcsRow[] = [];
  for (const key of [...keys].sort()) {
    const row: AcsRow = { [keyColumn]: key };
    for (const [column, vars] of Object.entries(ACS_VARIABLES)) {
      let sum: number | null = null;
      for (const v of vars) {
        for (const t of tables) {
          const val = t.get(key)?.get(v);
          if (val != null) sum = (sum ?? 0) + val;
        }
      }
      row[column] = sum;
    }
    rows.push(row);
  }
  return rows;
}

export interface AcsManifest {
  vintage: string;
  released: string;
  description: string;
  sources: Record<string, { url: string; sha256: string }>;
  outputs: Record<string, { file: string; sha256: string; rows: number }>;
  dataset_sha256: string;
}

export interface AcsBundle {
  manifest: AcsManifest;
  counties: Array<Record<string, string>>;
  zctas: Array<Record<string, string>>;
}

export class AcsBundleError extends Error {}

/** Reads and verifies the bundle. Throws AcsBundleError when it is missing or altered. */
export function readAcsBundle(dir = CENSUS_DIR): AcsBundle {
  const manifestPath = path.join(dir, ACS_MANIFEST);
  if (!fs.existsSync(manifestPath)) throw new AcsBundleError(`No ACS data at ${dir}`);
  const manifest: AcsManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const read = (name: string) => {
    const out = manifest.outputs[name];
    if (!out) throw new AcsBundleError(`${ACS_MANIFEST} has no entry for ${name}`);
    const gz = fs.readFileSync(path.join(dir, out.file));
    const sha = crypto.createHash("sha256").update(gz).digest("hex");
    if (sha !== out.sha256) throw new AcsBundleError(`${out.file} doesn't match ${ACS_MANIFEST} (sha256 ${sha})`);
    const rows = fromCsv(zlib.gunzipSync(gz).toString("utf8"));
    if (rows.length !== out.rows) throw new AcsBundleError(`${out.file} has ${rows.length} rows; ${ACS_MANIFEST} says ${out.rows}`);
    return rows;
  };
  return { manifest, counties: read("census_acs_county"), zctas: read("census_acs_zcta") };
}

export function hasAcsBundle(dir = CENSUS_DIR): boolean {
  return fs.existsSync(path.join(dir, ACS_MANIFEST));
}

const intOrNull = (v: string | undefined) => (v == null || v === "" ? null : Math.round(Number(v)));

async function insertBatches(client: any, table: string, columns: string[], rows: unknown[][]) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const part = rows.slice(i, i + BATCH);
    const values: unknown[] = [];
    const tuples = part.map((r, j) => {
      values.push(...r);
      return `(${columns.map((_, k) => `$${j * columns.length + k + 1}`).join(", ")})`;
    });
    await client.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")}`, values);
  }
}

export interface AcsLoadResult {
  status: "loaded" | "unchanged";
  vintage: string;
  counts: { counties: number; zctas: number };
}

export async function loadAcsDemographics(pool: any, opts: { force?: boolean; dir?: string; log?: Pick<Console, "log"> } = {}): Promise<AcsLoadResult> {
  const bundle = readAcsBundle(opts.dir);
  const counts = { counties: bundle.counties.length, zctas: bundle.zctas.length };
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('census_acs_load'))");
    const { rows: [meta] } = await client.query("SELECT dataset_sha256 FROM geo_meta WHERE key = $1", [ACS_META_KEY]);
    const { rows: [filled] } = await client.query("SELECT EXISTS (SELECT 1 FROM census_acs_county) AND EXISTS (SELECT 1 FROM census_acs_zcta) AS ok");
    if (!opts.force && meta?.dataset_sha256 === bundle.manifest.dataset_sha256 && filled?.ok) {
      await client.query("COMMIT");
      return { status: "unchanged", vintage: bundle.manifest.vintage, counts };
    }
    await client.query("TRUNCATE census_acs_zcta, census_acs_county");
    await insertBatches(client, "census_acs_county", ACS_COUNTY_COLUMNS, bundle.counties.map((r) => [r.fips, ...ACS_COLUMNS.map((c) => intOrNull(r[c]))]));
    await insertBatches(client, "census_acs_zcta", ACS_ZCTA_COLUMNS, bundle.zctas.map((r) => [r.zcta, ...ACS_COLUMNS.map((c) => intOrNull(r[c]))]));
    await client.query(
      `INSERT INTO geo_meta (key, vintage, dataset_sha256, row_counts, loaded_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (key) DO UPDATE SET vintage = EXCLUDED.vintage, dataset_sha256 = EXCLUDED.dataset_sha256,
         row_counts = EXCLUDED.row_counts, loaded_at = now()`,
      [ACS_META_KEY, bundle.manifest.vintage, bundle.manifest.dataset_sha256, JSON.stringify(counts)],
    );
    await client.query("COMMIT");
    opts.log?.log(`[acs] Loaded ${counts.counties} counties and ${counts.zctas} ZCTAs (ACS ${bundle.manifest.vintage})`);
    return { status: "loaded", vintage: bundle.manifest.vintage, counts };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Boot: load when the tables are empty or the bundle changed. Never throws; quiet when no bundle is shipped. */
export async function autoloadAcsDemographics(pool: any, log: Pick<Console, "log" | "warn"> = console) {
  if (process.env.GEO_AUTOLOAD === "false" || !hasAcsBundle()) return;
  try {
    const exists = await pool.query("SELECT to_regclass('census_acs_county') AS t");
    if (!exists.rows[0]?.t) {
      log.warn("[acs] census_acs_county doesn't exist yet; run npm run db:migrate");
      return;
    }
    await loadAcsDemographics(pool, { log });
  } catch (e: any) {
    log.warn("[acs] Couldn't load the ACS demographics:", e?.message || e);
  }
}
