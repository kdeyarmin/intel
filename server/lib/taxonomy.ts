// NUCC taxonomy lookups: the description, grouping and display name for a
// taxonomy code. Read once from nucc_taxonomies (about 900 rows) and kept in
// memory; the NPPES file importer uses it to describe codes (the
// dissemination files carry codes only) and the UI to explain specialties.
import { nppesDescription, type TaxonomyRow } from "./nucc/parse";

export interface TaxonomyIndex {
  byCode: Map<string, TaxonomyRow>;
  version: string | null;
  /** NPPES-style description for a code; null when the code is unknown. */
  describe(code: string | null | undefined): string | null;
  /** Codes looked up that the code set doesn't contain (for import logs). */
  unknown: Set<string>;
}

const TTL_MS = 60 * 60 * 1000;
const STAMP_SQL = "SELECT vintage, loaded_at::text AS stamp FROM geo_meta WHERE key = 'nucc'";
let cache: { at: number; stamp: string | null; index: TaxonomyIndex } | null = null;
let loading: Promise<TaxonomyIndex> | null = null;
let generation = 0;

export function buildTaxonomyIndex(rows: TaxonomyRow[], version: string | null = null): TaxonomyIndex {
  const byCode = new Map(rows.map((r) => [r.code.toUpperCase(), r]));
  const unknown = new Set<string>();
  return {
    byCode,
    version,
    unknown,
    describe(code) {
      const c = (code || "").trim().toUpperCase();
      if (!c) return null;
      const row = byCode.get(c);
      if (row) return nppesDescription(row);
      if (byCode.size > 0 && unknown.size < 1000) unknown.add(c);
      return null;
    },
  };
}

async function loadIndex(pool: any): Promise<{ index: TaxonomyIndex; stamp: string | null }> {
  const meta = await pool.query(STAMP_SQL).catch(() => ({ rows: [] as any[] }));
  const { rows } = await pool.query(
    "SELECT code, grouping, classification, specialization, display_name, section, definition FROM nucc_taxonomies",
  ).catch(() => ({ rows: [] as TaxonomyRow[] }));
  return { index: buildTaxonomyIndex(rows, meta.rows[0]?.vintage ?? null), stamp: meta.rows[0]?.stamp ?? null };
}

/** The in-memory code set, loaded on first use. Empty (not an error) before the data is loaded. */
export async function getTaxonomyIndex(pool: any): Promise<TaxonomyIndex> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS && cache.index.byCode.size > 0) return cache.index;
  const gen = generation;
  loading ??= loadIndex(pool)
    .then(({ index, stamp }) => {
      if (gen === generation) cache = { at: Date.now(), stamp, index };
      return index;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

/** Forget the cached index, including one still loading (after a reload). */
export function resetTaxonomyCache() {
  cache = null;
  loading = null;
  generation += 1;
}
