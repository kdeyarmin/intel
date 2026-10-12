// What each line of business should see first. "all" is no filter.
// Reports are ids from the reports catalog. Facility types match Facilities ?type=.
// Competitor settings match the county competitors tabs. Call-sheet kinds match the roster.

export const BUSINESS_LINES = [
  { id: 'all', label: 'All lines' },
  { id: 'hha', label: 'Home health' },
  { id: 'hospice', label: 'Hospice' },
  { id: 'snf', label: 'Nursing home' },
  { id: 'pch', label: 'Personal care home' },
  { id: 'hospital', label: 'Hospital' },
  { id: 'dme', label: 'DME' },
];

const LINES = {
  hha: {
    label: 'Home health',
    blurb: 'Counties, agencies, hospitals, and clinicians that matter for home health. Hospice and nursing-home rankings stay out of the way.',
    reports: ['expand-hha', 'acquire-hha', 'hospital-partners', 'calls-hha'],
    facilityTypes: ['home_health'],
    competitorSettings: ['hha'],
    referralSetting: 'hha',
    callSheetKinds: ['hospital', 'hha', 'clinician'],
    marketColumns: ['benes', 'ma_penetration', 'hha_users_pct', 'hha_agencies', 'hha_providers', 'std_per_capita_hha', 'hospitals_serving', 'living_alone_65_plus'],
    countyTabs: ['market', 'hospitals', 'competitors', 'referrals'],
    pacSettings: ['hha'],
    residential: false,
  },
  hospice: {
    label: 'Hospice',
    blurb: 'Counties, hospices, hospitals, and clinicians that matter for hospice.',
    reports: ['expand-hospice', 'acquire-hospice', 'hospital-partners', 'calls-hospice'],
    facilityTypes: ['hospice'],
    competitorSettings: ['hospice'],
    referralSetting: 'hospice',
    callSheetKinds: ['hospital', 'hospice', 'clinician'],
    marketColumns: ['benes', 'ma_penetration', 'benes_85_plus', 'hospice_users_pct', 'hospice_agencies', 'hospice_providers', 'std_per_capita_hospice', 'hospitals_serving'],
    countyTabs: ['market', 'hospitals', 'competitors', 'referrals'],
    pacSettings: ['hospice'],
    residential: false,
  },
  snf: {
    label: 'Nursing home',
    blurb: 'Counties, nursing homes, and the hospitals that discharge into them.',
    reports: ['expand-snf', 'acquire-snf', 'hospital-partners'],
    facilityTypes: ['snf'],
    competitorSettings: ['snf'],
    referralSetting: null,
    callSheetKinds: ['hospital', 'snf'],
    marketColumns: ['benes', 'ma_penetration', 'snf_users_pct', 'snf_facilities', 'snf_providers', 'std_per_capita_snf', 'hospitals_serving'],
    countyTabs: ['market', 'hospitals', 'competitors'],
    pacSettings: ['snf'],
    residential: false,
  },
  pch: {
    label: 'Personal care home',
    blurb: 'Licensed homes, beds, and where older people live. Medicare post-acute rankings are a different business.',
    reports: [],
    facilityTypes: ['licensed'],
    competitorSettings: ['licensed'],
    referralSetting: null,
    callSheetKinds: ['licensed'],
    marketColumns: ['pop_65_plus', 'pop_85_plus', 'living_alone_65_plus', 'licensed_homes', 'licensed_beds', 'median_income'],
    countyTabs: ['market', 'competitors'],
    pacSettings: [],
    residential: true,
  },
  hospital: {
    label: 'Hospital',
    blurb: 'Hospitals, where their residents go after discharge, and the home health, hospice, and nursing homes those patients use.',
    reports: ['hospital-partners'],
    facilityTypes: ['hospital'],
    competitorSettings: ['hha', 'hospice', 'snf'],
    referralSetting: null,
    callSheetKinds: ['hospital', 'hha', 'hospice', 'snf'],
    marketColumns: ['benes', 'hospitals_serving', 'hha_users_pct', 'hospice_users_pct', 'snf_users_pct', 'readmission_rate'],
    countyTabs: ['market', 'hospitals', 'competitors'],
    pacSettings: ['hha', 'hospice', 'snf'],
    residential: false,
  },
  dme: {
    label: 'DME',
    blurb: 'Equipment suppliers and the clinicians who can order DME.',
    reports: [],
    facilityTypes: ['dme'],
    competitorSettings: [],
    referralSetting: 'dme',
    callSheetKinds: ['dme', 'clinician'],
    marketColumns: ['benes', 'ma_penetration', 'pop_65_plus', 'living_alone_65_plus'],
    countyTabs: ['market', 'referrals'],
    pacSettings: [],
    residential: false,
  },
};

export function lineProfile(id) {
  return LINES[id] || null;
}

export function lineLabel(id) {
  return BUSINESS_LINES.find((l) => l.id === id)?.label || 'All lines';
}
