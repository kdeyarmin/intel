import { db } from "../db";
import { medicareFacilities, providers, providerLocations, providerTaxonomies, providerServiceUtilization, cmsReferrals } from "../db/schema";
import { eq, sql, and, ilike, inArray, desc, asc } from "drizzle-orm";

const FACILITY_TYPE_GROUPS: Record<string, string[]> = {
  hospital: [
    "hospital_readmissions", "hospital_hcahps", "hospital_timely_care",
    "hospital_spending", "hospital_hac", "hospital_imaging",
    "hospital_service_area", "hospital_unplanned_visits",
    "hospital_payment_value", "hospital_complications",
    "hospital_infections", "hospital_psychiatric",
    "hospital_asc_quality", "hospital_veterans",
  ],
  home_health: [
    "home_health_agencies", "home_health_enrollments", "home_health_cost_report",
    "home_health_patient_survey", "home_health_hhcahps",
    "medicare_hha_utilization", "medicare_hha_stats",
  ],
  hospice: [
    "hospice_general_info", "hospice_enrollments", "hospice_provider_data",
    "hospice_provider_measures", "hospice_national_measures",
    "hospice_state_measures", "hospice_zip_data",
    "medicare_hospice_utilization",
  ],
  snf: [
    "snf_provider_measures", "snf_quality_reporting",
    "nursing_home_providers", "nursing_home_ownership",
    "nursing_home_fire_safety", "nursing_home_health_deficiencies",
    "nursing_home_deficiencies", "nursing_home_mds_quality",
    "nursing_home_penalties", "nursing_home_claims_quality",
    "medicare_snf_utilization", "medicare_snf_stats",
  ],
};

export function getFacilityTypeGroup(facilityType: string): string | null {
  for (const [group, types] of Object.entries(FACILITY_TYPE_GROUPS)) {
    if (types.some(t => facilityType.startsWith(t) || facilityType.includes(t))) return group;
  }
  return null;
}

export async function handleGetFacilityDetail(params: any) {
  const { provider_id, facility_group } = params;
  if (!provider_id) return { error: "provider_id is required" };

  const groupTypes = facility_group ? FACILITY_TYPE_GROUPS[facility_group] : null;

  const facilityRows = await db.select()
    .from(medicareFacilities)
    .where(
      groupTypes
        ? and(eq(medicareFacilities.provider_id, provider_id), sql`${medicareFacilities.facility_type} = ANY(${groupTypes})`)
        : eq(medicareFacilities.provider_id, provider_id)
    )
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
    .sort((a, b) => (b.data_year || 0) - (a.data_year || 0))[0];

  const financials = facilityRows.reduce((acc, r) => {
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
      const locs = await db.select().from(providerLocations).where(eq(providerLocations.npi, npiCandidate)).limit(10);
      const taxons = await db.select().from(providerTaxonomies).where(eq(providerTaxonomies.npi, npiCandidate)).limit(10);
      linkedProvider = { ...prov, locations: locs, taxonomies: taxons };
    }
  }

  return {
    provider_id,
    facility_name: first.facility_name || "",
    address: first.address || "",
    city: first.city || "",
    state: first.state || "",
    zip: first.zip || "",
    quality_rating: latestQuality?.quality_rating || null,
    facility_group: facility_group || getFacilityTypeGroup(first.facility_type || "") || "unknown",
    facility_types: facilityTypes,
    data_years: dataYears,
    record_count: facilityRows.length,
    financials,
    by_type: byType,
    linked_provider: linkedProvider,
  };
}

export async function handleGetProviderCMSData(params: any) {
  const { npi } = params;
  if (!npi) return { error: "npi is required" };

  const mipsRows = await db.select()
    .from(medicareFacilities)
    .where(and(
      eq(medicareFacilities.provider_id, npi),
      sql`${medicareFacilities.facility_type} IN ('clinician_mips_performance', 'clinician_mips_measures')`
    ))
    .orderBy(desc(medicareFacilities.data_year))
    .limit(100);

  const facilityRows = await db.select({
    provider_id: medicareFacilities.provider_id,
    facility_name: medicareFacilities.facility_name,
    facility_type: medicareFacilities.facility_type,
    city: medicareFacilities.city,
    state: medicareFacilities.state,
    quality_rating: medicareFacilities.quality_rating,
    data_year: medicareFacilities.data_year,
  })
    .from(medicareFacilities)
    .where(and(
      eq(medicareFacilities.provider_id, npi),
      sql`${medicareFacilities.facility_type} NOT IN ('clinician_mips_performance', 'clinician_mips_measures')`
    ))
    .orderBy(desc(medicareFacilities.data_year))
    .limit(50);

  const mipsByYear: Record<string, any> = {};
  for (const row of mipsRows) {
    const year = row.data_year || "unknown";
    if (!mipsByYear[year]) mipsByYear[year] = { year, performance: [], measures: [] };
    if (row.facility_type === "clinician_mips_performance") {
      mipsByYear[year].performance.push(row);
    } else {
      mipsByYear[year].measures.push(row);
    }
  }

  const linkedFacilities: Record<string, any> = {};
  for (const row of facilityRows) {
    const key = `${row.provider_id}_${row.facility_type}`;
    if (!linkedFacilities[key] || (row.data_year || 0) > (linkedFacilities[key].data_year || 0)) {
      linkedFacilities[key] = row;
    }
  }

  return {
    npi,
    mips: {
      has_data: mipsRows.length > 0,
      total_records: mipsRows.length,
      by_year: mipsByYear,
    },
    linked_facilities: Object.values(linkedFacilities),
    total_facility_records: facilityRows.length,
  };
}

const statesCache: Record<string, { data: any[]; timestamp: number }> = {};
const STATES_CACHE_TTL = 10 * 60 * 1000;

export async function handleListFacilities(params: any) {
  const { facility_group, state, search, page = 1, limit = 50 } = params;
  if (!facility_group) return { error: "facility_group is required" };

  const groupTypes = FACILITY_TYPE_GROUPS[facility_group];
  if (!groupTypes) return { error: `Unknown facility_group: ${facility_group}` };

  const offset = (page - 1) * limit;

  const typeCondition = groupTypes.length === 1
    ? eq(medicareFacilities.facility_type, groupTypes[0])
    : inArray(medicareFacilities.facility_type, groupTypes);
  const conditions = [typeCondition];
  if (state) conditions.push(eq(medicareFacilities.state, state.toUpperCase()));
  if (search) conditions.push(ilike(medicareFacilities.facility_name, `%${search}%`));

  const rows = await db.select({
    provider_id: medicareFacilities.provider_id,
    facility_name: medicareFacilities.facility_name,
    city: medicareFacilities.city,
    state: medicareFacilities.state,
    zip: medicareFacilities.zip,
    quality_rating: medicareFacilities.quality_rating,
    total_discharges: medicareFacilities.total_discharges,
    total_payments: medicareFacilities.total_payments,
    facility_type: medicareFacilities.facility_type,
    data_year: medicareFacilities.data_year,
  })
    .from(medicareFacilities)
    .where(and(...conditions))
    .orderBy(asc(medicareFacilities.facility_name))
    .limit(limit)
    .offset(offset);

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
      const states = await db.select({
        state: medicareFacilities.state,
        count: sql<number>`count(*)`,
      })
        .from(medicareFacilities)
        .where(typeCondition)
        .groupBy(medicareFacilities.state)
        .orderBy(desc(sql`count(*)`))
        .limit(60);
      availableStates = states.filter(s => s.state).map(s => ({ state: s.state, count: Number(s.count) }));
      statesCache[cacheKey] = { data: availableStates, timestamp: Date.now() };
    } catch (e) {
      console.warn(`[facilityDetail] States query failed for ${facility_group}:`, (e as any).message);
    }
  }

  return {
    facilities: Array.from(seen.values()),
    total: seen.size < limit ? offset + seen.size : offset + limit + 1,
    page,
    limit,
    available_states: availableStates,
  };
}
