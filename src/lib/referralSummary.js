// Summaries of a provider's cms_referrals rows (CMS shared-patient pairs:
// npi → referred_to_npi with total_referrals / total_beneficiaries per
// data_year) and of its Order & Referring eligibility. Shared-patient counts
// are patterns, not confirmed referrals, and the UI says so.

export const referralYear = (r) => r?.data_year ?? r?.year ?? null;

/** Per data year: shared-patient total, beneficiaries and distinct partners, oldest first. */
export function referralTotalsByYear(referrals = []) {
  const byYear = new Map();
  for (const r of referrals || []) {
    const year = referralYear(r);
    if (year == null || year === '') continue;
    const key = String(year);
    const e = byYear.get(key) || { year: key, total_referrals: 0, total_beneficiaries: 0, partners: new Set() };
    e.total_referrals += Number(r.total_referrals) || 0;
    e.total_beneficiaries += Number(r.total_beneficiaries) || 0;
    if (r.referred_to_npi) e.partners.add(r.referred_to_npi);
    byYear.set(key, e);
  }
  return [...byYear.values()]
    .sort((a, b) => (Number(a.year) || 0) - (Number(b.year) || 0))
    .map((e) => ({ ...e, partners: e.partners.size }));
}

/** The latest year's totals, or null when there is no shared-patient data. */
export function latestReferralSnapshot(referrals = []) {
  const years = referralTotalsByYear(referrals);
  return years.length ? years[years.length - 1] : null;
}

export const ELIGIBILITY_FLAGS = [
  { key: 'hha', label: 'Home Health' },
  { key: 'hospice', label: 'Hospice' },
  { key: 'dme', label: 'DME' },
  { key: 'partb', label: 'Part B' },
  { key: 'pmd', label: 'Power Mobility' },
];

/** Labels of the Medicare services a provider may order or refer (from cms_order_referring). */
export function eligibilityLabels(orderReferring) {
  if (!orderReferring) return [];
  return ELIGIBILITY_FLAGS.filter((f) => orderReferring[f.key] === true).map((f) => f.label);
}

/** One or two plain sentences for AI prompts; never invents a number. */
export function describeReferrals(referrals = [], orderReferring = null) {
  return describeSnapshot(latestReferralSnapshot(referrals), orderReferring);
}

/**
 * The same sentences from an already-aggregated snapshot
 * ({ year, total_referrals, partners }, as latestReferralSnapshot returns), so a
 * caller that holds the snapshot doesn't have to rebuild pair rows (which loses
 * the partner count).
 */
export function describeSnapshot(latest, orderReferring = null) {
  const parts = [];
  if (latest) {
    parts.push(`Shared Medicare patients (CMS shared-patient patterns, not confirmed referrals; data year ${latest.year}): ${(Number(latest.total_referrals) || 0).toLocaleString()} shared-patient encounters with ${(Number(latest.partners) || 0).toLocaleString()} partner providers.`);
  } else {
    parts.push('No shared-patient data on file.');
  }
  if (orderReferring) {
    const labels = eligibilityLabels(orderReferring);
    parts.push(labels.length
      ? `Eligible to order or refer Medicare: ${labels.join(', ')}${orderReferring.as_of ? ` (as of ${String(orderReferring.as_of).slice(0, 10)})` : ''}.`
      : 'Not listed as eligible to order or refer any Medicare service.');
  }
  return parts.join(' ');
}
