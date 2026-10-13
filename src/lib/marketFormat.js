// Formatting for the market views (tested in node). CMS publishes some
// figures as fractions (0.62), some in percent units (11.05) and some as
// counts or dollars; the server says which with a `format`.

export const fmtCount = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? '—' : Math.round(Number(v)).toLocaleString());

/** Years should never have thousands separators. */
export const fmtYear = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? '—' : String(Math.round(Number(v))));

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
    case 'year': return fmtYear(value);
    default: return fmtCount(value);
  }
}
