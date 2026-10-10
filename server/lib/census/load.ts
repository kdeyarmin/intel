// Loads the bundled Census geography (server/data/census) into the geo_*
// tables. Checks each file against manifest.json first, replaces all three
// tables in one transaction, and does nothing when the same dataset is
// already loaded (unless forced).
import crypto from "crypto";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { COUNTY_COLUMNS, fromCsv, ZCTA_COLUMNS, ZCTA_COUNTY_COLUMNS } from "./parse";

export const CENSUS_DIR = path.resolve(import.meta.dirname, "..", "..", "data", "census");
const META_KEY = "census";
const BATCH = 1000;

export interface CensusManifest {
  vintage: string;
  outputs: Record<string, { file: string; sha256: string; rows: number }>;
  dataset_sha256: string;
  inferred_counties?: number;
}

export interface CensusBundle {
  manifest: CensusManifest;
  counties: Array<Record<string, string>>;
  zctas: Array<Record<string, string>>;
  zctaCounties: Array<Record<string, string>>;
}

export class CensusBundleError extends Error {}

/** Reads and verifies the bundle. Throws CensusBundleError on a missing or altered file. */
export function readCensusBundle(dir = CENSUS_DIR): CensusBundle {
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new CensusBundleError(`No Census data at ${dir}`);
  const manifest: CensusManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const read = (name: string) => {
    const out = manifest.outputs[name];
    if (!out) throw new CensusBundleError(`manifest.json has no entry for ${name}`);
    const gz = fs.readFileSync(path.join(dir, out.file));
    const sha = crypto.createHash("sha256").update(gz).digest("hex");
    if (sha !== out.sha256) throw new CensusBundleError(`${out.file} doesn't match manifest.json (sha256 ${sha})`);
    const rows = fromCsv(zlib.gunzipSync(gz).toString("utf8"));
    if (rows.length !== out.rows) throw new CensusBundleError(`${out.file} has ${rows.length} rows; manifest.json says ${out.rows}`);
    return rows;
  };
  return { manifest, counties: read("geo_counties"), zctas: read("geo_zctas"), zctaCounties: read("geo_zcta_counties") };
}

const nullable = (v: string) => (v === "" ? null : v);
const float = (v: string) => (v === "" ? null : Number(v));

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

export interface LoadResult {
  status: "loaded" | "unchanged";
  vintage: string;
  counts: { counties: number; zctas: number; zcta_counties: number };
}

export async function loadCensusGeography(pool: any, opts: { force?: boolean; dir?: string; log?: Pick<Console, "log"> } = {}): Promise<LoadResult> {
  const bundle = readCensusBundle(opts.dir);
  const counts = { counties: bundle.counties.length, zctas: bundle.zctas.length, zcta_counties: bundle.zctaCounties.length };
  const client = await pool.connect();
  try {
    // One loader at a time: instances booting together wait here, then see the
    // first one's load and skip. The check runs under the lock, and also
    // reloads when the metadata matches but a table is empty.
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('census_geography_load'))");
    const { rows: [meta] } = await client.query("SELECT dataset_sha256 FROM geo_meta WHERE key = $1", [META_KEY]);
    const { rows: [filled] } = await client.query(
      `SELECT EXISTS (SELECT 1 FROM geo_counties) AND EXISTS (SELECT 1 FROM geo_zctas)
              AND EXISTS (SELECT 1 FROM geo_zcta_counties) AS ok`,
    );
    if (!opts.force && meta?.dataset_sha256 === bundle.manifest.dataset_sha256 && filled?.ok) {
      await client.query("COMMIT");
      return { status: "unchanged", vintage: bundle.manifest.vintage, counts };
    }
    await client.query("TRUNCATE geo_zcta_counties, geo_zctas, geo_counties");
    await insertBatches(client, "geo_counties", COUNTY_COLUMNS,
      bundle.counties.map((r) => [r.fips, r.state, r.name, Number(r.lat), Number(r.lng)]));
    await insertBatches(client, "geo_zctas", ZCTA_COLUMNS,
      bundle.zctas.map((r) => [r.zcta, Number(r.lat), Number(r.lng), float(r.land_sqmi), nullable(r.primary_county_fips), nullable(r.state)]));
    await insertBatches(client, "geo_zcta_counties", ZCTA_COUNTY_COLUMNS,
      bundle.zctaCounties.map((r) => [r.zcta, r.county_fips, Number(r.land_share)]));
    await client.query(
      `INSERT INTO geo_meta (key, vintage, dataset_sha256, row_counts, loaded_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (key) DO UPDATE SET vintage = EXCLUDED.vintage, dataset_sha256 = EXCLUDED.dataset_sha256,
         row_counts = EXCLUDED.row_counts, loaded_at = now()`,
      [META_KEY, bundle.manifest.vintage, bundle.manifest.dataset_sha256, JSON.stringify(counts)],
    );
    await client.query("COMMIT");
    opts.log?.log(`[census] Loaded ${counts.counties} counties, ${counts.zctas} ZCTAs, ${counts.zcta_counties} ZCTA-county pairs (${bundle.manifest.vintage})`);
    return { status: "loaded", vintage: bundle.manifest.vintage, counts };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Boot: load when the tables are empty or the bundle changed. Never throws. */
export async function autoloadCensusGeography(pool: any, log: Pick<Console, "log" | "warn"> = console) {
  if (process.env.GEO_AUTOLOAD === "false") return;
  try {
    const exists = await pool.query("SELECT to_regclass('geo_meta') AS t");
    if (!exists.rows[0]?.t) {
      log.warn("[census] geo tables don't exist yet; run npm run db:migrate");
      return;
    }
    await loadCensusGeography(pool, { log });
  } catch (e: any) {
    log.warn("[census] Couldn't load Census geography:", e?.message || e);
  }
}
