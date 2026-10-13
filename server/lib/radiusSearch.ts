import { getGeoIndex, type GeoIndex } from "./geo";
import { SEARCH_EXPR as E } from "./searchIndexes";
import { COLUMNS, clampSearchLimit, normalizeEntityFilter, runProviderSearch } from "./providerSearch";
import type { SearchCapabilities } from "./searchCapabilities";

export interface ZipRadius {
  zip: string;
  miles: number;
  distances: Map<string, number>;
  state: string | null;
}

function radiusError(status: number, message: string): never {
  throw Object.assign(new Error(message), { status });
}

export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function buildZipRadius(index: GeoIndex, zip: string, miles: number): ZipRadius {
  if (!index.zctas.size) radiusError(503, "ZIP geography is not loaded. Try again after geography has loaded.");
  const center = index.zctas.get(zip);
  if (!center) radiusError(400, "No ZIP-area centroid found for that ZIP code. Try a nearby ZIP code.");
  const distances = new Map<string, number>();
  for (const [zcta, point] of index.zctas) {
    const distance = haversineMiles(center, point);
    if (distance <= miles) distances.set(zcta, distance);
  }
  return { zip, miles, distances, state: center.state };
}

export async function resolveZipRadius(pool: any, payload: any): Promise<ZipRadius | null> {
  const zip = String(payload?.radius_zip ?? "").trim();
  if (!zip) {
    if (payload?.radius_miles != null && payload.radius_miles !== "") radiusError(400, "A ZIP code is required for radius search.");
    return null;
  }
  const miles = Number(payload?.radius_miles);
  if (!/^\d{5}$/.test(zip)) radiusError(400, "Enter a five-digit ZIP code.");
  if (![5, 10, 25, 50].includes(miles)) radiusError(400, "Choose a distance of 5, 10, 25, or 50 miles.");
  return buildZipRadius(await getGeoIndex(pool), zip, miles);
}

export function zipDistance(radius: ZipRadius, zip: unknown): number | null {
  return radius.distances.get(String(zip ?? "").slice(0, 5)) ?? null;
}

// Bound dense metro searches; the response explicitly reports when the sample is capped.
const LOCATION_CAP = 20_000;
const CHUNK_SIZE = 2000;

export async function runRadiusProviderSearch(client: any, q: string, options: { limit?: number; entityType?: unknown; state?: string | null }, caps: SearchCapabilities, radius: ZipRadius) {
  const values: unknown[] = [[...radius.distances.keys()]];
  const stateWhere = options.state ? " AND state = $2" : "";
  if (options.state) values.push(options.state);
  values.push(LOCATION_CAP + 1);
  const { rows: locations } = await client.query(
    `SELECT npi, location_type, address_1, city, state, zip FROM provider_locations
     WHERE ${E.zip5} = ANY($1)${stateWhere} LIMIT $${values.length}`, values,
  );
  const nearest = new Map<string, any>();
  for (const loc of locations.slice(0, LOCATION_CAP)) {
    const distance = zipDistance(radius, loc.zip);
    if (distance == null) continue;
    if (!nearest.has(loc.npi) || distance < nearest.get(loc.npi).distance_miles) {
      nearest.set(loc.npi, { ...loc, distance_miles: distance });
    }
  }
  const npis = [...nearest.keys()];
  const entity = normalizeEntityFilter(options.entityType);
  const found: any[] = [];
  let truncated = locations.length > LOCATION_CAP;
  let degraded = !caps.zip5;
  let mode = "radius";
  for (let i = 0; i < npis.length; i += CHUNK_SIZE) {
    const chunk = npis.slice(i, i + CHUNK_SIZE);
    if (q.trim().length >= 2) {
      const result = await runProviderSearch(client, q, { limit: 500, entityType: entity, npis: chunk }, caps);
      found.push(...result.providers);
      truncated ||= result.truncated;
      degraded ||= result.degraded;
      mode = result.mode;
    } else {
      const result = await client.query(
        `SELECT ${COLUMNS} FROM providers WHERE npi = ANY($1)${entity ? " AND entity_type = $2" : ""}`,
        [chunk, ...(entity ? [entity] : [])],
      );
      found.push(...result.rows);
    }
  }
  found.sort((a, b) => nearest.get(a.npi).distance_miles - nearest.get(b.npi).distance_miles || String(a.npi).localeCompare(String(b.npi)));
  const limit = clampSearchLimit(options.limit);
  return {
    providers: found.slice(0, limit).map((p) => ({ ...p, distance_miles: nearest.get(p.npi).distance_miles, radius_location: nearest.get(p.npi) })),
    truncated: truncated || found.length > limit,
    degraded,
    mode,
  };
}
