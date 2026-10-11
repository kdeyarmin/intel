// Mirror of LAYER_METRICS in server/functions/market.ts (a test keeps the
// keys, labels and formats identical): the county metrics the Territory map
// and the Market Intelligence table can show.
export const COUNTY_LAYER_METRICS = [
  { key: 'benes', label: 'Medicare beneficiaries', format: 'count' },
  { key: 'ma_penetration', label: 'Medicare Advantage share', format: 'percent' },
  { key: 'benes_85_plus', label: 'Beneficiaries aged 85+', format: 'count' },
  { key: 'dual', label: 'Dual-eligible beneficiaries', format: 'count' },
  { key: 'hha_users_pct', label: 'Home health use (% of FFS)', format: 'pct_units' },
  { key: 'hospice_users_pct', label: 'Hospice use (% of FFS)', format: 'pct_units' },
  { key: 'snf_users_pct', label: 'Skilled nursing use (% of FFS)', format: 'pct_units' },
  { key: 'hha_providers', label: 'Home health agencies', format: 'count' },
  { key: 'hospice_providers', label: 'Hospices', format: 'count' },
  { key: 'snf_providers', label: 'Skilled nursing facilities', format: 'count' },
  { key: 'std_per_capita_snf', label: 'SNF spend per beneficiary', format: 'money' },
  { key: 'std_per_capita_hha', label: 'Home health spend per beneficiary', format: 'money' },
  { key: 'std_per_capita_hospice', label: 'Hospice spend per beneficiary', format: 'money' },
  { key: 'readmission_rate', label: 'Hospital readmission rate', format: 'percent' },
  { key: 'er_visits_per_1000', label: 'ER visits per 1,000', format: 'rate' },
  { key: 'hospitals_serving', label: 'Hospitals serving residents', format: 'count' },
];

export const LAYER_BY_KEY = Object.fromEntries(COUNTY_LAYER_METRICS.map((m) => [m.key, m]));
