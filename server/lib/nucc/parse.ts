// Parser for the NUCC Health Care Provider Taxonomy code set (the CSV
// published at nucc.org twice a year) and for the compact CSV we bundle
// from it (server/data/nucc). Pure: used by the builder script, the loader
// and tests.
import { fromCsv } from "../census/parse";

export interface TaxonomyRow {
  code: string;
  grouping: string;
  classification: string;
  specialization: string;
  display_name: string;
  /** "Individual" or "Non-Individual" (NUCC's "Section" column). */
  section: string;
  definition: string;
}

export const TAXONOMY_COLUMNS = ["code", "grouping", "classification", "specialization", "display_name", "section", "definition"] as const;

// NUCC headers as published ("Display Name"); matched case-insensitively.
const SOURCE_COLUMNS: Record<keyof TaxonomyRow, string> = {
  code: "code",
  grouping: "grouping",
  classification: "classification",
  specialization: "specialization",
  display_name: "display name",
  section: "section",
  definition: "definition",
};

const CODE = /^[0-9A-Z]{9}X$/;

/**
 * nucc_taxonomy_NNN.csv → rows. Codes are ten characters ending in X; a row
 * without one (a note, a blank line) is dropped. The Notes column (change
 * history) isn't kept.
 */
export function parseNuccTaxonomy(text: string): TaxonomyRow[] {
  const rows = fromCsv(text);
  if (rows.length === 0) return [];
  const lookup = new Map(Object.keys(rows[0]).map((k) => [k.trim().toLowerCase(), k]));
  const col = (name: keyof TaxonomyRow) => {
    const key = lookup.get(SOURCE_COLUMNS[name]);
    if (!key) throw new Error(`NUCC file is missing the ${SOURCE_COLUMNS[name]} column`);
    return key;
  };
  const keys = Object.fromEntries(TAXONOMY_COLUMNS.map((c) => [c, col(c)])) as Record<keyof TaxonomyRow, string>;
  const out: TaxonomyRow[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const code = (r[keys.code] || "").trim().toUpperCase();
    if (!CODE.test(code) || seen.has(code)) continue;
    seen.add(code);
    out.push({
      code,
      grouping: (r[keys.grouping] || "").trim(),
      classification: (r[keys.classification] || "").trim(),
      specialization: (r[keys.specialization] || "").trim(),
      display_name: (r[keys.display_name] || "").trim(),
      section: (r[keys.section] || "").trim(),
      definition: (r[keys.definition] || "").replace(/\s+/g, " ").trim(),
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

/** The bundled CSV (same columns, already clean). */
export function parseBundledTaxonomy(text: string): TaxonomyRow[] {
  return fromCsv(text).map((r) => ({
    code: r.code,
    grouping: r.grouping,
    classification: r.classification,
    specialization: r.specialization,
    display_name: r.display_name,
    section: r.section,
    definition: r.definition,
  }));
}

/**
 * NPPES-style description for a code: "Classification, Specialization"
 * ("Internal Medicine, Cardiovascular Disease"), or the classification alone.
 * This is the wording the crawler stores from the NPI Registry API, so
 * file-imported taxonomies read the same as crawled ones.
 */
export function nppesDescription(row: Pick<TaxonomyRow, "classification" | "specialization">): string {
  return row.specialization ? `${row.classification}, ${row.specialization}` : row.classification;
}
