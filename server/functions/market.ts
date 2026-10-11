// Market and patient-flow views (public, read-only), served from the market
// rollups (server/lib/rollups/market.ts) plus index-backed IN-list lookups
// for names. Nothing here aggregates a big table in the request.
//
// Vocabulary: "hospital sources" are the hospitals whose inpatients live in a
// county (Hospital Service Area: where patients come from); the "discharge
// mix" is CMS's post-discharge Medicare spend by setting, a proxy for where
// a hospital's patients go next; "market share" is a provider's share of the
// Medicare FFS beneficiaries served by all providers of that setting located
// in the county or state. Counts under 11 are suppressed by CMS before
// publication, so nothing here reveals a small cell.
import { pool } from "../db";
import { isStatementTimeout, withTimeoutClient } from "../lib/pgClient";
import { countiesForState, getGeoIndex, resolveCounty, type GeoIndex } from "../lib/geo";
import { normalizeStateFilter } from "../lib/providerSearch";
import { specialtyGroupFor } from "../lib/specialtyGroups";
import { providerName } from "../lib/territory";
import { rollupStatus } from "../lib/rollups/runner";
import { MARKET_JOBS } from "../lib/rollups/market";

export const PAC_SETTINGS = ["snf", "hha", "hospice", "irf", "ltch"] as const;
export type PacSetting = (typeof PAC_SETTINGS)[number];
export const SETTING_LABELS: Record<string, string> = {
  snf: "Skilled nursing", hha: "Home health", hospice: "Hospice", irf: "Inpatient rehab", ltch: "Long-term care hospital", hospital: "Hospital",
};
/** The Facilities page group each setting's facilities open in (?group=). */
export const SETTING_FACILITY_GROUP: Record<string, string> = {
  snf: "snf", hha: "home_health", hospice: "hospice", irf: "irf", ltch: "ltch", hospital: "hospital",
};

/** County-level metrics the Territory map can colour by (rollup_county_market_profile columns). */
// Formats: count; percent (a fraction, 0.62); pct_units (CMS percent units, 11.05); money; rate.
export const LAYER_METRICS: Record<string, { column: string; label: string; format: "count" | "percent" | "pct_units" | "money" | "rate"; vintage: string }> = {
  benes: { column: "benes", label: "Medicare beneficiaries", format: "count", vintage: "enrollment" },
  ma_penetration: { column: "ma_penetration", label: "Medicare Advantage share", format: "percent", vintage: "enrollment" },
  benes_85_plus: { column: "benes_85_plus", label: "Beneficiaries aged 85+", format: "count", vintage: "enrollment" },
  dual: { column: "dual", label: "Dual-eligible beneficiaries", format: "count", vintage: "enrollment" },
  hha_users_pct: { column: "hha_users_pct", label: "Home health use (% of FFS)", format: "pct_units", vintage: "saturation" },
  hospice_users_pct: { column: "hospice_users_pct", label: "Hospice use (% of FFS)", format: "pct_units", vintage: "saturation" },
  snf_users_pct: { column: "snf_users_pct", label: "Skilled nursing use (% of FFS)", format: "pct_units", vintage: "saturation" },
  hha_providers: { column: "hha_providers", label: "Home health agencies", format: "count", vintage: "saturation" },
  hospice_providers: { column: "hospice_providers", label: "Hospices", format: "count", vintage: "saturation" },
  snf_providers: { column: "snf_providers", label: "Skilled nursing facilities", format: "count", vintage: "saturation" },
  std_per_capita_snf: { column: "std_per_capita_snf", label: "SNF spend per beneficiary", format: "money", vintage: "variation" },
  std_per_capita_hha: { column: "std_per_capita_hha", label: "Home health spend per beneficiary", format: "money", vintage: "variation" },
  std_per_capita_hospice: { column: "std_per_capita_hospice", label: "Hospice spend per beneficiary", format: "money", vintage: "variation" },
  readmission_rate: { column: "readmission_rate", label: "Hospital readmission rate", format: "percent", vintage: "variation" },
  er_visits_per_1000: { column: "er_visits_per_1000", label: "ER visits per 1,000", format: "rate", vintage: "variation" },
  hospitals_serving: { column: "hospitals_serving", label: "Hospitals serving residents", format: "count", vintage: "hospital_service_area" },
  pop_65_plus: { column: "pop_65_plus", label: "Population aged 65+", format: "count", vintage: "acs" },
  pop_85_plus: { column: "pop_85_plus", label: "Population aged 85+", format: "count", vintage: "acs" },
  living_alone_65_plus: { column: "living_alone_65_plus", label: "People 65+ living alone", format: "count", vintage: "acs" },
  median_income: { column: "median_income", label: "Median household income", format: "money", vintage: "acs" },
  median_home_value: { column: "median_home_value", label: "Median home value", format: "money", vintage: "acs" },
  licensed_homes: { column: "licensed_homes", label: "Licensed personal care / assisted living homes", format: "count", vintage: "licensed" },
  licensed_beds: { column: "licensed_beds", label: "Licensed personal care / assisted living beds", format: "count", vintage: "licensed" },
};

const TIMEOUT = "10s";
const TOP = 25;
const MAX_LIMIT = 200;
/** ZIP areas listed for a hospital's catchment, and counties in its split (totals cover them all). */
const CATCHMENT_ZIPS = 300;
const CATCHMENT_COUNTIES = 100;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const ccnOf = (v: unknown): string => String(v ?? "").trim().toUpperCase().slice(0, 10);

/** When each market rollup last computed, keyed by job. */
export async function marketRollupFreshness() {
  const names = new Set(MARKET_JOBS.map((j) => j.name));
  const out: Record<string, { status: string; refreshed_at: string | null; error: string | null }> = {};
  for (const j of await rollupStatus(pool).catch(() => [] as any[])) {
    if (!names.has(j.job)) continue;
    out[j.job] = { status: j.status ?? "never_run", refreshed_at: j.last_success_at ?? null, error: j.status === "failed" ? j.error ?? null : null };
  }
  return out;
}

/** Names for CCNs: the post-acute file, then the hospital spending file, then the facility records (index-backed). */
export async function facilityNames(client: any, ccns: string[]): Promise<Map<string, { name: string | null; city: string | null; state: string | null }>> {
  const out = new Map<string, { name: string | null; city: string | null; state: string | null }>();
  const wanted = [...new Set(ccns.filter(Boolean))];
  if (!wanted.length) return out;
  const pac = await client.query(
    `SELECT DISTINCT ON (ccn) ccn, provider_name, city, state FROM cms_pac_utilization
      WHERE summary_level = 'provider' AND ccn = ANY($1) ORDER BY ccn, data_year DESC`, [wanted]).catch(() => ({ rows: [] }));
  for (const r of pac.rows) out.set(r.ccn, { name: r.provider_name, city: r.city, state: r.state });
  let missing = wanted.filter((c) => !out.has(c));
  if (missing.length) {
    const mix = await client.query(
      "SELECT DISTINCT ON (ccn) ccn, facility_name, state FROM rollup_hospital_discharge_mix WHERE ccn = ANY($1) ORDER BY ccn, data_year DESC", [missing]).catch(() => ({ rows: [] }));
    for (const r of mix.rows) if (r.facility_name) out.set(r.ccn, { name: r.facility_name, city: null, state: r.state });
    missing = wanted.filter((c) => !out.has(c));
  }
  if (missing.length) {
    const fac = await client.query(
      `SELECT DISTINCT ON (provider_id) provider_id, facility_name, city, state FROM medicare_facilities
        WHERE provider_id = ANY($1) ORDER BY provider_id, data_year DESC NULLS LAST, id DESC`, [missing]).catch(() => ({ rows: [] }));
    for (const r of fac.rows) out.set(r.provider_id, { name: r.facility_name, city: r.city, state: r.state });
  }
  return out;
}

/** Latest CMS-671 census and payer mix per nursing home (cms_ltc_facility_characteristics). */
export async function nursingHomeCensus(client: any, ccns: string[]): Promise<Map<string, any>> {
  const wanted = [...new Set(ccns.filter(Boolean))];
  if (!wanted.length) return new Map();
  const { rows } = await client.query(
    `SELECT DISTINCT ON (ccn) ccn, period_end::text AS period_end, medicare_census, medicaid_census, other_census, total_residents,
            ownership_type, multi_facility_org_name, ccrc, special_care_beds
       FROM cms_ltc_facility_characteristics WHERE ccn = ANY($1) ORDER BY ccn, period_end DESC`, [wanted]).catch(() => ({ rows: [] as any[] }));
  return new Map(rows.map((r: any) => [r.ccn, {
    period_end: r.period_end, total_residents: num(r.total_residents), medicare_census: num(r.medicare_census), medicaid_census: num(r.medicaid_census), other_census: num(r.other_census),
    medicare_pct: r.total_residents > 0 && r.medicare_census != null ? Number(r.medicare_census) / Number(r.total_residents) : null,
    medicaid_pct: r.total_residents > 0 && r.medicaid_census != null ? Number(r.medicaid_census) / Number(r.total_residents) : null,
    ownership_type: r.ownership_type ?? null, chain: r.multi_facility_org_name ?? null, ccrc: r.ccrc ?? null,
    special_care_beds: r.special_care_beds && typeof r.special_care_beds === "object" ? r.special_care_beds : null,
  }]));
}

/** State-licensed homes (personal care, assisted living) in a county: the largest first, with totals by license type. */
export async function licensedHomes(client: any, countyFips: string, limit = 50) {
  const [{ rows }, { rows: totals }] = await Promise.all([
    client.query(
      `SELECT license_type, license_number, name, address, city, state, zip5, capacity, status, licensee, phone, as_of::text AS as_of
         FROM licensed_facilities WHERE county_fips = $1 ORDER BY capacity DESC NULLS LAST, name LIMIT $2`, [countyFips, limit]).catch(() => ({ rows: [] as any[] })),
    client.query(
      `SELECT license_type, count(*)::int AS homes, sum(capacity)::int AS beds, max(as_of)::text AS as_of
         FROM licensed_facilities WHERE county_fips = $1 GROUP BY 1 ORDER BY 2 DESC`, [countyFips]).catch(() => ({ rows: [] as any[] })),
  ]);
  return {
    as_of: totals.map((t: any) => t.as_of).filter(Boolean).sort().pop() ?? null,
    totals: totals.map((t: any) => ({ license_type: t.license_type, homes: Number(t.homes), beds: num(t.beds) })),
    rows: rows.map((r: any) => ({
      license_type: r.license_type, license_number: r.license_number, name: r.name, address: r.address, city: r.city, state: r.state, zip5: r.zip5,
      capacity: num(r.capacity), status: r.status, licensee: r.licensee, phone: r.phone, as_of: r.as_of,
    })),
  };
}

async function providerNames(client: any, npis: string[]): Promise<Map<string, { name: string; specialty: string | null; code: string | null; score: number | null }>> {
  const out = new Map<string, { name: string; specialty: string | null; code: string | null; score: number | null }>();
  const wanted = [...new Set(npis.filter(Boolean))];
  if (!wanted.length) return out;
  const [provs, taxes, scores] = await Promise.all([
    client.query("SELECT npi, first_name, last_name, organization_name, credential FROM providers WHERE npi = ANY($1)", [wanted]),
    client.query("SELECT npi, taxonomy_code, taxonomy_description FROM provider_taxonomies WHERE npi = ANY($1) AND is_primary = true", [wanted]).catch(() => ({ rows: [] })),
    client.query("SELECT npi, score FROM lead_scores WHERE npi = ANY($1) AND score IS NOT NULL", [wanted]).catch(() => ({ rows: [] })),
  ]);
  const tax = new Map<string, any>(taxes.rows.map((t: any) => [t.npi, t]));
  const score = new Map<string, number>();
  for (const s of scores.rows) if (!score.has(s.npi) || Number(s.score) > score.get(s.npi)!) score.set(s.npi, Number(s.score));
  for (const p of provs.rows) {
    const t = tax.get(p.npi);
    out.set(p.npi, { name: providerName(p, p.npi), specialty: t?.taxonomy_description ?? null, code: t?.taxonomy_code ?? null, score: score.get(p.npi) ?? null });
  }
  return out;
}

function countyName(index: GeoIndex, fips: string | null | undefined): string | null {
  return fips ? index.counties.get(fips)?.name ?? null : null;
}

async function resolveCountyArg(payload: any): Promise<{ state: string; index: GeoIndex; county: { fips: string; name: string; state: string } | null; counties?: Array<{ fips: string; name: string }> }> {
  const state = normalizeStateFilter(payload?.state);
  if (!state) throw new HttpError(400, "Pick a state.");
  const index = await getGeoIndex(pool);
  if (index.counties.size === 0) throw new HttpError(503, "Census geography isn't loaded yet, so counties aren't available.");
  const county = resolveCounty(index, { fips: payload?.county_fips, state, name: payload?.county });
  if (!county || county.state !== state) {
    return { state, index, county: null, counties: countiesForState(index, state).map((c) => ({ fips: c.fips, name: c.name })) };
  }
  return { state, index, county: { fips: county.fips, name: county.name, state: county.state } };
}

function guard<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((e) => {
    if (isStatementTimeout(e)) throw new HttpError(503, "The market data took too long to load. Try again in a moment.");
    throw e;
  });
}

const shareRow = (r: any) => ({
  ccn: r.ccn, benes: num(r.benes), stays: num(r.stays), days: num(r.days), payment: num(r.payment), dual_pct: num(r.dual_pct),
  risk_score: num(r.risk_score), share: num(r.share_benes), rank: num(r.rank), providers_in_market: num(r.providers_in_market),
  city: r.city ?? null, state: r.state ?? null, zip5: r.zip5 ?? null, data_year: r.data_year,
});

const mixRow = (r: any) => r ? ({
  data_year: r.data_year, pct_snf: num(r.pct_snf), pct_hha: num(r.pct_hha), pct_hospice: num(r.pct_hospice),
  pct_inpatient: num(r.pct_inpatient), pct_outpatient: num(r.pct_outpatient),
  state: { pct_snf: num(r.pct_snf_state), pct_hha: num(r.pct_hha_state), pct_hospice: num(r.pct_hospice_state) },
  national: { pct_snf: num(r.pct_snf_national), pct_hha: num(r.pct_hha_national), pct_hospice: num(r.pct_hospice_national) },
  avg_episode_spend: num(r.avg_episode_spend),
}) : null;

/** The county's market: profile, hospital sources, post-acute competitors and trends, agency coverage. */
export async function handleGetCountyMarket(payload: any) {
  const { state, index, county, counties } = await resolveCountyArg(payload);
  if (!county) return { state, needsCounty: true, counties };
  const fips = county.fips;
  return guard(() => withTimeoutClient(pool, TIMEOUT, async (client) => {
    const [profile, sources, competitors, trends, coverage] = await Promise.all([
      client.query("SELECT * FROM rollup_county_market_profile WHERE county_fips = $1", [fips]).catch(() => ({ rows: [] })),
      client.query(
        `SELECT s.ccn, s.data_year, s.cases, s.days, s.share_of_county, s.rank
           FROM rollup_county_hospital_sources s
           JOIN (SELECT max(data_year) AS y FROM rollup_county_hospital_sources WHERE county_fips = $1) l ON l.y = s.data_year
          WHERE s.county_fips = $1 ORDER BY s.rank LIMIT $2`, [fips, TOP]).catch(() => ({ rows: [] })),
      client.query(
        `SELECT p.* FROM rollup_pac_market_share p
           JOIN (SELECT setting, max(data_year) AS y FROM rollup_pac_market_share WHERE geo_level = 'county' AND geo_code = $1 GROUP BY setting) l
             ON l.setting = p.setting AND l.y = p.data_year
          WHERE p.geo_level = 'county' AND p.geo_code = $1 AND p.rank <= $2 ORDER BY p.setting, p.rank`, [fips, TOP]).catch(() => ({ rows: [] })),
      client.query(
        `SELECT setting, data_year, sum(benes)::bigint AS benes, sum(stays)::bigint AS stays, count(*)::int AS providers
           FROM rollup_pac_market_share WHERE geo_level = 'county' AND geo_code = $1 GROUP BY 1, 2 ORDER BY 1, 2`, [fips]).catch(() => ({ rows: [] })),
      // The TOP best-covering agencies of each setting (one limit across both settings would let a county with many
      // home health agencies push every hospice out of the list).
      client.query(
        `SELECT setting, ccn, zips_served, county_zips, share_of_county_zips FROM (
           SELECT setting, ccn, zips_served, county_zips, share_of_county_zips,
                  row_number() OVER (PARTITION BY setting ORDER BY share_of_county_zips DESC, ccn) AS rn
             FROM rollup_agency_coverage WHERE county_fips = $1) c
          WHERE rn <= $2 ORDER BY setting, rn`, [fips, TOP]).catch(() => ({ rows: [] })),
    ]);
    const licensed = await licensedHomes(client, fips);
    const snfCensus = await nursingHomeCensus(client, competitors.rows.filter((r: any) => r.setting === "snf").map((r: any) => r.ccn));
    const sourceCcns = sources.rows.map((r: any) => r.ccn);
    const mix = sourceCcns.length
      ? await client.query("SELECT DISTINCT ON (ccn) * FROM rollup_hospital_discharge_mix WHERE ccn = ANY($1) ORDER BY ccn, data_year DESC", [sourceCcns]).catch(() => ({ rows: [] }))
      : { rows: [] };
    const mixBy = new Map<string, any>(mix.rows.map((r: any) => [r.ccn, r]));
    const names = await facilityNames(client, [...sourceCcns, ...competitors.rows.map((r: any) => r.ccn), ...coverage.rows.map((r: any) => r.ccn)]);
    const named = (ccn: string) => names.get(ccn) ?? { name: null, city: null, state: null };

    const bySetting: Record<string, { data_year: string | null; rows: any[] }> = {};
    for (const s of PAC_SETTINGS) bySetting[s] = { data_year: null, rows: [] };
    for (const r of competitors.rows) {
      const e = bySetting[r.setting] ?? (bySetting[r.setting] = { data_year: null, rows: [] });
      e.data_year = r.data_year;
      e.rows.push({ ...shareRow(r), name: r.provider_name || named(r.ccn).name, facility_group: SETTING_FACILITY_GROUP[r.setting] ?? null, census: r.setting === "snf" ? snfCensus.get(r.ccn) ?? null : undefined });
    }
    const trendBy: Record<string, Array<{ data_year: string; benes: number | null; stays: number | null; providers: number }>> = {};
    for (const r of trends.rows) (trendBy[r.setting] ??= []).push({ data_year: r.data_year, benes: num(r.benes), stays: num(r.stays), providers: Number(r.providers) });
    const coverageBy: Record<string, any[]> = { hha: [], hospice: [] };
    for (const r of coverage.rows) {
      const list = coverageBy[r.setting] ??= [];
      if (list.length >= TOP) continue;
      list.push({ ccn: r.ccn, ...named(r.ccn), zips_served: Number(r.zips_served), county_zips: Number(r.county_zips), share_of_county_zips: num(r.share_of_county_zips), facility_group: SETTING_FACILITY_GROUP[r.setting] ?? null });
    }
    const p = profile.rows[0];
    return {
      state,
      county,
      profile: p ? { ...p, available: true } : { available: false, county_fips: fips },
      hospital_sources: {
        data_year: sources.rows[0]?.data_year ?? null,
        rows: sources.rows.map((r: any) => ({
          ccn: r.ccn, ...named(r.ccn), cases: num(r.cases), days: num(r.days), share: num(r.share_of_county), rank: num(r.rank),
          discharge_mix: mixRow(mixBy.get(r.ccn)),
        })),
      },
      competitors: bySetting,
      trends: trendBy,
      coverage: coverageBy,
      licensed,
      labels: SETTING_LABELS,
      vintages: p?.as_of ?? null,
      rollups: await marketRollupFreshness(),
    };
  }));
}

/** Where a hospital's inpatients live: ZIP areas and counties with cases and shares. */
export async function handleGetHospitalCatchment(payload: any) {
  const ccn = ccnOf(payload?.ccn);
  if (!ccn) throw new HttpError(400, "A CMS certification number (ccn) is required.");
  const index = await getGeoIndex(pool);
  return guard(() => withTimeoutClient(pool, TIMEOUT, async (client) => {
    const years = (await client.query("SELECT DISTINCT data_year FROM rollup_hospital_catchment WHERE ccn = $1 ORDER BY data_year DESC", [ccn]).catch(() => ({ rows: [] }))).rows.map((r: any) => String(r.data_year));
    const wanted = payload?.data_year ? String(payload.data_year) : years[0];
    const year = years.includes(wanted) ? wanted : years[0] ?? null;
    // The ZIP list is the busiest CATCHMENT_ZIPS areas; the totals and the county split
    // are aggregated over every ZIP area of the hospital, not just the ones listed.
    const [zips, totals, byCounty, mix, names] = await Promise.all([
      year ? client.query(
        `SELECT zip5, county_fips, cases, days, charges, share_of_hospital FROM rollup_hospital_catchment
          WHERE ccn = $1 AND data_year = $2 ORDER BY cases DESC NULLS LAST, zip5 LIMIT ${CATCHMENT_ZIPS}`, [ccn, year]) : { rows: [] },
      year ? client.query(
        "SELECT COALESCE(sum(cases), 0)::bigint AS cases, count(*)::int AS zips FROM rollup_hospital_catchment WHERE ccn = $1 AND data_year = $2", [ccn, year]) : { rows: [] },
      year ? client.query(
        `SELECT county_fips, sum(cases)::bigint AS cases, sum(days)::bigint AS days, count(*)::int AS zips FROM rollup_hospital_catchment
          WHERE ccn = $1 AND data_year = $2 AND county_fips IS NOT NULL
          GROUP BY county_fips ORDER BY sum(cases) DESC NULLS LAST, county_fips LIMIT ${CATCHMENT_COUNTIES}`, [ccn, year]) : { rows: [] },
      client.query("SELECT * FROM rollup_hospital_discharge_mix WHERE ccn = $1 ORDER BY data_year DESC LIMIT 1", [ccn]).catch(() => ({ rows: [] })),
      facilityNames(client, [ccn]),
    ]);
    const total = num(totals.rows[0]?.cases) ?? 0;
    const zipsTotal = Number(totals.rows[0]?.zips) || 0;
    const zipRows = zips.rows.map((r: any) => ({
      zip5: r.zip5, county_fips: r.county_fips, county_name: countyName(index, r.county_fips),
      cases: num(r.cases) ?? 0, days: num(r.days), charges: num(r.charges), share: num(r.share_of_hospital),
    }));
    const counties = byCounty.rows.map((r: any) => {
      const c = index.counties.get(r.county_fips);
      const cases = num(r.cases) ?? 0;
      return { county_fips: r.county_fips, name: c?.name ?? null, state: c?.state ?? null, cases, days: num(r.days) ?? 0, zips: Number(r.zips) || 0, share: total ? cases / total : null };
    });
    const n = names.get(ccn);
    return {
      ccn,
      name: n?.name ?? mix.rows[0]?.facility_name ?? null,
      city: n?.city ?? null,
      state: n?.state ?? mix.rows[0]?.state ?? null,
      data_year: year,
      years,
      total_cases: total,
      zips_total: zipsTotal,
      zips_truncated: zipsTotal > zipRows.length,
      zips: zipRows,
      counties,
      discharge_mix: mixRow(mix.rows[0]),
      rollups: await marketRollupFreshness(),
    };
  }));
}

/** A post-acute provider's position in its county and state market, its trend and (for agencies) the counties it serves. */
export async function handleGetFacilityMarket(payload: any) {
  const ccn = ccnOf(payload?.ccn);
  const setting = String(payload?.setting ?? "").toLowerCase() as PacSetting;
  if (!ccn) throw new HttpError(400, "A CMS certification number (ccn) is required.");
  if (!PAC_SETTINGS.includes(setting)) throw new HttpError(400, `setting must be one of ${PAC_SETTINGS.join(", ")}.`);
  const index = await getGeoIndex(pool);
  return guard(() => withTimeoutClient(pool, TIMEOUT, async (client) => {
    const own = (await client.query(
      "SELECT * FROM rollup_pac_market_share WHERE ccn = $1 AND setting = $2 ORDER BY data_year DESC, geo_level", [ccn, setting]).catch(() => ({ rows: [] }))).rows;
    if (!own.length) return { ccn, setting, found: false, label: SETTING_LABELS[setting], rollups: await marketRollupFreshness() };
    const latestYear = own[0].data_year;
    const countyRow = own.find((r: any) => r.geo_level === "county" && r.data_year === latestYear);
    const stateRow = own.find((r: any) => r.geo_level === "state" && r.data_year === latestYear);
    const countyFips = countyRow?.geo_code ?? null;
    const [market, marketTrend, coverage] = await Promise.all([
      countyFips ? client.query(
        `SELECT * FROM rollup_pac_market_share WHERE setting = $1 AND geo_level = 'county' AND geo_code = $2 AND data_year = $3 ORDER BY rank LIMIT 100`,
        [setting, countyFips, latestYear]) : { rows: [] },
      countyFips ? client.query(
        `SELECT data_year, sum(benes)::bigint AS benes, count(*)::int AS providers FROM rollup_pac_market_share
          WHERE setting = $1 AND geo_level = 'county' AND geo_code = $2 GROUP BY 1 ORDER BY 1`, [setting, countyFips]) : { rows: [] },
      setting === "hha" || setting === "hospice"
        ? client.query("SELECT county_fips, zips_served, county_zips, share_of_county_zips FROM rollup_agency_coverage WHERE setting = $1 AND ccn = $2 ORDER BY share_of_county_zips DESC LIMIT 50", [setting, ccn]).catch(() => ({ rows: [] }))
        : { rows: [] },
    ]);
    const names = await facilityNames(client, market.rows.map((r: any) => r.ccn));
    const census = setting === "snf" ? await nursingHomeCensus(client, [ccn, ...market.rows.map((r: any) => r.ccn)]) : new Map();
    const county = countyFips ? index.counties.get(countyFips) : null;
    const trendBy = new Map<string, any>(marketTrend.rows.map((r: any) => [String(r.data_year), r]));
    return {
      ccn, setting, found: true, label: SETTING_LABELS[setting],
      name: countyRow?.provider_name ?? own[0].provider_name ?? null,
      county: county ? { fips: county.fips, name: county.name, state: county.state } : null,
      data_year: latestYear,
      // The provider's own volumes come from any level; rank, share and market size are the county's only when it
      // has a county row (without one they are null, never the state's figures under a county label).
      position: {
        ...shareRow(countyRow ?? stateRow ?? own[0]),
        ...(countyRow ? {} : { rank: null, share: null, providers_in_market: null }),
        state_rank: num(stateRow?.rank), state_providers: num(stateRow?.providers_in_market), state_share: num(stateRow?.share_benes),
      },
      census: census.get(ccn) ?? null,
      market: market.rows.map((r: any) => ({ ...shareRow(r), name: r.provider_name || names.get(r.ccn)?.name || null, is_this: r.ccn === ccn, facility_group: SETTING_FACILITY_GROUP[setting], census: setting === "snf" ? census.get(r.ccn) ?? null : undefined })),
      trend: own.filter((r: any) => r.geo_level === "county").map((r: any) => ({
        data_year: r.data_year, benes: num(r.benes), share: num(r.share_benes), rank: num(r.rank),
        market_benes: num(trendBy.get(String(r.data_year))?.benes), market_providers: num(trendBy.get(String(r.data_year))?.providers),
      })).sort((a: any, b: any) => String(a.data_year).localeCompare(String(b.data_year))),
      coverage: coverage.rows.map((r: any) => ({ county_fips: r.county_fips, county_name: countyName(index, r.county_fips), state: index.counties.get(r.county_fips)?.state ?? null, zips_served: Number(r.zips_served), county_zips: Number(r.county_zips), share_of_county_zips: num(r.share_of_county_zips) })),
      rollups: await marketRollupFreshness(),
    };
  }));
}

const VINTAGE_KEYS = ["enrollment", "saturation", "variation", "hospital_service_area", "pac_utilization", "acs", "licensed"];

/** One metric for every county in a state (for a choropleth), or with `all` every metric (for the county table). */
export async function handleGetCountyMarketLayer(payload: any) {
  const state = normalizeStateFilter(payload?.state);
  if (!state) throw new HttpError(400, "Pick a state.");
  if (payload?.all === true) {
    return guard(() => withTimeoutClient(pool, TIMEOUT, async (client) => {
      const cols = Object.values(LAYER_METRICS).map((m) => m.column);
      const { rows } = await client.query(
        `SELECT county_fips, county_name, ${cols.join(", ")}, as_of FROM rollup_county_market_profile WHERE state = $1 ORDER BY county_name`, [state],
      ).catch(() => ({ rows: [] as any[] }));
      const vintages: Record<string, unknown> = {};
      for (const k of VINTAGE_KEYS) vintages[k] = rows.find((r: any) => r.as_of?.[k])?.as_of?.[k] ?? null;
      return {
        state, all: true, vintages,
        metrics: Object.entries(LAYER_METRICS).map(([key, m]) => ({ key, label: m.label, format: m.format })),
        counties: rows.map((r: any) => ({ fips: r.county_fips, name: r.county_name, values: Object.fromEntries(Object.entries(LAYER_METRICS).map(([key, m]) => [key, num(r[m.column])])) })),
        rollups: await marketRollupFreshness(),
      };
    }));
  }
  const metric = String(payload?.metric ?? "benes");
  const def = LAYER_METRICS[metric];
  if (!def) throw new HttpError(400, `metric must be one of ${Object.keys(LAYER_METRICS).join(", ")}.`);
  return guard(() => withTimeoutClient(pool, TIMEOUT, async (client) => {
    const { rows } = await client.query(
      `SELECT county_fips, county_name, ${def.column} AS value, as_of FROM rollup_county_market_profile WHERE state = $1 ORDER BY county_name`, [state],
    ).catch(() => ({ rows: [] as any[] }));
    const vintage = rows.find((r: any) => r.as_of?.[def.vintage])?.as_of?.[def.vintage] ?? null;
    return {
      state, metric, label: def.label, format: def.format, vintage,
      metrics: Object.entries(LAYER_METRICS).map(([key, m]) => ({ key, label: m.label, format: m.format })),
      counties: rows.map((r: any) => ({ fips: r.county_fips, name: r.county_name, value: num(r.value) })),
      rollups: await marketRollupFreshness(),
    };
  }));
}

/** Top likely referral sources (clinicians) in a county or state, with the components behind the index. */
export async function handleGetReferralSources(payload: any) {
  const state = normalizeStateFilter(payload?.state);
  if (!state) throw new HttpError(400, "Pick a state.");
  const index = await getGeoIndex(pool);
  const county = payload?.county_fips || payload?.county ? resolveCounty(index, { fips: payload?.county_fips, state, name: payload?.county }) : null;
  if ((payload?.county_fips || payload?.county) && (!county || county.state !== state)) {
    return { state, needsCounty: true, counties: countiesForState(index, state).map((c) => ({ fips: c.fips, name: c.name })) };
  }
  const setting = ["hha", "hospice", "dme"].includes(String(payload?.setting)) ? String(payload.setting) : null;
  const group = typeof payload?.specialty_group === "string" && payload.specialty_group !== "all" ? payload.specialty_group : null;
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(payload?.limit) || TOP));
  const fetch = group ? Math.min(1000, limit * 5) : limit;
  return guard(() => withTimeoutClient(pool, TIMEOUT, async (client) => {
    const where = [county ? "county_fips = $1" : "state = $1"];
    if (setting) where.push(`${setting}_eligible = true`);
    const { rows } = await client.query(
      `SELECT * FROM rollup_referral_sources WHERE ${where.join(" AND ")} ORDER BY referral_index DESC, benes DESC NULLS LAST, npi LIMIT $2`,
      [county ? county.fips : state, fetch],
    ).catch(() => ({ rows: [] as any[] }));
    const matched = group ? rows.filter((r: any) => specialtyGroupFor(null, r.specialty).key === group) : rows;
    const page = matched.slice(0, limit);
    const names = await providerNames(client, page.map((r: any) => r.npi));
    return {
      state,
      county: county ? { fips: county.fips, name: county.name, state: county.state } : null,
      setting, specialty_group: group, limit,
      data_year: page[0]?.data_year ?? rows[0]?.data_year ?? null,
      truncated: group ? rows.length >= fetch && matched.length > limit : rows.length > limit,
      rows: page.map((r: any) => {
        const n = names.get(r.npi);
        const g = specialtyGroupFor(n?.code ?? null, n?.specialty ?? r.specialty);
        return {
          npi: r.npi, name: n?.name ?? r.npi, specialty: r.specialty ?? n?.specialty ?? null, specialty_group: g.key, specialty_group_label: g.key === "other" ? "Other" : g.label,
          county_fips: r.county_fips, county_name: countyName(index, r.county_fips), state: r.state, zip5: r.zip5,
          benes: num(r.benes), services: num(r.services), avg_risk_score: num(r.avg_risk_score), dual_pct: num(r.dual_pct),
          chronic: { chf: num(r.cc_chf_pct), copd: num(r.cc_copd_pct), alzheimer: num(r.cc_alzheimer_pct), ckd: num(r.cc_ckd_pct), diabetes: num(r.cc_diabetes_pct) },
          eligible: { hha: !!r.hha_eligible, hospice: !!r.hospice_eligible, dme: !!r.dme_eligible },
          dme_benes: num(r.dme_benes), hospital_ccns: Array.isArray(r.hospital_ccns) ? r.hospital_ccns : [], affiliations: num(r.affiliations),
          referral_index: num(r.referral_index), rank_in_county: num(r.rank_in_county), lead_score: n?.score ?? null, data_year: r.data_year,
        };
      }),
      index_note: "Referral index (0–100): 50 points for Medicare beneficiaries served (full at 500), 25 for average patient risk score (full at 2.5), 25 for eligibility to order home health and hospice.",
      rollups: await marketRollupFreshness(),
    };
  }));
}

/** Home health agencies or hospices serving a county, with how much of it (and how many other counties) each covers. */
export async function handleGetServiceAreaOverlap(payload: any) {
  const { state, index, county, counties } = await resolveCountyArg(payload);
  if (!county) return { state, needsCounty: true, counties };
  const setting = String(payload?.setting ?? "hha").toLowerCase();
  if (setting !== "hha" && setting !== "hospice") throw new HttpError(400, "setting must be hha or hospice.");
  return guard(() => withTimeoutClient(pool, TIMEOUT, async (client) => {
    const { rows } = await client.query(
      `SELECT a.ccn, a.zips_served, a.county_zips, a.share_of_county_zips,
              (SELECT count(*)::int FROM rollup_agency_coverage b WHERE b.setting = a.setting AND b.ccn = a.ccn) AS counties_served
         FROM rollup_agency_coverage a WHERE a.setting = $1 AND a.county_fips = $2
        ORDER BY a.share_of_county_zips DESC, a.ccn LIMIT 100`, [setting, county.fips]).catch(() => ({ rows: [] as any[] }));
    const ccns = rows.map((r: any) => r.ccn);
    const [names, share] = await Promise.all([
      facilityNames(client, ccns),
      ccns.length ? client.query(
        `SELECT DISTINCT ON (ccn) ccn, data_year, benes, share_benes, rank FROM rollup_pac_market_share
          WHERE setting = $1 AND geo_level = 'county' AND geo_code = $2 AND ccn = ANY($3) ORDER BY ccn, data_year DESC`, [setting, county.fips, ccns]).catch(() => ({ rows: [] })) : { rows: [] },
    ]);
    const shareBy = new Map<string, any>(share.rows.map((r: any) => [r.ccn, r]));
    return {
      state, county, setting, label: SETTING_LABELS[setting],
      county_zips: rows[0] ? Number(rows[0].county_zips) : index.countyZctas.get(county.fips)?.length ?? null,
      rows: rows.map((r: any) => {
        const s = shareBy.get(r.ccn);
        return {
          ccn: r.ccn, ...(names.get(r.ccn) ?? { name: null, city: null, state: null }), facility_group: SETTING_FACILITY_GROUP[setting],
          zips_served: Number(r.zips_served), share_of_county_zips: num(r.share_of_county_zips), counties_served: Number(r.counties_served),
          benes: num(s?.benes), market_share: num(s?.share_benes), market_rank: num(s?.rank), market_year: s?.data_year ?? null,
        };
      }),
      rollups: await marketRollupFreshness(),
    };
  }));
}
