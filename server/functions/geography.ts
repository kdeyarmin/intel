// getGeoCounties / getGeoStatus (public, read-only) and loadCensusGeography (admin).
import { pool } from "../db";
import { coordsFor, countiesForState, countyZctas, getGeoIndex, resetGeoCache, zipToCounty } from "../lib/geo";
import { loadCensusGeography } from "../lib/census/load";
import { normalizeStateFilter } from "../lib/providerSearch";

export async function handleGetGeoStatus() {
  // geo_meta alone isn't proof: a table emptied since the load would still
  // leave its row behind (the loader repairs that on its next run).
  const { rows } = await pool.query(
    `SELECT vintage, row_counts, loaded_at,
            EXISTS (SELECT 1 FROM geo_counties) AND EXISTS (SELECT 1 FROM geo_zctas) AND EXISTS (SELECT 1 FROM geo_zcta_counties) AS complete
       FROM geo_meta WHERE key = 'census'`,
  ).catch(() => ({ rows: [] as any[] }));
  const meta = rows[0];
  return meta?.complete
    ? { loaded: true, vintage: meta.vintage, counts: meta.row_counts, loaded_at: meta.loaded_at, source: "U.S. Census Bureau, 2020 Gazetteer and ZCTA-to-county relationship files" }
    : { loaded: false, message: "Census geography isn't loaded yet. It loads automatically at start-up, or an admin can run npm run geo:load." };
}

export async function handleGetGeoCounties(payload: any) {
  const state = normalizeStateFilter(payload?.state);
  if (!state) return { counties: [], message: "Pick a state." };
  const index = await getGeoIndex(pool);
  if (index.counties.size === 0) return { counties: [], notLoaded: true, message: "Census geography isn't loaded yet." };
  return {
    state,
    counties: countiesForState(index, state).map((c) => ({
      fips: c.fips,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      zcta_count: index.countyZctas.get(c.fips)?.length ?? 0,
    })),
    vintage: index.vintage,
  };
}

export async function handleLoadCensusGeography(payload: any) {
  const result = await loadCensusGeography(pool, { force: !!payload?.force, log: console });
  resetGeoCache();
  return { success: true, ...result };
}

const MAX_POINTS = 2000;

/**
 * Map positions for providers by ZIP (ZCTA centre, else ZIP3 area, else
 * state), with the same stable per-provider offset the territory map uses.
 */
export async function handleGetZipCoordinates(payload: any) {
  const points = (Array.isArray(payload?.points) ? payload.points : []).slice(0, MAX_POINTS);
  const index = await getGeoIndex(pool);
  if (index.zctas.size === 0) return { coords: {}, notLoaded: true };
  const coords: Record<string, { lat: number; lng: number; precision: string }> = {};
  for (const p of points) {
    const key = String(p?.key ?? "");
    if (!key) continue;
    const c = coordsFor(index, { zip: p?.zip ?? null, state: p?.state ?? null, key });
    if (c) coords[key] = c;
  }
  return { coords };
}

/** The county for a ZIP and how many practice locations it and its county have (from the ZIP rollup). */
export async function handleGetGeoContext(payload: any) {
  const zip5 = String(payload?.zip ?? "").replace(/\D/g, "").slice(0, 5);
  const index = await getGeoIndex(pool);
  if (index.counties.size === 0) return { notLoaded: true };
  const county = zip5.length === 5 ? zipToCounty(index, zip5) : null;
  if (!county) return { county: null };
  const zctas = countyZctas(index, county.fips, 0.5);
  const { rows } = await pool.query(
    `SELECT sum(practice_locations) FILTER (WHERE zip5 = ANY($1))::bigint AS county_n,
            sum(practice_locations) FILTER (WHERE zip5 = $2)::bigint AS zip_n
       FROM rollup_zip_locations WHERE zip5 = ANY($1) OR zip5 = $2`,
    [zctas, zip5],
  ).catch(() => ({ rows: [] as any[] }));
  return {
    county: { fips: county.fips, name: county.name, state: county.state },
    county_practice_locations: rows[0]?.county_n != null ? Number(rows[0].county_n) : null,
    zip_practice_locations: rows[0]?.zip_n != null ? Number(rows[0].zip_n) : null,
  };
}
