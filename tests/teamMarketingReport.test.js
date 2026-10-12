import { describe, expect, it } from 'vitest';
import {
  buildTeamReport,
  mondayOf,
  userInitials,
  userLabel,
  weekBuckets,
} from '../src/lib/teamMarketingReport.js';

const USERS = [
  { id: 1, full_name: 'Ava Marketer', email: 'ava@example.com' },
  { id: 2, full_name: 'Ben Marketer', email: 'ben@example.com' },
];

// Ava: 2 done calls in Oct, 1 overdue scheduled, 1 upcoming; 3 referrals
// received in Oct, 1 admitted, 1 open (stale), 1 lost. Claims account 10.
const ACCOUNTS = [
  { id: 10, name: 'St. Mary', account_type: 'hospital', city: 'York', claimed_by_user_id: 1, claimed_at: '2026-10-01T00:00:00' },
  { id: 11, name: 'Sunny SNF', account_type: 'snf', city: 'York', claimed_by_user_id: null, claimed_at: null },
];

const ACTIVITIES = [
  { id: 1, account_id: 10, user_id: 1, kind: 'visit', activity_date: '2026-10-02', done: true },
  { id: 2, account_id: 10, user_id: 1, kind: 'call', activity_date: '2026-10-03', done: true },
  { id: 3, account_id: 11, user_id: 1, kind: 'visit', activity_date: '2026-10-04', done: false }, // overdue
  { id: 4, account_id: 11, user_id: 1, kind: 'call', activity_date: '2026-10-20', done: false }, // upcoming
  { id: 5, account_id: 11, user_id: 2, kind: 'visit', activity_date: '2026-10-05', done: true },
  { id: 6, account_id: 11, user_id: null, kind: 'call', activity_date: '2026-10-06', done: true }, // legacy
  { id: 7, account_id: 11, user_id: 2, kind: 'note', activity_date: '2026-10-06', done: true }, // not a call
];

const REFERRALS = [
  { id: 1, account_id: 10, user_id: 1, received_on: '2026-10-02', outcome: 'admitted', admitted_on: '2026-10-04' },
  { id: 2, account_id: 11, user_id: 1, received_on: '2026-09-20', outcome: 'open', admitted_on: null }, // stale open
  { id: 3, account_id: 11, user_id: 1, received_on: '2026-10-07', outcome: 'lost', admitted_on: null },
  { id: 4, account_id: 11, user_id: null, received_on: '2026-10-08', outcome: 'open', admitted_on: null }, // legacy
];

const NOW = new Date('2026-10-12T12:00:00');

function report(extra = {}) {
  return buildTeamReport({
    accounts: ACCOUNTS, activities: ACTIVITIES, referrals: REFERRALS, users: USERS, month: '2026-10', now: NOW, ...extra,
  });
}

describe('buildTeamReport', () => {
  it('attributes work by row user_id, never by claim', () => {
    // Ava's calls are on account 11, which is UNCLAIMED — they still count for her.
    const r = report();
    const ava = r.marketers.find((m) => m.id === 1);
    expect(ava.callsDone).toBe(2);
    expect(ava.bookSize).toBe(1);
    expect(ava.book[0].id).toBe(10);
  });

  it('computes completion as done over done-plus-overdue', () => {
    const ava = report().marketers.find((m) => m.id === 1);
    expect(ava.callsOverdue).toBe(1);
    expect(ava.callsUpcoming).toBe(1);
    expect(ava.completionPct).toBeCloseTo(2 / 3, 5);
  });

  it('distinguishes referrals from admissions', () => {
    const r = report();
    const ava = r.marketers.find((m) => m.id === 1);
    // Two referrals received in October (the Sept one is stale-open, not received).
    expect(ava.referralsReceived).toBe(2);
    expect(ava.admitted).toBe(1);
    expect(ava.lost).toBe(1);
    expect(ava.openReferrals).toBe(1); // the stale September one
    expect(ava.staleOpenReferrals).toBe(1);
    // Conversion is only October-received referrals that were admitted.
    expect(ava.conversionPct).toBeCloseTo(1 / 2, 5);
    // Team totals include the legacy (user_id null) rows.
    expect(r.totals.referrals).toBe(3);
    expect(r.totals.admissions).toBe(1);
    expect(r.legacy).toEqual({ activities: 1, referrals: 1 });
  });

  it('counts an admission in the month it was admitted', () => {
    const r = report({
      referrals: [
        { id: 9, account_id: 10, user_id: 2, received_on: '2026-09-28', outcome: 'admitted', admitted_on: '2026-10-03' },
      ],
    });
    const ben = r.marketers.find((m) => m.id === 2);
    expect(ben.referralsReceived).toBe(0);
    expect(ben.admitted).toBe(1);
    expect(ben.conversionPct).toBeNull();
  });

  it('lists unclaimed accounts and flags unclaimed ones with activity', () => {
    const r = report();
    expect(r.unclaimedAccounts.map((a) => a.id)).toEqual([11]);
    expect(r.alerts.unclaimedActive.map((a) => a.id)).toEqual([11]);
  });

  it('flags marketers below 60% completion', () => {
    const r = report();
    expect(r.alerts.belowTarget.map((m) => m.id)).toEqual([]);
    const low = report({
      activities: [{ id: 9, account_id: 10, user_id: 2, kind: 'visit', activity_date: '2026-10-01', done: false }],
    });
    expect(low.alerts.belowTarget.map((m) => m.id)).toEqual([2]);
  });

  it('surfaces marketers found only in the data', () => {
    const r = report({ users: [] });
    expect(r.marketers.map((m) => m.id)).toEqual([1, 2]);
    expect(r.marketers[0].onRoster).toBe(false);
    expect(r.marketers[0].label).toBe('Former marketer');
  });
});

describe('labels', () => {
  it('labels the legacy bucket and unknown users', () => {
    expect(userLabel(USERS, null)).toBe('Previously logged');
    expect(userLabel(USERS, 1)).toBe('Ava Marketer');
    expect(userLabel(USERS, 99)).toBe('Former marketer');
    expect(userLabel([], 5)).toBe('Former marketer');
  });

  it('builds initials', () => {
    expect(userInitials('Ava Marketer')).toBe('AM');
    expect(userInitials('ava@example.com')).toBe('AE');
    expect(userInitials(null)).toBe('?');
  });
});

describe('calendar helpers', () => {
  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-10-12')).toBe('2026-10-12'); // a Monday
    expect(mondayOf('2026-10-14')).toBe('2026-10-12');
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
  });

  it('buckets calls by day with marketer labels', () => {
    const week = weekBuckets(ACTIVITIES, USERS, '2026-10-05');
    expect(week).toHaveLength(7);
    expect(week[0].date).toBe('2026-10-05');
    const tue = week.find((d) => d.date === '2026-10-06');
    expect(tue.items.map((i) => i.id).sort()).toEqual([6]); // notes are not calls
    expect(tue.items.find((i) => i.id === 6).marketer).toBe('Previously logged');
  });
});
