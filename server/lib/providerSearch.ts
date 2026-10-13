// Provider search over the ~6M-row providers table. Each kind of match is its
// own index-backed query (NPI range, person last-name prefix, organization
// "contains" via pg_trgm or prefix), merged and ranked here. The builders are
// pure so they can be unit-tested; runProviderSearch does the database work.
import { SEARCH_EXPR as E } from "./searchIndexes";
import type { SearchCapabilities } from "./searchCapabilities";
import { SPECIALTY_GROUPS } from "./specialtyGroups";

export interface SqlQuery {
  text: string;
  values: unknown[];
}

export type EntityFilter = "Individual" | "Organization" | null;

export interface ProviderSearchOptions {
  limit?: number;
  entityType?: EntityFilter;
  /** Two-letter state; applied after matching, to a bounded candidate set. */
  state?: string | null;
  npis?: string[];
}

export interface SearchQuery extends SqlQuery {
  kind: "npi" | "person" | "org";
  /** Rows requested; a query that returns this many may have more. */
  cap: number;
}

export interface ProviderSearchPlan {
  queries: SearchQuery[];
  /** "contains": organization names match anywhere; "prefix": from the start. */
  mode: SearchMode;
  /** An index the query relies on is still building, so it may be slow. */
  degraded: boolean;
  term: string;
}

// The Providers and Organizations pages filter and sort these rows like entity
// rows: "Not searched" reads email_searched_at, "Last updated" updated_date.
export const COLUMNS = `id, npi, entity_type, first_name, last_name, organization_name,
       credential, status, email, email_confidence, email_validation_status,
       email_source, email_searched_at, phone, created_date, updated_date`;

const MAX_LIMIT = 500;
const ORG_CONTAINS_CANDIDATES = 200;
const STATE_CANDIDATES = 500;

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** How the term was matched: a name containing it, a name starting with it, or an NPI (or NPI prefix). */
export type SearchMode = "contains" | "prefix" | "npi";

export function normalizeQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function clampSearchLimit(limit: unknown): number {
  return Math.min(Math.max(Math.floor(Number(limit)) || 50, 1), MAX_LIMIT);
}

/**
 * [low, high) bounds covering every NPI that starts with `digits`, usable by a
 * plain btree under any collation (LIKE 'x%' needs pattern ops). high is null
 * when the prefix is all nines.
 */
export function npiPrefixRange(digits: string): { low: string; high: string | null } {
  let i = digits.length - 1;
  while (i >= 0 && digits[i] === "9") i -= 1;
  if (i < 0) return { low: digits, high: null };
  return { low: digits, high: digits.slice(0, i) + String(Number(digits[i]) + 1) };
}

export function normalizeEntityFilter(v: unknown): EntityFilter {
  return v === "Individual" || v === "Organization" ? v : null;
}

export function normalizeStateFilter(v: unknown): string | null {
  const s = String(v ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

export function buildProviderSearchPlan(rawQuery: string, options: ProviderSearchOptions, caps: SearchCapabilities): ProviderSearchPlan | null {
  const q = normalizeQuery(rawQuery);
  if (q.length < 2) return null;
  const limit = clampSearchLimit(options.limit);
  const entity = normalizeEntityFilter(options.entityType);
  // With a state filter, fetch more candidates so filtering still leaves enough.
  const cap = options.state ? Math.max(limit, STATE_CANDIDATES) : limit;
  const queries: SearchQuery[] = [];
  // The entity filter applies to every query, so a cap isn't spent on the
  // other kind (nothing guarantees an organization row has no last name).
  const entityWhere = (n: number) => (entity ? ` AND entity_type = $${n}` : "")
    + (options.npis ? ` AND npi = ANY($${n + (entity ? 1 : 0)})` : "");
  const entityValue: unknown[] = [...(entity ? [entity] : []), ...(options.npis ? [options.npis] : [])];

  const compact = q.replace(/[\s-]/g, "");
  if (/^\d{2,10}$/.test(compact)) {
    if (compact.length === 10) {
      queries.push({ kind: "npi", cap: 1, text: `SELECT ${COLUMNS} FROM providers WHERE npi = $1${entityWhere(2)} LIMIT 1`, values: [compact, ...entityValue] });
    } else {
      const { low, high } = npiPrefixRange(compact);
      queries.push(high
        ? { kind: "npi", cap, text: `SELECT ${COLUMNS} FROM providers WHERE npi >= $1 AND npi < $2${entityWhere(3)} ORDER BY npi LIMIT $${entityValue.length + 3}`, values: [low, high, ...entityValue, cap] }
        : { kind: "npi", cap, text: `SELECT ${COLUMNS} FROM providers WHERE npi >= $1${entityWhere(2)} ORDER BY npi LIMIT $${entityValue.length + 2}`, values: [low, ...entityValue, cap] });
    }
    return { queries, mode: "npi", degraded: false, term: compact };
  }

  const lower = q.toLowerCase();
  let degraded = false;

  if (entity !== "Organization") {
    const parts = lower.split(/\s*,\s*|\s+/).filter(Boolean);
    const person = (where: string, values: unknown[]) => queries.push({
      kind: "person",
      cap,
      text: `SELECT ${COLUMNS} FROM providers WHERE last_name IS NOT NULL AND ${where}${entityWhere(values.length + 1)} ORDER BY ${E.lastName} LIMIT $${values.length + entityValue.length + 1}`,
      values: [...values, ...entityValue, cap],
    });
    // The whole query as a last-name prefix ("smith", "de la cruz").
    person(`${E.lastName} LIKE $1`, [`${escapeLike(lower.replace(/,/g, ""))}%`]);
    if (parts.length >= 2) {
      const first = parts[0];
      const last = parts[parts.length - 1];
      // "John Smith" and "Smith John" / "Smith, John".
      person(`${E.lastName} LIKE $1 AND ${E.firstName} LIKE $2`, [`${escapeLike(last)}%`, `${escapeLike(first)}%`]);
      person(`${E.lastName} LIKE $1 AND ${E.firstName} LIKE $2`, [`${escapeLike(first)}%`, `${escapeLike(parts[1])}%`]);
    }
    if (!caps.lastName) degraded = true;
  }

  let mode: SearchMode = "prefix";
  if (entity !== "Individual") {
    // Names starting with the term, in order (the prefix index), so exact and
    // starts-with matches always reach the ranking.
    queries.push({
      kind: "org",
      cap,
      text: `SELECT ${COLUMNS} FROM providers WHERE organization_name IS NOT NULL AND ${E.orgName} LIKE $1${entityWhere(2)} ORDER BY ${E.orgName} LIMIT $${entityValue.length + 2}`,
      values: [`${escapeLike(lower)}%`, ...entityValue, cap],
    });
    if (!caps.orgPrefix) degraded = true;
    if (caps.trigram && lower.length >= 3) {
      // Then names containing it anywhere (the trigram index; unordered, capped).
      mode = "contains";
      const n = Math.max(cap, ORG_CONTAINS_CANDIDATES);
      queries.push({
        kind: "org",
        cap: n,
        text: `SELECT ${COLUMNS} FROM providers WHERE organization_name IS NOT NULL AND ${E.orgName} LIKE $1${entityWhere(2)} LIMIT $${entityValue.length + 2}`,
        values: [`%${escapeLike(lower)}%`, ...entityValue, n],
      });
    } else if (caps.trigramPending && lower.length >= 3) {
      // pg_trgm is installed but its index isn't ready, so "contains" matches
      // are skipped for now. (Without pg_trgm, prefix matching is the design.)
      degraded = true;
    }
  }

  return { queries, mode, degraded, term: lower };
}

function displayName(row: any): string {
  if (row.organization_name && !row.last_name) return row.organization_name;
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || row.organization_name || "";
}

/**
 * 0 exact, 1 starts with the term, 2 a word starts with it, 3 contains it,
 * 4 otherwise (e.g. matched "First Last" across columns).
 */
export function matchRank(row: any, term: string): number {
  const t = term.toLowerCase();
  const names = [displayName(row), row.organization_name, row.last_name, `${row.last_name || ""} ${row.first_name || ""}`]
    .filter(Boolean)
    .map((n: string) => n.toLowerCase());
  let best = 4;
  for (const n of names) {
    if (n === t) return 0;
    if (n.startsWith(t)) best = Math.min(best, 1);
    else if (n.split(/[\s,.\-/&]+/).some((w) => w.startsWith(t))) best = Math.min(best, 2);
    else if (n.includes(t)) best = Math.min(best, 3);
  }
  return best;
}

/** Merges query results: NPI matches first, then by match quality, shorter names, then name. */
export function mergeResults(results: Array<{ query: SearchQuery; rows: any[] }>, term: string): { rows: any[]; truncated: boolean } {
  const seen = new Map<string, { row: any; npiMatch: boolean }>();
  let truncated = false;
  for (const { query, rows } of results) {
    if (rows.length >= query.cap && query.cap > 1) truncated = true;
    for (const row of rows) {
      const key = row.npi || `id:${row.id}`;
      if (!seen.has(key)) seen.set(key, { row, npiMatch: query.kind === "npi" });
    }
  }
  const ranked = [...seen.values()].sort((a, b) => {
    if (a.npiMatch !== b.npiMatch) return a.npiMatch ? -1 : 1;
    if (a.npiMatch) return String(a.row.npi).localeCompare(String(b.row.npi));
    const ra = matchRank(a.row, term);
    const rb = matchRank(b.row, term);
    if (ra !== rb) return ra - rb;
    const na = displayName(a.row);
    const nb = displayName(b.row);
    return na.length - nb.length || na.localeCompare(nb);
  });
  return { rows: ranked.map((x) => x.row), truncated };
}

/** NPIs (from `npis`) with a location in `state`. Bounded by the NPI list. */
export const STATE_FILTER_SQL = "SELECT DISTINCT npi FROM provider_locations WHERE npi = ANY($1) AND state = $2";
/** The same, counting only practice locations (a mailing address there doesn't count). */
export const PRACTICE_STATE_FILTER_SQL = "SELECT DISTINCT npi FROM provider_locations WHERE npi = ANY($1) AND state = $2 AND location_type = 'Practice'";
/** The NPIs among $1 with a practice location in one of the ZIP areas $2 (a plan that covers some counties of a state). */
export const PRACTICE_ZIP_FILTER_SQL = "SELECT DISTINCT npi FROM provider_locations WHERE npi = ANY($1) AND location_type = 'Practice' AND left(zip, 5) = ANY($2)";
export const ENTITY_FILTER_SQL = "SELECT npi FROM providers WHERE npi = ANY($1) AND entity_type = $2";

export interface ProviderSearchResult {
  providers: any[];
  truncated: boolean;
  mode: SearchMode;
  degraded: boolean;
}

/** Runs a plan on one connection (the caller sets the statement timeout). */
export async function runProviderSearch(client: any, rawQuery: string, options: ProviderSearchOptions, caps: SearchCapabilities): Promise<ProviderSearchResult> {
  const plan = buildProviderSearchPlan(rawQuery, options, caps);
  if (!plan) return { providers: [], truncated: false, mode: caps.trigram ? "contains" : "prefix", degraded: false };
  const results = [];
  for (const query of plan.queries) {
    const { rows } = await client.query(query.text, query.values);
    results.push({ query, rows });
  }
  const merged = mergeResults(results, plan.term);
  let rows = merged.rows;
  const state = normalizeStateFilter(options.state);
  if (state && rows.length) {
    const { rows: inState } = await client.query(STATE_FILTER_SQL, [rows.map((r) => r.npi).filter(Boolean), state]);
    const keep = new Set(inState.map((r: any) => r.npi));
    rows = rows.filter((r) => keep.has(r.npi));
  }
  const limit = clampSearchLimit(options.limit);
  return {
    providers: rows.slice(0, limit),
    truncated: merged.truncated || rows.length > limit,
    mode: plan.mode,
    degraded: plan.degraded,
  };
}

// ─── By specialty ────────────────────────────────────────────────────────────

const SPECIALTY_CHUNK = 2000;
const SPECIALTY_CANDIDATES = 20_000;

/** LIKE patterns for a specialty group's NUCC code prefixes, or one exact code. */
export function specialtyPatterns(input: { group?: string | null; taxonomyCode?: string | null }): string[] | null {
  if (input.taxonomyCode && /^[0-9A-Z]{10}$/i.test(input.taxonomyCode)) return [input.taxonomyCode.toUpperCase()];
  const group = SPECIALTY_GROUPS.find((g) => g.key === input.group);
  return group ? group.codes.map((c) => (c.length === 10 ? c : `${c}%`)) : null;
}

/**
 * Providers whose primary taxonomy is in a specialty group, optionally in a
 * state. Reads a bounded candidate set from the taxonomy index (no sort, no
 * join), then checks the state in chunks. `truncated` means more may exist.
 * Any location in the state counts, unless `practiceOnly` asks for a practice
 * location there (as the territory map does).
 */
export async function searchBySpecialty(
  client: any,
  input: { group?: string | null; taxonomyCode?: string | null; state?: string | null; entityType?: string | null; limit?: number; practiceOnly?: boolean; zips?: string[] | null },
): Promise<{ providers: any[]; truncated: boolean; scanned: number } | null> {
  const patterns = specialtyPatterns(input);
  if (!patterns) return null;
  const limit = clampSearchLimit(input.limit);
  const state = normalizeStateFilter(input.state);
  const entity = normalizeEntityFilter(input.entityType);
  // `zips` narrows to practice locations in those ZIP areas (a county pack's counties), whatever the state.
  const zips = input.zips ?? null;
  const filtered = !!(state || entity || zips);
  const where = patterns.map((_, i) => `taxonomy_code LIKE $${i + 1}`).join(" OR ");
  const { rows: candidates } = await client.query(
    `SELECT npi, taxonomy_code, taxonomy_description FROM provider_taxonomies
      WHERE is_primary = true AND (${where}) LIMIT $${patterns.length + 1}`,
    [...patterns, filtered ? SPECIALTY_CANDIDATES : limit + 1],
  );
  const found: Array<{ npi: string; taxonomy_code: string; taxonomy_description: string }> = [];
  let scanned = 0;
  // The state and entity filters apply while choosing, before the limit, so
  // the sample is filled with providers that actually match.
  for (let i = 0; i < candidates.length && found.length <= limit; i += SPECIALTY_CHUNK) {
    let chunk = candidates.slice(i, i + SPECIALTY_CHUNK);
    scanned += chunk.length;
    if (zips) {
      const { rows: inZips } = await client.query(PRACTICE_ZIP_FILTER_SQL, [chunk.map((r: any) => r.npi), zips]);
      const keep = new Set(inZips.map((r: any) => r.npi));
      chunk = chunk.filter((r: any) => keep.has(r.npi));
    } else if (state) {
      const { rows: inState } = await client.query(input.practiceOnly ? PRACTICE_STATE_FILTER_SQL : STATE_FILTER_SQL, [chunk.map((r: any) => r.npi), state]);
      const keep = new Set(inState.map((r: any) => r.npi));
      chunk = chunk.filter((r: any) => keep.has(r.npi));
    }
    if (entity && chunk.length) {
      const { rows: ofKind } = await client.query(ENTITY_FILTER_SQL, [chunk.map((r: any) => r.npi), entity]);
      const keep = new Set(ofKind.map((r: any) => r.npi));
      chunk = chunk.filter((r: any) => keep.has(r.npi));
    }
    found.push(...chunk);
  }
  const capped = candidates.length >= (filtered ? SPECIALTY_CANDIDATES : limit + 1);
  const chosen = found.slice(0, limit);
  const tax = new Map(chosen.map((t) => [t.npi, t]));
  const { rows: providers } = chosen.length
    ? await client.query(`SELECT ${COLUMNS} FROM providers WHERE npi = ANY($1)`, [chosen.map((t) => t.npi)])
    : { rows: [] };
  return {
    providers: providers.map((p: any) => ({ ...p, taxonomy_code: tax.get(p.npi)?.taxonomy_code, specialty: tax.get(p.npi)?.taxonomy_description })),
    truncated: found.length > limit || (capped && found.length < limit),
    scanned,
  };
}
