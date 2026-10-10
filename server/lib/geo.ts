// Census geography lookups: counties for a state, a county's ZCTAs, the
// county for a ZIP, and map coordinates for a provider. Read once from the
// geo_* tables and kept in memory (≈33k ZCTAs, ≈3.2k counties).
//
// ZIP codes and ZCTAs aren't the same thing: most 5-digit ZIPs have a ZCTA of
// the same code, but PO-box and single-building ZIPs often don't. Those fall
// back to the ZIP3 area's centre, then the state's.

export interface County {
  fips: string;
  state: string;
  name: string;
  lat: number;
  lng: number;
}

export interface GeoIndex {
  counties: Map<string, County>;
  countiesByState: Map<string, County[]>;
  zctas: Map<string, { lat: number; lng: number; county: string | null; state: string | null }>;
  /** ZCTA → [county, share of the ZCTA's land]. */
  zctaCounties: Map<string, Array<{ county: string; share: number }>>;
  /** County → ZCTAs with any land in it, and that ZCTA's share there. */
  countyZctas: Map<string, Array<{ zcta: string; share: number }>>;
  zip3: Map<string, { lat: number; lng: number }>;
  stateCenters: Map<string, { lat: number; lng: number }>;
  vintage: string | null;
}

export type CoordPrecision = "zcta" | "zip3" | "state";

const TTL_MS = 60 * 60 * 1000;
let cache: { at: number; index: GeoIndex } | null = null;
let loading: Promise<GeoIndex> | null = null;

function mean(points: Array<{ lat: number; lng: number }>) {
  const n = points.length || 1;
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / n,
    lng: points.reduce((s, p) => s + p.lng, 0) / n,
  };
}

export function buildGeoIndex(rows: {
  counties: County[];
  zctas: Array<{ zcta: string; lat: number; lng: number; primary_county_fips: string | null; state: string | null }>;
  zctaCounties: Array<{ zcta: string; county_fips: string; land_share: number }>;
  vintage?: string | null;
}): GeoIndex {
  const counties = new Map(rows.counties.map((c) => [c.fips, { ...c, lat: Number(c.lat), lng: Number(c.lng) }]));
  const countiesByState = new Map<string, County[]>();
  for (const c of counties.values()) {
    const list = countiesByState.get(c.state) || [];
    list.push(c);
    countiesByState.set(c.state, list);
  }
  for (const list of countiesByState.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  const zctas = new Map(rows.zctas.map((z) => [z.zcta, { lat: Number(z.lat), lng: Number(z.lng), county: z.primary_county_fips, state: z.state }]));
  const zctaCounties = new Map<string, Array<{ county: string; share: number }>>();
  const countyZctas = new Map<string, Array<{ zcta: string; share: number }>>();
  for (const r of rows.zctaCounties) {
    const share = Number(r.land_share);
    (zctaCounties.get(r.zcta) || zctaCounties.set(r.zcta, []).get(r.zcta)!).push({ county: r.county_fips, share });
    (countyZctas.get(r.county_fips) || countyZctas.set(r.county_fips, []).get(r.county_fips)!).push({ zcta: r.zcta, share });
  }
  // A ZCTA known only by its main county (no relationship rows) still belongs to that county.
  for (const [zcta, z] of zctas) {
    if (z.county && !zctaCounties.has(zcta)) {
      zctaCounties.set(zcta, [{ county: z.county, share: 1 }]);
      (countyZctas.get(z.county) || countyZctas.set(z.county, []).get(z.county)!).push({ zcta, share: 1 });
    }
  }

  const byZip3 = new Map<string, Array<{ lat: number; lng: number }>>();
  const byState = new Map<string, Array<{ lat: number; lng: number }>>();
  for (const [zcta, z] of zctas) {
    (byZip3.get(zcta.slice(0, 3)) || byZip3.set(zcta.slice(0, 3), []).get(zcta.slice(0, 3))!).push(z);
    if (z.state) (byState.get(z.state) || byState.set(z.state, []).get(z.state)!).push(z);
  }
  const zip3 = new Map([...byZip3].map(([k, v]) => [k, mean(v)]));
  const stateCenters = new Map([...byState].map(([k, v]) => [k, mean(v)]));
  return { counties, countiesByState, zctas, zctaCounties, countyZctas, zip3, stateCenters, vintage: rows.vintage ?? null };
}

async function loadIndex(pool: any): Promise<GeoIndex> {
  const [counties, zctas, rels, meta] = await Promise.all([
    pool.query("SELECT fips, state, name, lat, lng FROM geo_counties"),
    pool.query("SELECT zcta, lat, lng, primary_county_fips, state FROM geo_zctas"),
    pool.query("SELECT zcta, county_fips, land_share FROM geo_zcta_counties"),
    pool.query("SELECT vintage FROM geo_meta WHERE key = 'census'"),
  ]);
  return buildGeoIndex({ counties: counties.rows, zctas: zctas.rows, zctaCounties: rels.rows, vintage: meta.rows[0]?.vintage ?? null });
}

/** The in-memory geography, loaded on first use. Empty (not an error) before the data is loaded. */
export async function getGeoIndex(pool: any): Promise<GeoIndex> {
  if (cache && Date.now() - cache.at < TTL_MS && cache.index.counties.size > 0) return cache.index;
  loading ??= loadIndex(pool)
    .then((index) => {
      cache = { at: Date.now(), index };
      return index;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

export function resetGeoCache() {
  cache = null;
}

export function countiesForState(index: GeoIndex, state: string): County[] {
  return index.countiesByState.get(state.toUpperCase()) || [];
}

const COUNTY_SUFFIX = /\s+(county|parish|borough|census area|city and borough|municipality|municipio|city)$/i;
const normalizeCountyName = (s: string) => s.trim().toLowerCase().replace(/^st\.?\s/, "saint ").replace(COUNTY_SUFFIX, "").replace(/\s+/g, " ");

/** A county by FIPS, or by state + name ("Allegheny", "Allegheny County", "St. Louis city"). */
export function resolveCounty(index: GeoIndex, input: { fips?: string | null; state?: string | null; name?: string | null }): County | null {
  if (input.fips && /^\d{5}$/.test(input.fips)) return index.counties.get(input.fips) || null;
  if (!input.state || !input.name) return null;
  const list = countiesForState(index, input.state);
  const exact = list.find((c) => c.name.toLowerCase() === input.name!.trim().toLowerCase());
  if (exact) return exact;
  const wanted = normalizeCountyName(input.name);
  const matches = list.filter((c) => normalizeCountyName(c.name) === wanted);
  // "Baltimore" matches both Baltimore County and Baltimore city; prefer the county.
  return matches.find((c) => / county$/i.test(c.name)) || matches[0] || null;
}

/** ZCTAs with at least `minShare` of their land in the county. */
export function countyZctas(index: GeoIndex, fips: string, minShare = 0): string[] {
  return (index.countyZctas.get(fips) || []).filter((z) => z.share >= minShare).map((z) => z.zcta).sort();
}

/** The county a ZIP's ZCTA mostly lies in. */
export function zipToCounty(index: GeoIndex, zip: string | null | undefined): County | null {
  const zip5 = String(zip || "").slice(0, 5);
  const z = index.zctas.get(zip5);
  return z?.county ? index.counties.get(z.county) || null : null;
}

/** Stable pseudo-random value in [-1, 1) for a key (FNV-1a). */
export function jitterUnit(key: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

const JITTER_DEG: Record<CoordPrecision, number> = { zcta: 0.006, zip3: 0.05, state: 0.4 };

/**
 * Where to draw a provider: its ZCTA centre, else its ZIP3 area, else its
 * state, plus a small offset derived from `key` (e.g. the NPI) so providers
 * in the same ZIP don't stack and markers stay put between loads.
 */
export function coordsFor(index: GeoIndex, input: { zip?: string | null; state?: string | null; key: string }): { lat: number; lng: number; precision: CoordPrecision } | null {
  const zip = String(input.zip || "").replace(/\D/g, "");
  let base: { lat: number; lng: number } | undefined;
  let precision: CoordPrecision = "zcta";
  if (zip.length >= 5) base = index.zctas.get(zip.slice(0, 5));
  if (!base && zip.length >= 3) {
    base = index.zip3.get(zip.slice(0, 3));
    precision = "zip3";
  }
  if (!base && input.state) {
    base = index.stateCenters.get(input.state.toUpperCase());
    precision = "state";
  }
  if (!base) return null;
  const d = JITTER_DEG[precision];
  return {
    lat: Math.round((base.lat + jitterUnit(input.key, 1) * d) * 1e5) / 1e5,
    lng: Math.round((base.lng + jitterUnit(input.key, 2) * d * 1.3) * 1e5) / 1e5,
    precision,
  };
}
