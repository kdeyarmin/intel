// searchProviders and searchLocations: index-backed search for the directory
// pages, global search and (later) the assistant.
import { pool } from "../db";
import { withTimeoutClient, isStatementTimeout } from "../lib/pgClient";
import { getSearchCapabilities } from "../lib/searchCapabilities";
import {
  normalizeEntityFilter,
  normalizeStateFilter,
  runProviderSearch,
  searchBySpecialty,
} from "../lib/providerSearch";
import { buildLocationSearchPlan, clampLocationLimit, parseCityState, rankLocations } from "../lib/locationSearch";
import { US_STATE_CODES } from "../lib/usStates";
import { assertTerritory, isUnrestricted, TerritoryError, type EntitledUser } from "../lib/entitlements";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const TIMEOUT_MESSAGE = "That search took too long. Add more letters, a state, or search by NPI.";

async function guarded<T>(fn: (client: any) => Promise<T>): Promise<T> {
  try {
    return await withTimeoutClient(pool, "8s", fn);
  } catch (e: any) {
    if (isStatementTimeout(e)) throw new HttpError(503, TIMEOUT_MESSAGE);
    throw e;
  }
}

/**
 * A restricted plan may only search the places it covers: the search is
 * checked against the territory (like the market views), and without a state
 * to check a restricted plan gets nothing — otherwise a County Pack plan
 * could enumerate providers nationally.
 */
function assertSearchTerritory(user: EntitledUser | null | undefined, state: string | null) {
  assertTerritory(user, { state });
  if (!state && !isUnrestricted(user)) {
    throw new TerritoryError("Your plan covers specific places. Add a state to your search.");
  }
}

/** The state a location search is scoped to: the filter, a "City, ST" query, or a bare state code. */
function locationSearchState(payload: any): string | null {
  const explicit = normalizeStateFilter(payload?.state);
  if (explicit) return explicit;
  const q = String(payload?.q ?? "").trim();
  const cityState = parseCityState(q);
  if (cityState) return cityState.state;
  const bare = q.toUpperCase();
  return /^[A-Z]{2}$/.test(bare) && US_STATE_CODES.has(bare) ? bare : null;
}

export async function handleSearchProviders(payload: any, user?: EntitledUser | null) {
  const caps = await getSearchCapabilities(pool);
  const q = String(payload?.q ?? "");
  const state = normalizeStateFilter(payload?.state);
  assertSearchTerritory(user, state);
  if (q.trim().length < 2 && payload?.specialty_group) {
    const result = await guarded((client) => searchBySpecialty(client, { group: payload.specialty_group, state, entityType: normalizeEntityFilter(payload?.entity_type), limit: payload?.limit }));
    if (!result) throw new HttpError(400, "Unknown specialty.");
    return { ...result, mode: "specialty", degraded: !caps.primaryTaxonomy };
  }
  return guarded((client) => runProviderSearch(client, q, {
    limit: payload?.limit,
    entityType: normalizeEntityFilter(payload?.entity_type),
    state,
  }, caps));
}

export async function handleSearchLocations(payload: any, user?: EntitledUser | null) {
  assertSearchTerritory(user, locationSearchState(payload));
  const plan = buildLocationSearchPlan({
    q: payload?.q,
    state: payload?.state,
    locationType: payload?.location_type,
    limit: payload?.limit,
  });
  if (!plan) return { locations: [], truncated: false, interpretation: null, label: null };
  if ("needsState" in plan) return { locations: [], truncated: false, needsState: true, message: plan.message };
  const caps = await getSearchCapabilities(pool);
  const degraded = (plan.interpretation === "zip" && !caps.zip5) || (plan.interpretation === "city_state" && !caps.stateCity);
  const rows = await guarded(async (client) => (await client.query(plan.text, plan.values)).rows);
  const limit = clampLocationLimit(payload?.limit);
  return {
    locations: rankLocations(rows, String(payload?.q ?? "")).slice(0, limit),
    truncated: rows.length > limit,
    interpretation: plan.interpretation,
    label: plan.label,
    degraded,
  };
}
