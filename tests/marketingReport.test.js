import { describe, expect, it } from 'vitest';
import { accountKey, buildMarketingReport, shiftMonth } from '../src/lib/marketingReport.js';

const accounts = [
  { id: 1, name: 'Memorial', account_type: 'hospital', city: 'Johnstown' },
  { id: 2, name: 'Quiet Manor', account_type: 'snf', city: 'Windber' },
];

describe('marketing month end', () => {
  it('counts calls, referrals and admissions, and ranks who sent more or less', () => {
    const report = buildMarketingReport({
      accounts,
      activities: [
        { account_id: 1, kind: 'visit', activity_date: '2026-10-02', done: true },
        { account_id: 1, kind: 'call', activity_date: '2026-10-03', done: true },
        { account_id: 1, kind: 'note', activity_date: '2026-10-04', done: true },
        { account_id: 1, kind: 'visit', activity_date: '2026-10-20', done: false },
        { account_id: 2, kind: 'call', activity_date: '2026-10-05', done: true },
      ],
      referrals: [
        { account_id: 1, received_on: '2026-09-12', outcome: 'admitted', admitted_on: '2026-09-20' },
        { account_id: 1, received_on: '2026-10-06', outcome: 'admitted', admitted_on: '2026-10-08' },
        { account_id: 1, received_on: '2026-10-07', outcome: 'open' },
      ],
      month: '2026-10',
    });
    expect(report.calls).toBe(3);
    expect(report.referrals).toBe(2);
    expect(report.admissions).toBe(1);
    expect(report.callsPerReferral).toBe(1.5);
    expect(report.conversion).toBe(0.5);
    expect(report.more.map((a) => a.name)).toEqual(['Memorial']);
    expect(report.more[0].change).toBe(1);
    expect(report.quiet.map((a) => a.name)).toEqual(['Quiet Manor']);
    expect(report.accounts[0].next).toBe('2026-10-20');
    expect(report.trend).toHaveLength(6);
    expect(report.trend.at(-1)).toMatchObject({ month: '2026-10', calls: 3, referrals: 2, admissions: 1 });
  });

  it('rolls the month across a year and keys an account by name', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(accountKey('snf', 'Quiet Manor', 'Windber')).toBe('manual:snf|quiet manor|windber');
  });
});
