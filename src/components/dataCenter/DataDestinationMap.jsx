import { buildImportTypeLabels } from '@/lib/cmsImportTypes';

// Maps import types to their destination pages for "View Data" links
const DATA_DESTINATION_MAP = {
  nppes_monthly: { page: 'Providers', label: 'Providers' },
  nppes_registry: { page: 'Providers', label: 'Providers' },
  cms_utilization: { page: 'Utilization', label: 'Utilization' },
  cms_part_d: { page: 'Providers', label: 'Providers' },
  cms_order_referring: { page: 'Referrals', label: 'Referrals' },
  pa_home_health: { page: 'Providers', label: 'Providers' },
  hospice_providers: { page: 'Providers', label: 'Providers' },
  nursing_home_chains: { page: 'Organizations', label: 'Organizations' },
  hospice_enrollments: { page: 'Organizations', label: 'Organizations' },
  home_health_enrollments: { page: 'Organizations', label: 'Organizations' },
  home_health_cost_reports: { page: 'Organizations', label: 'Organizations' },
  cms_service_utilization: { page: 'Utilization', label: 'Utilization' },
  provider_service_utilization: { page: 'Utilization', label: 'Utilization' },
  home_health_pdgm: { page: 'CMSAnalytics', label: 'CMS Analytics' },
  inpatient_drg: { page: 'CMSAnalytics', label: 'CMS Analytics' },
  provider_ownership: { page: 'Organizations', label: 'Organizations' },
  opt_out_physicians: { page: 'Providers', label: 'Providers' },
  medical_equipment_suppliers: { page: 'Organizations', label: 'Organizations' },
  medicare_hha_stats: { page: 'CMSAnalytics', label: 'CMS Analytics' },
  medicare_ma_inpatient: { page: 'MAInpatientDashboard', label: 'MA Inpatient' },
  medicare_part_d_stats: { page: 'CMSAnalytics', label: 'CMS Analytics' },
  medicare_snf_stats: { page: 'CMSAnalytics', label: 'CMS Analytics' },
  hospice_provider_measures: { page: 'CMSAnalytics', label: 'CMS Analytics' },
  hospice_state_measures: { page: 'CMSAnalytics', label: 'CMS Analytics' },
  hospice_national_measures: { page: 'CMSAnalytics', label: 'CMS Analytics' },
  snf_provider_measures: { page: 'CMSAnalytics', label: 'CMS Analytics' },
  nursing_home_providers: { page: 'Organizations', label: 'Organizations' },
  nursing_home_deficiencies: { page: 'Organizations', label: 'Organizations' },
  home_health_national_measures: { page: 'CMSAnalytics', label: 'CMS Analytics' },
};

const IMPORT_TYPE_LABELS = buildImportTypeLabels({
  home_health_enrollments: 'HH Enrollments',
  home_health_cost_reports: 'HH Cost Reports',
  provider_service_utilization: 'Provider Service Util',
  home_health_pdgm: 'HH PDGM',
});

export { DATA_DESTINATION_MAP, IMPORT_TYPE_LABELS };
