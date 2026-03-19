const CMS_IMPORT_TYPE_DEFINITIONS = [
  { id: 'nppes_registry', label: 'NPPES Registry', supportsUrl: true },
  { id: 'cms_order_referring', label: 'Order & Referring', supportsUrl: true, availableYears: [2023, 2022, 2021, 2020, 2019] },
  { id: 'provider_service_utilization', label: 'Provider Service Util', supportsUrl: true, availableYears: [2022, 2021, 2020, 2019] },
  { id: 'hospice_enrollments', label: 'Hospice Enrollments', supportsUrl: true, availableYears: [2024, 2023, 2022] },
  { id: 'home_health_enrollments', label: 'Home Health Enrollments', supportsUrl: true, availableYears: [2024, 2023, 2022] },
  { id: 'medicare_hha_stats', label: 'Medicare HHA Stats', supportsUrl: true, availableYears: [2023, 2022, 2021, 2020] },
  { id: 'medicare_ma_inpatient', label: 'Medicare MA Inpatient', supportsUrl: true, availableYears: [2023, 2022, 2021, 2020] },
  { id: 'medicare_part_d_stats', label: 'Medicare Part D Stats', supportsUrl: true, availableYears: [2023, 2022, 2021, 2020] },
  { id: 'medicare_snf_stats', label: 'Medicare SNF Stats', supportsUrl: true, availableYears: [2023, 2022, 2021, 2020] },
  { id: 'opt_out_physicians', label: 'Opt-Out Physicians', supportsUrl: true },
  { id: 'medical_equipment_suppliers', label: 'Medical Equipment Suppliers', supportsUrl: true },
  { id: 'hospice_provider_measures', label: 'Hospice Provider Measures', supportsUrl: true },
  { id: 'hospice_state_measures', label: 'Hospice State Measures', supportsUrl: true },
  { id: 'hospice_national_measures', label: 'Hospice National Measures', supportsUrl: true },
  { id: 'snf_provider_measures', label: 'SNF Provider Measures', supportsUrl: true },
  { id: 'nursing_home_providers', label: 'Nursing Home Providers', supportsUrl: true },
  { id: 'nursing_home_deficiencies', label: 'Nursing Home Deficiencies', supportsUrl: true },
  { id: 'home_health_national_measures', label: 'Home Health National Measures', supportsUrl: true },
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
  cms_part_d: 'CMS Part D',
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
