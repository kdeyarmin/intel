export const CONTACT_ROLES = [
  { id: 'administrator', label: 'Administrator' },
  { id: 'don', label: 'Director of nursing' },
  { id: 'business_office', label: 'Business office' },
  { id: 'social_services', label: 'Social services' },
  { id: 'admissions', label: 'Admissions' },
  { id: 'discharge_planner', label: 'Discharge planner' },
  { id: 'other', label: 'Other' },
];

export const ACCOUNT_TYPES = [
  { id: 'hospital', label: 'Hospital' },
  { id: 'snf', label: 'Nursing home' },
  { id: 'licensed', label: 'Personal care home' },
  { id: 'hha', label: 'Home health' },
  { id: 'hospice', label: 'Hospice' },
  { id: 'clinician', label: 'Physician or clinician' },
  { id: 'other', label: 'Other' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function roleLabel(id) {
  return CONTACT_ROLES.find((r) => r.id === id)?.label || id;
}

export function accountTypeLabel(id) {
  return ACCOUNT_TYPES.find((t) => t.id === id)?.label || id;
}

export function thisMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function shiftMonth(ym, delta) {
  const [y, m] = String(ym).split('-').map(Number);
  const d = new Date(Date.UTC(y, (m || 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(ym) {
  const n = Number(String(ym).slice(5, 7));
  return MONTHS[n - 1] || ym;
}

export function accountKey(type, name, city) {
  const slug = `${type}|${name}|${city || ''}`.toLowerCase().replace(/[^a-z0-9|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `manual:${slug}`.slice(0, 64);
}

function inMonth(date, ym) {
  return typeof date === 'string' && date.slice(0, 7) === ym;
}

function isCall(activity) {
  return activity.kind === 'visit' || activity.kind === 'call';
}

/** Month-end figures for one book of accounts. Admissions count in the month they were admitted. */
export function buildMarketingReport({ accounts = [], activities = [], referrals = [], month }) {
  const prev = shiftMonth(month, -1);
  const months = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
  const callsOf = (ym) => activities.filter((a) => isCall(a) && a.done && inMonth(a.activity_date, ym));
  const refsOf = (ym) => referrals.filter((r) => inMonth(r.received_on, ym));
  const admitsOf = (ym) => referrals.filter((r) => r.outcome === 'admitted' && inMonth(r.admitted_on || r.received_on, ym));
  const calls = callsOf(month).length;
  const refsReceived = refsOf(month);
  const refs = refsReceived.length;
  const admits = admitsOf(month).length;
  // Admissions are whoever was admitted this month. Conversion is only the
  // referrals that arrived this month and were admitted, so an older referral
  // admitted now cannot push the ratio over 100%.
  const converted = refsReceived.filter((r) => r.outcome === 'admitted').length;
  const rows = accounts.map((account) => {
    const callsNow = activities.filter((a) => a.account_id === account.id && isCall(a) && a.done && inMonth(a.activity_date, month)).length;
    const refsNow = referrals.filter((r) => r.account_id === account.id && inMonth(r.received_on, month)).length;
    const refsPrev = referrals.filter((r) => r.account_id === account.id && inMonth(r.received_on, prev)).length;
    const admitsNow = referrals.filter((r) => r.account_id === account.id && r.outcome === 'admitted' && inMonth(r.admitted_on || r.received_on, month)).length;
    const upcoming = activities
      .filter((a) => a.account_id === account.id && !a.done && a.activity_date >= `${month}-01`)
      .map((a) => a.activity_date)
      .sort();
    return {
      id: account.id,
      name: account.name,
      account_type: account.account_type,
      city: account.city || '',
      calls: callsNow,
      referrals: refsNow,
      previous: refsPrev,
      change: refsNow - refsPrev,
      admissions: admitsNow,
      next: upcoming[0] || null,
    };
  });
  const byReferrals = (list) => [...list].sort((a, b) => b.referrals - a.referrals || a.name.localeCompare(b.name));
  return {
    month,
    previous: prev,
    calls,
    referrals: refs,
    admissions: admits,
    callsPerReferral: refs ? Math.round((calls / refs) * 10) / 10 : null,
    conversion: refs ? converted / refs : null,
    trend: months.map((ym) => ({ month: ym, calls: callsOf(ym).length, referrals: refsOf(ym).length, admissions: admitsOf(ym).length })),
    more: rows.filter((a) => a.change > 0).sort((a, b) => b.change - a.change || b.referrals - a.referrals),
    less: rows.filter((a) => a.change < 0).sort((a, b) => a.change - b.change),
    quiet: rows.filter((a) => a.calls > 0 && a.referrals === 0).sort((a, b) => b.calls - a.calls),
    schedule: rows
      .filter((a) => a.change < 0 || (a.previous > 0 && a.calls === 0) || (a.referrals > 0 && !a.next))
      .sort((a, b) => a.change - b.change || b.referrals - a.referrals),
    accounts: byReferrals(rows),
  };
}
