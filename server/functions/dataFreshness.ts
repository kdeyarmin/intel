// getDataFreshness (public, read-only): what data is loaded and how old it is.
// Datasets come from the version registry, analytics from rollup_runs and
// geography from geo_meta, so the footer, the dataset catalog and the Help
// page can all say the same thing.
import { pool } from "../db";
import { listDatasetVersions } from "../lib/datasetRegistry";
import { NUCC_META_KEY } from "../lib/nucc/load";
import { getCMSDatasetCatalog } from "./triggerImport";
import { handleGetRollupStatus } from "./rollups";
import { handleGetGeoStatus } from "./geography";

/** Which NUCC taxonomy code set is loaded (server/data/nucc). */
export async function getTaxonomyStatus() {
  const { rows } = await pool.query(
    `SELECT vintage, row_counts, loaded_at, EXISTS (SELECT 1 FROM nucc_taxonomies) AS complete FROM geo_meta WHERE key = $1`,
    [NUCC_META_KEY],
  ).catch(() => ({ rows: [] as any[] }));
  const meta = rows[0];
  return meta?.complete
    ? { loaded: true, version: meta.vintage, counts: meta.row_counts, loaded_at: meta.loaded_at, source: "NUCC Health Care Provider Taxonomy code set" }
    : { loaded: false, message: "The NUCC taxonomy isn't loaded yet. It loads automatically at start-up, or an admin can run npm run nucc:load." };
}

/** `includeNotes`: the import notes carry raw error text and file names, so only platform admins get them. */
export async function handleGetDataFreshness(opts: { includeNotes?: boolean } = {}) {
  const [rows, rollups, geography, taxonomy] = await Promise.all([
    listDatasetVersions().catch(() => []),
    handleGetRollupStatus().catch(() => ({ jobs: [] })),
    handleGetGeoStatus().catch(() => ({ loaded: false })),
    getTaxonomyStatus().catch(() => ({ loaded: false })),
  ]);
  const catalog = getCMSDatasetCatalog().datasets;
  const titles = new Map(catalog.map((d) => [d.id, d.title]));
  const known = new Set<string>();
  const datasets = rows.map((r) => {
    known.add(r.import_type);
    return {
      import_type: r.import_type,
      label: titles.get(r.import_type) || r.source_title || r.import_type,
      source: r.source,
      status: r.status,
      data_year: r.data_year,
      temporal_start: r.temporal_start,
      temporal_end: r.temporal_end,
      cadence: r.accrual_periodicity,
      catalog_modified: r.catalog_modified,
      catalog_checked_at: r.catalog_checked_at,
      imported_at: r.imported_at,
      row_count: r.row_count,
      notes: opts.includeNotes ? r.notes : null,
    };
  });
  for (const d of catalog) {
    if (!known.has(d.id) && d.available) {
      datasets.push({ import_type: d.id, label: d.title, source: null as any, status: "never_imported", data_year: null, temporal_start: null, temporal_end: null, cadence: null, catalog_modified: null, catalog_checked_at: null, imported_at: null, row_count: null, notes: null });
    }
  }
  datasets.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  return { datasets, rollups: (rollups as any).jobs || [], geography, taxonomy, generated_at: new Date().toISOString() };
}
