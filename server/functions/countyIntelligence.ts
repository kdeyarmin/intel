import { pool } from "../db";

async function rawQuery(text: string, params: any[] = []) {
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '12s'");
    const result = await client.query(text, params);
    return result.rows;
  } finally {
    try { await client.query("RESET statement_timeout"); } catch {}
    client.release();
  }
}

export async function handleGetCountyIntelligence(payload: any) {
  const p = payload || {};
  const { state, county } = p;
  if (!state) throw { status: 400, message: "state is required" };

  const stateUpper = state.toUpperCase().trim();
  const countyFilter = county ? county.trim() : null;

  const npiParams: any[] = [stateUpper];
  let npiCityClause = '';
  if (countyFilter) {
    npiParams.push(countyFilter.toUpperCase());
    npiCityClause = ` AND UPPER(city) = $${npiParams.length}`;
  }

  const npiRows = await rawQuery(
    `SELECT npi FROM provider_locations WHERE state = $1${npiCityClause} LIMIT 200`,
    npiParams
  );
  const npiList = [...new Set(npiRows.map((r: any) => r.npi).filter(Boolean))];

  let individualProviders = 0;
  let orgProviders = 0;
  let providersList: any[] = [];
  let topSpecialties: any[] = [];
  let referrals: any[] = [];
  let topServices: any[] = [];
  let facilityRows: any[] = [];

  if (npiList.length > 0) {
    const ph = npiList.map((_: any, i: number) => `$${i + 1}`).join(',');

    const results = await Promise.allSettled([
      rawQuery(`
        SELECT p.npi, p.first_name, p.last_name, p.organization_name, p.entity_type, p.credential,
          (SELECT pt.taxonomy_description FROM provider_taxonomies pt WHERE pt.npi = p.npi AND pt.is_primary = true LIMIT 1) as specialty
        FROM providers p WHERE p.npi IN (${ph})
      `, npiList),

      rawQuery(`
        SELECT COALESCE(pt.taxonomy_description, 'Unknown') as name, COUNT(*) as count
        FROM provider_taxonomies pt
        WHERE pt.npi IN (${ph}) AND pt.is_primary = true
        GROUP BY pt.taxonomy_description ORDER BY count DESC LIMIT 20
      `, npiList),

      rawQuery(`
        SELECT cr.npi, cr.referred_to_npi, cr.referred_to_name, cr.total_referrals, cr.total_beneficiaries
        FROM cms_referrals cr WHERE cr.npi IN (${ph})
        ORDER BY cr.total_referrals DESC LIMIT 30
      `, npiList),

      rawQuery(`
        SELECT psu.service_type as name, SUM(CAST(psu.total_medicare_payment_amt AS numeric)) as amount
        FROM provider_service_utilization psu
        WHERE psu.npi IN (${ph}) AND psu.service_type IS NOT NULL
        GROUP BY psu.service_type ORDER BY amount DESC LIMIT 10
      `, npiList),

      Promise.resolve([]),
    ]);

    const provRows = results[0].status === 'fulfilled' ? results[0].value : [];
    topSpecialties = results[1].status === 'fulfilled' ? results[1].value : [];
    referrals = results[2].status === 'fulfilled' ? results[2].value : [];
    topServices = results[3].status === 'fulfilled' ? results[3].value : [];
    facilityRows = results[4].status === 'fulfilled' ? results[4].value : [];

    const isOrg = (et: string) => et === '2' || (et || '').toLowerCase().includes('organ');
    const isIndiv = (et: string) => et === '1' || (et || '').toLowerCase().includes('individ');
    individualProviders = provRows.filter((r: any) => isIndiv(r.entity_type)).length;
    orgProviders = provRows.filter((r: any) => isOrg(r.entity_type)).length;

    providersList = provRows.map((r: any) => {
      const orgFlag = isOrg(r.entity_type);
      const fullName = orgFlag
        ? (r.organization_name || r.last_name || 'Unknown Org')
        : `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.organization_name || 'Unknown';
      return {
        npi: r.npi,
        name: fullName,
        entityType: r.entity_type,
        credential: r.credential,
        specialty: r.specialty || null,
      };
    });
  }

  const facTypes: Record<string, { count: number; totalPayments: number; ratings: number[]; }> = {};
  for (const f of facilityRows) {
    const t = f.facility_type || 'other';
    if (!facTypes[t]) facTypes[t] = { count: 0, totalPayments: 0, ratings: [] };
    facTypes[t].count++;
    facTypes[t].totalPayments += parseFloat(f.total_payments) || 0;
    if (f.quality_rating && parseFloat(f.quality_rating) > 0) {
      facTypes[t].ratings.push(parseFloat(f.quality_rating));
    }
  }

  const facilitySummary = Object.entries(facTypes)
    .map(([type, d]) => ({
      type,
      count: d.count,
      totalPayments: d.totalPayments,
      avgRating: d.ratings.length > 0 ? Math.round((d.ratings.reduce((a, b) => a + b, 0) / d.ratings.length) * 10) / 10 : null,
    }))
    .sort((a, b) => b.count - a.count);

  const totalPayments = facilityRows.reduce((s: number, f: any) => s + (parseFloat(f.total_payments) || 0), 0);
  const totalDischarges = facilityRows.reduce((s: number, f: any) => s + (parseInt(f.total_discharges) || 0), 0);

  return {
    state: stateUpper,
    county: countyFilter,
    summary: {
      totalProviders: npiList.length,
      individualProviders,
      orgProviders,
      totalFacilities: facilityRows.length,
      totalPayments: Math.round(totalPayments),
      totalDischarges,
    },
    topSpecialties: topSpecialties.map((r: any) => ({
      name: r.name || 'Unknown',
      count: parseInt(r.count) || 0,
    })),
    facilitySummary,
    facilities: facilityRows.map((r: any) => ({
      id: r.id, name: r.facility_name, type: r.facility_type,
      providerId: r.provider_id, city: r.city,
      qualityRating: r.quality_rating, totalPayments: r.total_payments,
      totalDischarges: r.total_discharges, dataYear: r.data_year,
    })),
    providers: providersList,
    referrals: referrals.map((r: any) => ({
      fromNpi: r.npi, toNpi: r.referred_to_npi, toName: r.referred_to_name,
      totalReferrals: r.total_referrals, totalBeneficiaries: r.total_beneficiaries,
    })),
    affiliations: [],
    topServices: topServices.map((r: any) => ({
      name: r.name,
      amount: Math.round(parseFloat(r.amount) || 0),
    })),
  };
}

const US_STATES = [
  'AK','AL','AR','AZ','CA','CO','CT','DC','DE','FL','GA','GU','HI','IA','ID',
  'IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND',
  'NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','PR','RI','SC','SD','TN',
  'TX','UT','VA','VI','VT','WA','WI','WV','WY'
];

export async function handleGetAvailableStatesCounties(_payload: any) {
  return {
    states: US_STATES,
    statesCities: {},
  };
}
