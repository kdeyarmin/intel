import { pool } from "../db";

async function safeQuery(client: any, text: string, params: any[] = []) {
  try {
    const result = await client.query(text, params);
    return result.rows;
  } catch (e: any) {
    console.error("[Report query error]", e.message?.slice(0, 100));
    return [];
  }
}

export async function handleGetComprehensiveReport(payload: any) {
  const { npi, provider_id } = payload;

  if (!npi && !provider_id) {
    throw { status: 400, message: "npi or provider_id is required" };
  }

  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '15s'");

    const result: any = {
      generatedAt: new Date().toISOString(),
      provider: null,
      locations: [],
      taxonomies: [],
      utilization: [],
      referralsFrom: [],
      referralsTo: [],
      affiliations: [],
      facilities: [],
      leadScore: null,
      enrichments: [],
    };

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

      result.locations = await safeQuery(client, `SELECT * FROM provider_locations WHERE npi = $1`, [npi]);
      result.taxonomies = await safeQuery(client, `SELECT * FROM provider_taxonomies WHERE npi = $1`, [npi]);

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

      result.referralsFrom = (await safeQuery(client, `
        SELECT referred_to_npi, referred_to_name, total_referrals, total_beneficiaries, data_year
        FROM cms_referrals WHERE npi = $1 ORDER BY total_referrals DESC LIMIT 50
      `, [npi])).map((r: any) => ({
        toNpi: r.referred_to_npi, toName: r.referred_to_name,
        totalReferrals: r.total_referrals, totalBeneficiaries: r.total_beneficiaries,
        dataYear: r.data_year,
      }));

      result.referralsTo = [];

      result.affiliations = await safeQuery(client, `SELECT * FROM provider_affiliations WHERE npi = $1`, [npi]);

      const scoreRows = await safeQuery(client, `
        SELECT npi, score, outreach_potential, referral_likelihood, data_completeness
        FROM lead_scores WHERE npi = $1 LIMIT 1
      `, [npi]);
      result.leadScore = scoreRows[0] || null;

      result.enrichments = (await safeQuery(client, `
        SELECT source, field_name, new_value, confidence, status
        FROM enrichment_records WHERE npi = $1 LIMIT 50
      `, [npi])).map((e: any) => ({
        source: e.source, fieldName: e.field_name, newValue: e.new_value,
        confidence: e.confidence, status: e.status,
      }));
    }

    const facilityLookup = provider_id || npi;
    if (facilityLookup) {
      const facRows = await safeQuery(client, `
        SELECT id, facility_type, provider_id, facility_name, city, state,
          quality_rating, total_payments, total_discharges, data_year
        FROM medicare_facilities WHERE provider_id = $1
        ORDER BY data_year DESC LIMIT 200
      `, [facilityLookup]);
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

    // Aggregate the latest year's totals from the full table (not from the
    // 100-row display slice, which undercounts providers with many HCPCS lines).
    let totalPayments = 0, totalServices = 0, totalBeneficiaries = 0;
    if (npi) {
      const aggRows = await safeQuery(client, `
        SELECT
          COALESCE(SUM(CAST(NULLIF(total_medicare_payment_amt,'') AS NUMERIC)), 0) AS total_payments,
          COALESCE(SUM(CAST(NULLIF(total_services,'') AS NUMERIC)), 0) AS total_services,
          COALESCE(SUM(CAST(NULLIF(total_unique_benes,'') AS NUMERIC)), 0) AS total_benes
        FROM provider_service_utilization
        WHERE npi = $1
          AND data_year = (
            SELECT MAX(data_year) FROM provider_service_utilization WHERE npi = $1
          )
      `, [npi]);
      if (aggRows.length > 0) {
        totalPayments       = parseFloat(aggRows[0].total_payments  || "0");
        totalServices       = parseInt(aggRows[0].total_services     || "0", 10);
        totalBeneficiaries  = parseInt(aggRows[0].total_benes        || "0", 10);
      }
    }
    const totalReferralsOut = result.referralsFrom.reduce(
      (s: number, r: any) => s + (parseInt(r.totalReferrals) || 0), 0
    );
    const totalReferralsIn = 0;

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
      utilizationYears: [...new Set(result.utilization.map((u: any) => u.dataYear))].sort(),
    };

    return result;
  } finally {
    try { await client.query("RESET statement_timeout"); } catch {}
    client.release();
  }
}
