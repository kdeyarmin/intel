// getCountyIntelligence: providers, specialties, referrals, Medicare services
// and facilities for one county. The county is a real Census county (by FIPS,
// or by name within a state); providers are matched by the ZIP areas (ZCTAs)
// that lie mostly inside it. Every query is bounded and index-backed.
import { pool } from "../db";
import { withTimeoutClient, isStatementTimeout } from "../lib/pgClient";
import { countiesForState, countyZctas, getGeoIndex, resolveCounty } from "../lib/geo";
import { normalizeEntityType, specialtyGroupFor } from "../lib/specialtyGroups";
import { normalizeStateFilter } from "../lib/providerSearch";
import { parseMoney } from "../lib/rollups/core";
import { pickScore, providerName } from "../lib/territory";
import { LISTING_PRIMARY_TYPES, getFacilityTypeGroup } from "./facilityDetail";

// Practice locations read per county. Larger counties are summarised from a
// sample of this many (and the ZIP rollup gives the full count).
const LOCATION_SAMPLE = 5000;
// Providers whose referrals and services are read in detail.
const DETAIL_SAMPLE = 1000;
// A ZIP area belongs to the county holding at least this share of its land.
const MIN_ZCTA_SHARE = 0.5;
// Facility records listed per county (newest data year first).
const FACILITY_LIMIT = 2000;
// Referral pairs listed (the heaviest, latest year per pair).
const TOP_PAIRS = 30;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function handleGetCountyIntelligence(payload: any) {
  const state = normalizeStateFilter(payload?.state);
  if (!state) throw new HttpError(400, "Pick a state.");
  const index = await getGeoIndex(pool);
  if (index.counties.size === 0) {
    return { state, notLoaded: true, message: "Census geography isn't loaded yet, so counties aren't available." };
  }
  const county = resolveCounty(index, { fips: payload?.county_fips, state, name: payload?.county });
  if (!county || county.state !== state) {
    return { state, needsCounty: true, counties: countiesForState(index, state).map((c) => ({ fips: c.fips, name: c.name })) };
  }
  const zctas = countyZctas(index, county.fips, MIN_ZCTA_SHARE);

  try {
    return await withTimeoutClient(pool, "15s", async (client) => {
      const [{ rows: locRows }, { rows: zipCounts }] = await Promise.all([
        zctas.length
          ? client.query(
            `SELECT npi FROM provider_locations
              WHERE left(zip, 5) = ANY($1) AND state = $2 AND location_type = 'Practice' LIMIT $3`,
            [zctas, state, LOCATION_SAMPLE + 1],
          )
          : { rows: [] },
        zctas.length
          ? client.query("SELECT sum(practice_locations)::bigint AS n FROM rollup_zip_locations WHERE zip5 = ANY($1)", [zctas]).catch(() => ({ rows: [] }))
          : { rows: [] },
      ]);
      const sampled = locRows.length > LOCATION_SAMPLE;
      const npis = [...new Set(locRows.slice(0, LOCATION_SAMPLE).map((r: any) => r.npi).filter(Boolean))] as string[];
      const detailNpis = npis.slice(0, DETAIL_SAMPLE);
      const rollupCount = zipCounts[0]?.n != null ? Number(zipCounts[0].n) : null;

      const facilityTypes = Object.values(LISTING_PRIMARY_TYPES).concat("rural_health_clinic_enrollments");
      const [provs, taxes, referralRows, serviceRows, scores, facilityRows] = await Promise.all([
        npis.length ? client.query("SELECT npi, entity_type, first_name, last_name, organization_name, credential, ai_outreach_score FROM providers WHERE npi = ANY($1)", [npis]) : { rows: [] },
        npis.length ? client.query("SELECT npi, taxonomy_code, taxonomy_description FROM provider_taxonomies WHERE npi = ANY($1) AND is_primary = true", [npis]) : { rows: [] },
        // The latest year of each pair, heaviest first, before the cap (bounded
        // by the provider list, through the npi index).
        detailNpis.length ? client.query(
          `SELECT * FROM (
             SELECT DISTINCT ON (npi, referred_to_npi) npi, referred_to_npi, total_referrals, total_beneficiaries, data_year
               FROM cms_referrals WHERE npi = ANY($1) AND referred_to_npi IS NOT NULL
              ORDER BY npi, referred_to_npi, data_year DESC NULLS LAST
           ) latest ORDER BY total_referrals DESC NULLS LAST LIMIT $2`, [detailNpis, TOP_PAIRS]) : { rows: [] },
        // Each provider's latest year only, all of its rows (no cap to cut a provider short).
        detailNpis.length ? client.query(
          `WITH latest AS (
             SELECT npi, max(data_year) AS data_year FROM provider_service_utilization WHERE npi = ANY($1) GROUP BY npi
           )
           SELECT u.npi, u.service_type, u.hcpcs_code, u.hcpcs_description, u.total_services, u.total_medicare_payment_amt,
                  u.average_medicare_payment_amt, u.data_year
             FROM latest l JOIN provider_service_utilization u ON u.npi = l.npi AND u.data_year = l.data_year`, [detailNpis]) : { rows: [] },
        npis.length ? client.query("SELECT npi, score FROM lead_scores WHERE npi = ANY($1)", [npis]) : { rows: [] },
        // idx_medfac_state_zip5 (boot index) serves the state + ZIP predicate.
        zctas.length ? client.query(
          `SELECT id, facility_type, facility_name, provider_id, city, zip, quality_rating, total_payments, total_discharges, data_year
             FROM medicare_facilities WHERE facility_type = ANY($1) AND state = $2 AND left(zip, 5) = ANY($3)
            ORDER BY data_year DESC NULLS LAST, id DESC LIMIT $4`,
          [facilityTypes, state, zctas, FACILITY_LIMIT + 1]) : { rows: [] },
      ]);

      // Providers and specialties.
      const taxBy = new Map(taxes.rows.map((t: any) => [t.npi, t]));
      const scoreBy = new Map<string, number>();
      for (const r of scores.rows) if (r.score != null && (!scoreBy.has(r.npi) || r.score > scoreBy.get(r.npi)!)) scoreBy.set(r.npi, r.score);
      let individuals = 0;
      let organizations = 0;
      const groups = new Map<string, { name: string; count: number }>();
      const providers = provs.rows.map((p: any) => {
        const entityType = normalizeEntityType(p.entity_type) !== "Unknown"
          ? normalizeEntityType(p.entity_type)
          : p.organization_name && !p.last_name ? "Organization" : "Individual";
        if (entityType === "Organization") organizations += 1;
        else individuals += 1;
        const t: any = taxBy.get(p.npi);
        const g = specialtyGroupFor(t?.taxonomy_code, t?.taxonomy_description);
        const label = g.key === "other" ? t?.taxonomy_description || "Unknown" : g.label;
        const e = groups.get(label) || { name: label, count: 0 };
        e.count += 1;
        groups.set(label, e);
        return {
          npi: p.npi,
          name: providerName(p, p.npi),
          entityType,
          credential: p.credential,
          specialty: t?.taxonomy_description || null,
          ...pickScore(scoreBy.get(p.npi), p.ai_outreach_score),
        };
      }).sort((a: any, b: any) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name));
      const topSpecialties = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 20);

      // Referrals: the heaviest pairs, latest year per pair, with names.
      const bestPair = new Map<string, any>();
      for (const r of referralRows.rows) {
        const k = `${r.npi}>${r.referred_to_npi}`;
        const cur = bestPair.get(k);
        if (!cur || String(r.data_year || "") > String(cur.data_year || "")) bestPair.set(k, r);
      }
      const topPairs = [...bestPair.values()].sort((a, b) => (parseMoney(b.total_referrals) ?? 0) - (parseMoney(a.total_referrals) ?? 0)).slice(0, TOP_PAIRS);
      const nameNpis = [...new Set(topPairs.flatMap((r) => [r.npi, r.referred_to_npi]))];
      const names = new Map<string, string>();
      if (nameNpis.length) {
        const { rows } = await client.query("SELECT npi, first_name, last_name, organization_name, credential FROM providers WHERE npi = ANY($1)", [nameNpis]);
        for (const r of rows) names.set(r.npi, providerName(r, r.npi));
      }

      // Medicare services by HCPCS code (latest year per provider).
      const latestYear = new Map<string, string>();
      for (const r of serviceRows.rows) {
        const y = String(r.data_year || "");
        if (!latestYear.has(r.npi) || y > latestYear.get(r.npi)!) latestYear.set(r.npi, y);
      }
      const services = new Map<string, { code: string; name: string; amount: number; services: number }>();
      for (const r of serviceRows.rows) {
        if (String(r.data_year || "") !== latestYear.get(r.npi)) continue;
        const code = r.hcpcs_code || r.service_type;
        if (!code) continue;
        const count = parseMoney(r.total_services) ?? 0;
        const total = parseMoney(r.total_medicare_payment_amt);
        const avg = parseMoney(r.average_medicare_payment_amt);
        const e = services.get(code) || { code, name: r.hcpcs_description || r.service_type || code, amount: 0, services: 0 };
        e.amount += total ?? (avg != null ? avg * count : 0);
        e.services += count;
        services.set(code, e);
      }
      const topServices = [...services.values()].sort((a, b) => b.amount - a.amount).slice(0, 10)
        .map((s) => ({ code: s.code, name: s.name, amount: Math.round(s.amount), services: Math.round(s.services) }));

      // Facilities by group.
      const facilitiesCapped = facilityRows.rows.length > FACILITY_LIMIT;
      if (facilitiesCapped) facilityRows.rows.length = FACILITY_LIMIT;
      const facSummary = new Map<string, { type: string; count: number; totalPayments: number; ratings: number[] }>();
      const facilities = facilityRows.rows.map((f: any) => {
        const group = getFacilityTypeGroup(f.facility_type) || "other";
        const e = facSummary.get(group) || { type: group, count: 0, totalPayments: 0, ratings: [] };
        e.count += 1;
        e.totalPayments += Number(f.total_payments) || 0;
        if (Number(f.quality_rating) > 0) e.ratings.push(Number(f.quality_rating));
        facSummary.set(group, e);
        return {
          id: f.id,
          name: f.facility_name,
          type: f.facility_type,
          group,
          providerId: f.provider_id,
          city: f.city,
          qualityRating: f.quality_rating,
          totalPayments: f.total_payments,
          totalDischarges: f.total_discharges,
          dataYear: f.data_year,
        };
      });

      return {
        state,
        county: { fips: county.fips, name: county.name, lat: county.lat, lng: county.lng },
        zip_areas: zctas.length,
        summary: {
          // Exact when every practice location was read; otherwise the ZIP rollup's count.
          totalProviders: sampled ? rollupCount ?? npis.length : npis.length,
          providersExact: !sampled,
          sampledProviders: npis.length,
          individualProviders: individuals,
          orgProviders: organizations,
          totalFacilities: facilities.length,
          totalPayments: Math.round(facilityRows.rows.reduce((s: number, f: any) => s + (Number(f.total_payments) || 0), 0)),
          totalDischarges: facilityRows.rows.reduce((s: number, f: any) => s + (Number(f.total_discharges) || 0), 0),
        },
        sample: {
          sampled,
          detail_limit: DETAIL_SAMPLE,
          details_cover_all: npis.length <= DETAIL_SAMPLE,
          // Facility totals cover the newest FACILITY_LIMIT records.
          facilities_capped: facilitiesCapped,
          facility_limit: FACILITY_LIMIT,
        },
        topSpecialties,
        facilitySummary: [...facSummary.values()]
          .map((e) => ({
            type: e.type,
            count: e.count,
            totalPayments: Math.round(e.totalPayments),
            avgRating: e.ratings.length ? Math.round((e.ratings.reduce((a, b) => a + b, 0) / e.ratings.length) * 10) / 10 : null,
          }))
          .sort((a, b) => b.count - a.count),
        facilities,
        providers: providers.slice(0, 200),
        referrals: topPairs.map((r) => ({
          fromNpi: r.npi,
          fromName: names.get(r.npi) || null,
          toNpi: r.referred_to_npi,
          toName: names.get(r.referred_to_npi) || null,
          totalReferrals: parseMoney(r.total_referrals) ?? 0,
          totalBeneficiaries: parseMoney(r.total_beneficiaries) ?? null,
          dataYear: r.data_year || null,
        })),
        topServices,
      };
    });
  } catch (e: any) {
    if (isStatementTimeout(e)) throw new HttpError(503, "This county's data took too long to load. Try again in a moment.");
    throw e;
  }
}

/** States with counties, for the County Intel picker. */
export async function handleGetAvailableStatesCounties(_payload: any) {
  const index = await getGeoIndex(pool);
  return {
    states: [...index.countiesByState.keys()].sort(),
    statesCities: {},
    geography: { loaded: index.counties.size > 0, vintage: index.vintage },
  };
}
