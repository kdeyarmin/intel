// The accounts in one county a marketer can put on a call sheet. Read-only.
// Each kind is a published list (hospitals that discharged the county's
// residents, post-acute providers located there, clinicians on the referral
// rollup, DME suppliers, state-licensed homes). Phone is included only where
// a source file has one.
import { pool } from "../db";
import { isStatementTimeout } from "../lib/pgClient";
import { countiesForState, getGeoIndex, resolveCounty } from "../lib/geo";
import { normalizeStateFilter } from "../lib/providerSearch";
import { assertTerritory, type EntitledUser } from "../lib/entitlements";

export const ROSTER_KIND_IDS = ["hospital", "hha", "hospice", "snf", "irf", "ltch", "clinician", "dme", "licensed"] as const;
export type RosterKind = (typeof ROSTER_KIND_IDS)[number];

const PAC = new Set(["hha", "hospice", "snf", "irf", "ltch"]);
const PAGE_MAX = 500;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const num = (v: unknown) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** Count and page statements for one roster kind. County FIPS is $1; a post-acute setting is also $1 and the county is $2. */
export function rosterStatements(kind: RosterKind): { count: string; page: string } {
  if (kind === "hospital") {
    return {
      count: `SELECT count(*)::int AS n FROM rollup_county_hospital_sources s
        JOIN (SELECT max(data_year) AS y FROM rollup_county_hospital_sources WHERE county_fips = $1) l ON l.y = s.data_year
        WHERE s.county_fips = $1`,
      page: `SELECT s.ccn AS account_key, COALESCE(m.facility_name, f.facility_name, s.ccn) AS name, f.city,
              CASE WHEN s.cases IS NULL THEN NULL ELSE s.cases::text || ' inpatient cases' END AS detail
         FROM rollup_county_hospital_sources s
         JOIN (SELECT max(data_year) AS y FROM rollup_county_hospital_sources WHERE county_fips = $1) l ON l.y = s.data_year
         LEFT JOIN LATERAL (
           SELECT facility_name FROM rollup_hospital_discharge_mix WHERE ccn = s.ccn ORDER BY data_year DESC LIMIT 1
         ) m ON true
         LEFT JOIN LATERAL (
           SELECT facility_name, city FROM medicare_facilities WHERE provider_id = s.ccn ORDER BY data_year DESC NULLS LAST, id DESC LIMIT 1
         ) f ON true
        WHERE s.county_fips = $1
        ORDER BY s.rank NULLS LAST, s.ccn
        LIMIT $2 OFFSET $3`,
    };
  }
  if (PAC.has(kind)) {
    return {
      count: `SELECT count(*)::int AS n FROM rollup_pac_market_share p
        JOIN (SELECT max(data_year) AS y FROM rollup_pac_market_share WHERE setting = $1 AND geo_level = 'county' AND geo_code = $2) l ON l.y = p.data_year
        WHERE p.setting = $1 AND p.geo_level = 'county' AND p.geo_code = $2`,
      page: `SELECT p.ccn AS account_key, COALESCE(NULLIF(p.provider_name, ''), p.ccn) AS name, p.city,
              CASE WHEN p.benes IS NULL THEN NULL ELSE p.benes::text || ' Medicare beneficiaries' END AS detail
         FROM rollup_pac_market_share p
         JOIN (SELECT max(data_year) AS y FROM rollup_pac_market_share WHERE setting = $1 AND geo_level = 'county' AND geo_code = $2) l ON l.y = p.data_year
        WHERE p.setting = $1 AND p.geo_level = 'county' AND p.geo_code = $2
        ORDER BY p.rank NULLS LAST, p.ccn
        LIMIT $3 OFFSET $4`,
    };
  }
  if (kind === "clinician") {
    return {
      count: `SELECT count(*)::int AS n FROM rollup_referral_sources WHERE county_fips = $1`,
      page: `SELECT r.npi AS account_key,
              COALESCE(NULLIF(trim(both ' ' FROM concat_ws(' ', p.first_name, p.last_name) || CASE WHEN COALESCE(p.credential, '') <> '' THEN ', ' || p.credential ELSE '' END), ''), NULLIF(p.organization_name, ''), r.npi) AS name,
              loc.city, COALESCE(NULLIF(p.phone, ''), NULLIF(loc.phone, '')) AS phone, NULLIF(r.specialty, '') AS detail
         FROM rollup_referral_sources r
         LEFT JOIN providers p ON p.npi = r.npi
         LEFT JOIN LATERAL (
           SELECT city, phone FROM provider_locations WHERE npi = r.npi ORDER BY (COALESCE(phone, '') <> '') DESC, id LIMIT 1
         ) loc ON true
        WHERE r.county_fips = $1
        ORDER BY r.referral_index DESC NULLS LAST, r.npi
        LIMIT $2 OFFSET $3`,
    };
  }
  if (kind === "dme") {
    return {
      count: `SELECT count(*)::int AS n FROM dme_supplier_directory d JOIN geo_zctas z ON z.zcta = d.zip5 WHERE z.primary_county_fips = $1`,
      page: `SELECT d.provider_id AS account_key, COALESCE(NULLIF(d.business_name, ''), NULLIF(d.practice_name, ''), d.provider_id) AS name,
              d.city, NULLIF(d.phone, '') AS phone, NULLIF(left(COALESCE(d.specialties, d.supplies, ''), 120), '') AS detail
         FROM dme_supplier_directory d
         JOIN geo_zctas z ON z.zcta = d.zip5
        WHERE z.primary_county_fips = $1
        ORDER BY d.business_name NULLS LAST, d.provider_id
        LIMIT $2 OFFSET $3`,
    };
  }
  return {
    count: `SELECT count(*)::int AS n FROM licensed_facilities WHERE county_fips = $1`,
    page: `SELECT facility_key AS account_key, name, city, NULLIF(phone, '') AS phone, NULLIF(license_type, '') AS detail
       FROM licensed_facilities WHERE county_fips = $1
       ORDER BY name, facility_key
       LIMIT $2 OFFSET $3`,
  };
}

export async function handleGetMarketRoster(payload: any, user?: EntitledUser | null) {
  const state = normalizeStateFilter(payload?.state);
  if (!state) throw new HttpError(400, "Pick a state.");
  const kind = String(payload?.kind ?? "") as RosterKind;
  if (!ROSTER_KIND_IDS.includes(kind)) throw new HttpError(400, `kind must be one of ${ROSTER_KIND_IDS.join(", ")}.`);
  const index = await getGeoIndex(pool);
  if (index.counties.size === 0) throw new HttpError(503, "Census geography isn't loaded yet, so counties aren't available.");
  const county = resolveCounty(index, { fips: payload?.county_fips, state, name: payload?.county });
  if (!county || county.state !== state) {
    return { needsCounty: true, state, counties: countiesForState(index, state).map((c) => ({ fips: c.fips, name: c.name })) };
  }
  assertTerritory(user, { state, county_fips: county.fips, county_name: county.name });
  const limit = Math.min(PAGE_MAX, Math.max(1, Number(payload?.limit) || 200));
  const offset = Math.max(0, Number(payload?.offset) || 0);
  const sql = rosterStatements(kind);
  const accountKind = kind === "clinician" ? "provider" : "facility";
  return pool.connect().then(async (client) => {
    try {
      await client.query(`SET statement_timeout = '15s'`);
      const params = PAC.has(kind) ? [kind, county.fips] : [county.fips];
      const pageParams = PAC.has(kind) ? [kind, county.fips, limit, offset] : [county.fips, limit, offset];
      const counted = await client.query(sql.count, params);
      const listed = await client.query(sql.page, pageParams);
      return {
        state,
        county: { fips: county.fips, name: county.name },
        kind,
        total: num(counted.rows[0]?.n) ?? 0,
        offset,
        limit,
        rows: listed.rows.map((r: any) => ({
          account_kind: accountKind,
          account_key: String(r.account_key),
          account_type: kind,
          name: r.name || String(r.account_key),
          city: r.city || null,
          phone: r.phone || null,
          detail: r.detail || null,
        })),
      };
    } catch (e) {
      if (isStatementTimeout(e)) throw new HttpError(503, "That list took too long to load. Try again in a moment.");
      throw e;
    } finally {
      await client.query("RESET statement_timeout").catch(() => {});
      client.release();
    }
  });
}
