import { pool } from "../db";
import { assertTerritory, type EntitledUser } from "../lib/entitlements";
import { isOrgAdmin } from "../lib/roles";
import {
  ENROLLMENT_DATASETS, REPORT_DATASETS, enrollmentIds,
  summarizeOwnership, summarizeCostReports, summarizeAdditionalQuality,
} from "../lib/comprehensiveReportData";

async function safeQuery(client: any, text: string, params: any[] = []) {
  try {
    const result = await client.query(text, params);
    return result.rows;
  } catch (e: any) {
    console.error("[Report query error]", e.message?.slice(0, 100));
    return [];
  }
}

const validState = (s: unknown) => /^[A-Z]{2}$/.test(String(s ?? "").trim().toUpperCase()) ? String(s).trim().toUpperCase() : null;

// The parts of the report a caller can ask for (mirrored by REPORT_SECTIONS in
// src/components/reports/reportSections.js). "profile" is the identity card
// and the headline totals.
export const REPORT_SECTION_KEYS = [
  "profile", "locations", "taxonomies", "utilization", "referrals",
  "affiliations", "facilities", "quality", "ownership", "costReports", "additionalQuality", "leadScore", "enrichments",
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
    if (f.quality_rating == null || f.quality_rating === "") continue;
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
    };
    // Rows only the territory check reads when the locations section is off.
    let placeRows: any[] = [];

    if (npi) {
      const provRows = await safeQuery(client, `SELECT * FROM providers WHERE npi = $1 LIMIT 1`, [npi]);
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
        result.locations = await safeQuery(client, `SELECT * FROM provider_locations WHERE npi = $1`, [npi]);
        placeRows = result.locations;
      } else if (!isOrgAdmin(user)) {
        placeRows = await safeQuery(client, `SELECT location_type, state FROM provider_locations WHERE npi = $1`, [npi]);
      }
      if (want("taxonomies")) {
        result.taxonomies = await safeQuery(client, `SELECT * FROM provider_taxonomies WHERE npi = $1`, [npi]);
      }

      if (want("utilization")) {
        result.utilization = (await safeQuery(client, `
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
        result.referralsFrom = (await safeQuery(client, `
          SELECT referred_to_npi, referred_to_name, total_referrals, total_beneficiaries, data_year
          FROM cms_referrals WHERE npi = $1 ORDER BY total_referrals DESC LIMIT 50
        `, [npi])).map((r: any) => ({
          toNpi: r.referred_to_npi, toName: r.referred_to_name,
          totalReferrals: r.total_referrals, totalBeneficiaries: r.total_beneficiaries,
          dataYear: r.data_year,
        }));

        // Inbound: who shares patients with this provider (idx_cms_referrals_referred_to).
        result.referralsTo = (await safeQuery(client, `
          SELECT npi, total_referrals, total_beneficiaries, data_year
          FROM cms_referrals WHERE referred_to_npi = $1 ORDER BY total_referrals DESC NULLS LAST LIMIT 50
        `, [npi])).map((r: any) => ({
          fromNpi: r.npi, fromName: null as string | null,
          totalReferrals: r.total_referrals, totalBeneficiaries: r.total_beneficiaries,
          dataYear: r.data_year,
        }));
        const inboundNpis = want("referrals") ? result.referralsTo.map((r: any) => r.fromNpi).filter(Boolean) : [];
        if (inboundNpis.length) {
          const names = await safeQuery(client, `
            SELECT npi, entity_type, first_name, last_name, organization_name FROM providers WHERE npi = ANY($1)
          `, [inboundNpis]);
          const byNpi = new Map(names.map((p: any) => [p.npi, p.entity_type === "Individual" ? [p.first_name, p.last_name].filter(Boolean).join(" ") : (p.organization_name || [p.first_name, p.last_name].filter(Boolean).join(" "))]));
          for (const r of result.referralsTo) r.fromName = byNpi.get(r.fromNpi) || null;
        }
      }

      if (want("referrals")) {
        const orderRows = await safeQuery(client, `
          SELECT partb, dme, hha, pmd, hospice, as_of FROM cms_order_referring WHERE npi = $1 LIMIT 1
        `, [npi]);
        result.orderReferring = orderRows[0] || null;
      }

      if (want("affiliations")) {
        result.affiliations = await safeQuery(client, `SELECT * FROM provider_affiliations WHERE npi = $1`, [npi]);
      }

      if (want("leadScore")) {
        const scoreRows = await safeQuery(client, `
          SELECT npi, score, outreach_potential, referral_likelihood, data_completeness
          FROM lead_scores WHERE npi = $1 LIMIT 1
        `, [npi]);
        result.leadScore = scoreRows[0] || null;
      }

      if (want("enrichments")) {
        result.enrichments = (await safeQuery(client, `
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
    const needFacilityRows = want("facilities") || want("quality") || want("profile")
      || (!isOrgAdmin(user) && !placeRows.some((l: any) => validState(l.state)));
    let facRows: any[] = [];
    if (facilityLookup && needFacilityRows) {
      facRows = await safeQuery(client, `
        SELECT id, facility_type, provider_id, facility_name, city, state,
          quality_rating, total_payments, total_discharges, data_year
        FROM medicare_facilities WHERE provider_id = $1
        ORDER BY data_year DESC LIMIT 200
      `, [facilityLookup]);
      if (want("facilities")) {
        result.facilities = facRows.map((f: any) => ({
          id: f.id,
          facilityType: f.facility_type,
          providerId: f.provider_id,
          name: f.facility_name,
          city: f.city,
          state: f.state,
          qualityRating: f.quality_rating,
          totalPayments: f.total_payments,
          totalDischarges: f.total_discharges,
          dataYear: f.data_year,
        }));
      }
      if (want("quality")) result.quality = latestQualityRatings(facRows);
      if (want("profile") && provider_id && facRows.length) result.facility = facilityProfile(facRows);
    }

    const extraTypes = (["ownership", "costReports", "additionalQuality"] as const)
      .filter((key) => want(key)).flatMap((key) => [...REPORT_DATASETS[key]]);
    let extraRows: any[] = [];
    if (extraTypes.length) {
      const ids = [...new Set([provider_id, npi].filter(Boolean))];
      extraRows = await safeQuery(client, `
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
        ?? extraRows.find((f: any) => validState(f.state));
      if (place) assertTerritory(user, { state: validState(place.state) });
    }

    if (want("ownership")) {
      // All Owners rows use enrollment_owner_role keys, not CCNs. Resolve only
      // enrollment IDs present on the exact CCN/NPI rows; never match by name.
      for (const id of enrollmentIds(extraRows)) {
        extraRows.push(...await safeQuery(client, `
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
    let totalPayments = 0, totalServices = 0, totalBeneficiaries = 0;
    let utilizationYears: string[] = [];
    if (npi && want("profile")) {
      const aggRows = await safeQuery(client, `
        SELECT
          COALESCE(SUM(CAST(NULLIF(total_medicare_payment_amt,'') AS NUMERIC)), 0) AS total_payments,
          COALESCE(SUM(CAST(NULLIF(total_services,'') AS NUMERIC)), 0)             AS total_services,
          COALESCE(SUM(CAST(NULLIF(total_unique_benes,'') AS NUMERIC)), 0)          AS total_benes
        FROM provider_service_utilization
        WHERE npi = $1
          AND data_year = (
            SELECT MAX(data_year) FROM provider_service_utilization WHERE npi = $1
          )
      `, [npi]);
      if (aggRows.length > 0) {
        totalPayments      = parseFloat(aggRows[0].total_payments || "0");
        totalServices      = parseInt(aggRows[0].total_services   || "0", 10);
        totalBeneficiaries = parseInt(aggRows[0].total_benes      || "0", 10);
      }
      const yearRows = await safeQuery(client,
        `SELECT DISTINCT data_year FROM provider_service_utilization WHERE npi = $1 ORDER BY data_year DESC`,
        [npi],
      );
      utilizationYears = yearRows.map((r: any) => r.data_year).filter(Boolean);
    }
    const totalReferralsOut = result.referralsFrom.reduce(
      (s: number, r: any) => s + (parseInt(r.totalReferrals) || 0), 0
    );
    const totalReferralsIn = result.referralsTo.reduce(
      (s: number, r: any) => s + (parseInt(r.totalReferrals) || 0), 0
    );

    result.summary = {
      totalPayments: Math.round(totalPayments),
      totalServices,
      totalBeneficiaries,
      totalReferralsOut,
      totalReferralsIn,
      locationCount: result.locations.length,
      taxonomyCount: result.taxonomies.length,
      affiliationCount: result.affiliations.length,
      facilityCount: result.facilities.length,
      utilizationYears,
    };
    // The lists were read only for the profile's totals.
    if (!want("referrals")) {
      result.referralsFrom = [];
      result.referralsTo = [];
    }

    return result;
  } finally {
    try { await client.query("RESET statement_timeout"); } catch {}
    client.release();
  }
}
