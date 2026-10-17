import { db, pool } from "../db";
import { medicareFacilities, medicareFacilitiesRaw, providers, providerLocations, providerTaxonomies, providerServiceUtilization, cmsReferrals, leadScores, cmsOrderReferring, rollupReferralSources } from "../db/schema";
import { eq, sql, and, ilike, inArray, desc, asc } from "drizzle-orm";
import { providerReference, facilityDme, facilityDrgs, facilityCost, facilityAhcah } from "./marketReference";

const FACILITY_TYPE_GROUPS: Record<string, string[]> = {
  hospital: [
    "hospital_general_info", "hospital_enrollments", "hospital_all_owners",
    "hospital_cost_report", "hospital_readmissions", "hospital_hcahps_survey",
    "hospital_timely_effective_care", "hospital_spending_per_beneficiary",
    "hospital_spending_by_claim", "hospital_hac_reduction",
    "hospital_imaging_efficiency", "hospital_service_area",
    "hospital_unplanned_visits", "hospital_complications", "hospital_infections",
    "hospital_psychiatric_facility", "hospital_value_based_purchasing",
    "hospital_price_transparency", "hospital_joint_replacement",
    "ambulatory_surgical_center",
    "medicare_inpatient_by_provider", "medicare_outpatient_by_provider",
    "medicare_ma_inpatient",
  ],
  home_health: [
    "home_health_agencies", "home_health_enrollments", "home_health_all_owners",
    "home_health_cost_report", "home_health_patient_survey",
    "home_health_national_measures", "home_health_state_measures",
    "home_health_zip_data",
    "medicare_hha_utilization", "medicare_hha_stats",
    "home_infusion_therapy",
    "home_health_vbp",
    "hha_utilization_geo_casemix",
  ],
  hospice: [
    "hospice_general_info", "hospice_enrollments", "hospice_all_owners",
    "hospice_provider_data", "hospice_provider_measures",
    "hospice_national_measures", "hospice_state_measures", "hospice_zip_data",
    "medicare_hospice_utilization",
  ],
  snf: [
    "snf_provider_measures", "snf_quality_reporting",
    "nursing_home_providers", "nursing_home_ownership",
    "nursing_home_fire_safety", "nursing_home_health_deficiencies",
    "nursing_home_deficiencies", "nursing_home_mds_quality",
    "nursing_home_penalties", "nursing_home_claims_quality",
    "medicare_snf_utilization", "medicare_snf_stats",
    "snf_enrollments", "snf_all_owners", "snf_cost_report",
    "snf_vbp_facility",
    "nursing_home_chain_performance",
    "pbj_daily_nurse_staffing", "pbj_daily_nonnurse_staffing",
    "ltc_facility_characteristics", "mds_frequency",
    "snf_utilization_geo_casemix",
  ],
  irf: [
    "inpatient_rehab_general_info", "inpatient_rehab_provider_data",
    "medicare_irf_utilization",
  ],
  ltch: [
    "long_term_care_general_info", "long_term_care_provider_data",
    "medicare_ltch_utilization",
  ],
  dme: [
    "medical_equipment_suppliers", "medicare_dme_by_supplier",
    "medicare_dme_by_referring",
  ],
  community_health: [
    "fqhc_enrollments", "fqhc_all_owners",
    "rural_health_clinic_enrollments", "rural_health_clinic_all_owners",
  ],
};

export const LISTING_PRIMARY_TYPES: Record<string, string> = {
  hospital: "hospital_general_info",
  home_health: "home_health_agencies",
  hospice: "hospice_general_info",
  snf: "nursing_home_providers",
  irf: "inpatient_rehab_general_info",
  ltch: "long_term_care_general_info",
  dme: "medical_equipment_suppliers",
  community_health: "fqhc_enrollments",
};

export function getFacilityTypeGroup(facilityType: string): string | null {
  for (const [group, types] of Object.entries(FACILITY_TYPE_GROUPS)) {
    if (types.some(t => facilityType.startsWith(t) || facilityType.includes(t))) return group;
  }
  return null;
}

/**
 * The year embedded in a CMS data_year for ordering ("2023", "2023-24" -> 2023).
 * Plain arithmetic on the varchar breaks on non-numeric values (NaN sorts
 * nowhere), so parse the leading 4-digit year and treat the rest as unknown.
 */
export function parseDataYear(value: unknown): number | null {
  if (value == null) return null;
  const m = String(value).match(/\d{4}/);
  return m ? Number(m[0]) : null;
}

/**
 * Linked-facility rows keyed by the provider's NPI (no CCN in the source row)
 * can't be opened by FacilityDetail, which is keyed by CCN: match each one to
 * its real CCN-keyed rows (same facility group, state and name) so the card
 * links to actual facility records. Entries that can't be matched keep the
 * NPI key and `resolved_ccn: false`; the card renders those as non-clickable.
 */
async function resolveLinkedFacilityCcn(f: any) {
  const group = getFacilityTypeGroup(f.facility_type || "");
  const groupTypes = group ? FACILITY_TYPE_GROUPS[group] : null;
  if (!groupTypes || !f.facility_name || !f.state) return { ...f, resolved_ccn: false };
  const needle = String(f.facility_name).replace(/[%_\\]/g, (c) => `\\${c}`);
  const rows = await db.select({
    provider_id: medicareFacilities.provider_id,
    facility_name: medicareFacilities.facility_name,
    city: medicareFacilities.city,
    state: medicareFacilities.state,
    quality_rating: medicareFacilities.quality_rating,
    data_year: medicareFacilities.data_year,
  })
    .from(medicareFacilities)
    .where(and(
      inArray(medicareFacilities.facility_type, groupTypes),
      eq(medicareFacilities.state, String(f.state).toUpperCase()),
      ilike(medicareFacilities.facility_name, `%${needle}%`),
    ))
    .limit(25)
    .catch(() => [] as any[]);
  const isCcn = (id: any) => !!id && !/^\d{10}$/.test(String(id));
  const norm = (s: any) => String(s || "").toLowerCase().trim();
  const name = norm(f.facility_name);
  const pick =
    rows.find((r: any) => isCcn(r.provider_id) && norm(r.facility_name) === name && norm(r.city) === norm(f.city)) ||
    rows.find((r: any) => isCcn(r.provider_id) && norm(r.facility_name) === name) ||
    rows.find((r: any) => isCcn(r.provider_id));
  if (!pick?.provider_id) return { ...f, resolved_ccn: false };
  return {
    provider_id: pick.provider_id,
    facility_name: pick.facility_name || f.facility_name,
    facility_type: f.facility_type,
    city: pick.city || f.city,
    state: pick.state || f.state,
    quality_rating: pick.quality_rating ?? f.quality_rating,
    data_year: pick.data_year || f.data_year,
    resolved_ccn: true,
  };
}

/** Rows for one facility, limited to its group's facility types when a group is given. */
export function facilityRowsWhere(providerId: string, groupTypes: string[] | null | undefined) {
  // inArray, not sql`= ANY(${groupTypes})`: drizzle expands an interpolated
  // array into a row ($2, $3, …), which Postgres rejects for ANY.
  return groupTypes
    ? and(eq(medicareFacilities.provider_id, providerId), inArray(medicareFacilities.facility_type, groupTypes))
    : eq(medicareFacilities.provider_id, providerId);
}

export async function handleGetFacilityDetail(params: any) {
  const { provider_id, facility_group } = params;
  if (!provider_id) return { error: "provider_id is required" };

  // An unknown ?group= must not run the query unfiltered while the page brands
  // itself as a hospital: validate first. Unknown groups behave like no group
  // (all rows), and the response reports the group the data actually resolved
  // to so the page can say so honestly.
  const validGroup = facility_group && FACILITY_TYPE_GROUPS[facility_group] ? facility_group : null;
  const groupTypes = validGroup ? FACILITY_TYPE_GROUPS[validGroup] : null;

  // raw_data is moving to the medicare_facilities_raw side table (phase 1):
  // pull every facility column explicitly and overlay raw_data via a LEFT JOIN
  // with COALESCE, so we keep working against both the (still-present) column
  // and the new side table during the rollout.
  const facilityRows = await db.select({
    id: medicareFacilities.id,
    facility_type: medicareFacilities.facility_type,
    provider_id: medicareFacilities.provider_id,
    facility_name: medicareFacilities.facility_name,
    address: medicareFacilities.address,
    city: medicareFacilities.city,
    state: medicareFacilities.state,
    zip: medicareFacilities.zip,
    total_discharges: medicareFacilities.total_discharges,
    total_days_of_care: medicareFacilities.total_days_of_care,
    avg_length_of_stay: medicareFacilities.avg_length_of_stay,
    total_charges: medicareFacilities.total_charges,
    total_payments: medicareFacilities.total_payments,
    quality_rating: medicareFacilities.quality_rating,
    data_year: medicareFacilities.data_year,
    raw_data: sql<any>`COALESCE(${medicareFacilitiesRaw.raw_data}, ${medicareFacilities.raw_data})`,
    import_batch_id: medicareFacilities.import_batch_id,
    created_date: medicareFacilities.created_date,
    updated_date: medicareFacilities.updated_date,
  })
    .from(medicareFacilities)
    .leftJoin(medicareFacilitiesRaw, eq(medicareFacilitiesRaw.facility_id, medicareFacilities.id))
    .where(facilityRowsWhere(provider_id, groupTypes))
    .limit(500);

  if (facilityRows.length === 0) {
    return { error: "No facility data found", provider_id };
  }

  const first = facilityRows[0];
  const facilityTypes = [...new Set(facilityRows.map(r => r.facility_type))];
  const dataYears = [...new Set(facilityRows.map(r => r.data_year).filter(Boolean))].sort();

  const byType: Record<string, any[]> = {};
  for (const row of facilityRows) {
    const ft = row.facility_type || "unknown";
    if (!byType[ft]) byType[ft] = [];
    byType[ft].push(row);
  }

  const latestQuality = facilityRows
    .filter(r => r.quality_rating != null)
    // data_year is a varchar: parse the numeric year instead of subtracting
    // strings, so values like "2023-24" don't poison the sort with NaN.
    .sort((a, b) => (parseDataYear(b.data_year) ?? -1) - (parseDataYear(a.data_year) ?? -1))[0];

  // Each dollar counted once: the same totals repeat across a facility's files
  // (the audited cost report, the one-row-per-facility CMS utilization files
  // and the spending files), so summing every row double- or triple-counts.
  // Prefer the audited cost report; when the group has none, fall back to the
  // CMS utilization files; when it has neither, to any row carrying the value.
  // Within the chosen rows use the latest data year only, so multiple years of
  // the same file don't stack either.
  const COST_REPORT_HINT = "cost_report";
  const UTILIZATION_FILE_TYPES = [
    "medicare_inpatient_by_provider", "medicare_outpatient_by_provider", "medicare_ma_inpatient",
    "medicare_hha_utilization", "medicare_hha_stats",
    "medicare_hospice_utilization",
    "medicare_snf_utilization", "medicare_snf_stats",
    "medicare_irf_utilization", "medicare_ltch_utilization",
    "medicare_dme_by_supplier",
  ];
  const costReportRows = facilityRows.filter(r => (r.facility_type || "").includes(COST_REPORT_HINT));
  const utilizationFileRows = facilityRows.filter(r => UTILIZATION_FILE_TYPES.includes(r.facility_type || ""));
  const financialCandidates = costReportRows.length
    ? costReportRows
    : utilizationFileRows.length
      ? utilizationFileRows
      : facilityRows;
  const candidateYears = financialCandidates.map(r => parseDataYear(r.data_year)).filter((y): y is number => y != null);
  const latestFinancialYear = candidateYears.length ? Math.max(...candidateYears) : null;
  const financialSource = latestFinancialYear == null
    ? financialCandidates
    : financialCandidates.filter(r => parseDataYear(r.data_year) === latestFinancialYear);
  const financials = financialSource.reduce((acc, r) => {
    if (r.total_payments) acc.totalPayments += Number(r.total_payments) || 0;
    if (r.total_charges) acc.totalCharges += Number(r.total_charges) || 0;
    if (r.total_discharges) acc.totalDischarges += Number(r.total_discharges) || 0;
    if (r.total_days_of_care) acc.totalDaysOfCare += Number(r.total_days_of_care) || 0;
    return acc;
  }, { totalPayments: 0, totalCharges: 0, totalDischarges: 0, totalDaysOfCare: 0 });

  let linkedProvider = null;
  const npiCandidate = provider_id.length === 10 ? provider_id : null;
  if (npiCandidate) {
    const [prov] = await db.select().from(providers).where(eq(providers.npi, npiCandidate)).limit(1);
    if (prov) {
      const [locs, taxons, scores] = await Promise.all([
        db.select().from(providerLocations).where(eq(providerLocations.npi, npiCandidate)).limit(10),
        db.select().from(providerTaxonomies).where(eq(providerTaxonomies.npi, npiCandidate)).limit(10),
        db.select().from(leadScores).where(eq(leadScores.npi, npiCandidate)).orderBy(desc(leadScores.last_calculated)).limit(1),
      ]);
      linkedProvider = { ...prov, locations: locs, taxonomies: taxons, lead_score: scores[0] || null };
    }
  }

  let dme = null;
  let drgs = null;
  let costReport = null;
  let ahcah = null;
  try {
    const client = await pool.connect();
    try {
      dme = await facilityDme(client, String(provider_id));
      drgs = await facilityDrgs(client, String(provider_id));
      costReport = await facilityCost(client, String(provider_id));
      ahcah = await facilityAhcah(client, String(provider_id));
    } finally {
      client.release();
    }
  } catch {
    dme = null;
    drgs = null;
    costReport = null;
    ahcah = null;
  }

  return {
    provider_id,
    facility_name: first.facility_name || "",
    address: first.address || "",
    city: first.city || "",
    state: first.state || "",
    zip: first.zip || "",
    quality_rating: latestQuality?.quality_rating || null,
    facility_group: validGroup || getFacilityTypeGroup(first.facility_type || "") || "unknown",
    facility_types: facilityTypes,
    data_years: dataYears,
    record_count: facilityRows.length,
    financials,
    by_type: byType,
    linked_provider: linkedProvider,
    dme,
    drgs,
    cost_report: costReport,
    ahcah,
  };
}

const CLINICIAN_TYPES = [
  'clinician_mips_performance', 'clinician_mips_measures',
  'clinician_national_file', 'clinician_group_measures', 'clinician_group_experience',
  'facility_affiliation',
];
const PROVIDER_UTILIZATION_TYPES = [
  'medicare_physician_by_provider', 'medicare_part_d_prescribers',
  'medicare_dme_by_referring', 'medicare_dme_by_supplier',
  'medicare_spending_by_drug_b', 'medicare_spending_by_drug_d',
  'cms_order_referring', 'provider_service_utilization',
  'medicare_telehealth_trends',
];
const PROVIDER_NETWORK_TYPES = [
  'aco_participants', 'aco_organizations', 'aco_financial_results',
];
const ALL_PROVIDER_CMS_TYPES = [...CLINICIAN_TYPES, ...PROVIDER_UTILIZATION_TYPES, ...PROVIDER_NETWORK_TYPES];

export async function handleGetProviderCMSData(params: any) {
  const { npi } = params;
  if (!npi) return { error: "npi is required" };

  // raw_data is moving to the medicare_facilities_raw side table (phase 1):
  // explicit projection + LEFT JOIN keeps consumers like ProviderCMSDataCard
  // and MIPSPerformanceCard working whether the row's raw_data still lives on
  // the column or has been migrated to the side table.
  const [orderReferring = null] = await db.select({
    partb: cmsOrderReferring.partb, dme: cmsOrderReferring.dme, hha: cmsOrderReferring.hha,
    pmd: cmsOrderReferring.pmd, hospice: cmsOrderReferring.hospice, as_of: cmsOrderReferring.as_of,
  }).from(cmsOrderReferring).where(eq(cmsOrderReferring.npi, String(npi))).limit(1).catch(() => [] as any[]);
  // The clinician's standing as a post-acute referral source (market rollup).
  const [potential = null] = await db.select().from(rollupReferralSources).where(eq(rollupReferralSources.npi, String(npi))).limit(1).catch(() => [] as any[]);
  let referralPotential: Record<string, unknown> | null = null;
  let rollups: Record<string, unknown> | null = null;
  if (potential) {
    const { getGeoIndex } = await import("../lib/geo");
    const { pool } = await import("../db");
    const index = await getGeoIndex(pool).catch(() => null);
    referralPotential = { ...potential, county_name: potential.county_fips && index ? index.counties.get(potential.county_fips)?.name ?? null : null };
    // When the rollup behind the card last computed: every market view says so (MarketFreshness).
    const { marketRollupFreshness } = await import("./market");
    rollups = await marketRollupFreshness();
  }

  const allRows = await db.select({
    id: medicareFacilities.id,
    facility_type: medicareFacilities.facility_type,
    provider_id: medicareFacilities.provider_id,
    facility_name: medicareFacilities.facility_name,
    address: medicareFacilities.address,
    city: medicareFacilities.city,
    state: medicareFacilities.state,
    zip: medicareFacilities.zip,
    total_discharges: medicareFacilities.total_discharges,
    total_days_of_care: medicareFacilities.total_days_of_care,
    avg_length_of_stay: medicareFacilities.avg_length_of_stay,
    total_charges: medicareFacilities.total_charges,
    total_payments: medicareFacilities.total_payments,
    quality_rating: medicareFacilities.quality_rating,
    data_year: medicareFacilities.data_year,
    raw_data: sql<any>`COALESCE(${medicareFacilitiesRaw.raw_data}, ${medicareFacilities.raw_data})`,
    import_batch_id: medicareFacilities.import_batch_id,
    created_date: medicareFacilities.created_date,
    updated_date: medicareFacilities.updated_date,
  })
    .from(medicareFacilities)
    .leftJoin(medicareFacilitiesRaw, eq(medicareFacilitiesRaw.facility_id, medicareFacilities.id))
    .where(eq(medicareFacilities.provider_id, npi))
    .orderBy(desc(medicareFacilities.data_year))
    .limit(500);

  const mipsByYear: Record<string, any> = {};
  const clinicianData: Record<string, any[]> = {};
  const providerUtilData: Record<string, any[]> = {};
  const networkData: Record<string, any[]> = {};
  const linkedCandidates: Record<string, any> = {};

  for (const row of allRows) {
    const ft = row.facility_type || "unknown";

    if (ft === 'clinician_mips_performance' || ft === 'clinician_mips_measures') {
      const year = row.data_year || "unknown";
      if (!mipsByYear[year]) mipsByYear[year] = { year, performance: [], measures: [] };
      if (ft === 'clinician_mips_performance') {
        mipsByYear[year].performance.push(row);
      } else {
        mipsByYear[year].measures.push(row);
      }
    } else if (CLINICIAN_TYPES.includes(ft)) {
      if (!clinicianData[ft]) clinicianData[ft] = [];
      clinicianData[ft].push(row);
    } else if (PROVIDER_UTILIZATION_TYPES.includes(ft)) {
      if (!providerUtilData[ft]) providerUtilData[ft] = [];
      providerUtilData[ft].push(row);
    } else if (PROVIDER_NETWORK_TYPES.includes(ft)) {
      if (!networkData[ft]) networkData[ft] = [];
      networkData[ft].push(row);
    } else {
      const key = `${row.provider_id}_${ft}`;
      if (!linkedCandidates[key] || (parseDataYear(row.data_year) ?? -1) > (parseDataYear(linkedCandidates[key].data_year) ?? -1)) {
        linkedCandidates[key] = {
          provider_id: row.provider_id,
          facility_name: row.facility_name,
          facility_type: ft,
          city: row.city,
          state: row.state,
          quality_rating: row.quality_rating,
          data_year: row.data_year,
        };
      }
    }
  }

  // These rows are keyed by the provider's NPI, not a facility CCN: resolve
  // each to real CCN-keyed facility rows so the card links somewhere real.
  const linkedFacilities: any[] = [];
  for (const candidate of Object.values(linkedCandidates)) {
    linkedFacilities.push(await resolveLinkedFacilityCcn(candidate));
  }

  const hasMips = Object.keys(mipsByYear).length > 0;
  const mipsRecords = hasMips ? Object.values(mipsByYear).reduce((sum: number, y: any) =>
    sum + (y.performance?.length || 0) + (y.measures?.length || 0), 0) : 0;

  let reference = null;
  try {
    const client = await pool.connect();
    try {
      reference = await providerReference(client, String(npi));
    } finally {
      client.release();
    }
  } catch {
    reference = null;
  }

  return {
    npi,
    mips: {
      has_data: hasMips,
      total_records: mipsRecords,
      by_year: mipsByYear,
    },
    clinician: {
      has_data: Object.keys(clinicianData).length > 0,
      by_type: clinicianData,
    },
    utilization_cms: {
      has_data: Object.keys(providerUtilData).length > 0,
      by_type: providerUtilData,
    },
    network: {
      has_data: Object.keys(networkData).length > 0,
      by_type: networkData,
    },
    linked_facilities: linkedFacilities,
    // Medicare services the provider may order or refer (CMS Order & Referring).
    order_referring: orderReferring,
    // The clinician's standing as a post-acute referral source (ReferralPotentialCard, the assistant).
    referral_potential: referralPotential,
    // Freshness of the market rollups the card reads (present with referral_potential).
    rollups,
    reference,
    total_records: allRows.length,
  };
}

const statesCache: Record<string, { data: any[]; timestamp: number }> = {};
const STATES_CACHE_TTL = 10 * 60 * 1000;

const listingCache: Record<string, { data: any; timestamp: number }> = {};
const LISTING_CACHE_TTL = 10 * 60 * 1000;

async function paramQuery(sqlText: string, values: any[], timeoutMs: number = 30000): Promise<any[]> {
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = '${Math.max(1000, Math.min(timeoutMs, 120000))}'`);
    const result = await client.query(sqlText, values);
    return result.rows || [];
  } finally {
    // RESET (not SET '0', which would leave the pooled connection with no timeout
    // at all for the next query that reuses it).
    await client.query(`RESET statement_timeout`).catch(() => {});
    client.release();
  }
}

/** State-licensed homes (licensed_facilities), listed like the Medicare facilities but without a detail page. */
async function listLicensedFacilities(params: any) {
  const { state, search, page = 1, limit = 50 } = params;
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;
  const where: string[] = [];
  const values: any[] = [];
  if (state) { values.push(String(state).toUpperCase()); where.push(`state = $${values.length}`); }
  if (search) { values.push(`%${search}%`); where.push(`(name ILIKE $${values.length} OR city ILIKE $${values.length})`); }
  const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows, counts, states] = await Promise.all([
    paramQuery(`SELECT facility_key, license_type, license_number, name AS facility_name, address, city, state, zip5 AS zip, county_fips, capacity, status, licensee, phone, as_of::text AS as_of
                  FROM licensed_facilities ${whereSQL} ORDER BY name ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, safeLimit, offset], 30000),
    paramQuery(`SELECT count(*)::int AS count FROM licensed_facilities ${whereSQL}`, values, 30000),
    paramQuery("SELECT state, count(*)::int AS count FROM licensed_facilities GROUP BY state ORDER BY count DESC LIMIT 60", [], 30000),
  ]);
  return {
    facility_group: "licensed",
    facilities: rows.map((r: any) => ({ ...r, provider_id: null, quality_rating: null, total_discharges: null, total_payments: null })),
    total: Number(counts[0]?.count || 0),
    page: safePage,
    limit: safeLimit,
    available_states: states.map((s: any) => ({ state: s.state, count: Number(s.count) })),
  };
}

export async function handleListFacilities(params: any) {
  const { facility_group, state, search, page = 1, limit = 50 } = params;
  if (!facility_group) return { error: "facility_group is required" };
  if (facility_group === "licensed") return listLicensedFacilities(params);

  const groupTypes = FACILITY_TYPE_GROUPS[facility_group];
  if (!groupTypes) return { error: `Unknown facility_group: ${facility_group}` };

  const primaryType = LISTING_PRIMARY_TYPES[facility_group] || groupTypes[0];
  const listingTypes = facility_group === 'community_health'
    ? ["fqhc_enrollments", "rural_health_clinic_enrollments"]
    : [primaryType];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;

  let whereClauses = [`m.facility_type = ANY($1)`];
  const queryValues: any[] = [listingTypes];
  let paramIdx = 2;

  if (state) {
    whereClauses.push(`m.state = $${paramIdx}`);
    queryValues.push(state.toUpperCase());
    paramIdx++;
  }
  if (search) {
    whereClauses.push(`m.facility_name ILIKE $${paramIdx}`);
    queryValues.push(`%${search}%`);
    paramIdx++;
  }
  const whereSQL = whereClauses.join(" AND ");
  // Care Compare hospital rows don't carry discharges or Medicare payment. Those live on the
  // inpatient-by-provider file (one row per CCN). Join the latest of those for the hospital list only.
  const volumeJoin = facility_group === "hospital"
    ? `LEFT JOIN LATERAL (
         SELECT total_discharges, total_payments FROM medicare_facilities
          WHERE facility_type = 'medicare_inpatient_by_provider' AND provider_id = m.provider_id
          ORDER BY data_year DESC NULLS LAST, id DESC
          LIMIT 1
       ) ip ON true`
    : "";
  const volumeCols = facility_group === "hospital"
    ? "COALESCE(ip.total_discharges, m.total_discharges) AS total_discharges, COALESCE(ip.total_payments, m.total_payments) AS total_payments"
    : "m.total_discharges, m.total_payments";

  let rows: any[] = [];
  try {
    rows = await paramQuery(
      `SELECT m.provider_id, m.facility_name, m.city, m.state, m.zip, m.quality_rating, ${volumeCols}, m.facility_type, m.data_year
       FROM medicare_facilities m ${volumeJoin} WHERE ${whereSQL}
       ORDER BY m.facility_name ASC LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...queryValues, safeLimit, offset],
      60000
    );
  } catch (e: any) {
    console.warn(`[facilityDetail] Ordered query timed out for ${facility_group}, falling back to unordered`);
    try {
      rows = await paramQuery(
        `SELECT m.provider_id, m.facility_name, m.city, m.state, m.zip, m.quality_rating, ${volumeCols}, m.facility_type, m.data_year
         FROM medicare_facilities m ${volumeJoin} WHERE ${whereSQL}
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...queryValues, safeLimit, offset],
        60000
      );
    } catch (e2: any) {
      console.error(`[facilityDetail] Both queries failed for ${facility_group}:`, e2.message?.substring(0, 200));
      // An outage isn't "no facilities": let the page show its error state.
      throw Object.assign(new Error("Couldn't load facilities right now. Try again in a minute."), { status: 503 });
    }
  }

  const seen = new Map<string, any>();
  for (const row of rows) {
    const pid = row.provider_id;
    if (!pid) continue;
    if (!seen.has(pid) || (row.data_year || 0) > (seen.get(pid).data_year || 0)) {
      seen.set(pid, row);
    }
  }

  let availableStates: any[] = [];
  const cacheKey = `states_${facility_group}`;
  if (statesCache[cacheKey] && Date.now() - statesCache[cacheKey].timestamp < STATES_CACHE_TTL) {
    availableStates = statesCache[cacheKey].data;
  } else {
    try {
      const states = await paramQuery(
        `SELECT state, count(*) as count FROM medicare_facilities WHERE facility_type = ANY($1) GROUP BY state ORDER BY count(*) DESC LIMIT 60`,
        [listingTypes],
        45000
      );
      availableStates = states.filter((s: any) => s.state).map((s: any) => ({ state: s.state, count: Number(s.count) }));
      statesCache[cacheKey] = { data: availableStates, timestamp: Date.now() };
    } catch (e) {
      console.warn(`[facilityDetail] States query failed for ${facility_group}:`, (e as any).message?.substring(0, 200));
    }
  }

  let totalCount = seen.size < safeLimit ? offset + seen.size : offset + safeLimit + 1;
  const totalCacheKey = `total_${facility_group}_${state || 'all'}_${search || ''}`;
  if (listingCache[totalCacheKey] && Date.now() - listingCache[totalCacheKey].timestamp < LISTING_CACHE_TTL) {
    totalCount = listingCache[totalCacheKey].data;
  } else {
    try {
      const countRows = await paramQuery(
        `SELECT count(DISTINCT m.provider_id) as count FROM medicare_facilities m WHERE ${whereSQL}`,
        queryValues,
        30000
      );
      totalCount = Number(countRows[0]?.count || totalCount);
      listingCache[totalCacheKey] = { data: totalCount, timestamp: Date.now() };
    } catch (e) {
    }
  }

  return {
    facilities: Array.from(seen.values()),
    total: totalCount,
    page: safePage,
    limit: safeLimit,
    available_states: availableStates,
  };
}
