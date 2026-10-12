// @vitest-environment jsdom
// The score card names every row of a breakdown the server job stores: its rows are keyed by rule type.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ScoreBreakdown, { breakdownLabel } from '../src/components/providers/ScoreBreakdown';
import { DEFAULT_SCORING_RULES, normalizeRules, scoreProvider } from '../server/lib/leadScoring';

const result = scoreProvider({
  npi: '1234567893', specialtyGroup: 'family_medicine', specialtyLabel: 'Family Medicine', beneficiaries: 120, services: 900,
  utilizationYear: 2023, orderReferring: true, locations: [{ state: 'PA', county_fips: '42003' }], affiliations: 1, hasEmail: true, hasPhone: true,
}, normalizeRules(DEFAULT_SCORING_RULES));

afterEach(cleanup);

describe('ScoreBreakdown', () => {
  it('labels every row of a breakdown the scoring job stores, by the rule\'s name', () => {
    expect(Object.keys(result.breakdown)).toHaveLength(7);
    render(<ScoreBreakdown score={result.score} breakdown={result.breakdown} reasons={result.reasons} />);
    for (const rule of DEFAULT_SCORING_RULES) {
      expect(screen.getByText(rule.name), rule.rule_type).toBeInTheDocument();
    }
  });

  it('reads an unknown rule type as words rather than leaving the row unnamed', () => {
    expect(breakdownLabel('group_size')).toBe('Group Size');
    expect(breakdownLabel('hospital_affiliation_depth')).toBe('Hospital affiliation depth');
    render(<ScoreBreakdown breakdown={{ hospital_affiliation_depth: { value: 40, weight: 10, contribution: 4 } }} />);
    expect(screen.getByText('Hospital affiliation depth')).toBeInTheDocument();
  });

  it('shows a score of zero, which is a score, rather than hiding it', () => {
    render(<ScoreBreakdown score={0} breakdown={{ patient_volume: { value: 0, weight: 20, contribution: 0 } }} />);
    expect(screen.getByText('Out of 100')).toBeInTheDocument();
  });
});
