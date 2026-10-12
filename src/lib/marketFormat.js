// Formatting for the market views (tested in node). CMS publishes some
// figures as fractions (0.62), some in percent units (11.05) and some as
// counts or dollars; the server says which with a `format`.

export const fmtCount = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? '—' : Math.round(Number(v)).toLocaleString());

/** A fraction (0.31) as a percentage ("31%"). */
export const fmtShare = (v, digits = 0) => (v == null || Number.isNaN(Number(v)) ? '—' : `${(Number(v) * 100).toFixed(digits)}%`);

/** A value already in percent units (11.05) as "11.1%". */
export const fmtPct = (v, digits = 1) => (v == null || Number.isNaN(Number(v)) ? '—' : `${Number(v).toFixed(digits)}%`);

export const fmtRate = (v, digits = 1) => (v == null || Number.isNaN(Number(v)) ? '—' : Number(v).toFixed(digits));

export function fmtMoney(v) {
  if (v == null || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

/** Formats a value by the server's format name (count, percent = fraction, pct_units, money, rate). */
export function formatMetric(value, format) {
  switch (format) {
    case 'percent': return fmtShare(value, 1);
    case 'pct_units': return fmtPct(value, 1);
    case 'money': return fmtMoney(value);
    case 'rate': return fmtRate(value, 1);
    default: return fmtCount(value);
  }
}

/** The CSV header for a county metric: its label, with the unit when the value is exported in one ("%" for shares, "$" for dollars). */
export function csvHeader(metric) {
  const label = metric.label.replace(/\s*\(%[^)]*\)\s*$/, '');
  if (metric.format === 'percent' || metric.format === 'pct_units') return `${label} (%)`;
  if (metric.format === 'money') return `${label} ($)`;
  return label;
}

/** A metric value as exported: shares are percent numbers (0.62 → 62), dollars and counts stay numbers, missing stays empty. */
export function csvValue(value, format) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '';
  const n = Number(value);
  return format === 'percent' ? Math.round(n * 1e6) / 1e4 : n;
}

/** "1st", "2nd", "3rd", "11th"… */
export function ordinal(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const i = Math.round(Number(n));
  const mod100 = i % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${i}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[i % 10] || 'th';
  return `${i}${suffix}`;
}

/** A compact CSV (RFC 4180 quoting) for downloads. */
export function toCsv(columns, rows) {
  const cell = (v) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => cell(c.label ?? c.key)).join(','), ...rows.map((r) => columns.map((c) => cell(typeof c.value === 'function' ? c.value(r) : r[c.key])).join(','))].join('\n') + '\n';
}

/** Sorts rows by a key, nulls last, numbers numerically and strings alphabetically. */
export function sortRows(rows, key, dir = 'desc', pick = (r, k) => r[k]) {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = pick(a, key);
    const vb = pick(b, key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return sign * (va - vb);
    return sign * String(va).localeCompare(String(vb));
  });
}

const PAC_SETTING_NAMES = { snf: 'skilled nursing', hha: 'home health', hospice: 'hospice' };

/** The post-acute utilization year, or each setting's own year when CMS has released them in different years. */
function pacVintage(vintages) {
  const by = vintages.pac_utilization_by_setting;
  const entries = by && typeof by === 'object' ? Object.entries(by).filter(([, year]) => year) : [];
  if (entries.length > 1 && new Set(entries.map(([, year]) => String(year))).size > 1) {
    return entries.map(([setting, year]) => `${PAC_SETTING_NAMES[setting] || setting} ${year}`).join(', ');
  }
  return vintages.pac_utilization ? String(vintages.pac_utilization).slice(0, 10) : null;
}

/** A vintage as one short token: a calendar-year range reads as the year, any other range as its start date. */
function vintageToken(value) {
  const text = String(value);
  const year = /^(\d{4})-01-01 to \1-12-31$/.exec(text);
  return year ? year[1] : text.replace(/ to .*$/, '').slice(0, 10);
}

/** One sentence naming the vintages a market view used ("Enrollment June 2026; Hospital Service Area 2025"). */
export function describeVintages(vintages) {
  if (!vintages || typeof vintages !== 'object') return null;
  const labels = {
    enrollment: 'Medicare enrollment', saturation: 'Market saturation', variation: 'Geographic variation',
    hospital_service_area: 'Hospital Service Area', pac_utilization: 'Post-acute utilization',
    acs: 'Census ACS', licensed: 'State licensing',
  };
  const parts = Object.entries(labels)
    .map(([k, label]) => [label, k === 'pac_utilization' ? pacVintage(vintages) : vintages[k] ? vintageToken(vintages[k]) : null])
    .filter(([, value]) => value)
    .map(([label, value]) => `${label} ${value}`);
  return parts.length ? `Data: ${parts.join('; ')}.` : null;
}

/**
 * What to tell the reader about a referral-source list that isn't the whole ranked list, or null
 * when it is. With a specialty only the top `searched` clinicians were looked at, so a short (or
 * empty) list can still leave matches further down.
 */
export function referralListNote({ rowCount = 0, truncated = false, searched = 0, specialty = false } = {}) {
  if (!truncated) return null;
  if (!specialty) return 'More clinicians are ranked below these; raise the limit to see them.';
  const top = `the top ${Number(searched || 0).toLocaleString('en-US')} ranked clinicians`;
  return rowCount === 0
    ? `None of ${top} here are in this specialty. Raise the limit to search further.`
    : `Searched ${top} for this specialty; raise the limit to search further.`;
}
