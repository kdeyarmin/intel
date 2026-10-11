// The dataset version registry (table dataset_versions): which version of
// each source dataset is loaded, and what the CMS catalogs say is current.
//
// - checkCmsCatalog (a maintenance worker) refreshes the catalog_* columns at
//   most once a day and marks datasets with a newer release update_available,
//   waking any `on_release` import schedule for them.
// - triggerImport asks resolveImportVersion for the newest version's endpoint
//   and data year, and records what it imported through markImportStarted /
//   markImportFinished.
// - getDataFreshness reads it all back for the UI.
import { db, pool } from "../db";
import { datasetVersions } from "../db/schema";
import { safeFetchStream } from "./safeFetch";
import {
  dataApiUrl,
  dataYearOf,
  indexCatalog,
  isNewer,
  parseDcatCatalog,
  parseProviderDataCatalog,
  providerDataUrl,
  resolveImportUrl,
  type CatalogEntry,
} from "./cmsCatalog";

export const DATA_JSON_URL = "https://data.cms.gov/data.json";
export const PROVIDER_DATA_ITEMS_URL = "https://data.cms.gov/provider-data/api/1/metastore/schemas/dataset/items";
/** The catalogs change at most daily; data.json is ~18 MB. */
export const CATALOG_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/**
 * After a failed fetch the next try waits this long. The daily throttle keys off the last
 * successful check, so without it every tick of a cron would download ~18 MB again while
 * CMS is down.
 */
export const CATALOG_RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000;
let lastFetchFailure: { at: number; message: string } | null = null;
/** For tests: forget a failed fetch. */
export function resetCatalogFetchBackoff() {
  lastFetchFailure = null;
}
const FETCH_TIMEOUT_MS = 120_000;

export type FetchJson = (url: string) => Promise<unknown>;

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await safeFetchStream(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return JSON.parse(await res.text());
  } finally {
    clearTimeout(timer);
  }
}

export interface CatalogRefreshResult {
  skipped?: string;
  checked: number;
  unresolved: string[];
  updates_available: string[];
  woken: number;
  errors: string[];
}

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Pure: the registry status a catalog check leaves a dataset in.
 * `importActive` says whether a batch of this type is really running; a
 * dataset still flagged "importing" without one is stale (an exit that never
 * reported, or a restart) and is judged on what was imported instead.
 */
export function nextStatus(
  existing: { status?: string | null; imported_modified?: Date | string | null; imported_at?: Date | string | null } | null | undefined,
  newest: Pick<CatalogEntry, "modified">,
  opts: { importActive?: boolean } = {},
): string {
  const importing = existing?.status === "importing";
  if (importing && opts.importActive !== false) return "importing";
  const everImported = !!existing?.imported_modified || !!existing?.imported_at;
  if (!everImported) return importing || existing?.status === "failed" ? "failed" : "never_imported";
  // Imported before the catalog was ever checked, so which release it was is
  // unknown: take the newest release (once) rather than call it current.
  if (!existing?.imported_modified) return newest.modified ? "update_available" : "current";
  return isNewer(newest.modified, existing.imported_modified) ? "update_available" : "current";
}

/**
 * Refresh catalog metadata for every import type in `urls`. Throttled to one
 * run per CATALOG_CHECK_INTERVAL_MS unless forced.
 */
export async function refreshCatalog(opts: { urls: Record<string, string>; now?: Date; force?: boolean; fetch?: FetchJson }): Promise<CatalogRefreshResult> {
  const now = opts.now ?? new Date();
  const fetcher = opts.fetch ?? fetchJson;
  const result: CatalogRefreshResult = { checked: 0, unresolved: [], updates_available: [], woken: 0, errors: [] };

  if (!opts.force) {
    const { rows } = await pool.query("SELECT max(catalog_checked_at) AS last FROM dataset_versions");
    const last = rows[0]?.last ? new Date(rows[0].last).getTime() : 0;
    if (last && now.getTime() - last < CATALOG_CHECK_INTERVAL_MS) {
      return { ...result, skipped: `checked ${Math.round((now.getTime() - last) / 60000)} minutes ago` };
    }
    if (lastFetchFailure && now.getTime() - lastFetchFailure.at < CATALOG_RETRY_AFTER_FAILURE_MS) {
      const minutes = Math.round((now.getTime() - lastFetchFailure.at) / 60000);
      // Still a failure for the worker to report, but without downloading anything.
      return { ...result, skipped: `the last catalog fetch failed ${minutes} minutes ago; trying again hourly`, errors: [`catalog fetch: ${lastFetchFailure.message}`] };
    }
  }

  let dcat: CatalogEntry[];
  let providerItems: CatalogEntry[];
  try {
    [dcat, providerItems] = await Promise.all([
      fetcher(DATA_JSON_URL).then((j) => parseDcatCatalog(j as { dataset?: unknown[] })),
      fetcher(PROVIDER_DATA_ITEMS_URL).then((j) => parseProviderDataCatalog(j as unknown[])),
    ]);
  } catch (e: any) {
    lastFetchFailure = { at: now.getTime(), message: String(e?.message || e).slice(0, 160) };
    throw e;
  }
  lastFetchFailure = null;
  const index = indexCatalog([...dcat, ...providerItems]);

  const types = Object.keys(opts.urls);
  const { rows: existingRows } = await pool.query("SELECT * FROM dataset_versions WHERE import_type = ANY($1)", [types]);
  const existing = new Map<string, any>(existingRows.map((r: any) => [r.import_type, r]));
  const { rows: activeRows } = await pool.query(
    "SELECT DISTINCT import_type FROM import_batches WHERE status IN ('validating', 'processing') AND import_type = ANY($1)",
    [types],
  );
  const importing = new Set<string>(activeRows.map((r: any) => r.import_type));

  for (const importType of types) {
    const resolved = resolveImportUrl(opts.urls[importType], index);
    const newest = resolved?.newest ?? resolved?.pinned ?? null;
    if (!resolved || !newest) {
      result.unresolved.push(importType);
      continue;
    }
    const row = existing.get(importType);
    const status = nextStatus(row, newest, { importActive: importing.has(importType) });
    try {
      await pool.query(
        `INSERT INTO dataset_versions (import_type, source, source_dataset_id, source_title, catalog_modified, catalog_issued,
           temporal_start, temporal_end, accrual_periodicity, catalog_checked_at, data_year, status, updated_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $10)
         ON CONFLICT (import_type) DO UPDATE SET
           source = EXCLUDED.source, source_dataset_id = EXCLUDED.source_dataset_id, source_title = EXCLUDED.source_title,
           catalog_modified = EXCLUDED.catalog_modified, catalog_issued = EXCLUDED.catalog_issued,
           temporal_start = EXCLUDED.temporal_start, temporal_end = EXCLUDED.temporal_end,
           accrual_periodicity = EXCLUDED.accrual_periodicity, catalog_checked_at = EXCLUDED.catalog_checked_at,
           data_year = CASE WHEN dataset_versions.imported_at IS NULL THEN EXCLUDED.data_year ELSE dataset_versions.data_year END,
           status = EXCLUDED.status, updated_date = EXCLUDED.updated_date`,
        [
          importType, newest.source, newest.datasetId, newest.family, toDate(newest.modified), toDate(newest.issued),
          newest.temporalStart, newest.temporalEnd, newest.accrualPeriodicity, now, dataYearOf(newest), status,
        ],
      );
      result.checked++;
      if (status === "update_available") result.updates_available.push(importType);
    } catch (e: any) {
      result.errors.push(`${importType}: ${String(e?.message || e).slice(0, 120)}`);
    }
  }

  if (result.updates_available.length) {
    const { rowCount } = await pool.query(
      `UPDATE import_schedule_configs SET next_run_at = $1, updated_date = $1
        WHERE schedule_frequency = 'on_release' AND import_type = ANY($2)
          AND is_active = true AND enabled = true
          AND last_run_status IS DISTINCT FROM 'running'
          AND (next_run_at IS NULL OR next_run_at > $1)`,
      [now, result.updates_available],
    );
    result.woken = rowCount || 0;
  }
  return result;
}

/** Record a source file (not from the CMS catalogs) as the version an import type loads. */
export async function recordSourceFile(importType: string, file: { source: string; title: string; periodStart?: string | null; periodEnd: string | null; modified?: Date | string | null }, now = new Date()): Promise<void> {
  await pool.query(
    `INSERT INTO dataset_versions (import_type, source, source_title, catalog_modified, temporal_start, temporal_end, catalog_checked_at, data_year, status, updated_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'never_imported', $7)
     ON CONFLICT (import_type) DO UPDATE SET source = EXCLUDED.source, source_title = EXCLUDED.source_title,
       catalog_modified = EXCLUDED.catalog_modified, temporal_start = EXCLUDED.temporal_start, temporal_end = EXCLUDED.temporal_end,
       catalog_checked_at = EXCLUDED.catalog_checked_at, updated_date = EXCLUDED.updated_date`,
    [importType, file.source, file.title, file.modified ? new Date(file.modified) : file.periodEnd ? new Date(file.periodEnd) : null,
      file.periodStart ?? null, file.periodEnd, now, file.periodEnd ? file.periodEnd.slice(0, 4) : null],
  );
}

export interface ImportVersion {
  source: string;
  dataUrl: string | null;
  dataYear: string | null;
  /** The last day the version covers (YYYY-MM-DD), the "as of" date for snapshot files. */
  temporalEnd: string | null;
  catalogModified: Date | null;
}

/** The newest known version of an import type's dataset, from the registry. */
export async function resolveImportVersion(importType: string): Promise<ImportVersion | null> {
  const { rows } = await pool.query(
    "SELECT source, source_dataset_id, data_year, temporal_start, temporal_end, catalog_modified, imported_modified FROM dataset_versions WHERE import_type = $1",
    [importType],
  );
  const row = rows[0];
  if (!row) return null;
  const id = row.source_dataset_id as string | null;
  const dataUrl = !id ? null : row.source === "cms_data_api" ? dataApiUrl(id) : row.source === "cms_provider_data" ? providerDataUrl(id) : null;
  const toDay = (v: unknown) => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null);
  const temporalEnd = toDay(row.temporal_end);
  const catalogModified = row.catalog_modified ? new Date(row.catalog_modified) : null;
  return {
    source: row.source,
    dataUrl,
    dataYear: importDataYear({ temporalStart: toDay(row.temporal_start), temporalEnd, loadedYear: row.data_year, catalogModified, importedModified: row.imported_modified }),
    temporalEnd,
    catalogModified,
  };
}

/**
 * Pure: the data year an import of the newest release is labelled with. The
 * release's own period decides it. The year already loaded is reused only when
 * the catalog doesn't say and nothing newer than what was imported exists (a
 * re-import of the same release); otherwise null, and the importer guesses.
 * (Reusing the loaded year for a newer release would stamp it with the old
 * year and overwrite that vintage's rows.)
 */
export function importDataYear(input: {
  temporalStart: string | null;
  temporalEnd: string | null;
  loadedYear: string | number | null | undefined;
  catalogModified: Date | string | null | undefined;
  importedModified: Date | string | null | undefined;
}): string | null {
  const fromPeriod = dataYearOf({ temporalEnd: input.temporalEnd, temporalStart: input.temporalStart });
  if (fromPeriod) return fromPeriod;
  const newerThanLoaded = isNewer(input.catalogModified, input.importedModified);
  return !newerThanLoaded && input.loadedYear ? String(input.loadedYear) : null;
}

export async function markImportStarted(importType: string, batchId: number, source: string, now = new Date()): Promise<void> {
  await pool.query(
    `INSERT INTO dataset_versions (import_type, source, status, imported_batch_id, updated_date)
     VALUES ($1, $2, 'importing', $3, $4)
     ON CONFLICT (import_type) DO UPDATE SET status = 'importing', imported_batch_id = EXCLUDED.imported_batch_id, updated_date = EXCLUDED.updated_date`,
    [importType, source, batchId, now],
  );
}

export async function markImportFinished(
  importType: string,
  opts: { batchId: number; ok: boolean; rowCount?: number | null; dataYear?: string | number | null; note?: string | null; now?: Date },
): Promise<void> {
  const now = opts.now ?? new Date();
  if (opts.ok) {
    await pool.query(
      `UPDATE dataset_versions SET status = 'current', imported_at = $2, imported_modified = catalog_modified,
         imported_batch_id = $3, row_count = $4, data_year = COALESCE($5, data_year), notes = $6, updated_date = $2
       WHERE import_type = $1`,
      [importType, now, opts.batchId, opts.rowCount ?? null, opts.dataYear != null ? String(opts.dataYear) : null, opts.note ?? null],
    );
  } else {
    await pool.query(
      `UPDATE dataset_versions SET status = 'failed', imported_batch_id = $2, notes = $3, updated_date = $4 WHERE import_type = $1`,
      [importType, opts.batchId, opts.note ?? null, now],
    );
  }
}

export async function listDatasetVersions() {
  return db.select().from(datasetVersions);
}
