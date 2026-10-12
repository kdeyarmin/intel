// Loads the bundled NUCC taxonomy code set (server/data/nucc) into
// nucc_taxonomies. Checks the file against manifest.json first, replaces the
// table in one transaction, and does nothing when the same version is
// already loaded (unless forced). Modelled on server/lib/census/load.ts.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { parseBundledTaxonomy, TAXONOMY_COLUMNS, type TaxonomyRow } from "./parse";
import { resetTaxonomyCache } from "../taxonomy";

export const NUCC_DIR = path.resolve(import.meta.dirname, "..", "..", "data", "nucc");
export const NUCC_META_KEY = "nucc";
const BATCH = 500;

export interface NuccManifest {
  version: string;
  released: string;
  description: string;
  source: { url: string; sha256: string };
  outputs: Record<string, { file: string; sha256: string; rows: number }>;
  dataset_sha256: string;
}

export interface NuccBundle {
  manifest: NuccManifest;
  taxonomies: TaxonomyRow[];
}

export class NuccBundleError extends Error {}

/** Reads and verifies the bundle. Throws NuccBundleError on a missing or altered file. */
export function readNuccBundle(dir = NUCC_DIR): NuccBundle {
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new NuccBundleError(`No NUCC data at ${dir}`);
  const manifest: NuccManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const out = manifest.outputs.nucc_taxonomies;
  if (!out) throw new NuccBundleError("manifest.json has no entry for nucc_taxonomies");
  const gz = fs.readFileSync(path.join(dir, out.file));
  const sha = crypto.createHash("sha256").update(gz).digest("hex");
  if (sha !== out.sha256) throw new NuccBundleError(`${out.file} doesn't match manifest.json (sha256 ${sha})`);
  const taxonomies = parseBundledTaxonomy(zlib.gunzipSync(gz).toString("utf8"));
  if (taxonomies.length !== out.rows) throw new NuccBundleError(`${out.file} has ${taxonomies.length} rows; manifest.json says ${out.rows}`);
  return { manifest, taxonomies };
}

export interface NuccLoadResult {
  status: "loaded" | "unchanged";
  version: string;
  rows: number;
}

export async function loadNuccTaxonomies(pool: any, opts: { force?: boolean; dir?: string; log?: Pick<Console, "log"> } = {}): Promise<NuccLoadResult> {
  const bundle = readNuccBundle(opts.dir);
  const rows = bundle.taxonomies.length;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('nucc_taxonomy_load'))");
    const { rows: [meta] } = await client.query("SELECT dataset_sha256 FROM geo_meta WHERE key = $1", [NUCC_META_KEY]);
    const { rows: [filled] } = await client.query("SELECT EXISTS (SELECT 1 FROM nucc_taxonomies) AS ok");
    if (!opts.force && meta?.dataset_sha256 === bundle.manifest.dataset_sha256 && filled?.ok) {
      await client.query("COMMIT");
      return { status: "unchanged", version: bundle.manifest.version, rows };
    }
    await client.query("TRUNCATE nucc_taxonomies");
    const columns = [...TAXONOMY_COLUMNS, "version"];
    for (let i = 0; i < rows; i += BATCH) {
      const part = bundle.taxonomies.slice(i, i + BATCH);
      const values: unknown[] = [];
      const tuples = part.map((r, j) => {
        values.push(...TAXONOMY_COLUMNS.map((c) => r[c] || null), bundle.manifest.version);
        return `(${columns.map((_, k) => `$${j * columns.length + k + 1}`).join(", ")})`;
      });
      await client.query(`INSERT INTO nucc_taxonomies (${columns.join(", ")}) VALUES ${tuples.join(", ")}`, values);
    }
    await client.query(
      `INSERT INTO geo_meta (key, vintage, dataset_sha256, row_counts, loaded_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (key) DO UPDATE SET vintage = EXCLUDED.vintage, dataset_sha256 = EXCLUDED.dataset_sha256,
         row_counts = EXCLUDED.row_counts, loaded_at = now()`,
      [NUCC_META_KEY, bundle.manifest.version, bundle.manifest.dataset_sha256, JSON.stringify({ taxonomies: rows })],
    );
    await client.query("COMMIT");
    opts.log?.log(`[nucc] Loaded ${rows} taxonomy codes (version ${bundle.manifest.version})`);
    return { status: "loaded", version: bundle.manifest.version, rows };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Boot: load when the table is empty or the bundle changed. Never throws. */
export async function autoloadNuccTaxonomies(pool: any, log: Pick<Console, "log" | "warn"> = console) {
  if (process.env.GEO_AUTOLOAD === "false") return;
  try {
    const exists = await pool.query("SELECT to_regclass('nucc_taxonomies') AS t");
    if (!exists.rows[0]?.t) {
      log.warn("[nucc] nucc_taxonomies doesn't exist yet; run npm run db:migrate");
      return;
    }
    const result = await loadNuccTaxonomies(pool, { log });
    if (result.status === "loaded") resetTaxonomyCache();
  } catch (e: any) {
    log.warn("[nucc] Couldn't load the NUCC taxonomy:", e?.message || e);
  }
}
