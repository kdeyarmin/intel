// Market and patient-flow rollups ("who refers, and where do patients go").
// These are query jobs: each replaces its result table with one SELECT over
// the typed CMS tables (server/functions/cmsTypedTables.ts), which hold at
// most a few million rows, joined to the Census geography (geo_zctas gives
// each ZIP area the county holding most of its land). The 46M-row
// medicare_facilities table is never read here. The county profile runs last
// because it reads two of the other results.
//
// Every figure is Medicare fee-for-service (and MA where CMS includes it),
// as published by CMS; counts under 11 are already suppressed in the files.

import { RESIDENTIAL_LICENSE_TYPES } from "../licenseTypes";

export interface MarketJob {
  name: string;
  label: string;
  source: string;
  resultTable: string;
  resultColumns: string[];
  /** The SELECT that fills resultColumns, in order. */
  sql: string;
}

// Chronic-condition shares come from the physician file's jsonb, whose
// column names changed between vintages; the first present key wins. CMS
// publishes them in percent units (31 for 31%); the result stores fractions
// (0.31), like every other share in these tables, so the views format them
// all the same way.
const cc = (keys: string[]) => `COALESCE(${keys.map((k) => `(p.chronic_conditions->>'${k}')::float8`).join(", ")}) / 100.0`;

export const MARKET_JOBS: MarketJob[] = [
  {
    name: "hospital_catchment",
    label: "Hospital catchment (where inpatients live)",
    source: "cms_hospital_service_area",
    resultTable: "rollup_hospital_catchment",
    resultColumns: ["ccn", "zip5", "data_year", "county_fips", "cases", "days", "charges", "share_of_hospital"],
    sql: `
      SELECT h.ccn, h.zip5, h.data_year, z.primary_county_fips,
             h.total_cases, h.total_days, h.total_charges,
             h.total_cases::float8 / NULLIF(sum(h.total_cases) OVER (PARTITION BY h.ccn, h.data_year), 0)
        FROM cms_hospital_service_area h
        LEFT JOIN geo_zctas z ON z.zcta = h.zip5
       WHERE h.total_cases IS NOT NULL`,
  },
  {
    name: "county_hospital_sources",
    label: "Hospitals discharging each county's residents",
    source: "cms_hospital_service_area",
    resultTable: "rollup_county_hospital_sources",
    resultColumns: ["county_fips", "ccn", "data_year", "cases", "days", "share_of_county", "rank"],
    sql: `
      WITH c AS (
        SELECT z.primary_county_fips AS county_fips, h.ccn, h.data_year,
               sum(h.total_cases)::int AS cases, sum(h.total_days)::int AS days
          FROM cms_hospital_service_area h
          JOIN geo_zctas z ON z.zcta = h.zip5
         WHERE h.total_cases IS NOT NULL AND z.primary_county_fips IS NOT NULL
         GROUP BY 1, 2, 3)
      SELECT county_fips, ccn, data_year, cases, days,
             cases::float8 / NULLIF(sum(cases) OVER (PARTITION BY county_fips, data_year), 0),
             (rank() OVER (PARTITION BY county_fips, data_year ORDER BY cases DESC, ccn))::int
        FROM c`,
  },
  {
    name: "hospital_discharge_mix",
    label: "Post-discharge spend mix by hospital",
    source: "cms_hospital_spending_by_claim",
    resultTable: "rollup_hospital_discharge_mix",
    resultColumns: [
      "ccn", "data_year", "facility_name", "state", "pct_snf", "pct_hha", "pct_hospice", "pct_inpatient", "pct_outpatient",
      "pct_snf_state", "pct_hha_state", "pct_hospice_state", "pct_snf_national", "pct_hha_national", "pct_hospice_national", "avg_episode_spend",
    ],
    sql: `
      SELECT ccn, data_year, max(facility_name), max(state),
             max(pct_spend_hospital) FILTER (WHERE after_discharge AND claim_type ILIKE 'skilled nursing%'),
             max(pct_spend_hospital) FILTER (WHERE after_discharge AND claim_type ILIKE 'home health%'),
             max(pct_spend_hospital) FILTER (WHERE after_discharge AND claim_type ILIKE 'hospice%'),
             max(pct_spend_hospital) FILTER (WHERE after_discharge AND claim_type ILIKE 'inpatient%'),
             max(pct_spend_hospital) FILTER (WHERE after_discharge AND claim_type ILIKE 'outpatient%'),
             max(pct_spend_state) FILTER (WHERE after_discharge AND claim_type ILIKE 'skilled nursing%'),
             max(pct_spend_state) FILTER (WHERE after_discharge AND claim_type ILIKE 'home health%'),
             max(pct_spend_state) FILTER (WHERE after_discharge AND claim_type ILIKE 'hospice%'),
             max(pct_spend_national) FILTER (WHERE after_discharge AND claim_type ILIKE 'skilled nursing%'),
             max(pct_spend_national) FILTER (WHERE after_discharge AND claim_type ILIKE 'home health%'),
             max(pct_spend_national) FILTER (WHERE after_discharge AND claim_type ILIKE 'hospice%'),
             max(avg_spend_hospital) FILTER (WHERE claim_type ILIKE 'total%' AND period ILIKE 'complete episode%')
        FROM (SELECT s.*, period ILIKE '%after discharge%' AS after_discharge FROM cms_hospital_spending_by_claim s) x
       WHERE after_discharge OR (claim_type ILIKE 'total%' AND period ILIKE 'complete episode%')
       GROUP BY ccn, data_year`,
  },
  {
    name: "pac_market_share",
    label: "Post-acute market share by county and state",
    source: "cms_pac_utilization",
    resultTable: "rollup_pac_market_share",
    resultColumns: [
      "setting", "data_year", "geo_level", "geo_code", "ccn", "provider_name", "city", "state", "zip5",
      "benes", "stays", "days", "payment", "dual_pct", "risk_score", "share_benes", "rank", "providers_in_market",
    ],
    sql: `
      WITH p AS (
        SELECT u.setting, u.data_year, u.ccn, u.provider_name, u.city, u.state, u.zip5,
               u.bene_count, u.stays, u.service_days, u.medicare_payment, u.dual_pct, u.avg_risk_score,
               z.primary_county_fips AS county_fips
          FROM cms_pac_utilization u
          LEFT JOIN geo_zctas z ON z.zcta = u.zip5
         WHERE u.summary_level = 'provider' AND u.ccn <> ''),
      m AS (
        SELECT setting, data_year, 'county' AS geo_level, county_fips AS geo_code, ccn, provider_name, city, state, zip5,
               bene_count, stays, service_days, medicare_payment, dual_pct, avg_risk_score
          FROM p WHERE county_fips IS NOT NULL
        UNION ALL
        SELECT setting, data_year, 'state', state, ccn, provider_name, city, state, zip5,
               bene_count, stays, service_days, medicare_payment, dual_pct, avg_risk_score
          FROM p WHERE state <> '')
      SELECT setting, data_year, geo_level, geo_code, ccn, provider_name, city, state, zip5,
             bene_count, stays, service_days, medicare_payment, dual_pct, avg_risk_score,
             bene_count::float8 / NULLIF(sum(bene_count) OVER w, 0),
             (rank() OVER (PARTITION BY setting, data_year, geo_level, geo_code ORDER BY bene_count DESC NULLS LAST, ccn))::int,
             (count(*) OVER w)::int
        FROM m
      WINDOW w AS (PARTITION BY setting, data_year, geo_level, geo_code)`,
  },
  {
    name: "agency_coverage",
    label: "Home health and hospice coverage by county",
    source: "cms_zip_service_area",
    resultTable: "rollup_agency_coverage",
    resultColumns: ["setting", "county_fips", "ccn", "zips_served", "county_zips", "share_of_county_zips"],
    sql: `
      WITH county_zips AS (
        SELECT primary_county_fips AS county_fips, count(*)::int AS n FROM geo_zctas WHERE primary_county_fips IS NOT NULL GROUP BY 1),
      served AS (
        SELECT s.setting, z.primary_county_fips AS county_fips, s.ccn, count(DISTINCT s.zip5)::int AS zips_served
          FROM cms_zip_service_area s
          JOIN geo_zctas z ON z.zcta = s.zip5
         WHERE z.primary_county_fips IS NOT NULL
         GROUP BY 1, 2, 3)
      SELECT s.setting, s.county_fips, s.ccn, s.zips_served, c.n, s.zips_served::float8 / NULLIF(c.n, 0)
        FROM served s JOIN county_zips c USING (county_fips)`,
  },
  {
    name: "referral_sources",
    label: "Likely referral sources (clinicians by county)",
    source: "cms_physician_by_provider",
    resultTable: "rollup_referral_sources",
    resultColumns: [
      "npi", "data_year", "county_fips", "state", "zip5", "specialty", "benes", "services", "avg_risk_score", "dual_pct",
      "cc_chf_pct", "cc_copd_pct", "cc_alzheimer_pct", "cc_ckd_pct", "cc_diabetes_pct",
      "hha_eligible", "hospice_eligible", "dme_eligible", "dme_benes", "hospital_ccns", "affiliations", "referral_index", "rank_in_county",
      "hh_cert_benes", "hospice_oversight_benes", "hh_cert_year", "hospice_index", "hospice_rank_in_county",
    ],
    // rank_in_county is set only for clinicians whose ZIP resolves to a county: a NULL partition would rank the
    // ones that don't against each other, and the provider page would show a bogus "Nth in the county".
    sql: `
      WITH phys AS (
        SELECT DISTINCT ON (npi) npi, data_year, state, zip5, provider_type, benes, services, avg_risk_score, dual_count, chronic_conditions
          FROM cms_physician_by_provider
         WHERE entity_code = 'I' AND benes IS NOT NULL
         ORDER BY npi, data_year DESC),
      dme AS (
        SELECT DISTINCT ON (npi) npi, benes AS dme_benes FROM cms_dme_by_referring ORDER BY npi, data_year DESC),
      aff AS (
        SELECT npi,
               array_remove(array_agg(DISTINCT facility_ccn) FILTER (WHERE facility_type ILIKE 'hospital%' AND facility_ccn <> ''), NULL) AS hospital_ccns,
               count(*)::int AS affiliations
          FROM cms_facility_affiliation GROUP BY npi),
      /* affiliations stays NULL (unknown) until the Facility Affiliation file has been imported: "no hospital listed"
         is a statement about the file, and without it every clinician would read 0. */
      aff_loaded AS (SELECT EXISTS (SELECT 1 FROM cms_facility_affiliation) AS loaded),
      /* Patients a clinician certified for home health (G0180) and patients whose hospice plan of care they oversaw
         (G0182) in the latest data year. CMS counts patients per clinician, code and care setting (facility or office)
         and lists a row only above 10, so the sum over settings counts a patient seen in both twice (102 of 18,598
         certifiers in the 2024 file have rows in both), and a clinician with 10 or fewer in every setting is not
         listed however many they have in all. Like affiliations, both stay NULL (unknown) until the Home Health
         Certifications file has been imported. The index then rests on certifications: being listed is worth 15 points
         and 40 patients the full 50, where it used to rest on Order & Referring eligibility, which nearly every
         physician has (99% in the 2026 file) and so says nothing about who refers; without any certification a clinician
         can reach 50 of 100 on volume, risk and eligibility.
         Only rows that a completed import wrote count. The importer commits each page as it goes, so a rollup that
         ran during the import, or after one that failed part-way, would otherwise rank on part of the file (and a
         newer year half loaded would take the place of a complete older one). A clinician's rows carry the batch that
         last wrote them, so a running import takes its rows out until it completes. hh_cert_year is the year the
         counts come from, which can differ from the physician file's year. */
      cert_rows AS (
        SELECT c.npi, c.hcpcs_code, c.data_year, c.benes
          FROM cms_physician_certifications c
         WHERE c.import_batch_id IN (SELECT id FROM import_batches WHERE import_type = 'physician_certifications' AND status = 'completed')),
      cert_year AS (SELECT max(data_year) AS y FROM cert_rows),
      cert AS (
        SELECT c.npi,
               COALESCE(sum(c.benes) FILTER (WHERE c.hcpcs_code = 'G0180'), 0)::int AS hh_cert_benes,
               COALESCE(sum(c.benes) FILTER (WHERE c.hcpcs_code = 'G0182'), 0)::int AS hospice_oversight_benes
          FROM cert_rows c
          JOIN cert_year l ON l.y = c.data_year
         GROUP BY c.npi),
      cert_loaded AS (SELECT EXISTS (SELECT 1 FROM cert_rows) AS loaded),
      scored AS (
        SELECT p.npi, p.data_year, z.primary_county_fips AS county_fips, p.state, p.zip5, p.provider_type, p.benes, p.services,
               p.avg_risk_score,
               CASE WHEN p.benes > 0 AND p.dual_count IS NOT NULL THEN p.dual_count::float8 / p.benes END AS dual_pct,
               ${cc(["Bene_CC_PH_HF_NonIHD_V2_Pct", "Bene_CC_CHF_Pct"])} AS cc_chf_pct,
               ${cc(["Bene_CC_PH_COPD_V2_Pct", "Bene_CC_COPD_Pct"])} AS cc_copd_pct,
               ${cc(["Bene_CC_BH_Alz_NonAlzdem_V2_Pct", "Bene_CC_Alzhmr_Pct"])} AS cc_alzheimer_pct,
               ${cc(["Bene_CC_PH_CKD_V2_Pct", "Bene_CC_CKD_Pct"])} AS cc_ckd_pct,
               ${cc(["Bene_CC_PH_Diabetes_V2_Pct", "Bene_CC_Diab_Pct"])} AS cc_diabetes_pct,
               COALESCE(o.hha, false) AS hha_eligible, COALESCE(o.hospice, false) AS hospice_eligible, COALESCE(o.dme, false) AS dme_eligible,
               d.dme_benes, a.hospital_ccns, CASE WHEN (SELECT loaded FROM aff_loaded) THEN COALESCE(a.affiliations, 0) END AS affiliations,
               CASE WHEN (SELECT loaded FROM cert_loaded) THEN COALESCE(ce.hh_cert_benes, 0) END AS hh_cert_benes,
               CASE WHEN (SELECT loaded FROM cert_loaded) THEN COALESCE(ce.hospice_oversight_benes, 0) END AS hospice_oversight_benes,
               (SELECT y FROM cert_year) AS hh_cert_year,
               CASE WHEN (SELECT loaded FROM cert_loaded)
                    THEN round(CASE WHEN COALESCE(ce.hh_cert_benes, 0) > 0 THEN 15 + 35 * least(ce.hh_cert_benes / 40.0, 1) ELSE 0 END
                               + 20 * least(p.benes / 500.0, 1) + 15 * least(COALESCE(p.avg_risk_score, 0) / 2.5, 1)
                               + 15 * ((COALESCE(o.hha, false)::int + COALESCE(o.hospice, false)::int) / 2.0))::int
                    ELSE round(50 * least(p.benes / 500.0, 1) + 25 * least(COALESCE(p.avg_risk_score, 0) / 2.5, 1)
                               + 25 * ((COALESCE(o.hha, false)::int + COALESCE(o.hospice, false)::int) / 2.0))::int
               END AS referral_index,
               /* Specialty fit for a hospice referral. Volume is multiplied by this, so a radiologist scores nothing
                  from panel size. Physical medicine and rehabilitation refer to post-acute care; physical therapy does not. */
               CASE
                 WHEN p.provider_type ~* 'radiolog|patholog|anesthesiolog|ophthalmolog|optometr|dermatolog|podiatr|chiropract|audiolog|physical therapy' THEN 0
                 WHEN p.provider_type ~* 'hospice|palliative|geriatric' THEN 1
                 WHEN p.provider_type ~* 'internal medicine|family practice|general practice|hospitalist' THEN 0.85
                 WHEN p.provider_type ~* 'oncolog|hematolog|nephrolog|pulmon|cardiolog|neurolog|physiat|physical medicine|rehabilitation' THEN 0.7
                 WHEN p.provider_type ~* 'nurse practitioner|physician assistant' THEN 0.55
                 ELSE 0.25
               END AS hospice_fit
          FROM phys p
          LEFT JOIN geo_zctas z ON z.zcta = p.zip5
          LEFT JOIN cms_order_referring o ON o.npi = p.npi
          LEFT JOIN dme d ON d.npi = p.npi
          LEFT JOIN aff a ON a.npi = p.npi
          LEFT JOIN cert ce ON ce.npi = p.npi),
      /* Acuity is the average of the non-null Alzheimer's, heart-failure and COPD shares (fractions; full at 0.25).
         G0182 is a bonus of at most 10 once the certification file is loaded, and is not in the index before that.
         The ELSE is written as ELSE (round so it is not the referral index's ELSE round. */
      indexed AS (
        SELECT s.*,
               CASE WHEN (SELECT loaded FROM cert_loaded)
                    THEN round(35 * s.hospice_fit
                               + 25 * least(COALESCE((SELECT avg(v) FROM (VALUES (s.cc_alzheimer_pct), (s.cc_chf_pct), (s.cc_copd_pct)) AS t(v) WHERE v IS NOT NULL), 0) / 0.25, 1)
                               + 15 * least(COALESCE(s.avg_risk_score, 0) / 2.5, 1)
                               + 15 * s.hospice_fit * least(COALESCE(s.benes, 0) / 400.0, 1)
                               + CASE WHEN COALESCE(s.hospice_oversight_benes, 0) > 0 THEN 4 + 6 * least(s.hospice_oversight_benes / 20.0, 1) ELSE 0 END)::int
                    ELSE
                      (round(40 * s.hospice_fit
                             + 25 * least(COALESCE((SELECT avg(v) FROM (VALUES (s.cc_alzheimer_pct), (s.cc_chf_pct), (s.cc_copd_pct)) AS t(v) WHERE v IS NOT NULL), 0) / 0.25, 1)
                             + 20 * least(COALESCE(s.avg_risk_score, 0) / 2.5, 1)
                             + 15 * s.hospice_fit * least(COALESCE(s.benes, 0) / 400.0, 1))::int)
               END AS hospice_index
          FROM scored s)
      SELECT npi, data_year, county_fips, state, zip5, provider_type, benes, services, avg_risk_score, dual_pct,
             cc_chf_pct, cc_copd_pct, cc_alzheimer_pct, cc_ckd_pct, cc_diabetes_pct,
             hha_eligible, hospice_eligible, dme_eligible, dme_benes, hospital_ccns, affiliations, referral_index,
             (CASE WHEN county_fips IS NOT NULL THEN rank() OVER (PARTITION BY county_fips ORDER BY referral_index DESC, benes DESC, npi) END)::int,
             hh_cert_benes, hospice_oversight_benes, hh_cert_year, hospice_index,
             (CASE WHEN county_fips IS NOT NULL AND hospice_eligible THEN rank() OVER (PARTITION BY county_fips, hospice_eligible ORDER BY hospice_index DESC, benes DESC, npi) END)::int
        FROM indexed`,
  },
  {
    name: "county_market_profile",
    label: "County market profile",
    source: "geo_counties",
    resultTable: "rollup_county_market_profile",
    resultColumns: [
      "county_fips", "state", "county_name", "enrollment_period", "benes", "original_medicare", "ma_benes", "ma_penetration", "aged", "dual", "benes_85_plus",
      "saturation_period", "hha_providers", "hha_users", "hha_users_pct", "hospice_providers", "hospice_users", "hospice_users_pct", "snf_providers", "snf_users", "snf_users_pct",
      "variation_year", "std_per_capita_total", "std_per_capita_snf", "std_per_capita_hha", "std_per_capita_hospice", "readmission_rate", "er_visits_per_1000", "avg_hcc_score",
      "hsa_year", "hospitals_serving", "top_hospital_ccn", "top_hospital_share", "pac_year", "snf_facilities", "hha_agencies", "hospice_agencies", "as_of",
      "pop_total", "pop_65_plus", "pop_85_plus", "median_income", "median_home_value", "living_alone_65_plus", "licensed_homes", "licensed_beds",
      "hha_users_change_pct", "hha_providers_change_pct", "hospice_users_change_pct", "hospice_providers_change_pct", "snf_users_change_pct", "snf_providers_change_pct", "avg_hcc_source",
    ],
    sql: `
      WITH latest_enroll AS (SELECT max(period) AS period FROM cms_monthly_enrollment WHERE geo_level = 'County' AND period NOT LIKE '%-ALL'),
      enroll AS (SELECT e.* FROM cms_monthly_enrollment e, latest_enroll l WHERE e.geo_level = 'County' AND e.period = l.period),
      /* CMS often leaves the published year-over-year columns blank. Keep a published percent (percent units, like
         the file) and otherwise compute (current - previous) / previous from the prior reference period. Periods are
         ISO dates, so they sort lexicographically. */
      sat_hist AS (
        SELECT s.geo_code, s.service, s.reference_period, s.providers, s.users, s.users_pct, s.providers_change_pct, s.users_change_pct,
               lag(s.providers) OVER (PARTITION BY s.geo_code, s.service ORDER BY s.reference_period) AS prev_providers,
               lag(s.users) OVER (PARTITION BY s.geo_code, s.service ORDER BY s.reference_period) AS prev_users
          FROM cms_market_saturation s
         WHERE s.geo_level ILIKE 'county%'),
      latest_sat AS (SELECT max(reference_period) AS period FROM sat_hist),
      sat AS (
        SELECT h.geo_code, h.reference_period,
               max(providers) FILTER (WHERE service ILIKE 'home health%') AS hha_providers,
               max(users) FILTER (WHERE service ILIKE 'home health%') AS hha_users,
               max(users_pct) FILTER (WHERE service ILIKE 'home health%') AS hha_users_pct,
               max(providers) FILTER (WHERE service ILIKE 'hospice%') AS hospice_providers,
               max(users) FILTER (WHERE service ILIKE 'hospice%') AS hospice_users,
               max(users_pct) FILTER (WHERE service ILIKE 'hospice%') AS hospice_users_pct,
               max(providers) FILTER (WHERE service ILIKE 'skilled nursing%') AS snf_providers,
               max(users) FILTER (WHERE service ILIKE 'skilled nursing%') AS snf_users,
               max(users_pct) FILTER (WHERE service ILIKE 'skilled nursing%') AS snf_users_pct,
               max(COALESCE(users_change_pct, CASE WHEN prev_users > 0 THEN (users - prev_users)::float8 / prev_users * 100 END)) FILTER (WHERE service ILIKE 'home health%') AS hha_users_change_pct,
               max(COALESCE(providers_change_pct, CASE WHEN prev_providers > 0 THEN (providers - prev_providers)::float8 / prev_providers * 100 END)) FILTER (WHERE service ILIKE 'home health%') AS hha_providers_change_pct,
               max(COALESCE(users_change_pct, CASE WHEN prev_users > 0 THEN (users - prev_users)::float8 / prev_users * 100 END)) FILTER (WHERE service ILIKE 'hospice%') AS hospice_users_change_pct,
               max(COALESCE(providers_change_pct, CASE WHEN prev_providers > 0 THEN (providers - prev_providers)::float8 / prev_providers * 100 END)) FILTER (WHERE service ILIKE 'hospice%') AS hospice_providers_change_pct,
               max(COALESCE(users_change_pct, CASE WHEN prev_users > 0 THEN (users - prev_users)::float8 / prev_users * 100 END)) FILTER (WHERE service ILIKE 'skilled nursing%') AS snf_users_change_pct,
               max(COALESCE(providers_change_pct, CASE WHEN prev_providers > 0 THEN (providers - prev_providers)::float8 / prev_providers * 100 END)) FILTER (WHERE service ILIKE 'skilled nursing%') AS snf_providers_change_pct
          FROM sat_hist h, latest_sat l
         WHERE h.reference_period = l.period
         GROUP BY 1, 2),
      latest_var AS (SELECT max(data_year) AS year FROM cms_geo_variation WHERE geo_level = 'County'),
      var AS (SELECT v.* FROM cms_geo_variation v, latest_var l WHERE v.geo_level = 'County' AND v.age_level = 'All' AND v.data_year = l.year),
      latest_hsa AS (SELECT max(data_year) AS year FROM rollup_county_hospital_sources),
      hsa AS (
        SELECT county_fips, data_year, count(*)::int AS hospitals_serving,
               max(ccn) FILTER (WHERE rank = 1) AS top_hospital_ccn, max(share_of_county) FILTER (WHERE rank = 1) AS top_hospital_share
          FROM rollup_county_hospital_sources h, latest_hsa l WHERE h.data_year = l.year GROUP BY 1, 2),
      -- CMS publishes each setting's file on its own schedule, so each is counted
      -- at its own latest year (one shared year would zero the settings not yet
      -- released for it).
      latest_pac AS (SELECT setting, max(data_year) AS year FROM rollup_pac_market_share WHERE geo_level = 'county' GROUP BY setting),
      pac_years AS (
        SELECT max(year) AS year, jsonb_object_agg(setting, year) AS by_setting
          FROM latest_pac WHERE setting IN ('snf', 'hha', 'hospice')),
      pac AS (
        SELECT p.geo_code AS county_fips,
               count(*) FILTER (WHERE p.setting = 'snf')::int AS snf_facilities,
               count(*) FILTER (WHERE p.setting = 'hha')::int AS hha_agencies,
               count(*) FILTER (WHERE p.setting = 'hospice')::int AS hospice_agencies
          FROM rollup_pac_market_share p JOIN latest_pac l ON l.setting = p.setting AND l.year = p.data_year
         WHERE p.geo_level = 'county' GROUP BY 1),
      acs_meta AS (SELECT vintage FROM geo_meta WHERE key = 'acs'),
      lic AS (
        SELECT county_fips, count(*)::int AS homes, sum(capacity)::int AS beds, max(as_of)::text AS as_of
          FROM licensed_facilities WHERE county_fips IS NOT NULL AND license_type IN (${RESIDENTIAL_LICENSE_TYPES.map((t) => `'${t}'`).join(", ")}) GROUP BY 1),
      /* The county geographic-variation file has no risk score. When it doesn't, use the beneficiary-weighted
         average of clinicians' CMS patient risk scores whose ZIP's primary county is this one (latest year, individuals). */
      phys_hcc AS (
        SELECT z.primary_county_fips AS county_fips,
               sum(p.avg_risk_score * p.benes) / NULLIF(sum(p.benes), 0) AS avg_hcc
          FROM (
            SELECT DISTINCT ON (npi) zip5, benes, avg_risk_score
              FROM cms_physician_by_provider
             WHERE entity_code = 'I' AND avg_risk_score IS NOT NULL AND benes > 0
             ORDER BY npi, data_year DESC
          ) p
          JOIN geo_zctas z ON z.zcta = p.zip5
         WHERE z.primary_county_fips IS NOT NULL
         GROUP BY 1)
      SELECT c.fips, c.state, c.name,
             e.period, e.total_benes, e.original_medicare, e.ma_and_other, e.ma_and_other::float8 / NULLIF(e.total_benes, 0), e.aged, e.dual, e.age_85_plus,
             s.reference_period, s.hha_providers, s.hha_users, s.hha_users_pct, s.hospice_providers, s.hospice_users, s.hospice_users_pct, s.snf_providers, s.snf_users, s.snf_users_pct,
             v.data_year, v.std_per_capita_total, v.std_per_capita_snf, v.std_per_capita_hha, v.std_per_capita_hospice, v.readmission_rate, v.er_visits_per_1000, COALESCE(v.avg_hcc_score, ph.avg_hcc),
             h.data_year, h.hospitals_serving, h.top_hospital_ccn, h.top_hospital_share,
             py.year, p.snf_facilities, p.hha_agencies, p.hospice_agencies,
             jsonb_build_object('enrollment', e.period, 'saturation', s.reference_period, 'variation', v.data_year,
                                'hospital_service_area', h.data_year, 'pac_utilization', py.year,
                                'pac_utilization_by_setting', py.by_setting,
                                'acs', (SELECT vintage FROM acs_meta), 'licensed', lf.as_of),
             a.pop_total, a.pop_65_plus, a.pop_85_plus, a.median_income, a.median_home_value, a.living_alone_65_plus,
             lf.homes, lf.beds,
             s.hha_users_change_pct, s.hha_providers_change_pct, s.hospice_users_change_pct, s.hospice_providers_change_pct, s.snf_users_change_pct, s.snf_providers_change_pct,
             CASE WHEN v.avg_hcc_score IS NOT NULL THEN 'geographic_variation' WHEN ph.avg_hcc IS NOT NULL THEN 'physician_panels' END
        FROM geo_counties c
        LEFT JOIN enroll e ON e.geo_code = c.fips
        LEFT JOIN sat s ON s.geo_code = c.fips
        LEFT JOIN var v ON v.geo_code = c.fips
        LEFT JOIN hsa h ON h.county_fips = c.fips
        LEFT JOIN pac p ON p.county_fips = c.fips
        LEFT JOIN pac_years py ON true
        LEFT JOIN census_acs_county a ON a.fips = c.fips
        LEFT JOIN lic lf ON lf.county_fips = c.fips
        LEFT JOIN phys_hcc ph ON ph.county_fips = c.fips`,
  },
];
