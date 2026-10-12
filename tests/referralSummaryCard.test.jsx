// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ReferralSummaryCard from '../src/components/providers/ReferralSummaryCard';

const pairs = [
  { npi: '1', referred_to_npi: '2', data_year: 2015, total_referrals: 100, total_beneficiaries: 40 },
  { npi: '1', referred_to_npi: '3', data_year: 2015, total_referrals: 60, total_beneficiaries: 30 },
];

describe('ReferralSummaryCard', () => {
  it('says the beneficiary figure is summed across partners, not a distinct count', () => {
    // A beneficiary shared with two partners is counted in both rows, so 70 is not "70 people".
    render(<ReferralSummaryCard referrals={pairs} />);
    expect(screen.getByText('70')).toBeTruthy();
    expect(screen.getByText('beneficiaries, summed across partners')).toBeTruthy();
    expect(screen.queryByText('beneficiaries')).toBeNull();
  });
});
