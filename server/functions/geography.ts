// getGeoCounties / getGeoStatus (public, read-only) and loadCensusGeography (admin).
import { pool } from "../db";
import { countiesForState, getGeoIndex, resetGeoCache } from "../lib/geo";
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
