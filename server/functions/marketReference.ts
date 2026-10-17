// County and provider facts loaded from files that are not on the CMS data-api:
// Medicare Advantage plans, Part D drugs, CDC PLACES, exclusions, and opt-out.
// One client, one query at a time: a pg client does not run statements in parallel.
import type { PoolClient } from "pg";

async function rows(client: PoolClient, sql: string, params: unknown[]) {
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } catch (err: any) {
    // A deploy can briefly race the migration. An absent table is "not loaded", not a failed page.
    if (err?.code === "42P01") return [];
    throw err;
  }
}

/** PHC4 prints the county without the word "County". */
function phc4County(name: string | null | undefined) {
  return (name || "").replace(/ County$/i, "").trim();
}

// Free published PHC4 reports. Residence stats are not the facility's patients,
// and the short facility names are not Medicare IDs.
async function latestValue(client: PoolClient, sql: string, params: unknown[]): Promise<string | null> {
  const found = await rows(client, sql, params);
  const value = found[0]?.v;
  return value == null || value === "" ? null : String(value);
}

async function phc4ForCounty(client: PoolClient, countyName: string | null | undefined, state: string | null) {
  const county = phc4County(countyName);
  if (state !== "PA" || !county) return null;
  const inpatientPeriod = await latestValue(client, `SELECT max(period) AS v FROM phc4_county_stat WHERE county_name = $1 AND report = 'inpatient_payer'`, [county]);
  const conditionPeriod = await latestValue(client, `SELECT max(period) AS v FROM phc4_county_stat WHERE county_name = $1 AND report LIKE 'condition_%'`, [county]);
  const cardiacPeriod = await latestValue(client, `SELECT max(report_period) AS v FROM phc4_cardiac_volume WHERE county_name = $1 AND facility_name <> 'Statewide'`, [county]);
  const cancerPeriod = await latestValue(client, `SELECT max(report_period) AS v FROM phc4_cancer_surgery WHERE county_name = $1 AND facility_name <> 'Statewide'`, [county]);
  const payers = inpatientPeriod
    ? await rows(client, `SELECT category, cases, value, value_unit FROM phc4_county_stat WHERE period = $2 AND report = 'inpatient_payer' AND county_name = $1 ORDER BY (category = 'total') DESC, value DESC NULLS LAST`, [county, inpatientPeriod])
    : [];
  const ages = inpatientPeriod
    ? await rows(client, `SELECT category, value FROM phc4_county_stat WHERE period = $2 AND report = 'inpatient_age' AND county_name = $1 AND category IN ('65-74', '75 and older')`, [county, inpatientPeriod])
    : [];
  const outpatient = inpatientPeriod
    ? await rows(client, `SELECT cases FROM phc4_county_stat WHERE period = $2 AND report = 'outpatient_facility_type' AND county_name = $1 AND category = 'total'`, [county, inpatientPeriod])
    : [];
  const conditions = conditionPeriod
    ? await rows(client, `SELECT report, category, cases, value, value_unit FROM phc4_county_stat WHERE period = $2 AND county_name = $1 AND report LIKE 'condition_%' ORDER BY cases DESC NULLS LAST`, [county, conditionPeriod])
    : [];
  const cardiac = cardiacPeriod
    ? await rows(client, `SELECT v.procedure_code, v.facility_name, v.total_cases, v.inpatient_cases, v.outpatient_cases, o.rating AS mortality_rating, o.actual_rate AS mortality_rate
    FROM phc4_cardiac_volume v
    LEFT JOIN phc4_cardiac_outcome o ON o.report_period = v.report_period AND o.procedure_code = v.procedure_code AND o.facility_name = v.facility_name AND o.measure = 'mortality'
    WHERE v.report_period = $2 AND v.county_name = $1 AND v.facility_name <> 'Statewide'
    ORDER BY v.total_cases DESC NULLS LAST LIMIT 8`, [county, cardiacPeriod])
    : [];
  const cancer = cancerPeriod
    ? await rows(client, `SELECT cancer, facility_name, facility_type, total_cases FROM phc4_cancer_surgery WHERE report_period = $2 AND county_name = $1 AND facility_name <> 'Statewide' ORDER BY total_cases DESC NULLS LAST LIMIT 8`, [county, cancerPeriod])
    : [];
  if (!payers.length && !conditions.length && !cardiac.length && !cancer.length) return null;
  return {
    inpatient_total: payers.find((r) => r.category === "total")?.cases ?? null,
    outpatient_total: outpatient[0]?.cases ?? null,
    payers: payers.filter((r) => r.category !== "total"),
    ages,
    conditions,
    cardiac,
    cancer,
    periods: { inpatient: inpatientPeriod, conditions: conditionPeriod, cardiac: cardiacPeriod, cancer: cancerPeriod },
  };
}

export async function countyReference(client: PoolClient, fips: string, state: string | null, countyName?: string | null) {
  const latestPlan = await rows(client, `SELECT max(period) AS period FROM cms_ma_plan_enrollment WHERE county_fips = $1`, [fips]);
  const planPeriod = latestPlan[0]?.period ?? null;
  const plans = planPeriod
    ? await rows(client, `SELECT organization, enrollment, contracts FROM cms_ma_plan_enrollment WHERE county_fips = $1 AND period = $2 ORDER BY enrollment DESC LIMIT 8`, [fips, planPeriod])
    : [];
  const places = await rows(client, `SELECT measure_id, measure, data_value, year FROM cdc_places_county WHERE county_fips = $1 ORDER BY data_value DESC NULLS LAST`, [fips]);
  const drugs = await rows(client, `SELECT generic_name, claims, drug_cost, beneficiaries, opioid, data_year, county_fips FROM cms_partd_geo_drug WHERE county_fips = $1 OR county_fips = $2 ORDER BY (county_fips = $1) DESC, claims DESC NULLS LAST LIMIT 12`, [fips, state ?? ""]);
  const services = await rows(client, `SELECT hcpcs, description, beneficiaries, services, payment, data_year, county_fips FROM cms_geo_service WHERE county_fips = $1 OR county_fips = $2 ORDER BY (county_fips = $1) DESC, services DESC NULLS LAST LIMIT 8`, [fips, state ?? ""]);
  const shortage = await rows(client, `SELECT discipline, designation_type, hpsa_score, status FROM hrsa_shortage WHERE county_fips = $1 ORDER BY hpsa_score DESC NULLS LAST LIMIT 6`, [fips]);
  const phc4 = await phc4ForCounty(client, countyName, state);
  const medicaidPeriod = state === "PA"
    ? await latestValue(client, `SELECT max(period) AS v FROM pa_mco_enrollment WHERE lower(county_name) = lower($1)`, [phc4County(countyName)])
    : null;
  const medicaid = medicaidPeriod
    ? await rows(client, `SELECT plan, zone, enrollment FROM pa_mco_enrollment WHERE period = $2 AND lower(county_name) = lower($1) ORDER BY enrollment DESC`, [phc4County(countyName), medicaidPeriod])
    : [];
  const marketplaceYear = await latestValue(client, `SELECT max(plan_year) AS v FROM qhp_county_issuer WHERE county_fips = $1 AND market = 'individual'`, [fips]);
  const marketplace = marketplaceYear
    ? await rows(client, `SELECT issuer_id, issuer_name, plan_count, metals, state_enrollment FROM qhp_county_issuer WHERE plan_year = $2 AND county_fips = $1 AND market = 'individual' ORDER BY state_enrollment DESC NULLS LAST, plan_count DESC`, [fips, marketplaceYear])
    : [];
  const acaYear = state === "PA" ? await latestValue(client, `SELECT max(plan_year) AS v FROM pa_aca_rate`, []) : null;
  const acaRates = acaYear
    ? await rows(client, `SELECT market, company, on_marketplace, approved_pct, market_share FROM pa_aca_rate WHERE plan_year = $1 ORDER BY market, market_share DESC NULLS LAST`, [acaYear])
    : [];
  const mlrYear = await latestValue(client, `SELECT max(reporting_year) AS v FROM cms_mlr WHERE state = $1 AND market = 'individual'`, [state ?? ""]);
  const mlr = mlrYear
    ? await rows(client, `SELECT company, mlr, mlr_denominator, rebate FROM cms_mlr WHERE reporting_year = $2 AND state = $1 AND market = 'individual' ORDER BY mlr_denominator DESC NULLS LAST LIMIT 6`, [state ?? "", mlrYear])
    : [];
  const oepYear = await latestValue(client, `SELECT max(coverage_year) AS v FROM cms_oep_state WHERE state = $1`, [state ?? ""]);
  const oep = oepYear
    ? await rows(client, `SELECT platform, plan_selections, avg_premium, avg_premium_after_aptc FROM cms_oep_state WHERE coverage_year = $2 AND state = $1`, [state ?? "", oepYear])
    : [];
  const contractPeriod = await latestValue(client, `SELECT max(period) AS v FROM cms_ma_contract_county WHERE county_fips = $1`, [fips]);
  const starYear = contractPeriod
    ? await latestValue(client, `SELECT max(s.rating_year) AS v FROM cms_ma_star s JOIN cms_ma_contract_county e ON e.contract_id = s.contract_id WHERE e.county_fips = $1 AND e.period = $2`, [fips, contractPeriod])
    : null;
  const maStars = contractPeriod && starYear
    ? await rows(client, `SELECT s.contract_id, s.marketing_name, s.parent_organization, s.overall_rating, s.part_c_rating, s.part_d_rating, s.snp, e.enrollment
    FROM cms_ma_contract_county e
    JOIN cms_ma_star s ON s.contract_id = e.contract_id AND s.rating_year = $3
    WHERE e.period = $2 AND e.county_fips = $1 AND (s.overall_rating IS NOT NULL OR s.part_c_rating IS NOT NULL OR s.part_d_rating IS NOT NULL)
    ORDER BY e.enrollment DESC LIMIT 6`, [fips, contractPeriod, starYear])
    : [];
  const penetrationPeriod = await latestValue(client, `SELECT max(period) AS v FROM cms_ma_penetration WHERE county_fips = $1`, [fips]);
  const penetration = penetrationPeriod
    ? await rows(client, `SELECT eligibles, enrolled, penetration, period FROM cms_ma_penetration WHERE county_fips = $1 AND period = $2`, [fips, penetrationPeriod])
    : [];
  const sdohYear = await latestValue(client, `SELECT max(year) AS v FROM county_sdoh WHERE county_fips = $1`, [fips]);
  const sdoh = sdohYear
    ? await rows(client, `SELECT measure_id, measure, data_value, year FROM county_sdoh WHERE county_fips = $1 AND year = $2 ORDER BY measure_id LIMIT 12`, [fips, sdohYear])
    : [];
  const svi = await rows(client, `SELECT year, rpl_themes, rpl_theme1, rpl_theme2, rpl_theme3, rpl_theme4 FROM cdc_svi_county WHERE county_fips = $1 ORDER BY year DESC LIMIT 1`, [fips]);
  const wageYear = await latestValue(client, `SELECT max(year) AS v FROM bls_wage WHERE area_code = $1`, [fips]);
  const wages = wageYear
    ? await rows(client, `SELECT series, occupation, employment, avg_wage, year FROM bls_wage WHERE area_code = $1 AND year = $2 ORDER BY employment DESC NULLS LAST LIMIT 8`, [fips, wageYear])
    : [];
  const dme = await dmeForCounty(client, fips, state);
  return {
    state,
    ma_plans: plans,
    ma_stars: maStars,
    ma_penetration: penetration[0] ?? null,
    places,
    drugs,
    services,
    shortage,
    phc4,
    medicaid,
    marketplace,
    aca_rates: acaRates,
    mlr,
    oep: oep[0] ?? null,
    sdoh,
    svi: svi[0] ?? null,
    wages,
    dme,
    as_of: {
      ma: planPeriod,
      ma_contract: contractPeriod,
      ma_stars: starYear,
      ma_penetration: penetrationPeriod,
      places: places[0]?.year ?? null,
      drugs: drugs[0]?.data_year ?? null,
      services: services[0]?.data_year ?? null,
      medicaid: medicaidPeriod,
      marketplace: marketplaceYear,
      aca: acaYear,
      mlr: mlrYear,
      oep: oepYear,
      sdoh: sdohYear,
      svi: svi[0]?.year ?? null,
      wages: wageYear,
    },
  };
}

export async function providerReference(client: PoolClient, npi: string) {
  const drugs = await rows(client, `SELECT generic_name, brand_name, claims, drug_cost, beneficiaries, data_year FROM cms_partd_provider_drug WHERE npi = $1 ORDER BY claims DESC NULLS LAST LIMIT 12`, [npi]);
  const excluded = await rows(client, `SELECT name, excl_type, excl_date, state FROM oig_exclusions WHERE npi = $1`, [npi]);
  const optedOut = await rows(client, `SELECT name, specialty, state, effective_date, end_date FROM medicare_opt_out WHERE npi = $1`, [npi]);
  const payments = await rows(client, `SELECT program_year, payment_count, total_amount, recipient_state FROM cms_open_payment_totals WHERE npi = $1`, [npi]);
  const dme = await dmeForProvider(client, npi);
  return {
    drugs,
    excluded: excluded[0] ?? null,
    opted_out: optedOut[0] ?? null,
    open_payments: payments[0] ?? null,
    dme,
  };
}

// Original Medicare DMEPOS. Geography is the referring provider's state, not
// the patient's county. Directory locations are counted by the ZIP's main county.
async function dmeForCounty(client: PoolClient, fips: string, state: string | null) {
  const year = state
    ? await latestValue(client, `SELECT max(data_year) AS v FROM cms_dme_geo_service WHERE geo_level = 'State' AND state = $1`, [state])
    : null;
  const products = year
    ? await rows(client, `SELECT hcpcs, hcpcs_desc, rental, rbcs_desc, benes, suppliers, avg_payment FROM cms_dme_geo_service WHERE data_year = $2 AND geo_level = 'State' AND state = $1 ORDER BY benes DESC NULLS LAST LIMIT 8`, [state, year])
    : [];
  const counted = await rows(client, `SELECT count(*)::int AS suppliers FROM dme_supplier_directory d JOIN geo_zctas z ON z.zcta = d.zip5 WHERE z.primary_county_fips = $1`, [fips]);
  const locations = await rows(client, `SELECT d.business_name, d.city, left(d.supplies, 180) AS supplies FROM dme_supplier_directory d JOIN geo_zctas z ON z.zcta = d.zip5 WHERE z.primary_county_fips = $1 ORDER BY d.business_name LIMIT 6`, [fips]);
  const directoryAsOf = await latestValue(client, `SELECT max(d.as_of)::text AS v FROM dme_supplier_directory d JOIN geo_zctas z ON z.zcta = d.zip5 WHERE z.primary_county_fips = $1`, [fips]);
  const suppliers = counted[0]?.suppliers ?? 0;
  if (!products.length && !suppliers && !locations.length) return null;
  return { year, directory_as_of: directoryAsOf, products, suppliers, locations };
}

async function dmeYearForProvider(client: PoolClient, npi: string): Promise<string | null> {
  return latestValue(client, `SELECT max(data_year) AS v FROM (
    SELECT data_year FROM cms_dme_by_referring WHERE npi = $1
    UNION ALL SELECT data_year FROM cms_dme_order_line WHERE npi = $1
    UNION ALL SELECT data_year FROM cms_dme_by_supplier WHERE npi = $1
    UNION ALL SELECT data_year FROM cms_dme_supply_line WHERE npi = $1
  ) years`, [npi]);
}

async function dmeForProvider(client: PoolClient, npi: string) {
  const year = await dmeYearForProvider(client, npi);
  const summary = year
    ? await rows(client, `SELECT data_year, specialty, suppliers, benes, claims, services, medicare_payment, dme_suppressed, dme_benes, dme_payment, pos_suppressed, pos_benes, pos_payment, drug_suppressed, drug_benes, drug_payment FROM cms_dme_by_referring WHERE npi = $1 AND data_year = $2`, [npi, year])
    : [];
  const orders = year
    ? await rows(client, `SELECT hcpcs, hcpcs_desc, rental, rbcs_desc, benes, services, avg_payment FROM cms_dme_order_line WHERE npi = $1 AND data_year = $2 ORDER BY benes DESC NULLS LAST LIMIT 10`, [npi, year])
    : [];
  const suppliedSummary = year
    ? await rows(client, `SELECT name, specialty, benes, medicare_payment, dme_suppressed, dme_benes, dme_payment, pos_suppressed, pos_benes, pos_payment, drug_suppressed, drug_benes, drug_payment FROM cms_dme_by_supplier WHERE npi = $1 AND data_year = $2`, [npi, year])
    : [];
  const supplied = year
    ? await rows(client, `SELECT hcpcs, hcpcs_desc, rental, rbcs_desc, benes, services, avg_payment FROM cms_dme_supply_line WHERE npi = $1 AND data_year = $2 ORDER BY benes DESC NULLS LAST LIMIT 10`, [npi, year])
    : [];
  if (!summary.length && !orders.length && !suppliedSummary.length && !supplied.length) return null;
  return { year, summary: summary[0] ?? null, orders, supplier: suppliedSummary[0] ?? null, supplied };
}

export async function facilityDme(client: PoolClient, providerId: string) {
  const directory = await rows(client, `SELECT business_name, phone, accepts_assignment, supplies, specialties, provider_types, cba_contracted, npi, participation_begin FROM dme_supplier_directory WHERE provider_id = $1`, [providerId]);
  const linked = directory[0]?.npi;
  const npi = typeof linked === "string" && /^\d{10}$/.test(linked) ? linked : (/^\d{10}$/.test(providerId) ? providerId : null);
  const year = npi ? await dmeYearForProvider(client, npi) : null;
  const summary = npi && year
    ? await rows(client, `SELECT benes, medicare_payment, dme_benes, dme_payment, dme_suppressed, pos_benes, pos_payment, pos_suppressed, drug_benes, drug_payment, drug_suppressed FROM cms_dme_by_supplier WHERE npi = $1 AND data_year = $2`, [npi, year])
    : [];
  const lines = npi && year
    ? await rows(client, `SELECT hcpcs, hcpcs_desc, rental, rbcs_desc, benes, services, avg_payment FROM cms_dme_supply_line WHERE npi = $1 AND data_year = $2 ORDER BY benes DESC NULLS LAST LIMIT 12`, [npi, year])
    : [];
  if (!directory.length && !summary.length && !lines.length) return null;
  return { year, directory: directory[0] ?? null, summary: summary[0] ?? null, lines, npi };
}

export async function facilityCost(client: PoolClient, providerId: string) {
  const year = await latestValue(client, `SELECT max(fiscal_year) AS v FROM hcris_cost_summary WHERE provider_id = $1`, [providerId]);
  if (!year) return null;
  const lines = await rows(client, `SELECT setting, fiscal_year, total_patient_revenue, medicare_revenue, medicaid_revenue, total_cost, net_income, medicare_share, margin
    FROM hcris_cost_summary WHERE provider_id = $1 AND fiscal_year = $2 ORDER BY setting`, [providerId, year]);
  return lines.length ? { year, lines } : null;
}

export async function facilityAhcah(client: PoolClient, ccn: string) {
  if (!/^\d{6}$/.test(ccn)) return null;
  const found = await rows(client, `SELECT ccn, facility_name, state, city, listed_on FROM cms_ahcah WHERE ccn = $1`, [ccn]);
  return found[0] ?? null;
}

// MS-DRG discharges for one IPPS hospital. CMS omits any diagnosis under 11 discharges.
export async function facilityDrgs(client: PoolClient, ccn: string) {
  if (!/^\d{6}$/.test(ccn)) return null;
  const lines = await rows(client, `SELECT drg_code, drg_desc, discharges, avg_medicare_payments, data_year
    FROM cms_inpatient_drg WHERE ccn = $1 AND data_year = (SELECT max(data_year) FROM cms_inpatient_drg WHERE ccn = $1)
    ORDER BY discharges DESC NULLS LAST LIMIT 8`, [ccn]);
  if (!lines.length) return null;
  const total = await rows(client, `SELECT sum(discharges)::int AS discharges, count(*)::int AS drg_count FROM cms_inpatient_drg WHERE ccn = $1 AND data_year = $2`, [ccn, lines[0].data_year]);
  return { year: lines[0].data_year, lines, discharges: total[0]?.discharges ?? null, drg_count: total[0]?.drg_count ?? null };
}
