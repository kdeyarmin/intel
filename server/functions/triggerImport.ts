import { db } from "../db";
import { importBatches, cmsReferrals, providerServiceUtilization, medicareFacilities, medicareFacilitiesRaw } from "../db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { handleImportNPPESFlatFile } from "./importNPPESFlatFile";
import { CMS_NATURAL_KEYS, partition, distinctValues } from "./cmsUpsert";

const LOOKUP_PRIMARY_BATCH_SIZE = 100;

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
  nursing_home_ownership: "https://data.cms.gov/provider-data/api/1/datastore/query/y2hd-n93e/0",
  nursing_home_fire_safety: "https://data.cms.gov/provider-data/api/1/datastore/query/ifjz-ge4w/0",
  nursing_home_health_deficiencies: "https://data.cms.gov/provider-data/api/1/datastore/query/r5ix-sfxw/0",
  nursing_home_mds_quality: "https://data.cms.gov/provider-data/api/1/datastore/query/djen-97ju/0",
  nursing_home_claims_quality: "https://data.cms.gov/provider-data/api/1/datastore/query/ijh5-nb2v/0",
  facility_affiliation: "https://data.cms.gov/provider-data/api/1/datastore/query/27ea-46a8/0",
  home_health_vbp: "https://data.cms.gov/provider-data/api/1/datastore/query/56d7-4994/0",
  snf_vbp_facility: "https://data.cms.gov/provider-data/api/1/datastore/query/284v-j9fz/0",
  rural_health_clinic_enrollments: "https://data.cms.gov/data-api/v1/dataset/3b7e7659-067e-41ea-8e36-f9ee2036e1f6/data",
  rural_health_clinic_all_owners: "https://data.cms.gov/data-api/v1/dataset/ab03c9bc-0c22-4ca4-b032-21dd3408210d/data",
  nursing_home_chain_performance: "https://data.cms.gov/data-api/v1/dataset/97ecfad1-d3f1-4d42-b774-d74661d830bc/data",
  medicare_geographic_variation: "https://data.cms.gov/data-api/v1/dataset/8e989bc0-2260-49a7-9c6d-8e9e10af7cea/data",
  pbj_daily_nurse_staffing: "https://data.cms.gov/data-api/v1/dataset/7e0d53ba-8f02-4c66-98a5-14a1c997c50d/data",
  pbj_daily_nonnurse_staffing: "https://data.cms.gov/data-api/v1/dataset/b497431a-5b57-42c0-9016-90105b51841e/data",
  snf_enrollments: "https://data.cms.gov/data-api/v1/dataset/5f2c306f-3b1c-42cd-b037-187b2ce22126/data",
  snf_all_owners: "https://data.cms.gov/data-api/v1/dataset/afe44b85-cc6d-40d7-b5df-00ae8910d1d2/data",
  snf_cost_report: "https://data.cms.gov/data-api/v1/dataset/a69d3df7-3f66-4a0d-b5b8-0d66049bd565/data",
  fqhc_all_owners: "https://data.cms.gov/data-api/v1/dataset/ed289c89-0bb8-4221-a20a-85776066381b/data",
  aco_participants: "https://data.cms.gov/data-api/v1/dataset/9767cb68-8ea9-4f0b-8179-9431abc89f11/data",
  aco_organizations: "https://data.cms.gov/data-api/v1/dataset/69ec2609-5ce5-4ce1-b14c-1f8809fda2c2/data",
  aco_financial_results: "https://data.cms.gov/data-api/v1/dataset/73b2ce14-351d-40ac-90ba-ec9e1f5ba80c/data",
  medicare_telehealth_trends: "https://data.cms.gov/data-api/v1/dataset/939226be-b107-476e-8777-f199a840138a/data",
  snf_utilization_geo_casemix: "https://data.cms.gov/data-api/v1/dataset/4c2a8bf6-8560-4b00-bc56-1a0322677b7f/data",
  hha_utilization_geo_casemix: "https://data.cms.gov/data-api/v1/dataset/6c63099b-0794-40a0-925c-51a66b9b9901/data",
  ltc_facility_characteristics: "https://data.cms.gov/data-api/v1/dataset/129a6503-c0f1-4132-b186-4c0232c2d894/data",
  mds_frequency: "https://data.cms.gov/data-api/v1/dataset/4b50bbe6-a496-4eda-b03b-5f835937f81b/data",
  nursing_home_chains: "https://data.cms.gov/data-api/v1/dataset/97ecfad1-d3f1-4d42-b774-d74661d830bc/data",
  snf_quality_reporting: "https://data.cms.gov/provider-data/api/1/datastore/query/fykj-qjee/0",
  provider_ownership: "https://data.cms.gov/data-api/v1/dataset/6f1e6491-670f-4e3e-8bfb-7e04d678cfac/data",
  inpatient_drg: "https://data.cms.gov/data-api/v1/dataset/ee6fb1a5-39b9-46b3-a980-a7284551a732/data",
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
  { id: "physician_shared_patient_patterns", title: "Physician Shared Patient Patterns", description: "Real provider-to-provider relationships: directed pairs of providers who treated the same Medicare beneficiaries within a 30/60/90/180-day window, with shared-patient and encounter counts. Populates referred_to_npi + total_referrals so the Network/County/Dashboard referral features show real relationships. Not on the data.cms.gov data-api — import by supplying a CMS FOIA file_url (the rows must reach the importer as named-field JSON; a headerless FOIA CSV must have a header row / be converted first).", category: "Physicians & Clinicians", records: "~35M", priority: "high" },
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
  { id: "medicare_snf_utilization", title: "Medicare Post-Acute Care - SNF", description: "Post-acute care utilization and spending data for skilled nursing facilities.", category: "Nursing Homes & SNF", records: "~15K", priority: "medium" },

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
  { id: "medicare_telehealth_trends", title: "Medicare Telehealth Trends", description: "Telehealth utilization trends including visit counts, provider adoption, and specialty breakdown across Medicare.", category: "Medicare Programs", records: "~50K", priority: "medium" },
  { id: "medicare_geographic_variation", title: "Medicare Geographic Variation", description: "Medicare spending and utilization variation data at the national and state level including per-capita costs.", category: "Medicare Programs", records: "~60", priority: "medium" },

  { id: "facility_affiliation", title: "Facility Affiliation Data", description: "Links between individual clinicians and the facilities or group practices where they provide services.", category: "Doctors & Clinicians", records: "~3M", priority: "high" },

  { id: "home_health_vbp", title: "Home Health Value-Based Purchasing (HHVBP)", description: "Home health agency performance under the Expanded HHVBP Model including quality scores and payment adjustments.", category: "Home Health", records: "~8K", priority: "medium" },

  { id: "nursing_home_chain_performance", title: "Nursing Home Chain Performance Measures", description: "Quality performance metrics aggregated at the nursing home chain/organization level.", category: "Nursing Homes & SNF", records: "~1K", priority: "medium" },
  { id: "snf_enrollments", title: "Skilled Nursing Facility Enrollments", description: "CMS enrollment data for SNFs including NPI, CCN, organization name, address, and enrollment status.", category: "Nursing Homes & SNF", records: "~15K", priority: "high" },
  { id: "snf_all_owners", title: "Skilled Nursing Facility All Owners", description: "Ownership information for all Medicare-certified skilled nursing facilities.", category: "Nursing Homes & SNF", records: "~60K", priority: "medium" },
  { id: "snf_cost_report", title: "Skilled Nursing Facility Cost Report", description: "Financial cost report data for SNFs including revenue, expenses, bed counts, and utilization.", category: "Nursing Homes & SNF", records: "~15K", priority: "medium" },
  { id: "snf_vbp_facility", title: "SNF Value-Based Purchasing - Facility", description: "Facility-level SNF Value-Based Purchasing program scores including readmission measures and incentive payments.", category: "Nursing Homes & SNF", records: "~15K", priority: "medium" },

  { id: "pbj_daily_nurse_staffing", title: "Payroll Based Journal - Daily Nurse Staffing", description: "Actual daily nurse staffing hours reported by nursing homes including RN, LPN, and CNA hours per resident day.", category: "Nursing Homes & SNF", records: "~6M", priority: "high" },
  { id: "pbj_daily_nonnurse_staffing", title: "Payroll Based Journal - Daily Non-Nurse Staffing", description: "Daily non-nurse staffing hours for nursing homes including physical therapy, dietary, and administrative staff.", category: "Nursing Homes & SNF", records: "~6M", priority: "medium" },

  { id: "rural_health_clinic_enrollments", title: "Rural Health Clinic Enrollments", description: "CMS enrollment data for rural health clinics including NPI, organization name, address, and enrollment status.", category: "Other Facilities", records: "~5K", priority: "high" },
  { id: "rural_health_clinic_all_owners", title: "Rural Health Clinic All Owners", description: "Ownership information for all Medicare-certified rural health clinics.", category: "Other Facilities", records: "~15K", priority: "medium" },
  { id: "fqhc_all_owners", title: "Federally Qualified Health Center All Owners", description: "Ownership information for all Medicare-certified FQHCs.", category: "Other Facilities", records: "~50K", priority: "medium" },

  { id: "aco_participants", title: "ACO Participants", description: "Complete list of providers participating in Medicare Accountable Care Organizations with TINs and NPIs.", category: "ACO & Networks", records: "~500K", priority: "high" },
  { id: "aco_organizations", title: "Accountable Care Organizations", description: "Profiles of Medicare Shared Savings Program ACOs including name, start date, track, and agreement details.", category: "ACO & Networks", records: "~500", priority: "high" },
  { id: "aco_financial_results", title: "ACO Financial & Quality Results", description: "Annual financial performance and quality measure results for ACOs in the Medicare Shared Savings Program.", category: "ACO & Networks", records: "~500", priority: "medium" },

  { id: "nursing_home_chains", title: "Nursing Home Chain Data", description: "Performance data aggregated at the nursing home chain level including star ratings and facility counts.", category: "Nursing Homes & SNF", records: "~1K", priority: "medium" },
  { id: "inpatient_drg", title: "Medicare Inpatient DRG Statistics", description: "Inpatient hospital charge and payment data by DRG code including discharges and average payments.", category: "Hospitals", records: "~200K", priority: "medium" },
  { id: "provider_ownership", title: "Provider & Supplier Ownership", description: "Ownership and control information for Medicare providers and suppliers.", category: "Medicare Programs", records: "~2M", priority: "medium" },
  { id: "home_health_pdgm", title: "Home Health PDGM Data (Retired)", description: "Patient-Driven Groupings Model data — dataset retired by CMS. Use HHA Utilization by Geography & Case-Mix instead.", category: "Home Health", records: "N/A", priority: "low" },
  { id: "snf_quality_reporting", title: "SNF Quality Reporting Program", description: "Quality measure data from the SNF Quality Reporting Program.", category: "Nursing Homes & SNF", records: "~15K", priority: "medium" },
  { id: "snf_utilization_geo_casemix", title: "SNF Utilization by Geography & Case-Mix", description: "Skilled nursing facility utilization and payment data broken down by geographic area, provider, and case-mix grouping.", category: "Nursing Homes & SNF", records: "~100K", priority: "medium" },
  { id: "hha_utilization_geo_casemix", title: "HHA Utilization by Geography & Case-Mix", description: "Home health agency utilization data by geographic area, provider, and patient case-mix grouping.", category: "Home Health", records: "~127K", priority: "medium" },
  { id: "ltc_facility_characteristics", title: "Long-Term Care Facility Characteristics", description: "Detailed feature data for long-term care facilities including bed counts, certification, payer mix, and resident demographics.", category: "Nursing Homes & SNF", records: "~15K", priority: "medium" },
  { id: "mds_frequency", title: "Minimum Data Set Frequency", description: "MDS assessment frequency metrics for nursing homes indicating how often resident assessments are performed.", category: "Nursing Homes & SNF", records: "~15K", priority: "medium" },
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

  const { import_type: raw_import_type, file_url, dry_run = false, year, retry_of, retry_count, retry_tags, category, resume_offset, batch_id, npi_filter, state_filter, skip_validation } = payload;

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
    throw {
      status: 400,
      message: `Import type "${import_type}" requires ZIP/Excel file processing which is not yet available on the server. Use the API-based equivalents instead (e.g. medicare_hha_utilization, medicare_snf_utilization, medicare_irf_utilization).`,
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
      retry_params: { year: resolvedYear, resume_offset: resolvedOffset, retry_of, retry_count: (retry_count || 0) + 1, retry_tags, category, file_url: resolvedUrl, npi_filter, state_filter, skip_validation },
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
      retry_params: { year: resolvedYear, resume_offset: resolvedOffset, retry_of, retry_count, retry_tags, category, file_url: resolvedUrl, npi_filter, state_filter, skip_validation },
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
      npi_filter,
      state_filter,
      // skip_validation is carried for forward-compat; the server CMS importer
      // does not run rule-based validation (only required-key checks), so there
      // is nothing for it to skip today.
      skip_validation,
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

/**
 * Map a raw CMS provider service utilization record into the normalized provider-service utilization shape used by the importer.
 *
 * @param row - Raw input row from a CMS utilization dataset; accepts variant header names (e.g., `Rndrng_NPI`, `npi`, `Tot_Srvcs`, `tot_srvcs`, `Avg_Mdcr_Pymt_Amt`, etc.)
 * @param year - Data year to assign to the resulting row (stored in `data_year`)
 * @returns An object with the normalized fields:
 * - `npi`: provider NPI or `null`
 * - `service_type`: rendering provider specialty or `null`
 * - `hcpcs_code`: HCPCS/CPT code or `null`
 * - `hcpcs_description`: HCPCS description or `null`
 * - `place_of_service`: place of service or `null`
 * - `total_services`: total service count or `null`
 * - `total_unique_benes`: total unique beneficiaries or `null`
 * - `average_submitted_chrg_amt`: average submitted charge or `null`
 * - `average_medicare_payment_amt`: average Medicare payment per service or `null`
 * - `total_medicare_payment_amt`: derived total Medicare payment (average × services) or `null`
 * - `data_year`: the provided `year` coerced to a string
 */
export function mapCMSUtilizationRow(row: any, year: number, _batchId: number) {
  const avgPayment = row.Avg_Mdcr_Pymt_Amt ?? row.avg_mdcr_pymt_amt ?? null;
  const totalServices = row.Tot_Srvcs ?? row.tot_srvcs ?? null;

  // Derive total payment from average × services
  let totalPayment = null;
  if (avgPayment && totalServices) {
    const avg = parseFloat(avgPayment);
    const count = parseFloat(totalServices);
    if (!isNaN(avg) && !isNaN(count)) {
      totalPayment = (avg * count).toFixed(2);
    }
  }

  return {
    npi: row.Rndrng_NPI || row.npi || null,
    service_type: row.Rndrng_Prvdr_Type || row.Rndrng_prvdr_type || null,
    hcpcs_code: row.HCPCS_Cd || row.hcpcs_cd || null,
    hcpcs_description: row.HCPCS_Desc || row.hcpcs_desc || null,
    place_of_service: row.Place_Of_Srvc || row.place_of_srvc || null,
    total_services: totalServices,
    total_unique_benes: row.Tot_Benes || row.tot_benes || null,
    average_submitted_chrg_amt: row.Avg_Sbmtd_Chrg || row.avg_sbmtd_chrg || null,
    average_medicare_payment_amt: avgPayment,
    total_medicare_payment_amt: totalPayment,
    data_year: String(year),
    raw_data: row,
  };
}

/**
 * Selects the first non-empty value from `row` among a list of candidate keys.
 *
 * @param row - The object to search for values.
 * @param keys - Ordered candidate property names to check on `row`.
 * @returns The first value that is not `undefined`, not `null`, and not an empty string after trimming, or `null` if none are found.
 */
function firstField(row: any, keys: string[]): any {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

/**
 * Parse a value into an integer, returning null when an integer cannot be derived.
 *
 * @param v - The input value (number, string, or other) to parse for an integer
 * @returns The parsed integer, or `null` if no integer could be extracted
 */
function toIntOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const cleaned = String(v).replace(/[^0-9-]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : null;
}

// ── Optional import row filters (npi_filter / state_filter) ─────────────────
// CMS dataset rows carry the provider NPI and state under wildly varying header
// names (data-api caps vs provider-data snake_case, "Rndrng_" vs "Prscrbr_"
// prefixes, etc.). These alias lists let the optional filters extract the
// relevant field regardless of dataset shape.
const FILTER_NPI_FIELDS = [
  "NPI", "npi", "Rndrng_NPI", "rndrng_npi", "Prscrbr_NPI", "PRSCRBR_NPI",
  "Suplr_NPI", "suplr_npi", "Rfrg_NPI", "rfrg_npi", "npi_1", "NPI_1",
  "provider_npi", "PROVIDER_NPI", "org_npi", "ORG_NPI",
];
const FILTER_STATE_FIELDS = [
  "state", "State", "STATE", "st", "ST", "state_cd", "STATE_CD",
  "Rndrng_Prvdr_State_Abrvtn", "Prvdr_State_Abrvtn", "prvdr_state",
  "Rndrng_Prvdr_State", "Prscrbr_State_Abrvtn", "provider_state",
  "PROVIDER_STATE", "BENE_STATE_ABRVTN", "state_abbreviation",
  "STATE_ABBREVIATION", "Provider State", "State Code",
];

// Parse a comma/space/semicolon-separated filter string (or array) into a
// trimmed, de-duplicated list. Exported for unit testing.
export function parseFilterList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(/[,\s;]+/);
  return [...new Set(raw.map((v) => String(v).trim()).filter(Boolean))];
}

// Build a row predicate from the optional npi_filter / state_filter inputs, or
// null when neither is set (so callers can skip filtering entirely). NPIs are
// compared digits-only; states case-insensitively. Exported for unit testing.
export function buildImportRowFilter(
  npiFilter: unknown,
  stateFilter: unknown,
): ((row: any) => boolean) | null {
  const npis = new Set(
    parseFilterList(npiFilter).map((s) => s.replace(/\D/g, "")).filter(Boolean),
  );
  const states = new Set(parseFilterList(stateFilter).map((s) => s.toUpperCase()));
  if (npis.size === 0 && states.size === 0) return null;
  return (row: any) => {
    if (npis.size > 0) {
      const npi = String(firstField(row, FILTER_NPI_FIELDS) ?? "").replace(/\D/g, "");
      if (!npi || !npis.has(npi)) return false;
    }
    if (states.size > 0) {
      const st = String(firstField(row, FILTER_STATE_FIELDS) ?? "").trim().toUpperCase();
      if (!st || !states.has(st)) return false;
    }
    return true;
  };
}

// The CMS "Physician Shared Patient Patterns" (PSPP) dataset records pairs of
// providers who shared the same Medicare beneficiaries within a time window
// (30/60/90/180 days) — i.e. real provider-to-provider relationships, unlike the
// "Order & Referring" eligibility registry. Each row is a directed edge with
// shared-patient / encounter counts; we store it in cms_referrals so the
// Network/County/Dashboard referral features can surface true relationships.
//
// PSPP is distributed as headerless/variant CSV (CMS FOIA, NBER mirror) and is
// NOT on the data.cms.gov JSON data-api, so column names vary by source. We read
// a tolerant set of aliases per logical field and keep the full row in raw_data
// so nothing is lost. Destination columns are derived from aliases and normalized.
/**
 * Normalize a physician shared-patient-pattern row into the shape used for `cms_referrals`.
 *
 * @param row - Raw input record (CSV/JSON) which may use multiple header aliases for NPIs and counts; original row is preserved on `raw_data`.
 * @param year - Numeric data year to populate `data_year`.
 * @param batchId - Import batch identifier stored as `import_batch_id`.
 * @returns An object with:
 *  - `npi` — referring provider NPI (trimmed string or `null`),
 *  - `referred_to_npi` — referred-to provider NPI (trimmed string or `null`),
 *  - `referred_to_name` — always `null` (placeholder),
 *  - `total_referrals` — referrals count if present, otherwise falls back to beneficiary count (`number` or `null`),
 *  - `total_beneficiaries` — beneficiary count (`number` or `null`),
 *  - `data_year` — stringified `year`,
 *  - `raw_data` — the original input `row`,
 *  - `import_batch_id` — stringified `batchId`.
 */
export function mapSharedPatientPatternRow(row: any, year: number, batchId: number) {
  const npi = firstField(row, ["npi_1", "NPI_1", "from_npi", "FROM_NPI", "src_npi", "referring_npi", "provider_1_npi", "npi", "NPI"]);
  const referredToNpi = firstField(row, ["npi_2", "NPI_2", "to_npi", "TO_NPI", "dst_npi", "referred_npi", "paired_npi", "provider_2_npi"]);
  const referrals = toIntOrNull(firstField(row, ["transaction_count", "TRANSACTION_COUNT", "transactions", "pair_count", "PAIR_COUNT", "shared_count", "referral_count", "count", "COUNT", "total_referrals"]));
  const beneficiaries = toIntOrNull(firstField(row, ["bene_count", "BENE_COUNT", "beneficiary_count", "unique_bene_count", "patient_count", "shared_patient_count", "benes", "total_beneficiaries"]));
  return {
    npi: npi != null ? String(npi).trim().slice(0, 20) : null,
    referred_to_npi: referredToNpi != null ? String(referredToNpi).trim().slice(0, 20) : null,
    referred_to_name: null as string | null,
    // Consumers order by total_referrals, so fall back to the shared-beneficiary
    // count when a distinct encounter/transaction count isn't published.
    total_referrals: referrals != null ? referrals : beneficiaries,
    total_beneficiaries: beneficiaries,
    data_year: String(year),
    raw_data: row,
    import_batch_id: String(batchId),
  };
}

/**
 * Compute a stable statistical identifier for a dataset row based on the dataset's import type.
 *
 * The returned identifier is derived from one or more dataset fields according to the import type
 * and is truncated to 50 characters. If no suitable identifier can be derived, returns `null`.
 *
 * @param row - The raw dataset row object (provider/measure/record fields vary by dataset)
 * @param importType - The internal import type key that determines which row fields to use
 * @param index - Optional ordinal index of the row (may be used by some import types or as a fallback)
 * @returns The derived identifier string truncated to 50 characters, or `null` if none could be derived
 */
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
  } else if (importType === "nursing_home_ownership" || importType === "nursing_home_fire_safety" || importType === "nursing_home_health_deficiencies" || importType === "nursing_home_mds_quality" || importType === "nursing_home_claims_quality" || importType === "snf_quality_reporting") {
    id = row.federal_provider_number || row.provider_id || row.provnum || null;
  } else if (importType === "inpatient_rehab_general_info" || importType === "inpatient_rehab_provider_data" || importType === "long_term_care_general_info" || importType === "long_term_care_provider_data") {
    id = row.cms_certification_number_ccn || row.ccn || null;
  } else if (importType === "facility_affiliation") {
    id = [row.npi || row.NPI, row.facility_ccn || row.pac_id_of_organizational_healthcare_provider].filter(Boolean).join("_") || null;
  } else if (importType === "home_health_vbp") {
    id = row.cms_certification_number_ccn || row.ccn || row.provider_id || null;
  } else if (importType === "snf_vbp_facility") {
    id = row.cms_certification_number_ccn || row.ccn || row.provider_id || null;
  } else if (importType === "rural_health_clinic_enrollments" || importType === "rural_health_clinic_all_owners") {
    id = row.NPI || row.npi || row.ENROLLMENT_ID || null;
  } else if (importType === "nursing_home_chain_performance") {
    id = row.organization_id || row.chain_id || null;
  } else if (importType === "medicare_geographic_variation") {
    id = [row.YEAR, row.BENE_GEO_LVL, row.BENE_GEO_CD].filter(Boolean).join("_") || null;
  } else if (importType === "pbj_daily_nurse_staffing" || importType === "pbj_daily_nonnurse_staffing") {
    id = [row.PROVNUM || row.provnum, row.WorkDate || row.WORKDATE].filter(Boolean).join("_") || null;
  } else if (importType === "snf_enrollments") {
    id = row.NPI || row.npi || row.ENROLLMENT_ID || null;
  } else if (importType === "snf_all_owners" || importType === "fqhc_all_owners") {
    id = [row.NPI || row.npi, row.ASSOCIATE_ID || row.associate_id].filter(Boolean).join("_") || null;
  } else if (importType === "snf_cost_report") {
    id = row.PRVDR_NUM || row.prvdr_num || row.RPT_REC_NUM || null;
  } else if (importType === "aco_participants") {
    id = [row.ACO_ID, row.NPI || row.TIN].filter(Boolean).join("_") || null;
  } else if (importType === "aco_organizations") {
    id = row.ACO_ID || row.aco_id || null;
  } else if (importType === "aco_financial_results") {
    id = [row.ACO_ID, row.PY || row.PERFORMANCE_YEAR].filter(Boolean).join("_") || null;
  } else if (importType === "medicare_telehealth_trends") {
    id = [row.YEAR, row.BENE_STATE_ABRVTN || row.STATE, row.HCPCS_CD].filter(Boolean).join("_") || null;
  } else if (importType === "snf_utilization_geo_casemix" || importType === "hha_utilization_geo_casemix") {
    id = [row.PRVDR_ID || row.CCN, row.GEO_CD || row.STATE, row.CASEMIX_GRP || row.HH_PDGM_GRP].filter(Boolean).join("_") || null;
  } else if (importType === "ltc_facility_characteristics") {
    id = row.PROVNUM || row.provnum || row.FEDERAL_PROVIDER_NUMBER || null;
  } else if (importType === "mds_frequency") {
    id = [row.PROVNUM || row.provnum, row.MEASURE_CODE || row.measure_code].filter(Boolean).join("_") || null;
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
  if (importType === "nursing_home_ownership" || importType === "nursing_home_fire_safety" || importType === "nursing_home_health_deficiencies" || importType === "nursing_home_mds_quality" || importType === "nursing_home_claims_quality" || importType === "snf_quality_reporting") {
    return row.provider_name || row.facility_name || null;
  }
  if (importType === "inpatient_rehab_general_info" || importType === "inpatient_rehab_provider_data") {
    return row.provider_name || row.facility_name || null;
  }
  if (importType === "long_term_care_general_info" || importType === "long_term_care_provider_data") {
    return row.provider_name || row.facility_name || null;
  }
  if (importType === "facility_affiliation") {
    return [row.clinician_last_name || row.provider_last_name, row.clinician_first_name || row.provider_first_name].filter(Boolean).join(", ") || row.facility_name || null;
  }
  if (importType === "home_health_vbp" || importType === "snf_vbp_facility") {
    return row.provider_name || row.facility_name || null;
  }
  if (importType === "rural_health_clinic_enrollments" || importType === "rural_health_clinic_all_owners") {
    return row["ORGANIZATION NAME"] || row.organization_name || row.FIRST_NAME || null;
  }
  if (importType === "nursing_home_chain_performance") {
    return row.organization_name || row.chain_name || null;
  }
  if (importType === "medicare_geographic_variation") {
    return [row.BENE_GEO_DESC, row.YEAR].filter(Boolean).join(" ") || null;
  }
  if (importType === "pbj_daily_nurse_staffing" || importType === "pbj_daily_nonnurse_staffing") {
    return row.PROVNAME || row.provname || null;
  }
  if (importType === "snf_enrollments") {
    return row["ORGANIZATION NAME"] || row.organization_name || null;
  }
  if (importType === "snf_all_owners" || importType === "fqhc_all_owners") {
    return row["ORGANIZATION NAME"] || row.organization_name || row.FIRST_NAME || null;
  }
  if (importType === "snf_cost_report") {
    return row.PRVDR_NAME || row.HOSPITAL_NAME || null;
  }
  if (importType === "aco_participants") {
    return row.ACO_NAME || row.PROVIDER_NAME || null;
  }
  if (importType === "aco_organizations") {
    return row.ACO_NAME || row.ACO_Legal_Name || null;
  }
  if (importType === "aco_financial_results") {
    return row.ACO_NAME || row.ACO_Legal_Name || null;
  }
  if (importType === "medicare_telehealth_trends") {
    return [row.HCPCS_DESC, row.BENE_STATE_DESC || row.STATE].filter(Boolean).join(" — ") || null;
  }
  if (importType === "snf_utilization_geo_casemix" || importType === "hha_utilization_geo_casemix") {
    return row.PRVDR_NAME || row.PROVIDER_NAME || row.GEO_DESC || null;
  }
  if (importType === "ltc_facility_characteristics") {
    return row.PROVNAME || row.provname || row.FACILITY_NAME || null;
  }
  if (importType === "mds_frequency") {
    return row.PROVNAME || row.provname || row.FACILITY_NAME || null;
  }
  return null;
}

function mapMedicareFacilityRow(row: any, importType: string, batchId: number) {
  const statId = deriveStatisticalId(row, importType);
  const statName = deriveStatisticalName(row, importType);

  const mapped: any = {
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
    state: (
      row.state || row.State || row.STATE ||
      row["State Code"] || row.Rndrng_Prvdr_State_Abrvtn ||
      row.Prscrbr_State_Abrvtn ||
      row.BENE_STATE_ABRVTN ||
      row["ENROLLMENT STATE"] ||
      row.practicestate ||
      row.Suplr_Prvdr_State_Abrvtn || row.Rfrg_Prvdr_State_Abrvtn ||
      null
    ),
    zip: (
      row.zip_code || row["Zip Code"] || row.Zip_Code ||
      row["ZIP CODE"] || row.ZIP_CODE ||
      row.Rndrng_Prvdr_Zip5 ||
      row.practicezip9code ||
      row.Suplr_Prvdr_Zip5 || row.Rfrg_Prvdr_Zip5 ||
      row.PRVDR_ZIP ||
      null
    ),
    raw_data: row,
    import_batch_id: String(batchId),
  };

  if (mapped.state && mapped.state.length > 10) mapped.state = mapped.state.substring(0, 10);
  if (mapped.zip && mapped.zip.length > 20) mapped.zip = mapped.zip.substring(0, 20);
  if (mapped.provider_id && mapped.provider_id.length > 50) mapped.provider_id = mapped.provider_id.substring(0, 50);

  return mapped;
}

async function safeImportQuery<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      if (attempt === 3) {
        const pgCode = e.code || e.cause?.code || '';
        const pgDetail = e.detail || e.cause?.detail || '';
        console.warn(`[CMS Import] ${label} failed after 3 attempts: [${pgCode}] ${e.message?.slice(0, 300)}${pgDetail ? ' | detail: ' + pgDetail : ''}`);
        return fallback;
      }
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  return fallback;
}

// Fetch existing rows matching the given primary values, in bounded batches so a
// single query can't pull an unbounded result set. Extra scope conditions narrow
// the lookup to the relevant import_type / data_year.
async function fetchExistingByPrimary(
  table: any,
  primaryCol: string,
  values: string[],
  scope: Array<{ col: string; value: any }>,
): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < values.length; i += LOOKUP_PRIMARY_BATCH_SIZE) {
    const slice = values.slice(i, i + LOOKUP_PRIMARY_BATCH_SIZE);
    const conds = [inArray((table as any)[primaryCol], slice)];
    for (const s of scope) {
      const col = (table as any)[s.col];
      if (s.col === "data_year") {
        conds.push(sql`TRIM(${col}) = ${String(s.value).trim()}`);
      } else {
        conds.push(eq(col, s.value));
      }
    }
    const rows = await safeImportQuery(
      () => db.select().from(table).where(and(...conds)).limit(20000),
      [] as any[], `lookup existing ${primaryCol}`,
    );
    if (rows.length === 20000) {
      const scopeInfo = scope.map(s => `${s.col}=${s.value}`).join(', ');
      console.warn(`[CMS Import] fetchExistingByPrimary hit 20000-row limit for ${primaryCol}, slice [${i}..${i + slice.length}] (scope: ${scopeInfo}) — some existing rows may be missed in deduplication`);
    }
    out.push(...rows);
  }
  return out;
}

// De-duplicate a chunk of medicare_facilities rows against what's already stored.
// Rows are identified by provider_id when present, otherwise by facility_name,
// always scoped to the current facility_type (import_type).
async function dedupeFacilities(importType: string, chunk: any[]): Promise<any[]> {
  const withPid = chunk.filter((r) => r.provider_id);
  const noPid = chunk.filter((r) => !r.provider_id && r.facility_name);

  const toCreate: any[] = [];

  if (withPid.length > 0) {
    const pids = distinctValues(withPid, "provider_id");
    const existing = await fetchExistingByPrimary(medicareFacilities, "provider_id", pids, [
      { col: "facility_type", value: importType },
    ]);
    toCreate.push(...partition(withPid, existing, ["provider_id"]).toCreate);
  }

  if (noPid.length > 0) {
    const names = distinctValues(noPid, "facility_name");
    const existing = await fetchExistingByPrimary(medicareFacilities, "facility_name", names, [
      { col: "facility_type", value: importType },
    ]);
    toCreate.push(...partition(noPid, existing, ["facility_name"]).toCreate);
  }

  return toCreate;
}

// Dual-write helper for medicare_facilities → medicare_facilities_raw split.
// Phase 1: every facility insert also mirrors raw_data into the side table.
// Must run inside a transaction so the column and the side-table row land
// together (or neither does). Exported for unit-testing the contract.
export async function dualWriteFacilityRows(
  tx: { insert: (table: any) => any },
  rows: Array<Record<string, any>>,
): Promise<void> {
  if (rows.length === 0) return;
  const inserted = await tx
    .insert(medicareFacilities)
    .values(rows)
    .returning({ id: medicareFacilities.id });
  const rawRows = rows
    .map((row, idx) => ({ facility_id: inserted[idx]?.id, raw_data: row.raw_data }))
    .filter((r) => r.facility_id != null && r.raw_data != null);
  if (rawRows.length > 0) {
    await tx.insert(medicareFacilitiesRaw).values(rawRows).onConflictDoUpdate({
      target: medicareFacilitiesRaw.facility_id,
      set: { raw_data: sql`excluded.raw_data`, updated_at: sql`NOW()` },
    });
  }
}
/**
 * Inserts mapped CMS rows into the appropriate destination table, applying per-import-type mapping, chunked deduplication, and conflict-tolerant insertion.
 *
 * @param importType - Import type that determines mapping and destination routing. Examples: `"cms_order_referring"` → inserts/upserts into `providers`; `"provider_service_utilization"` → `providerServiceUtilization`; `"physician_shared_patient_patterns"` → `cmsReferrals`; other import types are treated as facility-like and inserted into `medicareFacilities`.
 * @param rows - Raw CMS dataset rows to be mapped and inserted.
 * @param year - Data year used when mapping rows and when scoping natural-key deduplication.
 * @param batchId - Import batch identifier to attach to mapped rows.
 * @returns An object with:
 *   - `inserted`: number of rows successfully inserted,
 *   - `skipped`: number of rows skipped due to deduplication or per-row insert failures,
 *   - `filtered`: number of input rows removed before mapping (e.g., invalid or missing required keys).
 */
async function insertCMSRows(importType: string, rows: any[], year: number, batchId: number): Promise<{ inserted: number; skipped: number; filtered: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0, filtered: 0 };

  const CHUNK_SIZE = 500;
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
  } else if (importType === "physician_shared_patient_patterns") {
    // Provider-to-provider shared-patient edges -> cms_referrals.
    mapped = rows.map(r => mapSharedPatientPatternRow(r, year, batchId));
    mapped = mapped.filter(r => r.npi && r.referred_to_npi);
    table = cmsReferrals;
  } else {
    mapped = rows.map(r => mapMedicareFacilityRow(r, importType, batchId));
    mapped = mapped.filter(r => r.provider_id || r.facility_name);
    table = medicareFacilities;
  }

  if (mapped.length === 0) return { inserted: 0, skipped: 0, filtered: rows.length };

  const filteredCount = rows.length - mapped.length;
  const keyConfig = CMS_NATURAL_KEYS[importType];

  for (let i = 0; i < mapped.length; i += CHUNK_SIZE) {
    let chunk = mapped.slice(i, i + CHUNK_SIZE);

    // Natural-key de-duplication: drop rows that already exist (from a prior
    // import/resume) or repeat within this chunk, so re-imports don't multiply data.
    if (table === medicareFacilities) {
      const before = chunk.length;
      chunk = await dedupeFacilities(importType, chunk);
      skipped += before - chunk.length;
    } else if (keyConfig) {
      const before = chunk.length;
      const primaryValues = distinctValues(chunk, keyConfig.primaryCol);
      if (primaryValues.length > 0) {
        const existing = await fetchExistingByPrimary(table, keyConfig.primaryCol, primaryValues, [
          { col: "data_year", value: String(year) },
        ]);
        chunk = partition(chunk, existing, keyConfig.keyCols).toCreate;
      }
      skipped += before - chunk.length;
    }

    if (chunk.length === 0) continue;

    // For medicare_facilities we dual-write into medicare_facilities_raw (the
    // side table that owns the wide raw_data blob). Phase 1 of the column
    // split — the facility row keeps its raw_data column so existing readers
    // still work during the rollout; phase 2 drops the column once readers
    // have switched and the dual-write has soaked. Wrapping the bulk insert
    // + raw mirror in a single transaction keeps the two tables consistent
    // even if the second statement errors.
    const isFacility = table === medicareFacilities;

    const result = await safeImportQuery(
      async () => {
        if (isFacility) {
          await db.transaction(async (tx) => {
            await dualWriteFacilityRows(tx, chunk);
          });
        } else {
          await db.insert(table).values(chunk);
        }
        return chunk.length;
      },
      -1, `bulk insert ${importType}`
    );
    if (result >= 0) {
      inserted += result;
    } else {
      for (const row of chunk) {
        const ok = await safeImportQuery(
          async () => {
            if (isFacility) {
              await db.transaction(async (tx) => {
                await dualWriteFacilityRows(tx, [row]);
              });
            } else {
              await db.insert(table).values(row);
            }
            return true;
          },
          false, `single insert ${importType}`
        );
        if (ok) inserted++;
        else skipped++;
      }
    }
  }

  return { inserted, skipped, filtered: filteredCount };
}

export async function handleAutoImportCMSData(params: any) {
  const { import_type, file_url, year, dry_run, resume_offset = 0, batch_id, total_inserted = 0, total_skipped = 0, npi_filter, state_filter } = params;
  // Optional row-level filters from the import dialog. Built once; null when no
  // filter is configured so the common path stays allocation-free.
  const rowFilter = buildImportRowFilter(npi_filter, state_filter);
  const PAGE_SIZE = 1000;
  const PAUSE_CHECK_INTERVAL = 5;
  const PROGRESS_UPDATE_INTERVAL = 5;
  const MAX_PAGES = 50000;
  const isProviderDataAPI = file_url.includes("/datastore/query/");

  try {
    let offset = Number(resume_offset) || 0;
    let totalFetched = offset;
    let totalInserted = Number(total_inserted) || 0;
    let totalSkipped = Number(total_skipped) || 0;
    let hasMore = true;
    let consecutiveErrors = 0;
    let pagesSinceProgressUpdate = 0;
    let pagesSincePauseCheck = 0;
    const errors: any[] = [];

    let pageCount = 0;
    while (hasMore && pageCount < MAX_PAGES) {
      pageCount++;
      pagesSincePauseCheck++;
      if (pagesSincePauseCheck >= PAUSE_CHECK_INTERVAL) {
        pagesSincePauseCheck = 0;
        const [currentBatch] = await safeImportQuery(
          () => db.select().from(importBatches).where(eq(importBatches.id, batch_id)).limit(1),
          [] as any[], `pause check ${import_type}`
        );
        if (currentBatch && (currentBatch.status === "paused" || currentBatch.status === "cancelled")) {
          console.log(`[AutoImportCMS] Import ${import_type} ${currentBatch.status} by user at offset ${offset}`);
          await safeImportQuery(
            () => db.update(importBatches).set({
              imported_rows: totalInserted,
              skipped_rows: totalSkipped,
              total_rows: totalFetched,
              retry_params: { ...params, resume_offset: offset, total_inserted: totalInserted, total_skipped: totalSkipped },
              updated_date: new Date(),
            }).where(eq(importBatches.id, batch_id)),
            undefined, `save progress on ${currentBatch.status}`
          );
          return;
        }
      }

      let url: string;
      if (isProviderDataAPI) {
        const separator = file_url.includes("?") ? "&" : "?";
        url = `${file_url}${separator}offset=${offset}&limit=${PAGE_SIZE}`;
      } else {
        const separator = file_url.includes("?") ? "&" : "?";
        url = `${file_url}${separator}offset=${offset}&size=${PAGE_SIZE}`;
      }

      let response: Response;
      const fetchTimeoutMs = offset > 1000000 ? 300000 : offset > 500000 ? 240000 : offset > 200000 ? 180000 : offset > 50000 ? 120000 : 60000;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
        response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
      } catch (e: any) {
        const isAbort = e.name === 'AbortError' || (e.message && e.message.includes('aborted'));
        consecutiveErrors++;
        const errMsg = `Fetch failed at offset ${offset}: ${e.message}`;
        console.error(`[AutoImportCMS] ${errMsg} (timeout=${fetchTimeoutMs}ms, attempt ${consecutiveErrors}/7)`);
        errors.push({ offset, message: errMsg });
        const maxRetries = isAbort ? 7 : 5;
        if (consecutiveErrors >= maxRetries) {
          await safeImportQuery(
            () => db.update(importBatches).set({
              status: "failed",
              imported_rows: totalInserted,
              skipped_rows: totalSkipped,
              total_rows: totalFetched,
              error_samples: errors.slice(-5),
              retry_params: { ...params, resume_offset: offset, total_inserted: totalInserted, total_skipped: totalSkipped },
              updated_date: new Date(),
            }).where(eq(importBatches.id, batch_id)),
            undefined, `fail on fetch error ${import_type}`
          );
          return;
        }
        const baseBackoff = isAbort ? 5000 : 3000;
        const backoffMs = Math.min(baseBackoff * Math.pow(2, consecutiveErrors - 1), 60000);
        console.log(`[AutoImportCMS] Retry ${consecutiveErrors}/${maxRetries} in ${backoffMs}ms for offset ${offset}`);
        await new Promise(r => setTimeout(r, backoffMs));
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
        if (consecutiveErrors >= 5) {
          await safeImportQuery(
            () => db.update(importBatches).set({
              status: "failed",
              imported_rows: totalInserted,
              skipped_rows: totalSkipped,
              total_rows: totalFetched,
              error_samples: errors.slice(-5),
              retry_params: { ...params, resume_offset: offset, total_inserted: totalInserted, total_skipped: totalSkipped },
              updated_date: new Date(),
            }).where(eq(importBatches.id, batch_id)),
            undefined, `fail on HTTP error ${import_type}`
          );
          return;
        }
        const backoffMs = Math.min(2000 * Math.pow(2, consecutiveErrors - 1), 30000);
        await new Promise(r => setTimeout(r, backoffMs));
        continue;
      }

      consecutiveErrors = 0;
      const data = await response.json();
      const rows = Array.isArray(data) ? data : data.results || data.data || [];

      if (rows.length === 0) {
        hasMore = false;
        break;
      }

      // Apply the optional npi_filter / state_filter to this page. Pagination
      // (offset / hasMore) still uses the ORIGINAL row count; rows removed by
      // the filter are counted as skipped.
      let pageRows = rows;
      if (rowFilter) {
        const beforeLen = pageRows.length;
        pageRows = pageRows.filter(rowFilter);
        totalSkipped += beforeLen - pageRows.length;
      }

      if (!dry_run && pageRows.length > 0) {
        try {
          const result = await insertCMSRows(import_type, pageRows, year, batch_id);
          totalInserted += result.inserted;
          totalSkipped += result.skipped + result.filtered;
        } catch (e: any) {
          console.error(`[AutoImportCMS] Insert error at offset ${offset}: ${e.message}`);
          errors.push({ offset, message: `Insert error: ${e.message}` });
        }
      }

      totalFetched += rows.length;
      offset += rows.length;

      pagesSinceProgressUpdate++;
      if (pagesSinceProgressUpdate >= PROGRESS_UPDATE_INTERVAL || rows.length < PAGE_SIZE) {
        pagesSinceProgressUpdate = 0;
        await safeImportQuery(
          () => db.update(importBatches).set({
            imported_rows: totalInserted,
            skipped_rows: totalSkipped,
            total_rows: totalFetched,
            retry_params: { ...params, resume_offset: offset, total_inserted: totalInserted, total_skipped: totalSkipped },
            updated_date: new Date(),
          }).where(eq(importBatches.id, batch_id)),
          undefined, `update progress ${import_type}`
        );
      }

      if (rows.length < PAGE_SIZE) {
        hasMore = false;
      }

      await new Promise(r => setTimeout(r, 50));
    }

    if (hasMore && pageCount >= MAX_PAGES) {
      console.warn(`[AutoImportCMS] Safety limit reached at offset ${offset} after ${MAX_PAGES} pages, inserted=${totalInserted}. Marking incomplete.`);
      await safeImportQuery(
        () => db.update(importBatches).set({
          status: "completed_with_errors",
          imported_rows: totalInserted,
          skipped_rows: totalSkipped,
          total_rows: totalFetched,
          error_samples: [{ message: `Import stopped after ${MAX_PAGES} pages at offset ${offset}. Resume to continue.`, phase: "safety_limit" }],
          retry_params: { ...params, resume_offset: offset, total_inserted: totalInserted, total_skipped: totalSkipped },
          updated_date: new Date(),
        }).where(eq(importBatches.id, batch_id)),
        undefined, `safety limit ${import_type}`
      );
      return;
    }

    await safeImportQuery(
      () => db.update(importBatches).set({
        status: "completed",
        completed_at: new Date(),
        imported_rows: totalInserted,
        skipped_rows: totalSkipped,
        total_rows: totalFetched,
        error_samples: errors.length > 0 ? errors.slice(-5) : null,
        updated_date: new Date(),
      }).where(eq(importBatches.id, batch_id)),
      undefined, `complete ${import_type}`
    );
    console.log(`[AutoImportCMS] Completed ${import_type}: fetched=${totalFetched}, inserted=${totalInserted}, skipped=${totalSkipped}`);
  } catch (e: any) {
    console.error(`[AutoImportCMS] Fatal error:`, e.message);
    await safeImportQuery(
      () => db.update(importBatches).set({
        status: "failed",
        error_samples: [{ message: e.message, phase: "cms_import" }],
        retry_params: { ...params, resume_offset: resume_offset },
        updated_date: new Date(),
      }).where(eq(importBatches.id, batch_id)),
      undefined, `fail ${import_type}`
    );
  }
}
