import { pool } from "../db";
import { assertTerritory, isUnrestricted, type EntitledUser } from "../lib/entitlements";
import { isOrgAdmin } from "../lib/roles";
import { getGeoIndex, resolveCounty, zipToCounty } from "../lib/geo";
import {
  ENROLLMENT_DATASETS, REPORT_DATASETS, enrollmentIds,
  summarizeOwnership, summarizeCostReports, summarizeAdditionalQuality,
  facilityDetails, reportedNumber, summarizeFacilityUtilization, summarizeMarketProfile,
} from "../lib/comprehensiveReportData";

async function safeQuery(client: any, text: string, params: any[], onFailure: () => void) {
  try {
    const result = await client.query(text, params);
    return result.rows;
  } catch (e: any) {
    console.error("[Report query error]", e.message?.slice(0, 100));
    onFailure();
    return [];
  }
}

const validState = (s: unknown) => /^[A-Z]{2}$/.test(String(s ?? "").trim().toUpperCase()) ? String(s).trim().toUpperCase() : null;

// The parts of the report a caller can ask for (mirrored by REPORT_SECTIONS in
// src/components/reports/reportSections.js). "profile" is the identity card
// and the headline totals.
export const REPORT_SECTION_KEYS = [
  "profile", "locations", "taxonomies", "utilization", "referrals",
  "affiliations", "facilities", "quality", "ownership", "costReports", "additionalQuality", "market", "leadScore", "enrichments",
] as const;
export type ReportSectionKey = typeof REPORT_SECTION_KEYS[number];

/**
 * The sections to build. No list (or a list naming none we know) means the
 * whole report, so existing callers keep getting everything.
 */
export function normalizeReportSections(input: unknown): Set<ReportSectionKey> {
  if (!Array.isArray(input)) return new Set(REPORT_SECTION_KEYS);
  const known = new Set<string>(REPORT_SECTION_KEYS);
  const picked = input.filter((s): s is ReportSectionKey => typeof s === "string" && known.has(s));
  return new Set(picked.length ? picked : REPORT_SECTION_KEYS);
}

/** The newest star rating of each facility dataset that carries one. */
export function latestQualityRatings(facRows: any[]) {
  const byType = new Map<string, any>();
  for (const f of facRows) {
    if (reportedNumber(f.quality_rating) == null) continue;
    const prev = byType.get(f.facility_type);
    if (!prev || String(f.data_year || "") > String(prev.data_year || "")) byType.set(f.facility_type, f);
  }
  return [...byType.values()].map((f) => ({
    facilityType: f.facility_type,
    name: f.facility_name,
    qualityRating: Number(f.quality_rating),
    dataYear: f.data_year,
  }));
}

/** A facility's identity card, from its newest CMS rows. */
export function facilityProfile(facRows: any[]) {
  const sorted = [...facRows].sort((a, b) => String(b.data_year || "").localeCompare(String(a.data_year || "")));
  const named = sorted.find((f) => f.facility_name) || sorted[0];
  return {
    providerId: named.provider_id,
    name: named.facility_name || null,
    city: sorted.find((f) => f.city)?.city || null,
    state: sorted.find((f) => validState(f.state))?.state || null,
    ...facilityDetails(sorted),
    facilityTypes: [...new Set(sorted.map((f) => f.facility_type).filter(Boolean))],
    latestYear: sorted.find((f) => f.data_year)?.data_year || null,
    recordCount: facRows.length,
  };
}

export async function handleGetComprehensiveReport(payload: any, user?: EntitledUser | null) {
  const { npi, provider_id } = payload;
  const sections = normalizeReportSections(payload?.sections);
  const want = (k: ReportSectionKey) => sections.has(k);

  if (!npi && !provider_id) {
    throw { status: 400, message: "npi or provider_id is required" };
  }

  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '15s'");

    const result: any = {
      generatedAt: new Date().toISOString(),
      sections: REPORT_SECTION_KEYS.filter((k) => sections.has(k)),
      provider: null,
      facility: null as null | Record<string, unknown>,
      locations: [],
      taxonomies: [],
      utilization: [],
      referralsFrom: [],
      referralsTo: [],
      orderReferring: null as null | Record<string, unknown>,
      affiliations: [],
      facilities: [],
      leadScore: null,
      enrichments: [],
      quality: [],
      ownership: [],
      costReports: [],
      additionalQuality: [],
      facilityUtilization: [],
      marketContext: null,
      unavailableSections: [],
    };
    const unavailable = new Set<ReportSectionKey>();
    const query = (affected: ReportSectionKey[], text: string, params: any[] = []) =>
      safeQuery(client, text, params, () => {
        for (const key of affected) if (want(key)) unavailable.add(key);
      });
    // Rows only the territory check reads when the locations section is off.
    let placeRows: any[] = [];

    if (npi) {
      const provRows = await query([...sections], `SELECT * FROM providers WHERE npi = $1 LIMIT 1`, [npi]);
      const prov = provRows[0];
      if (prov) {
        const isOrg = prov.entity_type === '2' || (prov.entity_type || '').toLowerCase().includes('organ');
        result.provider = {
          npi: prov.npi, entityType: prov.entity_type,
          firstName: prov.first_name, lastName: prov.last_name,
          organizationName: prov.organization_name,
          credential: prov.credential, status: prov.status,
          email: prov.email, phone: prov.phone,
          displayName: isOrg
            ? (prov.organization_name || prov.last_name || 'Unknown')
            : `${prov.first_name || ""} ${prov.last_name || ""}`.trim(),
        };
      }

      if (want("locations")) {
        result.locations = await query(["locations", "market"], `SELECT * FROM provider_locations WHERE npi = $1 LIMIT 100`, [npi]);
        placeRows = result.locations;
      } else if (want("market")) {
        placeRows = await query(["market"], `SELECT location_type, state, zip FROM provider_locations WHERE npi = $1 LIMIT 100`, [npi]);
      } else if (!isOrgAdmin(user)) {
        placeRows = await query([...sections], `SELECT location_type, state FROM provider_locations WHERE npi = $1 LIMIT 100`, [npi]);
      }
      if (want("taxonomies")) {
        result.taxonomies = await query(["taxonomies"], `SELECT * FROM provider_taxonomies WHERE npi = $1 LIMIT 100`, [npi]);
      }

      if (want("utilization")) {
        result.utilization = (await query(["utilization"], `
          SELECT service_type, hcpcs_description, total_services, total_unique_benes,
            total_medicare_payment_amt, average_submitted_chrg_amt, data_year
          FROM provider_service_utilization WHERE npi = $1
          ORDER BY data_year DESC LIMIT 100
        `, [npi])).map((u: any) => ({
          serviceType: u.hcpcs_description || u.service_type,
          totalServices: u.total_services,
          totalBeneficiaries: u.total_unique_benes,
          totalPayment: u.total_medicare_payment_amt,
          avgCharge: u.average_submitted_chrg_amt,
          dataYear: u.data_year,
        }));
      }

      // The profile's referral totals are summed from these lists, so they are
      // read for either section.
      if (want("referrals") || want("profile")) {
        result.referralsFrom = (await query(["referrals", "profile"], `
          SELECT referred_to_npi, referred_to_name, total_referrals, total_beneficiaries, data_year
          FROM cms_referrals WHERE npi = $1 ORDER BY total_referrals DESC LIMIT 50
        `, [npi])).map((r: any) => ({
          toNpi: r.referred_to_npi, toName: r.referred_to_name,
          totalReferrals: r.total_referrals, totalBeneficiaries: r.total_beneficiaries,
          dataYear: r.data_year,
        }));

        // Inbound: who shares patients with this provider (idx_cms_referrals_referred_to).
        result.referralsTo = (await query(["referrals", "profile"], `
          SELECT npi, total_referrals, total_beneficiaries, data_year
          FROM cms_referrals WHERE referred_to_npi = $1 ORDER BY total_referrals DESC NULLS LAST LIMIT 50
        `, [npi])).map((r: any) => ({
          fromNpi: r.npi, fromName: null as string | null,
          totalReferrals: r.total_referrals, totalBeneficiaries: r.total_beneficiaries,
          dataYear: r.data_year,
        }));
        const inboundNpis = want("referrals") ? result.referralsTo.map((r: any) => r.fromNpi).filter(Boolean) : [];
        if (inboundNpis.length) {
          const names = await query(["referrals"], `
            SELECT npi, entity_type, first_name, last_name, organization_name FROM providers WHERE npi = ANY($1)
          `, [inboundNpis]);
          const byNpi = new Map(names.map((p: any) => [p.npi, p.entity_type === "Individual" ? [p.first_name, p.last_name].filter(Boolean).join(" ") : (p.organization_name || [p.first_name, p.last_name].filter(Boolean).join(" "))]));
          for (const r of result.referralsTo) r.fromName = byNpi.get(r.fromNpi) || null;
        }
      }

      if (want("referrals")) {
        const orderRows = await query(["referrals"], `
          SELECT partb, dme, hha, pmd, hospice, as_of FROM cms_order_referring WHERE npi = $1 LIMIT 1
        `, [npi]);
        result.orderReferring = orderRows[0] || null;
      }

      if (want("affiliations")) {
        result.affiliations = await query(["affiliations"], `SELECT * FROM provider_affiliations WHERE npi = $1 LIMIT 100`, [npi]);
      }

      if (want("leadScore")) {
        const scoreRows = await query(["leadScore"], `
          SELECT npi, score, outreach_potential, referral_likelihood, data_completeness
          FROM lead_scores WHERE npi = $1 LIMIT 1
        `, [npi]);
        result.leadScore = scoreRows[0] || null;
      }

      if (want("enrichments")) {
        result.enrichments = (await query(["enrichments"], `
          SELECT source, field_name, new_value, confidence, status
          FROM enrichment_records WHERE npi = $1 LIMIT 50
        `, [npi])).map((e: any) => ({
          source: e.source, fieldName: e.field_name, newValue: e.new_value,
          confidence: e.confidence, status: e.status,
        }));
      }
    }

    const facilityLookup = provider_id || npi;
    // Facility rows feed three sections and, when the provider has no
    // located address, the territory check.
    const needFacilityRows = want("facilities") || want("quality") || want("profile") || want("market") || want("utilization")
      || (!isOrgAdmin(user) && !placeRows.some((l: any) => validState(l.state)));
    let facRows: any[] = [];
    if (facilityLookup && needFacilityRows) {
      facRows = await query(["facilities", "quality", "profile", "utilization", "market"], `
        SELECT f.id, f.facility_type, f.provider_id, f.facility_name, f.address, f.zip, f.city, f.state,
          f.quality_rating, f.total_payments, f.total_discharges, f.total_charges,
          f.avg_length_of_stay, f.total_days_of_care, f.data_year,
          COALESCE(r.raw_data, f.raw_data) AS raw_data
        FROM medicare_facilities f
        LEFT JOIN medicare_facilities_raw r ON r.facility_id = f.id
        WHERE f.provider_id = $1
        ORDER BY f.data_year DESC NULLS LAST, f.id DESC LIMIT 200
      `, [facilityLookup]);
      if (want("facilities")) {
        result.facilities = facRows.map((f: any) => ({
          id: f.id,
          facilityType: f.facility_type,
          providerId: f.provider_id,
          name: f.facility_name,
          city: f.city,
          state: f.state,
          address: f.address,
          zip: f.zip,
          qualityRating: f.quality_rating,
          totalPayments: f.total_payments,
          totalDischarges: f.total_discharges,
          totalCharges: f.total_charges,
          avgLengthOfStay: f.avg_length_of_stay,
          totalDaysOfCare: f.total_days_of_care,
          dataYear: f.data_year,
        }));
      }
      if (want("quality")) result.quality = latestQualityRatings(facRows);
      if (want("profile") && provider_id && facRows.length) result.facility = facilityProfile(facRows);
    }

    let pacRows: any[] = [];
    if (provider_id && (want("utilization") || want("profile") || want("market"))) {
      pacRows = await query(["utilization", "profile", "market"], `
        SELECT DISTINCT ON (setting) setting, ccn, provider_name, city, state, zip5, data_year, bene_count,
          stays, service_days, charges, allowed, medicare_payment, standardized_payment
        FROM cms_pac_utilization WHERE ccn = $1 AND summary_level = 'provider'
        ORDER BY setting, data_year DESC LIMIT 10
      `, [provider_id]);
      if (want("profile") && pacRows.length) {
        result.facility = facilityProfile([...facRows, ...pacRows.map((r) => ({
          ...r, provider_id: r.ccn, facility_name: r.provider_name, facility_type: r.setting, zip: r.zip5,
        }))]);
      }
    }
    if (want("utilization") || want("profile")) result.facilityUtilization = summarizeFacilityUtilization(facRows, pacRows);

    const extraTypes = (["ownership", "costReports", "additionalQuality"] as const)
      .filter((key) => want(key)).flatMap((key) => [...REPORT_DATASETS[key]]);
    let extraRows: any[] = [];
    if (extraTypes.length) {
      // Statistical composite keys identify owner/measure rows, not facilities.
      const ids = [...new Set([provider_id, npi].filter((id) =>
        typeof id === "string" && /^(?:[a-z0-9]{6}|\d{10})$/i.test(id)))];
      extraRows = await query(["ownership", "costReports", "additionalQuality"], `
        SELECT f.facility_type, f.provider_id, f.state, f.data_year,
          COALESCE(r.raw_data, f.raw_data) AS raw_data
        FROM medicare_facilities f
        LEFT JOIN medicare_facilities_raw r ON r.facility_id = f.id
        WHERE f.provider_id = ANY($1) AND f.facility_type = ANY($2)
        ORDER BY f.data_year DESC NULLS LAST, f.id LIMIT 200
      `, [ids, [...extraTypes, ...(want("ownership") ? ENROLLMENT_DATASETS : [])]]);
    }
    // A restricted plan sees a provider only in its territory; owners and
    // platform admins see everything. Checked against the practice location
    // (else the facility), like the market views check a place.
    if (!isOrgAdmin(user)) {
      const place = placeRows.find((l: any) => l.location_type === "Practice" && validState(l.state))
        ?? placeRows.find((l: any) => validState(l.state))
        ?? facRows.find((f: any) => validState(f.state))
        ?? pacRows.find((f: any) => validState(f.state))
        ?? extraRows.find((f: any) => validState(f.state));
      if (place) assertTerritory(user, { state: validState(place.state) });
      else if (extraRows.length && !isUnrestricted(user)) {
        throw { status: 403, message: "Cannot verify the territory for these report datasets." };
      }
      // A caller can supply both identifiers: the NPI's permitted address
      // must not authorize an unrelated facility outside its territory.
      if (npi && provider_id && npi !== provider_id) {
        const facilityRows = [...facRows, ...extraRows, ...pacRows.map((r) => ({ ...r, provider_id: r.ccn }))].filter((f: any) => f.provider_id === provider_id);
        const facilityPlace = facilityRows.find((f: any) => validState(f.state));
        if (facilityPlace) assertTerritory(user, { state: validState(facilityPlace.state) });
        else if (facilityRows.length && !isUnrestricted(user)) {
          throw { status: 403, message: "Cannot verify the facility's territory." };
        }

      }
    }

    // County entitlements apply even to organization owners. A state-only
    // check must never authorize a different county in a County Pack.
    if (want("market")) {
      const practice = placeRows.find((r) => r.location_type === "Practice") ?? placeRows[0];
      const places = provider_id ? [...facRows, ...pacRows] : practice ? [practice] : facRows;
      let county: ReturnType<typeof zipToCounty> = null;
      if (places.length) {
        try {
          const index = await getGeoIndex(pool);
          for (const place of places) {
            const details = facilityDetails([place]);
            county = resolveCounty(index, { fips: place.county_fips })
              ?? zipToCounty(index, place.zip || place.zip5 || details.zip);
            if (county && validState(place.state) && county.state !== validState(place.state)) county = null;
            if (county) break;
          }
        } catch {
          unavailable.add("market");
        }
      }
      if (!county && !isUnrestricted(user)) {
        unavailable.add("market");
      }
      if (county) {
        assertTerritory(user, { state: county.state, county_fips: county.fips, county_name: county.name });
        const marketRows = await query(["market"],
          `SELECT * FROM rollup_county_market_profile WHERE county_fips = $1 LIMIT 1`, [county.fips]);
        if (marketRows[0]) result.marketContext = {
          countyName: county.name, countyFips: county.fips, state: county.state,
          metrics: summarizeMarketProfile(marketRows[0]),
        };
      }
    }

    if (want("ownership")) {
      // All Owners rows use enrollment_owner_role keys, not CCNs. Resolve only
      // enrollment IDs present on the exact CCN/NPI rows; never match by name.
      for (const id of enrollmentIds(extraRows)) {
        extraRows.push(...await query(["ownership"], `
          SELECT f.facility_type, f.data_year, COALESCE(r.raw_data, f.raw_data) AS raw_data
          FROM medicare_facilities f
          LEFT JOIN medicare_facilities_raw r ON r.facility_id = f.id
          WHERE f.provider_id >= $1 AND f.provider_id < $2
            AND left(f.provider_id, length($1) + 1) = $1 || '_'
            AND f.facility_type = ANY($3)
          ORDER BY f.data_year DESC NULLS LAST, f.id LIMIT 30
        `, [id, `${id}z`, REPORT_DATASETS.ownership]));
      }
      result.ownership = summarizeOwnership(extraRows);
    }
    if (want("costReports")) result.costReports = summarizeCostReports(extraRows);
    if (want("additionalQuality")) result.additionalQuality = summarizeAdditionalQuality(extraRows);

    // Aggregate totals and distinct years from the full table — not from the
    // 100-row display slice which undercounts providers with many HCPCS lines
    // and may miss years that fall outside the top-100 rows.
    let totalPayments: number | null = null, totalServices: number | null = null, totalBeneficiaries: number | null = null;
    let utilizationYears: string[] = [];
    if (npi && want("profile")) {
      const aggRows = await query(["profile"], `
        SELECT
          SUM(CAST(NULLIF(total_medicare_payment_amt,'') AS NUMERIC)) AS total_payments,
          SUM(CAST(NULLIF(total_services,'') AS NUMERIC))             AS total_services,
          SUM(CAST(NULLIF(total_unique_benes,'') AS NUMERIC))          AS total_benes
        FROM provider_service_utilization
        WHERE npi = $1
          AND data_year = (
            SELECT MAX(data_year) FROM provider_service_utilization WHERE npi = $1
          )
      `, [npi]);
      if (aggRows.length > 0) {
        totalPayments      = reportedNumber(aggRows[0].total_payments);
        totalServices      = reportedNumber(aggRows[0].total_services);
        totalBeneficiaries = reportedNumber(aggRows[0].total_benes);
      }
      const yearRows = await query(["profile"],
        `SELECT DISTINCT data_year FROM provider_service_utilization WHERE npi = $1 ORDER BY data_year DESC`,
        [npi],
      );
      utilizationYears = yearRows.map((r: any) => r.data_year).filter(Boolean);
    }
    const referralTotal = (rows: any[]) => {
      const values = rows.map((r) => reportedNumber(r.totalReferrals)).filter((v): v is number => v != null);
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    };
    const totalReferralsOut = referralTotal(result.referralsFrom);
    const totalReferralsIn = referralTotal(result.referralsTo);

    result.summary = {
      totalPayments: totalPayments == null ? null : Math.round(totalPayments),
      totalServices,
      totalBeneficiaries,
      totalReferralsOut,
      totalReferralsIn,
      locationCount: result.locations.length,
      taxonomyCount: result.taxonomies.length,
      affiliationCount: result.affiliations.length,
      facilityCount: result.facilities.length,
      utilizationYears,
      beneficiaryNote: "Beneficiary counts are summed across service codes and may count the same person more than once.",
    };
    // The lists were read only for the profile's totals.
    if (!want("referrals")) {
      result.referralsFrom = [];
      result.referralsTo = [];
    }

    result.unavailableSections = REPORT_SECTION_KEYS.filter((k) => unavailable.has(k));
    return result;
  } finally {
    try { await client.query("RESET statement_timeout"); } catch {}
    client.release();
  }
}
