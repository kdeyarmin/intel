// ProviderServiceUtilization rows are per-HCPCS-code slices, not provider
// totals. Reading a single row (e.g. the first of the latest year) for a KPI
// or "latest" snapshot reports one billing code's numbers as the provider's.
// Any provider-level number must sum every row from the relevant data year.

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** The data year of a utilization row as a number, or null when unparseable. */
export function utilizationRowYear(r) {
  const y = num(r?.year ?? r?.data_year);
  return y > 0 ? y : null;
}

/** Distinct data years present in the rows, ascending. */
export function utilizationYears(utilizations = []) {
  return [...new Set((utilizations || []).map(utilizationRowYear).filter((y) => y != null))].sort((a, b) => a - b);
}

/**
 * Provider totals for one data year: the sum across every HCPCS row.
 * Fields absent from the rows sum as 0.
 */
export function sumUtilizationYear(utilizations = [], year) {
  const rows = (utilizations || []).filter((r) => utilizationRowYear(r) === year);
  const sum = (k) => rows.reduce((t, r) => t + num(r[k]), 0);
  return {
    year,
    // total_unique_benes is unique only inside one HCPCS row. Summing it is
    // not a provider-level unique count, so it is not exposed as one.
    total_medicare_beneficiaries: null,
    code_level_beneficiaries: sum('total_medicare_beneficiaries'),
    total_services: sum('total_services'),
    total_medicare_payment: sum('total_medicare_payment'),
    total_submitted_charges: sum('total_submitted_charges'),
    drug_services: sum('drug_services'),
    row_count: rows.length,
  };
}

/** Aggregated provider totals for the latest data year, or null when no rows. */
export function latestUtilizationTotals(utilizations = []) {
  const years = utilizationYears(utilizations);
  if (!years.length) return null;
  return sumUtilizationYear(utilizations, years[years.length - 1]);
}
