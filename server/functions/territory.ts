// getTerritoryData: a bounded, labelled sample of providers for the territory
// map, with real scores, Census-based positions and counties, and county
// density from the ZIP rollup. Index-backed IN queries only.
import { pool } from "../db";
import { withTimeoutClient, isStatementTimeout } from "../lib/pgClient";
import { coordsFor, getGeoIndex, zipToCounty } from "../lib/geo";
import { normalizeEntityType, specialtyGroupFor, specialtyGroupLabel } from "../lib/specialtyGroups";
import { normalizeStateFilter, searchBySpecialty } from "../lib/providerSearch";
import { countyDensity, pickScore, providerName, stateCountsFromStats, utilizationByNpi } from "../lib/territory";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;
const SCORED_CANDIDATES = 5000;
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

/** Highest lead scores first (in the state), then other practice locations in the state. */
async function chooseNpis(client: any, state: string | null, limit: number): Promise<{ npis: string[]; scoredFirst: number }> {
  const { rows: scored } = await client.query(
    "SELECT npi FROM lead_scores WHERE npi IS NOT NULL AND score IS NOT NULL ORDER BY score DESC LIMIT $1",
    [SCORED_CANDIDATES],
  );
  let top: string[] = [...new Set<string>(scored.map((r: any) => r.npi as string))];
  if (state && top.length) {
    const { rows } = await client.query(
      "SELECT DISTINCT npi FROM provider_locations WHERE npi = ANY($1) AND state = $2 AND location_type = 'Practice'",
      [top, state],
    );
    const inState = new Set(rows.map((r: any) => r.npi));
    top = top.filter((n) => inState.has(n));
  }
  top = top.slice(0, limit);
  const npis: string[] = [...top];
  if (npis.length < limit) {
    const { rows } = await client.query(
      `SELECT npi FROM provider_locations WHERE location_type = 'Practice'${state ? " AND state = $2" : ""} LIMIT $1`,
      state ? [limit * 3, state] : [limit * 3],
    );
    const have = new Set(npis);
    for (const r of rows) {
      if (npis.length >= limit) break;
      if (r.npi && !have.has(r.npi)) {
        have.add(r.npi);
        npis.push(r.npi);
      }
    }
  }
  return { npis, scoredFirst: top.length };
}

export async function handleGetTerritoryData(payload: any) {
  const state = normalizeStateFilter(payload?.state === "ALL" ? null : payload?.state ?? "PA");
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
        const found = await searchBySpecialty(client, { group, state, limit });
        if (!found) throw new HttpError(400, "Unknown specialty.");
        npis = found.providers.map((p: any) => p.npi);
        truncated = found.truncated;
      } else {
        ({ npis, scoredFirst } = await chooseNpis(client, state, limit));
      }

      const [provs, taxes, locs, util, scores, zipCounts] = await Promise.all([
        npis.length ? client.query("SELECT npi, entity_type, first_name, last_name, organization_name, credential, ai_outreach_score FROM providers WHERE npi = ANY($1)", [npis]) : { rows: [] },
        npis.length ? client.query("SELECT npi, taxonomy_code, taxonomy_description FROM provider_taxonomies WHERE npi = ANY($1) AND is_primary = true", [npis]) : { rows: [] },
        npis.length ? client.query("SELECT npi, location_type, address_1, city, state, zip FROM provider_locations WHERE npi = ANY($1) LIMIT $2", [npis, npis.length * 4]) : { rows: [] },
        npis.length ? client.query(
          `SELECT npi, data_year, total_services, total_unique_benes, total_medicare_payment_amt, average_medicare_payment_amt
             FROM provider_service_utilization WHERE npi = ANY($1) LIMIT $2`, [npis, npis.length * 60]) : { rows: [] },
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
