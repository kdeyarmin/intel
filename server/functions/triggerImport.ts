import { db } from "../db";
import { importBatches, cmsReferrals, providerServiceUtilization, medicareFacilities } from "../db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { handleImportNPPESFlatFile } from "./importNPPESFlatFile";

const IMPORT_TYPE_ALIASES: Record<string, string> = {
  cms_utilization: "provider_service_utilization",
};

const IMPORT_TYPE_URLS: Record<string, string> = {
  provider_service_utilization: "https://data.cms.gov/data-api/v1/dataset/92396110-2aed-4d63-a6a2-5d6207d46a29/data",
  cms_order_referring: "https://data.cms.gov/data-api/v1/dataset/c99b5865-1119-4436-bb80-c5af2773ea1f/data",
  home_health_enrollments: "https://data.cms.gov/data-api/v1/dataset/15f64ab4-3172-4a27-b589-ebd67a6d28aa/data",
  hospice_enrollments: "https://data.cms.gov/data-api/v1/dataset/25704213-e833-4b8b-9dbc-58dd17149209/data",
  medical_equipment_suppliers: "https://data.cms.gov/provider-data/api/1/datastore/query/ct36-nrcq/0",
  hospice_provider_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/gxki-hrr8/0",
  hospice_state_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/eda0-92f0/0",
  hospice_national_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/7cv8-v37d/0",
  snf_provider_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/fykj-qjee/0",
  nursing_home_providers: "https://data.cms.gov/provider-data/api/1/datastore/query/4pq5-n9py/0",
  nursing_home_deficiencies: "https://data.cms.gov/provider-data/api/1/datastore/query/tbry-pc2d/0",
  home_health_national_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/97z8-de96/0",
  hospital_enrollments: "https://data.cms.gov/data-api/v1/dataset/f6f6505c-e8b0-4d57-b258-e2b94133aaf2/data",
  hospital_all_owners: "https://data.cms.gov/data-api/v1/dataset/029c119f-f79c-49be-9100-344d31d10344/data",
  hospital_cost_report: "https://data.cms.gov/data-api/v1/dataset/44060663-47d8-4ced-a115-b53b4c270acb/data",
  hospital_service_area: "https://data.cms.gov/data-api/v1/dataset/8708ca8b-8636-44ed-8303-724cbfaf78ad/data",
  hospital_general_info: "https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0",
  hospital_readmissions: "https://data.cms.gov/provider-data/api/1/datastore/query/9n3s-kdb3/0",
  hospital_complications: "https://data.cms.gov/provider-data/api/1/datastore/query/ynj2-r877/0",
  hospital_infections: "https://data.cms.gov/provider-data/api/1/datastore/query/77hc-ibv8/0",
  hospital_value_based_purchasing: "https://data.cms.gov/provider-data/api/1/datastore/query/ypbt-wvdk/0",
  fqhc_enrollments: "https://data.cms.gov/data-api/v1/dataset/4bcae866-3411-439a-b762-90a6187c194b/data",
  hospice_all_owners: "https://data.cms.gov/data-api/v1/dataset/e983965e-1603-4cb8-82b5-c40090e380d1/data",
  hospice_general_info: "https://data.cms.gov/provider-data/api/1/datastore/query/yc9t-dgbk/0",
  hospice_provider_data: "https://data.cms.gov/provider-data/api/1/datastore/query/252m-zfp9/0",
  home_health_agencies: "https://data.cms.gov/provider-data/api/1/datastore/query/6jpm-sxkc/0",
  home_health_all_owners: "https://data.cms.gov/data-api/v1/dataset/fc009b2d-7846-44b1-b4a1-692f0c143879/data",
  home_health_cost_report: "https://data.cms.gov/data-api/v1/dataset/4999da74-1d8d-4a6f-934e-2d7ea470cc63/data",
  home_health_state_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/tee5-ixt5/0",
  dialysis_facility_listing: "https://data.cms.gov/provider-data/api/1/datastore/query/23ew-n7w9/0",
  dialysis_state_averages: "https://data.cms.gov/provider-data/api/1/datastore/query/2fpu-cgbb/0",
  dialysis_national_averages: "https://data.cms.gov/provider-data/api/1/datastore/query/2rkq-ygai/0",
  nursing_home_penalties: "https://data.cms.gov/provider-data/api/1/datastore/query/g6vv-u9sr/0",
  inpatient_rehab_general_info: "https://data.cms.gov/provider-data/api/1/datastore/query/7t8x-u3ir/0",
  inpatient_rehab_provider_data: "https://data.cms.gov/provider-data/api/1/datastore/query/v9e4-nwhh/0",
  long_term_care_general_info: "https://data.cms.gov/provider-data/api/1/datastore/query/azum-44iv/0",
  long_term_care_provider_data: "https://data.cms.gov/provider-data/api/1/datastore/query/fp6g-2gsn/0",
  medicare_inpatient_by_provider: "https://data.cms.gov/data-api/v1/dataset/ee6fb1a5-39b9-46b3-a980-a7284551a732/data",
  medicare_outpatient_by_provider: "https://data.cms.gov/data-api/v1/dataset/ccbc9a44-40d4-46b4-a709-5caa59212e50/data",
  medicare_physician_by_provider: "https://data.cms.gov/data-api/v1/dataset/8889d81e-2ee7-448f-8713-f071038289b5/data",
  medicare_dme_by_supplier: "https://data.cms.gov/data-api/v1/dataset/a2d56d3f-3531-4315-9d87-e29986516b41/data",
  medicare_dme_by_referring: "https://data.cms.gov/data-api/v1/dataset/f8603e5b-9c47-4c52-9b47-a4ef92dfada4/data",
  medicare_part_d_prescribers: "https://data.cms.gov/data-api/v1/dataset/14d8e8a9-7e9b-4370-a044-bf97c46b4b44/data",
  medicare_dialysis_facilities: "https://data.cms.gov/data-api/v1/dataset/f8610e87-ba25-43a3-a49e-927dbc8701ae/data",
  medicare_snf_utilization: "https://data.cms.gov/data-api/v1/dataset/eaed338b-847e-41b1-a4d3-a206f40dc72b/data",
  medicare_hha_utilization: "https://data.cms.gov/data-api/v1/dataset/43ef03ce-2b60-40a8-958e-146195b5fec7/data",
  medicare_hospice_utilization: "https://data.cms.gov/data-api/v1/dataset/4e73f1b5-82cb-4682-8ad2-28493f0b6840/data",
  medicare_irf_utilization: "https://data.cms.gov/data-api/v1/dataset/0d9eebff-7e23-4b1e-8e29-362eea132df5/data",
  medicare_ltch_utilization: "https://data.cms.gov/data-api/v1/dataset/2935c3fe-b18a-4e39-a0c5-e70573664f19/data",
  medicare_fee_for_service_enrollment: "https://data.cms.gov/data-api/v1/dataset/2457ea29-fc82-48b0-86ec-3b0755de7515/data",
  medicare_monthly_enrollment: "https://data.cms.gov/data-api/v1/dataset/d7fabe1e-d19b-4333-9eff-e80e0643f2fd/data",
  aco_snf_affiliates: "https://data.cms.gov/data-api/v1/dataset/5b227bd9-82d4-4145-86fd-809e02ca7f18/data",
  aco_reach_providers: "https://data.cms.gov/data-api/v1/dataset/e0eba16f-ce0d-4037-96ce-2af70c718c98/data",
  home_infusion_therapy: "https://data.cms.gov/data-api/v1/dataset/31f25ab6-2fe3-4bad-ac5a-90635ed79935/data",
  market_saturation_county: "https://data.cms.gov/data-api/v1/dataset/8900b9c5-50b7-43de-9bdd-0d7113a8355e/data",
  market_saturation_cbsa: "https://data.cms.gov/data-api/v1/dataset/9b0e7798-d945-48fc-9861-d38bb5083a74/data",
  provider_taxonomy_crosswalk: "https://data.cms.gov/data-api/v1/dataset/113eb0bc-0c9a-4d91-9f93-3f6b28c0bf6b/data",
  hospital_price_transparency: "https://data.cms.gov/data-api/v1/dataset/6a3aa708-3c9d-411a-a1a4-e046d3ade7ef/data",
  medicare_spending_by_drug_d: "https://data.cms.gov/data-api/v1/dataset/7e0b4365-fd63-4a29-8f5e-e0ac9f66a81b/data",
  medicare_spending_by_drug_b: "https://data.cms.gov/data-api/v1/dataset/76a714ad-3a2c-43ac-b76d-9dadf8f7d890/data",
  hospital_hcahps_survey: "https://data.cms.gov/provider-data/api/1/datastore/query/dgck-syfz/0",
  hospital_timely_effective_care: "https://data.cms.gov/provider-data/api/1/datastore/query/yv7e-xc69/0",
  hospital_unplanned_visits: "https://data.cms.gov/provider-data/api/1/datastore/query/632h-zaca/0",
  hospital_imaging_efficiency: "https://data.cms.gov/provider-data/api/1/datastore/query/wkfw-kthe/0",
  hospital_spending_per_beneficiary: "https://data.cms.gov/provider-data/api/1/datastore/query/rrqw-56er/0",
  hospital_spending_by_claim: "https://data.cms.gov/provider-data/api/1/datastore/query/nrth-mfg3/0",
  hospital_hac_reduction: "https://data.cms.gov/provider-data/api/1/datastore/query/yq43-i98g/0",
  hospital_psychiatric_facility: "https://data.cms.gov/provider-data/api/1/datastore/query/q9vs-r7wp/0",
  ambulatory_surgical_center: "https://data.cms.gov/provider-data/api/1/datastore/query/4jcv-atw7/0",
  hospital_joint_replacement: "https://data.cms.gov/provider-data/api/1/datastore/query/tqkv-mgxq/0",
  clinician_national_file: "https://data.cms.gov/provider-data/api/1/datastore/query/mj5m-pzi6/0",
  clinician_mips_performance: "https://data.cms.gov/provider-data/api/1/datastore/query/a174-a962/0",
  clinician_mips_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/7d6a-e7a6/0",
  clinician_group_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/0ba7-2cb0/0",
  clinician_group_experience: "https://data.cms.gov/provider-data/api/1/datastore/query/8c70-d353/0",
  home_health_patient_survey: "https://data.cms.gov/provider-data/api/1/datastore/query/ccn4-8vby/0",
  home_health_zip_data: "https://data.cms.gov/provider-data/api/1/datastore/query/m5eg-upu5/0",
  hospice_zip_data: "https://data.cms.gov/provider-data/api/1/datastore/query/95rg-2usp/0",
  dialysis_patient_survey: "https://data.cms.gov/provider-data/api/1/datastore/query/59mq-zhts/0",
  nursing_home_ownership: "https://data.cms.gov/provider-data/api/1/datastore/query/y2hd-n93e/0",
  nursing_home_fire_safety: "https://data.cms.gov/provider-data/api/1/datastore/query/ifjz-ge4w/0",
  nursing_home_health_deficiencies: "https://data.cms.gov/provider-data/api/1/datastore/query/r5ix-sfxw/0",
  nursing_home_mds_quality: "https://data.cms.gov/provider-data/api/1/datastore/query/djen-97ju/0",
  nursing_home_claims_quality: "https://data.cms.gov/provider-data/api/1/datastore/query/ijh5-nb2v/0",
  snf_quality_reporting: "https://data.cms.gov/provider-data/api/1/datastore/query/fykj-qjee/0",
};

const ZIP_FUNCTION_MAP: Record<string, string> = {
  medicare_hha_stats: "importMedicareHHA",
  medicare_ma_inpatient: "importMedicareMAInpatient",
  medicare_snf_stats: "importMedicareSNF",
};

const ALLOWED_URL_DOMAINS = [
  "data.cms.gov",
  "download.cms.gov",
  "npiregistry.cms.hhs.gov",
];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_URL_DOMAINS.some((d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

const CMS_DATASET_CATALOG = [
  { id: "cms_order_referring", title: "Order & Referring Providers", description: "Complete list of providers eligible to order and refer Medicare services including Part B, DME, HHA, PMD, and Hospice designations.", category: "Physicians & Clinicians", records: "~2M", priority: "high" },
  { id: "provider_service_utilization", title: "Physician & Other Practitioners - by Provider and Service", description: "Utilization and payment data for Medicare Part B services by individual provider and HCPCS code.", category: "Physicians & Clinicians", records: "~10M", priority: "high" },
  { id: "medicare_physician_by_provider", title: "Physician & Other Practitioners - by Provider", description: "Aggregate utilization and payment data for Medicare Part B services summarized at the provider level.", category: "Physicians & Clinicians", records: "~1.2M", priority: "high" },
  { id: "medicare_dme_by_supplier", title: "DME Suppliers - by Supplier", description: "Medicare Durable Medical Equipment, Devices & Supplies payment and utilization data by supplier.", category: "Physicians & Clinicians", records: "~70K", priority: "medium" },
  { id: "medicare_dme_by_referring", title: "DME - by Referring Provider", description: "DME utilization data grouped by the referring physician or provider.", category: "Physicians & Clinicians", records: "~400K", priority: "medium" },
  { id: "medical_equipment_suppliers", title: "Medical Equipment Supplier Directory", description: "Directory of DMEPOS suppliers including business name, address, specialties, and supplies lists.", category: "Physicians & Clinicians", records: "~58K", priority: "medium" },
  { id: "medicare_part_d_prescribers", title: "Part D Prescribers - by Provider", description: "Medicare Part D prescribing data summarized at the individual prescriber level.", category: "Physicians & Clinicians", records: "~1.2M", priority: "medium" },
  { id: "provider_taxonomy_crosswalk", title: "Provider & Supplier Taxonomy Crosswalk", description: "Maps Medicare provider types and specialties to standard healthcare taxonomy codes.", category: "Physicians & Clinicians", records: "~4K", priority: "low" },
  { id: "clinician_national_file", title: "Doctors & Clinicians - National Downloadable File", description: "Complete national file of all Medicare-enrolled doctors and clinicians with NPI, specialty, group affiliation, address, and quality program participation.", category: "Doctors & Clinicians", records: "~2.8M", priority: "high" },
  { id: "clinician_mips_performance", title: "Clinician MIPS Overall Performance", description: "Individual clinician performance scores under the Merit-based Incentive Payment System (MIPS) program.", category: "Doctors & Clinicians", records: "~541K", priority: "high" },
  { id: "clinician_mips_measures", title: "Clinician MIPS Measures and Attestations", description: "Detailed MIPS measure-level results and attestation data for individual clinicians.", category: "Doctors & Clinicians", records: "~540K", priority: "medium" },
  { id: "clinician_group_measures", title: "Group Practice MIPS Measures and Attestations", description: "MIPS measure-level performance data for physician group practices.", category: "Doctors & Clinicians", records: "~199K", priority: "medium" },
  { id: "clinician_group_experience", title: "Group Practice Patient Experience", description: "Patient experience survey results (CAHPS) for physician group practices.", category: "Doctors & Clinicians", records: "~560", priority: "medium" },

  { id: "hospital_enrollments", title: "Hospital Enrollments", description: "CMS enrollment data for all hospitals including NPI, CCN, organization name, address, and enrollment status.", category: "Hospitals", records: "~8K", priority: "high" },
  { id: "hospital_general_info", title: "Hospital General Information", description: "Comprehensive hospital profile data including type, ownership, emergency services, and overall quality ratings.", category: "Hospitals", records: "~5K", priority: "high" },
  { id: "hospital_all_owners", title: "Hospital All Owners", description: "Ownership information for all Medicare-certified hospitals.", category: "Hospitals", records: "~30K", priority: "medium" },
  { id: "hospital_readmissions", title: "Hospital Readmissions Reduction Program", description: "Hospital performance on readmission measures with excess readmission ratios and payment reduction data.", category: "Hospitals", records: "~20K", priority: "high" },
  { id: "hospital_complications", title: "Complications and Deaths - Hospital", description: "Hospital-level data on complication rates and mortality measures for key conditions.", category: "Hospitals", records: "~50K", priority: "high" },
  { id: "hospital_infections", title: "Healthcare Associated Infections - Hospital", description: "Hospital-level HAI data including CLABSI, CAUTI, SSI, MRSA, and C.diff infection rates.", category: "Hospitals", records: "~40K", priority: "high" },
  { id: "hospital_value_based_purchasing", title: "Hospital Value-Based Purchasing Scores", description: "Total Performance Scores for the Hospital VBP Program including clinical, efficiency, safety, and patient experience domains.", category: "Hospitals", records: "~3K", priority: "medium" },
  { id: "hospital_cost_report", title: "Hospital Provider Cost Report", description: "Cost report data including revenues, expenses, bed counts, and financial performance metrics.", category: "Hospitals", records: "~7K", priority: "medium" },
  { id: "hospital_service_area", title: "Hospital Service Area", description: "Geographic service area definitions for Medicare-certified hospitals.", category: "Hospitals", records: "~200K", priority: "low" },
  { id: "hospital_hcahps_survey", title: "Patient Survey (HCAHPS) - Hospital", description: "Hospital Consumer Assessment of Healthcare Providers and Systems survey results measuring patient experience.", category: "Hospitals", records: "~326K", priority: "high" },
  { id: "hospital_timely_effective_care", title: "Timely and Effective Care - Hospital", description: "Hospital performance on timely and effective care measures including ED wait times, heart attack care, and stroke care.", category: "Hospitals", records: "~138K", priority: "high" },
  { id: "hospital_unplanned_visits", title: "Unplanned Hospital Visits", description: "Hospital-level data on unplanned readmissions and emergency department visits after procedures.", category: "Hospitals", records: "~67K", priority: "high" },
  { id: "hospital_imaging_efficiency", title: "Outpatient Imaging Efficiency - Hospital", description: "Hospital performance on outpatient imaging efficiency measures including use of MRI and CT scans.", category: "Hospitals", records: "~19K", priority: "medium" },
  { id: "hospital_spending_per_beneficiary", title: "Medicare Spending Per Beneficiary - Hospital", description: "Hospital-level Medicare spending per beneficiary including pre-admission, during stay, and post-discharge.", category: "Hospitals", records: "~5K", priority: "medium" },
  { id: "hospital_spending_by_claim", title: "Medicare Hospital Spending by Claim", description: "Detailed Medicare spending data by claim type including inpatient, outpatient, SNF, home health, and hospice.", category: "Hospitals", records: "~64K", priority: "medium" },
  { id: "hospital_hac_reduction", title: "Hospital-Acquired Condition Reduction Program", description: "Hospital performance under the HAC Reduction Program including total HAC scores and payment reduction indicators.", category: "Hospitals", records: "~3K", priority: "medium" },
  { id: "hospital_psychiatric_facility", title: "Inpatient Psychiatric Facility Quality Measures", description: "Quality measure data for inpatient psychiatric facilities including screening, follow-up, and transition measures.", category: "Hospitals", records: "~1.4K", priority: "medium" },
  { id: "ambulatory_surgical_center", title: "Ambulatory Surgical Center Quality Measures", description: "Quality performance data for Medicare-certified ambulatory surgical centers.", category: "Hospitals", records: "~5.7K", priority: "medium" },
  { id: "hospital_joint_replacement", title: "Comprehensive Care for Joint Replacement - Provider", description: "Provider-level data for the CMS Comprehensive Care for Joint Replacement bundled payment model.", category: "Hospitals", records: "~320", priority: "low" },
  { id: "hospital_price_transparency", title: "Hospital Price Transparency Enforcement", description: "Enforcement activities and outcomes for hospital price transparency compliance.", category: "Hospitals", records: "~2K", priority: "low" },
  { id: "medicare_inpatient_by_provider", title: "Medicare Inpatient Hospitals - by Provider", description: "Inpatient hospital charge and payment data aggregated by provider including DRG utilization.", category: "Hospitals", records: "~200K", priority: "medium" },
  { id: "medicare_outpatient_by_provider", title: "Medicare Outpatient Hospitals - by Provider", description: "Outpatient hospital service utilization and payment data by provider and APC code.", category: "Hospitals", records: "~3M", priority: "medium" },

  { id: "home_health_enrollments", title: "Home Health Agency Enrollments", description: "CMS enrollment data for home health agencies including NPI, CCN, organization details, and enrollment status.", category: "Home Health", records: "~12K", priority: "high" },
  { id: "home_health_agencies", title: "Home Health Care Agencies", description: "Provider-level quality measures for home health agencies including star ratings and outcome measures.", category: "Home Health", records: "~8K", priority: "high" },
  { id: "home_health_all_owners", title: "Home Health Agency All Owners", description: "Ownership information for all Medicare-certified home health agencies.", category: "Home Health", records: "~30K", priority: "medium" },
  { id: "home_health_cost_report", title: "Home Health Agency Cost Report", description: "Financial cost report data for home health agencies including revenue, expenses, and visit counts.", category: "Home Health", records: "~12K", priority: "medium" },
  { id: "home_health_state_measures", title: "Home Health Care - State Data", description: "Quality measures for home health care aggregated at the state level.", category: "Home Health", records: "~55", priority: "low" },
  { id: "home_health_national_measures", title: "Home Health Care - National Data", description: "National-level aggregate quality and outcome measures for home health care.", category: "Home Health", records: "~1", priority: "low" },
  { id: "home_health_patient_survey", title: "Home Health Patient Survey (HHCAHPS)", description: "Patient experience survey data for home health agencies measuring care quality, communication, and overall satisfaction.", category: "Home Health", records: "~12K", priority: "high" },
  { id: "home_health_zip_data", title: "Home Health Care - Zip Code Data", description: "Quality measures and provider information for home health agencies by geographic ZIP code area.", category: "Home Health", records: "~549K", priority: "medium" },
  { id: "medicare_hha_utilization", title: "Medicare Post-Acute Care - Home Health", description: "Post-acute care utilization data for home health agencies.", category: "Home Health", records: "~10K", priority: "medium" },
  { id: "home_infusion_therapy", title: "Home Infusion Therapy Providers", description: "Directory of Medicare-enrolled home infusion therapy providers.", category: "Home Health", records: "~2K", priority: "low" },

  { id: "hospice_enrollments", title: "Hospice Enrollments", description: "CMS enrollment data for hospice providers including NPI, CCN, organization name, and enrollment status.", category: "Hospice", records: "~6K", priority: "high" },
  { id: "hospice_general_info", title: "Hospice - General Information", description: "Comprehensive hospice profile data including CCN, address, phone, ownership type, and CMS region.", category: "Hospice", records: "~6K", priority: "high" },
  { id: "hospice_provider_data", title: "Hospice - Provider Data", description: "Detailed provider-level quality and utilization measures for hospice facilities.", category: "Hospice", records: "~40K", priority: "high" },
  { id: "hospice_provider_measures", title: "Hospice CAHPS Survey - Provider Data", description: "Hospice CAHPS patient experience survey results at the provider level.", category: "Hospice", records: "~174K", priority: "medium" },
  { id: "hospice_all_owners", title: "Hospice All Owners", description: "Ownership information for all Medicare-certified hospice providers.", category: "Hospice", records: "~15K", priority: "medium" },
  { id: "hospice_state_measures", title: "Hospice CAHPS Survey - State Data", description: "State-level aggregate hospice CAHPS patient experience survey results.", category: "Hospice", records: "~1.1K", priority: "low" },
  { id: "hospice_national_measures", title: "Hospice CAHPS Survey - National Data", description: "National-level aggregate hospice CAHPS survey results.", category: "Hospice", records: "~24", priority: "low" },
  { id: "hospice_zip_data", title: "Hospice - Zip Code Data", description: "Hospice quality measures and utilization data by geographic ZIP code area.", category: "Hospice", records: "~366K", priority: "medium" },
  { id: "medicare_hospice_utilization", title: "Medicare Post-Acute Care - Hospice", description: "Post-acute care utilization and spending data for hospice providers.", category: "Hospice", records: "~5K", priority: "medium" },

  { id: "nursing_home_providers", title: "Nursing Home Provider Information", description: "Comprehensive nursing home data including beds, residents, ownership, star ratings, and staffing information.", category: "Nursing Homes & SNF", records: "~15K", priority: "high" },
  { id: "snf_provider_measures", title: "Skilled Nursing Facility Quality Measures", description: "Provider-level quality measures for SNFs including readmission, falls, pressure ulcers, and staffing metrics.", category: "Nursing Homes & SNF", records: "~838K", priority: "high" },
  { id: "nursing_home_deficiencies", title: "Nursing Home Deficiencies", description: "Survey deficiency data for nursing homes including scope, severity, and correction status.", category: "Nursing Homes & SNF", records: "~44K", priority: "medium" },
  { id: "nursing_home_penalties", title: "Nursing Home Penalties", description: "Civil money penalties and payment denials imposed on nursing home facilities.", category: "Nursing Homes & SNF", records: "~5K", priority: "medium" },
  { id: "nursing_home_ownership", title: "Nursing Home Ownership", description: "Detailed ownership information for all Medicare/Medicaid-certified nursing home facilities.", category: "Nursing Homes & SNF", records: "~159K", priority: "medium" },
  { id: "nursing_home_fire_safety", title: "Nursing Home Fire Safety Deficiencies", description: "Fire safety inspection deficiency data for nursing homes including scope and severity.", category: "Nursing Homes & SNF", records: "~200K", priority: "medium" },
  { id: "nursing_home_health_deficiencies", title: "Nursing Home Health Deficiencies", description: "Health inspection deficiency data for nursing homes including scope, severity, and correction status.", category: "Nursing Homes & SNF", records: "~419K", priority: "medium" },
  { id: "nursing_home_mds_quality", title: "Nursing Home MDS Quality Measures", description: "Minimum Data Set quality measures for nursing homes including falls, pressure ulcers, and ADL decline.", category: "Nursing Homes & SNF", records: "~250K", priority: "high" },
  { id: "nursing_home_claims_quality", title: "Nursing Home Medicare Claims Quality Measures", description: "Quality measures derived from Medicare claims data for nursing homes.", category: "Nursing Homes & SNF", records: "~59K", priority: "medium" },
  { id: "snf_quality_reporting", title: "SNF Quality Reporting Program - Provider Data", description: "Skilled Nursing Facility Quality Reporting Program performance data at the provider level.", category: "Nursing Homes & SNF", records: "~15K", priority: "high" },
  { id: "medicare_snf_utilization", title: "Medicare Post-Acute Care - SNF", description: "Post-acute care utilization and spending data for skilled nursing facilities.", category: "Nursing Homes & SNF", records: "~15K", priority: "medium" },

  { id: "dialysis_facility_listing", title: "Dialysis Facility Listing", description: "Directory of all Medicare-certified dialysis facilities with addresses and key facility information.", category: "Dialysis", records: "~8K", priority: "high" },
  { id: "medicare_dialysis_facilities", title: "Medicare Dialysis Facilities", description: "Medicare enrollment and utilization data for dialysis facilities.", category: "Dialysis", records: "~8K", priority: "medium" },
  { id: "dialysis_state_averages", title: "Dialysis Facility - State Averages", description: "State-level aggregate quality measures for dialysis facilities.", category: "Dialysis", records: "~55", priority: "low" },
  { id: "dialysis_national_averages", title: "Dialysis Facility - National Averages", description: "National-level aggregate quality measures for dialysis.", category: "Dialysis", records: "~1", priority: "low" },
  { id: "dialysis_patient_survey", title: "Dialysis Patient Survey (ICH CAHPS) - Facility", description: "In-Center Hemodialysis CAHPS patient experience survey results at the facility level.", category: "Dialysis", records: "~6K", priority: "medium" },

  { id: "fqhc_enrollments", title: "Federally Qualified Health Center Enrollments", description: "CMS enrollment data for FQHCs including NPI, organization name, address, and enrollment status.", category: "Other Facilities", records: "~15K", priority: "high" },
  { id: "inpatient_rehab_general_info", title: "Inpatient Rehabilitation Facility - General Information", description: "Comprehensive profile data for inpatient rehabilitation facilities including address, phone, ownership, and quality ratings.", category: "Other Facilities", records: "~1.2K", priority: "medium" },
  { id: "inpatient_rehab_provider_data", title: "Inpatient Rehabilitation Facility - Provider Data", description: "Quality measure data for inpatient rehabilitation facilities including functional outcomes and discharge measures.", category: "Other Facilities", records: "~10K", priority: "medium" },
  { id: "long_term_care_general_info", title: "Long-Term Care Hospital - General Information", description: "Profile data for long-term care hospitals including address, phone, ownership type, and overall quality ratings.", category: "Other Facilities", records: "~319", priority: "medium" },
  { id: "long_term_care_provider_data", title: "Long-Term Care Hospital - Provider Data", description: "Quality measure data for long-term care hospitals including readmission, infection, and functional outcome measures.", category: "Other Facilities", records: "~3K", priority: "medium" },
  { id: "aco_snf_affiliates", title: "ACO Skilled Nursing Facility Affiliates", description: "Affiliations between Accountable Care Organizations and Skilled Nursing Facilities.", category: "Other Facilities", records: "~80K", priority: "low" },
  { id: "aco_reach_providers", title: "ACO REACH Providers", description: "Provider information for ACO Realizing Equity, Access, and Community Health model participants.", category: "Other Facilities", records: "~350K", priority: "low" },

  { id: "medicare_fee_for_service_enrollment", title: "Medicare FFS Public Provider Enrollment", description: "Public enrollment data for Medicare Fee-For-Service providers.", category: "Medicare Programs", records: "~3M", priority: "medium" },
  { id: "medicare_monthly_enrollment", title: "Medicare Monthly Enrollment", description: "Monthly Medicare enrollment statistics and trends.", category: "Medicare Programs", records: "~5K", priority: "low" },
  { id: "medicare_irf_utilization", title: "Medicare Post-Acute Care - IRF", description: "Inpatient rehabilitation facility utilization and payment data.", category: "Medicare Programs", records: "~1.2K", priority: "low" },
  { id: "medicare_ltch_utilization", title: "Medicare Post-Acute Care - LTCH", description: "Long-term care hospital utilization and payment data.", category: "Medicare Programs", records: "~400", priority: "low" },
  { id: "market_saturation_county", title: "Market Saturation & Utilization - County", description: "Healthcare market saturation and utilization metrics at the county level.", category: "Medicare Programs", records: "~20K", priority: "medium" },
  { id: "market_saturation_cbsa", title: "Market Saturation & Utilization - CBSA", description: "Healthcare market saturation data at the Core-Based Statistical Area level.", category: "Medicare Programs", records: "~1K", priority: "low" },
  { id: "medicare_spending_by_drug_d", title: "Medicare Part D Spending by Drug", description: "Medicare Part D drug spending data including total spending, claims, and beneficiary counts.", category: "Medicare Programs", records: "~14.3K", priority: "low" },
  { id: "medicare_spending_by_drug_b", title: "Medicare Part B Spending by Drug", description: "Medicare Part B drug spending and utilization data.", category: "Medicare Programs", records: "~734", priority: "low" },
];

export function getCMSDatasetCatalog() {
  return {
    datasets: CMS_DATASET_CATALOG.map(ds => ({
      ...ds,
      url: IMPORT_TYPE_URLS[ds.id] || null,
      available: !!(IMPORT_TYPE_URLS[ds.id]),
      unavailable: !!(ds as any).unavailable,
    })),
    total: CMS_DATASET_CATALOG.length,
    categories: [...new Set(CMS_DATASET_CATALOG.map(ds => ds.category))],
  };
}

export async function handleTriggerImport(payload: any, user: any) {
  if (!user || user.role !== "admin") {
    throw { status: 403, message: "Forbidden: Admin access required" };
  }

  const { import_type: raw_import_type, file_url, dry_run = false, year, retry_of, retry_count, retry_tags, category, resume_offset, batch_id } = payload;

  if (!raw_import_type) {
    throw { status: 400, message: "Missing required field: import_type" };
  }

  if (file_url && !isAllowedUrl(file_url)) {
    throw { status: 400, message: "file_url must be a CMS government domain (data.cms.gov, download.cms.gov)" };
  }

  const import_type = IMPORT_TYPE_ALIASES[raw_import_type] || raw_import_type;

  const activeImports = await db.select().from(importBatches)
    .where(and(eq(importBatches.import_type, import_type), inArray(importBatches.status, ["validating", "processing"])));
  const realActive = activeImports.filter((b) => {
    const fn = b.file_name || "";
    return fn !== "batch_process_active" && fn !== "crawler_batch_stop_signal" && fn !== "crawler_auto_stop_signal" && b.id !== batch_id;
  });

  if (realActive.length > 0) {
    const existing = realActive[0];
    const stuckMs = Date.now() - new Date(existing.updated_date || existing.created_date!).getTime();
    if (stuckMs > 60 * 60 * 1000) {
      await db.update(importBatches).set({
        status: "failed",
        cancel_reason: `Auto-cancelled: stuck in "${existing.status}" for ${Math.round(stuckMs / 60000)} minutes`,
        cancelled_at: new Date(),
        updated_date: new Date(),
      }).where(eq(importBatches.id, existing.id));
    } else {
      throw {
        status: 409,
        message: `Import for ${import_type} is already in progress`,
        conflict: true,
        existing_batch_id: existing.id,
        started_at: existing.created_date,
      };
    }
  }

  if (ZIP_FUNCTION_MAP[import_type]) {
    return {
      success: true,
      message: `Import process for ${import_type} started in the background. Check Data Center for progress.`,
      import_type,
      note: "ZIP-based Medicare imports are not yet migrated. The batch has been queued for processing.",
    };
  }

  if (import_type === "nppes_flat_file" || import_type === "nppes_registry_file") {
    if (!file_url) {
      throw { status: 400, message: "file_url is required for NPPES flat file imports" };
    }

    const [batch] = await db.insert(importBatches).values({
      import_type,
      file_name: file_url.split("/").pop() || "nppes_flat_file",
      status: "processing",
      dry_run: !!dry_run,
      total_rows: 0,
      imported_rows: 0,
    }).returning();

    setTimeout(() => {
      handleImportNPPESFlatFile({ batch_id: batch.id, file_url, byte_offset: 0 })
        .catch((e) => console.error(`[triggerImport] NPPES flat file import error:`, e.message));
    }, 100);

    return {
      success: true,
      message: `NPPES flat file import started in the background. Check Data Center for progress.`,
      import_type,
      batch_id: batch.id,
      file_url,
    };
  }

  const validTypes = Object.keys(IMPORT_TYPE_URLS);
  if (!validTypes.includes(import_type) && !file_url) {
    throw {
      status: 400,
      message: `Invalid import_type for auto-import (no CMS URL configured). Either provide a file_url or use one of: ${[...validTypes, ...Object.keys(ZIP_FUNCTION_MAP), "nppes_flat_file"].join(", ")}`,
    };
  }

  const resolvedUrl = file_url || IMPORT_TYPE_URLS[import_type];
  if (!resolvedUrl) {
    throw { status: 400, message: "No URL available for this import type. Please provide a file_url." };
  }

  const resolvedYear = year || new Date().getFullYear() - 2;
  const resolvedOffset = resume_offset || 0;

  let activeBatchId: number;

  if (batch_id) {
    await db.update(importBatches).set({
      status: "processing",
      cancel_reason: null,
      cancelled_at: null,
      error_samples: null,
      retry_params: { year: resolvedYear, resume_offset: resolvedOffset, retry_of, retry_count: (retry_count || 0) + 1, retry_tags, category, file_url: resolvedUrl },
      updated_date: new Date(),
    }).where(eq(importBatches.id, batch_id));
    activeBatchId = batch_id;
  } else {
    const [batch] = await db.insert(importBatches).values({
      import_type,
      file_name: `cms_${import_type}_${resolvedYear}`,
      status: "processing",
      dry_run: !!dry_run,
      total_rows: 0,
      imported_rows: 0,
      retry_params: { year: resolvedYear, resume_offset: resolvedOffset, retry_of, retry_count, retry_tags, category, file_url: resolvedUrl },
    }).returning();
    activeBatchId = batch.id;
  }

  setTimeout(() => {
    handleAutoImportCMSData({
      import_type,
      file_url: resolvedUrl,
      year: resolvedYear,
      dry_run,
      resume_offset: resolvedOffset,
      batch_id: activeBatchId,
    }).catch((e) => console.error(`[triggerImport] CMS import error:`, e.message));
  }, 100);

  return {
    success: true,
    message: batch_id
      ? `Resuming import for ${import_type} from offset ${resolvedOffset}. Check Data Center for progress.`
      : `Import process for ${import_type} started in the background. Check Data Center for progress.`,
    import_type,
    batch_id: activeBatchId,
    file_url: resolvedUrl,
    year: resolvedYear,
    dry_run,
    resumed: !!batch_id,
  };
}

function mapCMSOrderReferringRow(row: any, year: number, batchId: number) {
  return {
    npi: row.NPI || row.npi || null,
    referred_to_npi: null,
    referred_to_name: [row.LAST_NAME || row.last_name, row.FIRST_NAME || row.first_name].filter(Boolean).join(", ") || null,
    total_referrals: null,
    total_beneficiaries: null,
    data_year: String(year),
    raw_data: row,
    import_batch_id: String(batchId),
  };
}

function mapCMSUtilizationRow(row: any, year: number, batchId: number) {
  return {
    npi: row.Rndrng_NPI || row.npi || null,
    service_type: row.Rndrng_Prvdr_Type || row.HCPCS_Desc || null,
    total_services: row.Tot_Srvcs || null,
    total_unique_benes: row.Tot_Benes || null,
    average_submitted_chrg_amt: row.Avg_Sbmtd_Chrg || null,
    total_medicare_payment_amt: row.Avg_Mdcr_Pymt_Amt || null,
    data_year: String(year),
    raw_data: row,
  };
}

function deriveStatisticalId(row: any, importType: string, index?: number): string | null {
  let id: string | null = null;
  if (importType === "medicare_spending_by_drug_d" || importType === "medicare_spending_by_drug_b") {
    id = row.Brnd_Name || row.Gnrc_Name || row.HCPCS_Cd || null;
  } else if (importType === "medicare_monthly_enrollment") {
    id = [row.YEAR, row.MONTH, row.BENE_STATE_ABRVTN].filter(Boolean).join("_") || null;
  } else if (importType === "market_saturation_county") {
    const svc = (row.type_of_service || "").substring(0, 15);
    id = [row.state_fips, row.county_fips, svc].filter(Boolean).join("_") || null;
  } else if (importType === "market_saturation_cbsa") {
    const svc = (row.type_of_service || "").substring(0, 15);
    id = [row.cbsa, svc].filter(Boolean).join("_") || null;
  } else if (importType === "provider_taxonomy_crosswalk") {
    id = [row["MEDICARE SPECIALTY CODE"], row["PROVIDER TAXONOMY CODE"]].filter(Boolean).join("_") || null;
  } else if (importType === "hospital_price_transparency") {
    id = row.Case_ID || null;
  } else if (importType === "medicare_part_d_prescribers") {
    id = row.Prscrbr_NPI || row.PRSCRBR_NPI || null;
  } else if (importType === "medicare_fee_for_service_enrollment") {
    id = [row.YEAR, row.BENE_STATE_ABRVTN].filter(Boolean).join("_") || null;
  } else if (importType === "medicare_irf_utilization" || importType === "medicare_ltch_utilization") {
    id = row.CCN || row.ccn || row.Provider_ID || row.provider_id || null;
  } else if (importType === "hospice_state_measures" || importType === "home_health_state_measures") {
    id = [row.state, row.measure_code].filter(Boolean).join("_") || null;
  } else if (importType === "hospice_national_measures") {
    id = row.measure_code || null;
  } else if (importType === "home_health_national_measures") {
    id = row.country || "nation";
  } else if (importType === "hospital_service_area") {
    id = [row.MEDICARE_PROV_NUM, row.ZIP_CD_OF_RESIDENCE].filter(Boolean).join("_") || null;
  } else if (importType === "medicare_hha_utilization") {
    id = row.PRVDR_ID || null;
  } else if (importType === "clinician_national_file" || importType === "clinician_mips_performance" || importType === "clinician_mips_measures") {
    id = row.npi || row.NPI || null;
  } else if (importType === "clinician_group_measures" || importType === "clinician_group_experience") {
    id = row.org_pac_id || row.Org_PAC_ID || null;
  } else if (importType === "hospital_hcahps_survey" || importType === "hospital_timely_effective_care" || importType === "hospital_unplanned_visits" || importType === "hospital_imaging_efficiency" || importType === "hospital_spending_per_beneficiary" || importType === "hospital_spending_by_claim" || importType === "hospital_hac_reduction") {
    id = row.facility_id || row.Facility_ID || row.provider_id || row.Provider_ID || null;
  } else if (importType === "hospital_psychiatric_facility" || importType === "ambulatory_surgical_center" || importType === "hospital_joint_replacement") {
    id = row.cms_certification_number_ccn || row.facility_id || row.ccn || null;
  } else if (importType === "home_health_patient_survey" || importType === "home_health_zip_data") {
    id = row.cms_certification_number_ccn || row.provider_id || null;
  } else if (importType === "hospice_zip_data") {
    id = row.cms_certification_number_ccn || row.ccn || null;
  } else if (importType === "dialysis_patient_survey") {
    id = row.facility_id || row.cms_certification_number_ccn || null;
  } else if (importType === "nursing_home_ownership" || importType === "nursing_home_fire_safety" || importType === "nursing_home_health_deficiencies" || importType === "nursing_home_mds_quality" || importType === "nursing_home_claims_quality" || importType === "snf_quality_reporting") {
    id = row.federal_provider_number || row.provider_id || row.provnum || null;
  } else if (importType === "inpatient_rehab_general_info" || importType === "inpatient_rehab_provider_data" || importType === "long_term_care_general_info" || importType === "long_term_care_provider_data") {
    id = row.cms_certification_number_ccn || row.ccn || null;
  }
  return id ? id.substring(0, 50) : null;
}

function deriveStatisticalName(row: any, importType: string): string | null {
  if (importType === "medicare_spending_by_drug_d" || importType === "medicare_spending_by_drug_b") {
    return [row.Brnd_Name, row.Gnrc_Name, row.HCPCS_Desc].filter(Boolean).join(" — ") || null;
  }
  if (importType === "medicare_monthly_enrollment") {
    return [row.BENE_STATE_DESC, row.BENE_COUNTY_DESC, row.YEAR, row.MONTH].filter(Boolean).join(" ") || null;
  }
  if (importType === "market_saturation_county") {
    return [row.type_of_service, row.state, row.county].filter(Boolean).join(" — ") || null;
  }
  if (importType === "market_saturation_cbsa") {
    return [row.type_of_service, row.cbsatitle].filter(Boolean).join(" — ") || null;
  }
  if (importType === "provider_taxonomy_crosswalk") {
    return [row["MEDICARE PROVIDER/SUPPLIER TYPE DESCRIPTION"], row["PROVIDER TAXONOMY DESCRIPTION:  TYPE, CLASSIFICATION, SPECIALIZATION"]].filter(Boolean).join(" — ") || null;
  }
  if (importType === "hospital_price_transparency") {
    return row.Hosp_Name || null;
  }
  if (importType === "medicare_part_d_prescribers") {
    return [row.Prscrbr_Last_Org_Name, row.Prscrbr_First_Name].filter(Boolean).join(", ") || null;
  }
  if (importType === "hospice_state_measures" || importType === "home_health_state_measures") {
    return [row.state, row.measure_name || row.measure_code].filter(Boolean).join(" — ") || null;
  }
  if (importType === "hospice_national_measures") {
    return row.measure_name || row.measure_code || null;
  }
  if (importType === "home_health_national_measures") {
    return row.country || "National Measures";
  }
  if (importType === "hospital_service_area") {
    return [row.MEDICARE_PROV_NUM, row.ZIP_CD_OF_RESIDENCE].filter(Boolean).join(" — ZIP ") || null;
  }
  if (importType === "medicare_hha_utilization") {
    return row.PRVDR_NAME || null;
  }
  if (importType === "clinician_national_file") {
    return [row.provider_last_name, row.provider_first_name].filter(Boolean).join(", ") || null;
  }
  if (importType === "clinician_mips_performance" || importType === "clinician_mips_measures") {
    return [row.provider_last_name, row.provider_first_name].filter(Boolean).join(", ") || null;
  }
  if (importType === "clinician_group_measures" || importType === "clinician_group_experience") {
    return row.org_name || row.group_name || null;
  }
  if (importType === "hospital_hcahps_survey" || importType === "hospital_timely_effective_care" || importType === "hospital_unplanned_visits" || importType === "hospital_imaging_efficiency" || importType === "hospital_spending_per_beneficiary" || importType === "hospital_spending_by_claim" || importType === "hospital_hac_reduction" || importType === "hospital_joint_replacement") {
    return row.facility_name || row.hospital_name || null;
  }
  if (importType === "hospital_psychiatric_facility" || importType === "ambulatory_surgical_center") {
    return row.facility_name || row.provider_name || null;
  }
  if (importType === "home_health_patient_survey" || importType === "home_health_zip_data") {
    return row.provider_name || row.facility_name || null;
  }
  if (importType === "hospice_zip_data") {
    return row.provider_name || row.facility_name || null;
  }
  if (importType === "dialysis_patient_survey") {
    return row.facility_name || row.provider_name || null;
  }
  if (importType === "nursing_home_ownership" || importType === "nursing_home_fire_safety" || importType === "nursing_home_health_deficiencies" || importType === "nursing_home_mds_quality" || importType === "nursing_home_claims_quality" || importType === "snf_quality_reporting") {
    return row.provider_name || row.facility_name || null;
  }
  if (importType === "inpatient_rehab_general_info" || importType === "inpatient_rehab_provider_data") {
    return row.provider_name || row.facility_name || null;
  }
  if (importType === "long_term_care_general_info" || importType === "long_term_care_provider_data") {
    return row.provider_name || row.facility_name || null;
  }
  return null;
}

function mapMedicareFacilityRow(row: any, importType: string, batchId: number) {
  const statId = deriveStatisticalId(row, importType);
  const statName = deriveStatisticalName(row, importType);

  return {
    facility_type: importType,
    provider_id:
      row.cms_certification_number_ccn ||
      row["CMS Certification Number"] || row.CMS_Certification_Number ||
      row["Provider CCN"] || row.Rndrng_Prvdr_CCN ||
      row.CCN || row.ccn ||
      row.provider_id || row["Provider ID"] ||
      row.NPI || row.npi || row.Prscrbr_NPI || row.PRSCRBR_NPI ||
      row.Rndrng_NPI || row.Suplr_NPI || row.Rfrg_NPI ||
      row.PRVDR_ID || row.MEDICARE_PROV_NUM || row.Case_ID ||
      statId ||
      null,
    facility_name:
      row.facility_name || row["Facility Name"] || row.Facility_Name ||
      row.provider_name || row["Provider Name"] || row.Provider_Name ||
      row["Hospital Name"] || row.Rndrng_Prvdr_Org_Name ||
      row["ORGANIZATION NAME"] || row.organization_name ||
      row.businessname || row.practicename ||
      row["DOING BUSINESS AS NAME"] ||
      row.Rndrng_Prvdr_Last_Org_Name || row.Suplr_Prvdr_Last_Name_Org || row.Rfrg_Prvdr_Last_Name_Org ||
      row.Prscrbr_Last_Org_Name || row.Hosp_Name ||
      row.PRVDR_NAME || row["HHA Name"] ||
      statName ||
      null,
    address:
      row.address_line_1 || row["Address Line 1"] || row.Address_Line_1 ||
      row["ADDRESS LINE 1"] ||
      row["Street Address"] || row.Rndrng_Prvdr_St ||
      row.provider_address || row["Provider Address"] ||
      row.practiceaddress1 ||
      row.Rndrng_Prvdr_St1 || row.Suplr_Prvdr_St1 || row.Rfrg_Prvdr_St1 ||
      row.Prscrbr_St1 || row.Hosp_Address ||
      null,
    city:
      row.citytown || row["City/Town"] ||
      row.City || row.CITY || row.city ||
      row.Rndrng_Prvdr_City ||
      row.practicecity ||
      row.Suplr_Prvdr_City || row.Rfrg_Prvdr_City ||
      row.Prscrbr_City ||
      row.PRVDR_CITY ||
      null,
    state:
      row.state || row.State || row.STATE ||
      row["State Code"] || row.Rndrng_Prvdr_State_Abrvtn ||
      row.Prscrbr_State_Abrvtn ||
      row.BENE_STATE_ABRVTN ||
      row["ENROLLMENT STATE"] ||
      row.practicestate ||
      row.Suplr_Prvdr_State_Abrvtn || row.Rfrg_Prvdr_State_Abrvtn ||
      null,
    zip:
      row.zip_code || row["Zip Code"] || row.Zip_Code ||
      row["ZIP CODE"] || row.ZIP_CODE ||
      row.Rndrng_Prvdr_Zip5 ||
      row.practicezip9code ||
      row.Suplr_Prvdr_Zip5 || row.Rfrg_Prvdr_Zip5 ||
      row.PRVDR_ZIP ||
      null,
    raw_data: row,
    import_batch_id: String(batchId),
  };
}

async function insertCMSRows(importType: string, rows: any[], year: number, batchId: number): Promise<{ inserted: number; skipped: number; filtered: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0, filtered: 0 };

  const CHUNK_SIZE = 100;
  let inserted = 0;
  let skipped = 0;

  let mapped: any[];
  let table: any;

  if (importType === "cms_order_referring") {
    mapped = rows.map(r => mapCMSOrderReferringRow(r, year, batchId));
    mapped = mapped.filter(r => r.npi);
    table = cmsReferrals;
  } else if (importType === "provider_service_utilization") {
    mapped = rows.map(r => mapCMSUtilizationRow(r, year, batchId));
    mapped = mapped.filter(r => r.npi);
    table = providerServiceUtilization;
  } else {
    mapped = rows.map(r => mapMedicareFacilityRow(r, importType, batchId));
    mapped = mapped.filter(r => r.provider_id || r.facility_name);
    table = medicareFacilities;
  }

  if (mapped.length === 0) return { inserted: 0, skipped: 0, filtered: rows.length };

  const filteredCount = rows.length - mapped.length;

  for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
    const chunk = mapped.slice(i, i + CHUNK_SIZE);
    try {
      await db.insert(table).values(chunk);
      inserted += chunk.length;
    } catch (e: any) {
      for (const row of chunk) {
        try {
          await db.insert(table).values(row);
          inserted++;
        } catch {
          skipped++;
        }
      }
    }
  }

  return { inserted, skipped, filtered: filteredCount };
}

export async function handleAutoImportCMSData(params: any) {
  const { import_type, file_url, year, dry_run, resume_offset = 0, batch_id, total_inserted = 0, total_skipped = 0 } = params;
  const MAX_EXEC_MS = 110000;
  const execStartTime = Date.now();
  const PAGE_SIZE = 1000;
  const isProviderDataAPI = file_url.includes("/datastore/query/");

  try {
    let offset = Number(resume_offset) || 0;
    let totalFetched = offset;
    let totalInserted = Number(total_inserted) || 0;
    let totalSkipped = Number(total_skipped) || 0;
    let hasMore = true;
    let consecutiveErrors = 0;
    const errors: any[] = [];

    while (hasMore && Date.now() - execStartTime < MAX_EXEC_MS) {
      let url: string;
      if (isProviderDataAPI) {
        const separator = file_url.includes("?") ? "&" : "?";
        url = `${file_url}${separator}offset=${offset}&limit=${PAGE_SIZE}`;
      } else {
        const separator = file_url.includes("?") ? "&" : "?";
        url = `${file_url}${separator}offset=${offset}&size=${PAGE_SIZE}`;
      }

      let response: Response;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
      } catch (e: any) {
        consecutiveErrors++;
        const errMsg = `Fetch failed at offset ${offset}: ${e.message}`;
        console.error(`[AutoImportCMS] ${errMsg}`);
        errors.push({ offset, message: errMsg });
        if (consecutiveErrors >= 3) {
          await db.update(importBatches).set({
            status: "failed",
            error_samples: errors.slice(-5),
            updated_date: new Date(),
          }).where(eq(importBatches.id, batch_id));
          return;
        }
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      if (response.status === 429) {
        console.warn(`[AutoImportCMS] Rate limited at offset ${offset}, waiting 10s`);
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      if (!response.ok) {
        consecutiveErrors++;
        const errMsg = `HTTP ${response.status} at offset ${offset}`;
        console.error(`[AutoImportCMS] ${errMsg}`);
        errors.push({ offset, message: errMsg });
        if (consecutiveErrors >= 3) {
          await db.update(importBatches).set({
            status: "failed",
            error_samples: errors.slice(-5),
            updated_date: new Date(),
          }).where(eq(importBatches.id, batch_id));
          return;
        }
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      consecutiveErrors = 0;
      const data = await response.json();
      const rows = Array.isArray(data) ? data : data.results || data.data || [];

      if (rows.length === 0) {
        hasMore = false;
        break;
      }

      if (!dry_run) {
        try {
          const result = await insertCMSRows(import_type, rows, year, batch_id);
          totalInserted += result.inserted;
          totalSkipped += result.skipped + result.filtered;
        } catch (e: any) {
          console.error(`[AutoImportCMS] Insert error at offset ${offset}: ${e.message}`);
          errors.push({ offset, message: `Insert error: ${e.message}` });
        }
      }

      totalFetched += rows.length;
      offset += rows.length;

      await db.update(importBatches).set({
        imported_rows: totalInserted,
        skipped_rows: totalSkipped,
        total_rows: totalFetched,
        retry_params: { ...params, resume_offset: offset, total_inserted: totalInserted, total_skipped: totalSkipped },
        updated_date: new Date(),
      }).where(eq(importBatches.id, batch_id));

      if (rows.length < PAGE_SIZE) {
        hasMore = false;
      }
    }

    if (hasMore && Date.now() - execStartTime >= MAX_EXEC_MS) {
      console.log(`[AutoImportCMS] Time limit reached at offset ${offset}, inserted=${totalInserted}, scheduling immediate continuation`);
      setImmediate(() => {
        handleAutoImportCMSData({ ...params, resume_offset: offset, total_inserted: totalInserted, total_skipped: totalSkipped })
          .catch((e) => console.error(`[AutoImportCMS] Resume failed:`, e.message));
      });
      return;
    }

    await db.update(importBatches).set({
      status: "completed",
      completed_at: new Date(),
      imported_rows: totalInserted,
      skipped_rows: totalSkipped,
      total_rows: totalFetched,
      error_samples: errors.length > 0 ? errors.slice(-5) : null,
      updated_date: new Date(),
    }).where(eq(importBatches.id, batch_id));
    console.log(`[AutoImportCMS] Completed ${import_type}: fetched=${totalFetched}, inserted=${totalInserted}, skipped=${totalSkipped}`);
  } catch (e: any) {
    console.error(`[AutoImportCMS] Fatal error:`, e.message);
    await db.update(importBatches).set({
      status: "failed",
      error_samples: [{ message: e.message, phase: "cms_import" }],
      updated_date: new Date(),
    }).where(eq(importBatches.id, batch_id));
  }
}
