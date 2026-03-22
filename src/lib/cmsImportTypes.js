const CMS_IMPORT_TYPE_DEFINITIONS = [
  { id: 'nppes_registry', label: 'NPPES Registry', supportsUrl: true },
  { id: 'cms_order_referring', label: 'Order & Referring', supportsUrl: true, availableYears: [2023, 2022, 2021, 2020, 2019] },
  { id: 'provider_service_utilization', label: 'Provider Service Util', supportsUrl: true, availableYears: [2022, 2021, 2020, 2019] },
  { id: 'hospice_enrollments', label: 'Hospice Enrollments', supportsUrl: true, availableYears: [2024, 2023, 2022] },
  { id: 'home_health_enrollments', label: 'Home Health Enrollments', supportsUrl: true, availableYears: [2024, 2023, 2022] },
  { id: 'medicare_hha_stats', label: 'Medicare HHA Stats', supportsUrl: true, availableYears: [2023, 2022, 2021, 2020] },
  { id: 'medicare_ma_inpatient', label: 'Medicare MA Inpatient', supportsUrl: true, availableYears: [2023, 2022, 2021, 2020] },
  { id: 'medicare_snf_stats', label: 'Medicare SNF Stats', supportsUrl: true, availableYears: [2023, 2022, 2021, 2020] },
  { id: 'medical_equipment_suppliers', label: 'Medical Equipment Suppliers', supportsUrl: true, availableYears: [2024, 2023, 2022] },
  { id: 'hospice_provider_measures', label: 'Hospice Provider Measures', supportsUrl: true, availableYears: [2023, 2022, 2021] },
  { id: 'hospice_state_measures', label: 'Hospice State Measures', supportsUrl: true, availableYears: [2023, 2022, 2021] },
  { id: 'hospice_national_measures', label: 'Hospice National Measures', supportsUrl: true, availableYears: [2023, 2022, 2021] },
  { id: 'snf_provider_measures', label: 'SNF Provider Measures', supportsUrl: true, availableYears: [2023, 2022, 2021] },
  { id: 'nursing_home_providers', label: 'Nursing Home Providers', supportsUrl: true, availableYears: [2024, 2023, 2022] },
  { id: 'nursing_home_deficiencies', label: 'Nursing Home Deficiencies', supportsUrl: true, availableYears: [2024, 2023, 2022] },
  { id: 'home_health_national_measures', label: 'Home Health National Measures', supportsUrl: true, availableYears: [2023, 2022, 2021] },
  { id: 'clinician_national_file', label: 'Clinician National File', supportsUrl: true },
  { id: 'clinician_mips_performance', label: 'Clinician MIPS Performance', supportsUrl: true },
  { id: 'clinician_mips_measures', label: 'Clinician MIPS Measures', supportsUrl: true },
  { id: 'clinician_group_measures', label: 'Group Practice Measures', supportsUrl: true },
  { id: 'clinician_group_experience', label: 'Group Practice Experience', supportsUrl: true },
  { id: 'hospital_hcahps_survey', label: 'Hospital HCAHPS Survey', supportsUrl: true },
  { id: 'hospital_timely_effective_care', label: 'Timely & Effective Care', supportsUrl: true },
  { id: 'hospital_unplanned_visits', label: 'Unplanned Hospital Visits', supportsUrl: true },
  { id: 'hospital_imaging_efficiency', label: 'Imaging Efficiency', supportsUrl: true },
  { id: 'hospital_spending_per_beneficiary', label: 'Spending Per Beneficiary', supportsUrl: true },
  { id: 'hospital_spending_by_claim', label: 'Spending by Claim', supportsUrl: true },
  { id: 'hospital_hac_reduction', label: 'HAC Reduction Program', supportsUrl: true },
  { id: 'hospital_psychiatric_facility', label: 'Psychiatric Facility QM', supportsUrl: true },
  { id: 'ambulatory_surgical_center', label: 'Ambulatory Surgical Center', supportsUrl: true },
  { id: 'hospital_joint_replacement', label: 'Joint Replacement Model', supportsUrl: true },
  { id: 'home_health_patient_survey', label: 'Home Health HHCAHPS', supportsUrl: true },
  { id: 'home_health_zip_data', label: 'Home Health Zip Data', supportsUrl: true },
  { id: 'hospice_zip_data', label: 'Hospice Zip Data', supportsUrl: true },
  { id: 'dialysis_patient_survey', label: 'Dialysis Patient Survey', supportsUrl: true },
  { id: 'nursing_home_ownership', label: 'Nursing Home Ownership', supportsUrl: true },
  { id: 'nursing_home_fire_safety', label: 'Nursing Home Fire Safety', supportsUrl: true },
  { id: 'nursing_home_health_deficiencies', label: 'Nursing Home Health Deficiencies', supportsUrl: true },
  { id: 'nursing_home_mds_quality', label: 'Nursing Home MDS Quality', supportsUrl: true },
  { id: 'nursing_home_claims_quality', label: 'Nursing Home Claims QM', supportsUrl: true },
  { id: 'snf_quality_reporting', label: 'SNF Quality Reporting', supportsUrl: true },
  { id: 'inpatient_rehab_general_info', label: 'IRF General Information', supportsUrl: true },
  { id: 'inpatient_rehab_provider_data', label: 'IRF Provider Data', supportsUrl: true },
  { id: 'long_term_care_general_info', label: 'LTCH General Information', supportsUrl: true },
  { id: 'long_term_care_provider_data', label: 'LTCH Provider Data', supportsUrl: true },
];

export const CMS_IMPORT_TYPE_ALIAS_MAP = {
  cms_service_utilization: 'provider_service_utilization',
};

export const CMS_IMPORT_TYPES = CMS_IMPORT_TYPE_DEFINITIONS.map(def => ({
  ...def,
  normalizedId: def.id,
}));

export const CMS_IMPORT_TYPE_LABELS = Object.fromEntries(
  CMS_IMPORT_TYPES.map(({ id, label }) => [id, label]),
);

export const BASE_IMPORT_TYPE_LABELS = {
  nppes_monthly: 'NPPES Monthly',
  nppes_registry: 'NPPES Registry',
  cms_utilization: 'CMS Utilization',
  pa_home_health: 'PA Home Health',
  hospice_providers: 'Hospice Providers',
  nursing_home_chains: 'Nursing Home Chains',
  hospice_enrollments: 'Hospice Enrollments',
  home_health_enrollments: 'Home Health Enrollments',
  home_health_cost_reports: 'Home Health Cost Reports',
  cms_service_utilization: 'Service Utilization',
  provider_service_utilization: 'Provider Service Util',
  home_health_pdgm: 'Home Health PDGM',
  inpatient_drg: 'Inpatient DRG',
  provider_ownership: 'Provider Ownership',
  hospital_hcahps_survey: 'Hospital HCAHPS',
  hospital_timely_effective_care: 'Timely & Effective Care',
  hospital_unplanned_visits: 'Unplanned Visits',
  hospital_imaging_efficiency: 'Imaging Efficiency',
  hospital_spending_per_beneficiary: 'Spending/Beneficiary',
  hospital_spending_by_claim: 'Spending by Claim',
  hospital_hac_reduction: 'HAC Reduction',
  hospital_psychiatric_facility: 'Psychiatric Facility',
  ambulatory_surgical_center: 'ASC Quality',
  hospital_joint_replacement: 'Joint Replacement',
  home_health_patient_survey: 'HHCAHPS Survey',
  home_health_zip_data: 'Home Health Zip',
  hospice_zip_data: 'Hospice Zip',
  dialysis_patient_survey: 'Dialysis ICH CAHPS',
  nursing_home_ownership: 'NH Ownership',
  nursing_home_fire_safety: 'NH Fire Safety',
  nursing_home_health_deficiencies: 'NH Health Deficiencies',
  nursing_home_mds_quality: 'NH MDS Quality',
  nursing_home_claims_quality: 'NH Claims Quality',
  snf_quality_reporting: 'SNF Quality Reporting',
  inpatient_rehab_general_info: 'IRF General Info',
  inpatient_rehab_provider_data: 'IRF Provider Data',
  long_term_care_general_info: 'LTCH General Info',
  long_term_care_provider_data: 'LTCH Provider Data',
  clinician_national_file: 'Clinician National File',
  clinician_mips_performance: 'Clinician MIPS',
  clinician_mips_measures: 'Clinician MIPS Measures',
  clinician_group_measures: 'Group MIPS Measures',
  clinician_group_experience: 'Group Experience',
  ...CMS_IMPORT_TYPE_LABELS,
};

export const SCHEDULABLE_CMS_IMPORT_TYPES = CMS_IMPORT_TYPES.filter(type => type.supportsUrl);

export const SCHEDULABLE_CMS_IMPORT_TYPE_IDS = SCHEDULABLE_CMS_IMPORT_TYPES.map(type => type.id);

export const CMS_IMPORT_TYPES_BY_ID = Object.fromEntries(
  CMS_IMPORT_TYPES.map(type => [type.id, type]),
);

export function normalizeCmsImportType(importType) {
  return CMS_IMPORT_TYPE_ALIAS_MAP[importType] || importType;
}

export function getCmsImportTypeLabel(importType) {
  const normalized = normalizeCmsImportType(importType);
  return CMS_IMPORT_TYPE_LABELS[normalized] || normalized;
}

export function getCmsImportTypeYears(importType) {
  const normalized = normalizeCmsImportType(importType);
  return CMS_IMPORT_TYPES_BY_ID[normalized]?.availableYears || null;
}

export function buildImportTypeLabels(overrides = {}) {
  return {
    ...BASE_IMPORT_TYPE_LABELS,
    ...overrides,
  };
}
