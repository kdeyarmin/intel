// getTerritoryData: a bounded, labelled sample of providers for the territory
// map, with real scores, Census-based positions and counties, and county
// density from the ZIP rollup. Index-backed IN queries only.
import { pool } from "../db";
import { withTimeoutClient, isStatementTimeout } from "../lib/pgClient";
import { coordsFor, getGeoIndex, zipToCounty } from "../lib/geo";
import { normalizeEntityType, specialtyGroupFor, specialtyGroupLabel } from "../lib/specialtyGroups";
import { assertTerritory, isUnrestricted, TerritoryError, type EntitledUser } from "../lib/entitlements";
import { ENTITY_FILTER_SQL, PRACTICE_STATE_FILTER_SQL, normalizeStateFilter, searchBySpecialty } from "../lib/providerSearch";
import { countyDensity, pickScore, providerName, stateCountsFromStats, utilizationByNpi } from "../lib/territory";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;
// Lead scores are walked in score order, a page at a time, until the state's
// sample is full; at most this many are read per request.
const SCORED_PAGE = 5000;
const SCORED_SCAN_MAX = 100_000;
const STATES_TTL_MS = 60 * 60 * 1000;
const RESULT_TTL_MS = 5 * 60 * 1000;

let statesCache: { at: number; states: Array<{ state: string; approx: number | null }> } | null = null;
const resultCache = new Map<string, { at: number; body: any }>();

/** The practice address (in the chosen state when there is one), else any address. */
function practiceLocation(locs: any[], state: string | null) {
  return locs.find((l) => l.location_type === "Practice" && (!state || l.state === state))
    || locs.find((l) => l.location_type === "Practice")
    || locs[0]
    || null;
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function availableStates(client: any) {
  if (statesCache && Date.now() - statesCache.at < STATES_TTL_MS) return statesCache.states;
  const [{ rows: [stats] }, { rows: [est] }] = await Promise.all([
    client.query("SELECT most_common_vals::text AS most_common_vals, most_common_freqs::text AS most_common_freqs FROM pg_stats WHERE tablename = 'provider_locations' AND attname = 'state' LIMIT 1"),
    client.query("SELECT reltuples::bigint AS n FROM pg_class WHERE relname = 'provider_locations'"),
  ]);
  const states = stateCountsFromStats(stats || null, Number(est?.n) || 0);
  statesCache = { at: Date.now(), states };
  return states;
}

/** The NPIs among `npis` of the given entity type (all of them when there's no filter). */
async function ofEntity(client: any, npis: string[], entity: string | null): Promise<Set<string>> {
  if (!entity || npis.length === 0) return new Set(npis);
  const { rows } = await client.query(ENTITY_FILTER_SQL, [npis, entity]);
  return new Set(rows.map((r: any) => r.npi));
}

/**
 * Highest lead scores first (in the state), then other practice locations in
 * the state. Scores are read in order a page at a time (idx_lead_scores_score_id)
 * and checked against the state and entity type, until the sample is full.
 */
async function chooseNpis(client: any, state: string | null, limit: number, entity: string | null = null): Promise<{ npis: string[]; scoredFirst: number }> {
  const top: string[] = [];
  const seen = new Set<string>();
  let after: { score: number; id: number } | null = null;
  for (let scanned = 0; top.length < limit && scanned < SCORED_SCAN_MAX;) {
    const { rows } = await client.query(
      `SELECT id, npi, score FROM lead_scores WHERE score IS NOT NULL AND npi IS NOT NULL${after ? " AND (score, id) < ($2, $3)" : ""}
        ORDER BY score DESC, id DESC LIMIT $1`,
      after ? [SCORED_PAGE, after.score, after.id] : [SCORED_PAGE],
    );
    if (!rows.length) break;
    scanned += rows.length;
    after = { score: rows[rows.length - 1].score, id: rows[rows.length - 1].id };
    const fresh = rows.map((r: any) => r.npi as string).filter((n: string) => !seen.has(n) && seen.add(n));
    let keep = fresh;
    if (state && fresh.length) {
      const { rows: inState } = await client.query(PRACTICE_STATE_FILTER_SQL, [fresh, state]);
      const ok = new Set(inState.map((r: any) => r.npi));
      keep = fresh.filter((n: string) => ok.has(n));
    }
    const ofKind = await ofEntity(client, keep, entity);
    keep = keep.filter((n: string) => ofKind.has(n));
    for (const n of keep) {
      if (top.length >= limit) break;
      top.push(n);
    }
    if (rows.length < SCORED_PAGE) break;
  }
  const npis: string[] = [...top];
  if (npis.length < limit) {
    const { rows } = await client.query(
      `SELECT npi FROM provider_locations WHERE location_type = 'Practice'${state ? " AND state = $2" : ""} LIMIT $1`,
      state ? [limit * 3, state] : [limit * 3],
    );
    const have = new Set(npis);
    const ofKind = await ofEntity(client, [...new Set(rows.map((r: any) => r.npi).filter(Boolean))] as string[], entity);
    for (const r of rows) {
      if (npis.length >= limit) break;
      if (r.npi && !have.has(r.npi) && ofKind.has(r.npi)) {
        have.add(r.npi);
        npis.push(r.npi);
      }
    }
  }
  return { npis, scoredFirst: top.length };
}

export async function handleGetTerritoryData(payload: any, user?: EntitledUser | null) {
  const state = normalizeStateFilter(payload?.state === "ALL" ? null : payload?.state ?? "PA");
  if (state && state !== "ALL") assertTerritory(user, { state });
  else {
    // The all-states sample spans the country: a plan that covers chosen places picks a state in them.
    assertTerritory(user, {});
    if (!isUnrestricted(user)) throw new TerritoryError("The all-states view is part of the National plan. Pick a state in your plan's territory.");
  }
  const group = typeof payload?.specialty_group === "string" && payload.specialty_group !== "all" ? payload.specialty_group : null;
  const entity = payload?.entity_type === "Individual" || payload?.entity_type === "Organization" ? payload.entity_type : null;
  const limit = Math.min(Math.max(Math.floor(Number(payload?.limit)) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const key = JSON.stringify([state, group, entity, limit]);
  const hit = resultCache.get(key);
  if (hit && Date.now() - hit.at < RESULT_TTL_MS) return hit.body;

  const index = await getGeoIndex(pool);
  try {
    const body = await withTimeoutClient(pool, "20s", async (client) => {
      const states = await availableStates(client);

      let npis: string[];
      let scoredFirst = 0;
      let truncated = true;
      if (group) {
        // Practice in the state, like the scored path: a mailing address there
        // would let in a provider who is then plotted at an out-of-state practice.
        const found = await searchBySpecialty(client, { group, state, entityType: entity, limit, practiceOnly: true });
        if (!found) throw new HttpError(400, "Unknown specialty.");
        npis = found.providers.map((p: any) => p.npi);
        truncated = found.truncated;
      } else {
        ({ npis, scoredFirst } = await chooseNpis(client, state, limit, entity));
      }

      const [provs, taxes, locs, util, scores, zipCounts] = await Promise.all([
        npis.length ? client.query("SELECT npi, entity_type, first_name, last_name, organization_name, credential, ai_outreach_score FROM providers WHERE npi = ANY($1)", [npis]) : { rows: [] },
        npis.length ? client.query("SELECT npi, taxonomy_code, taxonomy_description FROM provider_taxonomies WHERE npi = ANY($1) AND is_primary = true", [npis]) : { rows: [] },
        // One location per provider: the practice one in the state, else any
        // practice one, else any (an index probe each; no shared cap).
        npis.length ? client.query(
          `SELECT l.npi, l.location_type, l.address_1, l.city, l.state, l.zip
             FROM unnest($1::varchar[]) AS n(npi)
             CROSS JOIN LATERAL (
               SELECT npi, location_type, address_1, city, state, zip FROM provider_locations
                WHERE npi = n.npi
                ORDER BY (location_type = 'Practice' AND state IS NOT DISTINCT FROM $2) DESC NULLS LAST,
                         (location_type = 'Practice') DESC NULLS LAST,
                         id
                LIMIT 1
             ) l`, [npis, state]) : { rows: [] },
        // Each provider's latest year, all of its rows.
        npis.length ? client.query(
          `WITH latest AS (
             SELECT npi, max(data_year) AS data_year FROM provider_service_utilization WHERE npi = ANY($1) GROUP BY npi
           )
           SELECT u.npi, u.data_year, u.total_services, u.total_unique_benes, u.total_medicare_payment_amt, u.average_medicare_payment_amt
             FROM latest l JOIN provider_service_utilization u ON u.npi = l.npi AND u.data_year = l.data_year`, [npis]) : { rows: [] },
        npis.length ? client.query("SELECT npi, score FROM lead_scores WHERE npi = ANY($1)", [npis]) : { rows: [] },
        state ? client.query(
          "SELECT zip5, practice_locations FROM rollup_zip_locations WHERE zip5 = ANY($1)",
          [[...index.zctas].filter(([, z]) => z.state === state).map(([zcta]) => zcta)],
        ).catch(() => ({ rows: [] })) : { rows: [] },
      ]);

      const provBy = new Map(provs.rows.map((r: any) => [r.npi, r]));
      const taxBy = new Map(taxes.rows.map((r: any) => [r.npi, r]));
      const scoreBy = new Map<string, number>();
      for (const r of scores.rows) if (r.score != null && (!scoreBy.has(r.npi) || r.score > scoreBy.get(r.npi)!)) scoreBy.set(r.npi, r.score);
      const locsBy = new Map<string, any[]>();
      for (const l of locs.rows) (locsBy.get(l.npi) || locsBy.set(l.npi, []).get(l.npi)!).push(l);
      const utilBy = utilizationByNpi(util.rows);

      const providers = npis.map((npi) => {
        const p: any = provBy.get(npi);
        const t: any = taxBy.get(npi);
        const loc = practiceLocation(locsBy.get(npi) || [], state);
        const u = utilBy.get(npi);
        const g = specialtyGroupFor(t?.taxonomy_code, t?.taxonomy_description);
        const county = zipToCounty(index, loc?.zip);
        const coords = coordsFor(index, { zip: loc?.zip, state: loc?.state, key: npi });
        return {
          npi,
          name: providerName(p, npi),
          firstName: p?.first_name || null,
          lastName: p?.last_name || null,
          organizationName: p?.organization_name || null,
          entityType: normalizeEntityType(p?.entity_type),
          address: loc?.address_1 || "",
          city: loc?.city || "",
          state: loc?.state || "",
          zip: loc?.zip || "",
          countyFips: county?.fips || null,
          county: county?.name || null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          coordPrecision: coords?.precision ?? null,
          specialty: t?.taxonomy_description || "",
          taxonomyCode: t?.taxonomy_code || "",
          specialtyGroup: g.key,
          specialtyGroupLabel: g.key === "other" ? "Other" : g.label,
          ...pickScore(scoreBy.get(npi), p?.ai_outreach_score),
          totalMedicarePayment: u?.payments ?? null,
          totalBeneficiaries: u?.beneficiaries ?? null,
          totalServices: u?.services ?? null,
          dataYear: u?.dataYear ?? null,
        };
      }).filter((p) => !entity || p.entityType === entity);

      const stateInfo = state ? states.find((s) => s.state === state) : null;
      return {
        providers,
        availableStates: states,
        scope: {
          state: state || "ALL",
          label: group
            ? `${providers.length.toLocaleString("en-US")} ${specialtyGroupLabel(group)} providers in ${state || "all states"}${truncated ? " (a sample)" : ""}`
            : `${providers.length.toLocaleString("en-US")} providers in ${state || "all states"}: the ${scoredFirst.toLocaleString("en-US")} highest-scored first, then others`,
          sample_size: providers.length,
          approx_locations_in_state: stateInfo?.approx ?? null,
          truncated,
        },
        counties: state && zipCounts.rows.length ? countyDensity(index, state, zipCounts.rows) : [],
        geography: { loaded: index.counties.size > 0, vintage: index.vintage },
        generated_at: new Date().toISOString(),
      };
    });
    if (resultCache.size > 50) resultCache.clear();
    resultCache.set(key, { at: Date.now(), body });
    return body;
  } catch (e: any) {
    if (isStatementTimeout(e)) throw new HttpError(503, "The territory data took too long to load. Pick a state or a specialty.");
    throw e;
  }
}
