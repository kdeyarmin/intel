// Team marketing report — the practice manager's view over the CRM module.
//
// THE RULES (the full semantics live in DESIGN.md):
// 1. ATTRIBUTION IS BY ROW user_id, NEVER BY CLAIM. An activity or referral
//    counts for the marketer whose user_id is on that row, whether or not the
//    account is claimed. Reports run identically for claimed and unclaimed
//    accounts.
// 2. CLAIMS ONLY DEFINE BOOK-OF-BUSINESS MEMBERSHIP: which accounts sit on
//    whose book. They never move credit for work already logged.
// 3. A REFERRAL IS AN ADMISSION ONLY WHEN outcome === 'admitted' — the patient
//    is taken under care (admitted_on set). Open referrals are never admissions.
// 4. Rows with user_id NULL were logged before attribution existed. They are
//    still counted in every total and shown as the "Previously logged" bucket.

import { shiftMonth, thisMonth, monthLabel } from './marketingReport';

export { shiftMonth, thisMonth, monthLabel };

const CALL_KINDS = new Set(['visit', 'call']);

function inMonth(date, ym) {
  return typeof date === 'string' && date.slice(0, 7) === ym;
}

function isCall(activity) {
  return CALL_KINDS.has(activity?.kind);
}

function todayStr(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function daysAgo(n, now) {
  const d = new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  return todayStr(d);
}

/** Display name for a marketer id. Unknown ids are former marketers or rows
 *  from before the roster was available; null is the legacy bucket. */
export function userLabel(users, id) {
  if (id == null) return 'Previously logged';
  const u = (users || []).find((x) => Number(x.id) === Number(id));
  if (!u) return 'Former marketer';
  return u.full_name || u.email || `Marketer #${id}`;
}

export function userInitials(label) {
  const parts = String(label || '').split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function numId(v) {
  return v == null ? null : Number(v);
}

/**
 * Build the team report for one month.
 *
 * @param {Object} args
 * @param {Array} args.accounts crm_accounts rows (snake_case)
 * @param {Array} args.activities crm_activities rows
 * @param {Array} args.referrals crm_referrals rows
 * @param {Array} args.users roster rows: { id, full_name, email }
 * @param {string} args.month 'YYYY-MM'
 * @param {Date} [args.now] injectable clock (tests)
 */
export function buildTeamReport({ accounts = [], activities = [], referrals = [], users = [], month, now = new Date() }) {
  const today = todayStr(now);
  const staleBefore = daysAgo(7, now);

  const calls = activities.filter(isCall);
  const doneInMonth = (uid) => calls.filter((a) => numId(a.user_id) === uid && a.done && inMonth(a.activity_date, month));
  // Overdue/upcoming are month-scoped like completed calls, so the monthly
  // completion rate only counts calls that belonged to the selected month.
  const overdueFor = (uid) => calls.filter((a) => numId(a.user_id) === uid && !a.done && a.activity_date < today && inMonth(a.activity_date, month));
  const upcomingFor = (uid) => calls.filter((a) => numId(a.user_id) === uid && !a.done && a.activity_date >= today && inMonth(a.activity_date, month));

  const refsInMonth = (uid) => referrals.filter((r) => numId(r.user_id) === uid && inMonth(r.received_on, month));
  const admittedInMonth = (uid) => referrals.filter((r) => numId(r.user_id) === uid && r.outcome === 'admitted' && inMonth(r.admitted_on || r.received_on, month));
  const openFor = (uid) => referrals.filter((r) => numId(r.user_id) === uid && r.outcome === 'open');

  // The roster is the known users plus anyone the data mentions (a claim or a
  // row by someone no longer on the roster). Everyone's work is counted.
  const knownIds = new Set((users || []).map((u) => Number(u.id)));
  const seenIds = new Set();
  for (const a of activities) if (a.user_id != null) seenIds.add(Number(a.user_id));
  for (const r of referrals) if (r.user_id != null) seenIds.add(Number(r.user_id));
  for (const a of accounts) if (a.claimed_by_user_id != null) seenIds.add(Number(a.claimed_by_user_id));
  const marketerIds = [...new Set([...knownIds, ...seenIds])].sort((x, y) => x - y);

  const marketers = marketerIds.map((id) => {
    const done = doneInMonth(id).length;
    const overdue = overdueFor(id).length;
    const upcoming = upcomingFor(id).length;
    const received = refsInMonth(id);
    const admitted = admittedInMonth(id).length;
    const converted = received.filter((r) => r.outcome === 'admitted').length;
    const open = openFor(id);
    const book = accounts
      .filter((a) => numId(a.claimed_by_user_id) === id)
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return {
      id,
      label: userLabel(users, id),
      onRoster: knownIds.has(id),
      book,
      bookSize: book.length,
      callsDone: done,
      callsOverdue: overdue,
      callsUpcoming: upcoming,
      // Of the calls that should have happened by now, how many are logged
      // done. Null when there is nothing to complete yet.
      completionPct: done + overdue > 0 ? done / (done + overdue) : null,
      referralsReceived: received.length,
      admitted,
      lost: received.filter((r) => r.outcome === 'lost').length,
      openReferrals: open.length,
      staleOpenReferrals: open.filter((r) => r.received_on < staleBefore).length,
      // Only referrals received this month that were admitted, so an older
      // referral admitted now cannot push the ratio over 100%.
      conversionPct: received.length ? converted / received.length : null,
    };
  });

  const unclaimedAccounts = accounts
    .filter((a) => a.claimed_by_user_id == null)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  // Per-account figures for the book view. Referrals/admissions follow the
  // selected month; last activity is all-time. Indexed by account_id in
  // single passes so report construction stays linear in row count.
  const actsByAccount = new Map();
  for (const x of activities) {
    const k = x.account_id;
    if (!actsByAccount.has(k)) actsByAccount.set(k, []);
    actsByAccount.get(k).push(x);
  }
  const refsByAccount = new Map();
  for (const x of referrals) {
    const k = x.account_id;
    if (!refsByAccount.has(k)) refsByAccount.set(k, []);
    refsByAccount.get(k).push(x);
  }
  const accountStats = {};
  for (const a of accounts) {
    const acts = actsByAccount.get(a.id) || [];
    const refs = refsByAccount.get(a.id) || [];
    const dates = acts.map((x) => x.activity_date).filter(Boolean).sort();
    accountStats[a.id] = {
      lastActivity: dates.length ? dates[dates.length - 1] : null,
      referrals: refs.filter((r) => inMonth(r.received_on, month)).length,
      admissions: refs.filter((r) => r.outcome === 'admitted' && inMonth(r.admitted_on || r.received_on, month)).length,
      openReferrals: refs.filter((r) => r.outcome === 'open').length,
    };
  }

  // Rows from before attribution existed: still counted in every team total.
  const legacy = {
    activities: activities.filter((a) => a.user_id == null).length,
    referrals: referrals.filter((r) => r.user_id == null).length,
  };

  const teamReceived = referrals.filter((r) => inMonth(r.received_on, month));
  const teamConverted = teamReceived.filter((r) => r.outcome === 'admitted').length;
  const completions = marketers.map((m) => m.completionPct).filter((p) => p != null);
  const unclaimedActive = unclaimedAccounts.filter((a) =>
    activities.some((x) => x.account_id === a.id && inMonth(x.activity_date, month)),
  );

  return {
    month,
    marketers,
    unclaimedAccounts,
    accountStats,
    legacy,
    totals: {
      referrals: teamReceived.length,
      admissions: referrals.filter((r) => r.outcome === 'admitted' && inMonth(r.admitted_on || r.received_on, month)).length,
      conversionPct: teamReceived.length ? teamConverted / teamReceived.length : null,
      avgCompletionPct: completions.length ? completions.reduce((s, p) => s + p, 0) / completions.length : null,
      callsDone: calls.filter((a) => a.done && inMonth(a.activity_date, month)).length,
      staleOpenReferrals: referrals.filter((r) => r.outcome === 'open' && r.received_on < staleBefore).length,
    },
    alerts: {
      belowTarget: marketers.filter((m) => m.completionPct != null && m.completionPct < 0.6),
      unclaimedActive,
    },
  };
}

/** Week (Mon-Sun) buckets of a marketer's calls for the calendar view. */
export function weekBuckets(activities, users, weekStart) {
  const start = new Date(`${weekStart}T00:00:00`);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    return todayStr(d);
  });
  const calls = activities.filter(isCall);
  return days.map((date) => ({
    date,
    items: calls
      .filter((a) => a.activity_date === date)
      .map((a) => ({
        id: a.id,
        account_id: a.account_id,
        kind: a.kind,
        done: !!a.done,
        note: a.note,
        user_id: numId(a.user_id),
        marketer: userLabel(users, numId(a.user_id)),
      }))
      .sort((a, b) => String(a.marketer).localeCompare(String(b.marketer))),
  }));
}

/** Monday of the week containing `dateStr` (YYYY-MM-DD). */
export function mondayOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  return todayStr(new Date(d.getTime() - dow * 24 * 60 * 60 * 1000));
}
