export type Cadence = "monthly" | "quarterly" | "yearly";

export type ReferenceDataset = {
  id: string;
  label: string;
  cadence: Cadence;
  /** Public page the file comes from. The worker does not fetch it. */
  source: string;
  table: string;
  fileName: string;
};

export const REFERENCE_DATASETS: ReferenceDataset[] = [
  { id: "cdc_places", label: "CDC PLACES county measures", cadence: "yearly", source: "https://data.cdc.gov/500-Cities-Places/PLACES-Local-Data-for-Better-Health-County-Data-20/swc5-untb", table: "cdc_places_county", fileName: "cdc_places.csv" },
  { id: "hrsa_shortage", label: "HRSA health professional shortage areas", cadence: "quarterly", source: "https://data.hrsa.gov/data/download", table: "hrsa_shortage", fileName: "hrsa_shortage.csv" },
  { id: "cms_ma_plan_enrollment", label: "Medicare Advantage enrollment by organization and county", cadence: "monthly", source: "https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data", table: "cms_ma_plan_enrollment", fileName: "cms_ma_plan_enrollment.csv" },
  { id: "cms_ma_contract_county", label: "Medicare Advantage enrollment by contract and county", cadence: "monthly", source: "https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data", table: "cms_ma_contract_county", fileName: "cms_ma_contract_county.csv" },
  { id: "cms_ma_penetration", label: "Medicare Advantage penetration by county", cadence: "monthly", source: "https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-advantagepart-d-contract-and-enrollment-data", table: "cms_ma_penetration", fileName: "cms_ma_penetration.csv" },
  { id: "cms_ma_star", label: "Medicare Advantage star ratings", cadence: "yearly", source: "https://www.cms.gov/medicare/health-drug-plans/part-c-d-performance-data", table: "cms_ma_star", fileName: "cms_ma_star.csv" },
  { id: "oig_leie", label: "OIG List of Excluded Individuals and Entities", cadence: "monthly", source: "https://oig.hhs.gov/exclusions/exclusions_list.asp", table: "oig_exclusions", fileName: "oig_leie.csv" },
  { id: "cms_open_payments", label: "CMS Open Payments general-payment totals", cadence: "yearly", source: "https://openpaymentsdata.cms.gov/", table: "cms_open_payment_totals", fileName: "cms_open_payments.csv" },
  { id: "medicare_opt_out", label: "Medicare opt-out affidavits", cadence: "quarterly", source: "https://data.cms.gov/provider-characteristics/medicare-provider-supplier-enrollment/opt-out-affidavits", table: "medicare_opt_out", fileName: "medicare_opt_out.csv" },
  { id: "cms_partd_geo_drug", label: "Medicare Part D drugs by geography", cadence: "yearly", source: "https://data.cms.gov/provider-summary-by-type-of-service/medicare-part-d-prescribers", table: "cms_partd_geo_drug", fileName: "cms_partd_geo_drug.csv" },
  { id: "cms_partd_provider_drug", label: "Medicare Part D drugs by provider", cadence: "yearly", source: "https://data.cms.gov/provider-summary-by-type-of-service/medicare-part-d-prescribers", table: "cms_partd_provider_drug", fileName: "cms_partd_provider_drug.csv" },
  { id: "cms_geo_service", label: "Medicare physician services by geography", cadence: "yearly", source: "https://data.cms.gov/provider-summary-by-type-of-service/medicare-physician-other-practitioners", table: "cms_geo_service", fileName: "cms_geo_service.csv" },
  { id: "cms_mlr", label: "CMS medical loss ratio", cadence: "yearly", source: "https://www.cms.gov/marketplace/resources/data/medical-loss-ratio-data-systems-resources", table: "cms_mlr", fileName: "cms_mlr.csv" },
  { id: "cms_oep_state", label: "CMS open enrollment by state", cadence: "yearly", source: "https://www.cms.gov/data-research/statistics-trends-and-reports/marketplace-products", table: "cms_oep_state", fileName: "cms_oep_state.csv" },
  { id: "pa_mco_enrollment", label: "Pennsylvania HealthChoices enrollment", cadence: "monthly", source: "https://www.dhs.pa.gov/providers/Providers/Pages/Managed-Care-Organizations.aspx", table: "pa_mco_enrollment", fileName: "pa_mco_enrollment.csv" },
  { id: "qhp_county_issuer", label: "Marketplace issuers by county", cadence: "yearly", source: "https://www.cms.gov/marketplace/resources/data/marketplace-puf", table: "qhp_county_issuer", fileName: "qhp_county_issuer.csv" },
  { id: "pa_aca_rate", label: "Pennsylvania ACA rate filings", cadence: "yearly", source: "https://www.insurance.pa.gov/Consumers/HealthInsuranceFilings/Pages/default.aspx", table: "pa_aca_rate", fileName: "pa_aca_rate.csv" },
  { id: "phc4_county_stat", label: "PHC4 county statistics", cadence: "quarterly", source: "https://www.phc4.org/", table: "phc4_county_stat", fileName: "phc4_county_stat.csv" },
  { id: "cms_pos", label: "CMS Provider of Services", cadence: "quarterly", source: "https://data.cms.gov/provider-characteristics/hospitals-and-other-facilities/provider-of-services-file", table: "cms_pos_facility", fileName: "cms_pos.csv" },
  { id: "certificate_of_need", label: "State certificate of need", cadence: "yearly", source: "https://www.ncsl.org/health/certificate-of-need-state-laws", table: "certificate_of_need", fileName: "certificate_of_need.csv" },
  { id: "hud_zip_county", label: "HUD ZIP-county crosswalk", cadence: "yearly", source: "https://www.huduser.gov/portal/datasets/usps_crosswalk.html", table: "hud_zip_county", fileName: "hud_zip_county.csv" },
  { id: "hcris_hha", label: "HCRIS home health cost reports", cadence: "yearly", source: "https://www.cms.gov/data-research/statistics-trends-and-reports/cost-reports", table: "hcris_cost_summary", fileName: "hcris_hha.csv" },
  { id: "hcris_hospice", label: "HCRIS hospice cost reports", cadence: "yearly", source: "https://www.cms.gov/data-research/statistics-trends-and-reports/cost-reports", table: "hcris_cost_summary", fileName: "hcris_hospice.csv" },
  { id: "hcris_snf", label: "HCRIS skilled nursing cost reports", cadence: "yearly", source: "https://www.cms.gov/data-research/statistics-trends-and-reports/cost-reports", table: "hcris_cost_summary", fileName: "hcris_snf.csv" },
  { id: "ahrq_sdoh", label: "AHRQ Social Determinants of Health", cadence: "yearly", source: "https://www.ahrq.gov/sdoh/data-analytics/sdoh-data.html", table: "county_sdoh", fileName: "ahrq_sdoh.csv" },
  { id: "cdc_svi", label: "CDC Social Vulnerability Index", cadence: "yearly", source: "https://www.atsdr.cdc.gov/placeandhealth/svi/index.html", table: "cdc_svi_county", fileName: "cdc_svi.csv" },
  { id: "bls_qcew", label: "BLS Quarterly Census of Employment and Wages", cadence: "quarterly", source: "https://www.bls.gov/cew/", table: "bls_wage", fileName: "bls_qcew.csv" },
  { id: "bls_oews", label: "BLS Occupational Employment and Wage Statistics", cadence: "yearly", source: "https://www.bls.gov/oes/", table: "bls_wage", fileName: "bls_oews.csv" },
  { id: "cms_ahcah", label: "CMS Acute Hospital Care at Home", cadence: "monthly", source: "https://www.cms.gov/priorities/innovation/innovation-models/ahcah", table: "cms_ahcah", fileName: "cms_ahcah.csv" },
];

export function datasetById(id: string): ReferenceDataset | undefined {
  return REFERENCE_DATASETS.find((dataset) => dataset.id === id);
}

export function fileForDataset(id: string, fileNames: string[]): string | null {
  const dataset = datasetById(id);
  if (!dataset) return null;
  if (fileNames.includes(dataset.fileName)) return dataset.fileName;
  return fileNames.find((name) => name.startsWith(`${id}_`) && name.endsWith(".csv")) ?? null;
}
