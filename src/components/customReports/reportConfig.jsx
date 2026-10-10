// Central configuration for datasets, their metrics, grouping options, and filters

// Every metric and group is a real column of the dataset's table (a parity
// test checks this against server/db/schema.ts). The scheduled-report runner
// keeps the same list in server/lib/reportAggregate.ts (REPORT_DATASETS) and
// rejects anything else. countMetrics count rows instead of summing values.
export const DATASET_CONFIG = {
  cms_utilization: {
    label: 'Provider Service Utilization',
    entity: 'ProviderServiceUtilization',
    metrics: [
      { key: 'total_services', label: 'Total Services' },
      { key: 'total_unique_benes', label: 'Medicare Beneficiaries' },
      { key: 'total_medicare_payment_amt', label: 'Medicare Payment ($)' },
    ],
    groupOptions: [
      { key: 'data_year', label: 'Year' },
      { key: 'npi', label: 'Provider NPI' },
      { key: 'service_type', label: 'Service Type' },
    ],
    filters: ['year'],
    yearField: 'data_year',
  },
  cms_referrals: {
    label: 'CMS Referral Patterns',
    entity: 'CMSReferral',
    metrics: [
      { key: 'total_referrals', label: 'Total Referrals' },
      { key: 'total_beneficiaries', label: 'Beneficiaries' },
    ],
    groupOptions: [
      { key: 'data_year', label: 'Year' },
      { key: 'npi', label: 'Provider NPI' },
    ],
    filters: ['year'],
    yearField: 'data_year',
  },
  ma_inpatient: {
    label: 'Medicare Facilities',
    entity: 'MedicareFacility',
    metrics: [
      { key: 'total_discharges', label: 'Total Discharges' },
      { key: 'total_days_of_care', label: 'Days of Care' },
      { key: 'total_charges', label: 'Total Charges ($)' },
      { key: 'total_payments', label: 'Total Payments ($)' },
    ],
    groupOptions: [
      { key: 'data_year', label: 'Year' },
      { key: 'state', label: 'State' },
      { key: 'facility_type', label: 'Facility Type' },
    ],
    filters: ['year', 'state'],
    yearField: 'data_year',
  },
  hha_stats: {
    label: 'Home Health Agency Stats',
    entity: 'MedicareHHAStats',
    metrics: [
      { key: 'npi', label: 'Agencies' },
    ],
    countMetrics: ['npi'],
    groupOptions: [
      { key: 'data_year', label: 'Year' },
      { key: 'state', label: 'State' },
    ],
    filters: ['year', 'state'],
    yearField: 'data_year',
  },
  inpatient_drg: {
    label: 'Inpatient DRG',
    entity: 'InpatientDRG',
    metrics: [
      { key: 'total_discharges', label: 'Total Discharges' },
    ],
    groupOptions: [
      { key: 'data_year', label: 'Year' },
      { key: 'drg_code', label: 'DRG Code' },
      { key: 'npi', label: 'Provider NPI' },
    ],
    filters: ['year'],
    yearField: 'data_year',
  },
  snf_stats: {
    label: 'Medicare SNF',
    entity: 'MedicareSNFStats',
    metrics: [
      { key: 'npi', label: 'Facilities' },
    ],
    countMetrics: ['npi'],
    groupOptions: [
      { key: 'data_year', label: 'Year' },
      { key: 'state', label: 'State' },
    ],
    filters: ['year', 'state'],
    yearField: 'data_year',
  },
  providers: {
    label: 'Providers',
    entity: 'Provider',
    metrics: [
      { key: 'npi', label: 'Providers' },
    ],
    countMetrics: ['npi'],
    groupOptions: [
      { key: 'entity_type', label: 'Entity Type' },
      { key: 'status', label: 'Status' },
      { key: 'gender', label: 'Gender' },
      { key: 'email_validation_status', label: 'Email Validation' },
      { key: 'ai_enrichment_status', label: 'Enrichment Status' },
    ],
    filters: [],
  },
  reconciliation_discrepancies: {
    label: 'Reconciliation Discrepancies',
    entity: 'ProviderReconciliation',
    metrics: [
      { key: 'npi', label: 'Discrepancies' },
    ],
    countMetrics: ['npi'],
    groupOptions: [
      { key: 'source_a', label: 'Source' },
      { key: 'field_name', label: 'Field' },
      { key: 'status', label: 'Status' },
      { key: 'resolution_status', label: 'Resolution Status' },
    ],
    filters: [],
  },
  outreach_metrics: {
    label: 'Outreach Metrics',
    entity: 'OutreachCampaign',
    metrics: [
      { key: 'id', label: 'Campaigns' },
      { key: 'total_recipients', label: 'Recipients' },
    ],
    countMetrics: ['id'],
    groupOptions: [
      { key: 'status', label: 'Campaign Status' },
      { key: 'campaign_type', label: 'Campaign Type' },
    ],
    filters: [],
  },
};

// Datasets only the schedule form offers (too large to load in the browser).
export const SCHEDULE_ONLY_DATASETS = {
  locations: {
    label: 'Provider Locations',
    entity: 'ProviderLocation',
    metrics: [
      { key: 'npi', label: 'Locations' },
    ],
    countMetrics: ['npi'],
    groupOptions: [
      { key: 'state', label: 'State' },
      { key: 'location_type', label: 'Location Type' },
      { key: 'city', label: 'City' },
    ],
    filters: [],
  },
};

export const SCHEDULE_DATASETS = { ...DATASET_CONFIG, ...SCHEDULE_ONLY_DATASETS };

export const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
  '#84cc16', '#a855f7',
];