import { describe, expect, it } from 'vitest';
import { describeReferrals, describeSnapshot, eligibilityLabels, latestReferralSnapshot, referralTotalsByYear } from '../src/lib/referralSummary';

const rows = [
  { npi: '1', referred_to_npi: '2', total_referrals: 10, total_beneficiaries: 6, data_year: '2015' },
  { npi: '1', referred_to_npi: '3', total_referrals: 5, total_beneficiaries: 4, data_year: '2015' },
  { npi: '1', referred_to_npi: '2', total_referrals: 7, total_beneficiaries: 5, data_year: '2014' },
  { npi: '1', referred_to_npi: null, total_referrals: null, total_beneficiaries: null, data_year: '2015' },
  { npi: '1', referred_to_npi: '9', total_referrals: 1, total_beneficiaries: 1, data_year: null },
];

describe('referralTotalsByYear', () => {
  it('sums shared patients and counts distinct partners per data year, oldest first', () => {
    expect(referralTotalsByYear(rows)).toEqual([
      { year: '2014', total_referrals: 7, total_beneficiaries: 5, partners: 1 },
      { year: '2015', total_referrals: 15, total_beneficiaries: 10, partners: 2 },
    ]);
  });

  it('accepts a legacy `year` field and returns nothing for no rows', () => {
    expect(referralTotalsByYear([{ year: 2016, total_referrals: 3 }])).toEqual([{ year: '2016', total_referrals: 3, total_beneficiaries: 0, partners: 0 }]);
    expect(referralTotalsByYear([])).toEqual([]);
    expect(referralTotalsByYear(undefined)).toEqual([]);
  });
});

describe('latestReferralSnapshot', () => {
  it('is the latest year or null', () => {
    expect(latestReferralSnapshot(rows)).toMatchObject({ year: '2015', total_referrals: 15, partners: 2 });
    expect(latestReferralSnapshot([])).toBeNull();
  });
});

describe('eligibility', () => {
  it('lists only the services flagged true', () => {
    expect(eligibilityLabels({ hha: true, hospice: true, dme: false, partb: null, pmd: true })).toEqual(['Home Health', 'Hospice', 'Power Mobility']);
    expect(eligibilityLabels(null)).toEqual([]);
  });
});

describe('describeSnapshot', () => {
  it('states the partner count once, from the snapshot, instead of rebuilding pair rows (which said 0 partners)', () => {
    const snapshot = latestReferralSnapshot(rows);
    const text = describeSnapshot(snapshot, null);
    expect(text).toContain('15 shared-patient encounters with 2 partner providers');
    expect(text).not.toMatch(/with 0 partner/);
    // Same sentence as describing the rows themselves.
    expect(text).toBe(describeReferrals(rows, null));
  });

  it('copes with a snapshot that lacks a number and never invents one', () => {
    expect(describeSnapshot({ year: '2015', total_referrals: 3 }, null)).toContain('3 shared-patient encounters with 0 partner providers');
    expect(describeSnapshot(null, null)).toBe('No shared-patient data on file.');
  });
});

describe('describeReferrals', () => {
  it('describes shared patients as patterns and names the eligible services', () => {
    expect(describeReferrals(rows, { hha: true, hospice: false, as_of: '2026-10-03' })).toBe(
      'Shared Medicare patients (CMS shared-patient patterns, not confirmed referrals; data year 2015): 15 shared-patient encounters with 2 partner providers. Eligible to order or refer Medicare: Home Health (as of 2026-10-03).',
    );
  });

  it('never invents numbers', () => {
    expect(describeReferrals([], null)).toBe('No shared-patient data on file.');
    expect(describeReferrals([], { hha: false })).toBe('No shared-patient data on file. Not listed as eligible to order or refer any Medicare service.');
  });
});
