// Which search indexes are ready. They're built at boot, CONCURRENTLY, and
// on the large tables that takes a while; until an index is valid, search
// avoids the query shape that depends on it (or says results may be slow).
import { SEARCH_INDEX_NAMES } from "./searchIndexes";

export interface SearchCapabilities {
  /** pg_trgm installed and the organization trigram index is valid: "contains" search. */
  trigram: boolean;
  lastName: boolean;
  orgPrefix: boolean;
  zip5: boolean;
  stateCity: boolean;
  primaryTaxonomy: boolean;
}

export const NO_CAPABILITIES: SearchCapabilities = {
  trigram: false,
  lastName: false,
  orgPrefix: false,
  zip5: false,
  stateCity: false,
  primaryTaxonomy: false,
};

const TTL_MS = 60_000;
let cached: { at: number; caps: SearchCapabilities } | null = null;

export function capabilitiesFrom(extensions: string[], validIndexes: string[]): SearchCapabilities {
  const valid = new Set(validIndexes);
  const N = SEARCH_INDEX_NAMES;
  return {
    trigram: extensions.includes("pg_trgm") && valid.has(N.orgTrigram),
    lastName: valid.has(N.lastName),
    orgPrefix: valid.has(N.orgPrefix),
    zip5: valid.has(N.zip5),
    stateCity: valid.has(N.stateCity),
    primaryTaxonomy: valid.has(N.primaryTaxonomy),
  };
}

export async function getSearchCapabilities(pool: any): Promise<SearchCapabilities> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.caps;
  try {
    const [ext, idx] = await Promise.all([
      pool.query("SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'"),
      pool.query(
        `SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
          WHERE c.relname = ANY($1) AND i.indisvalid AND i.indisready`,
        [Object.values(SEARCH_INDEX_NAMES)],
      ),
    ]);
    const caps = capabilitiesFrom(ext.rows.map((r: any) => r.extname), idx.rows.map((r: any) => r.relname));
    cached = { at: Date.now(), caps };
    return caps;
  } catch (e: any) {
    console.warn("[search] Couldn't read search capabilities:", e?.message || e);
    return NO_CAPABILITIES;
  }
}

/** Tests. */
export function resetSearchCapabilities() {
  cached = null;
}
