// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import RuleResultsTable from '../src/components/dataQuality/RuleResultsTable';

afterEach(cleanup);

describe('RuleResultsTable', () => {
  it('preserves its default pass-rate order and sorts rows from column headers', () => {
    render(
      <RuleResultsTable
        results={[
          { rule_id: 1, rule_name: 'Alpha rule', category: 'accuracy', pct: 90, failing: 1 },
          { rule_id: 2, rule_name: 'Zulu rule', category: 'completeness', pct: 25, failing: 7 },
        ]}
      />,
    );

    const rowNames = () => screen.getAllByRole('row').slice(1).map((row) => row.textContent);
    expect(rowNames()[0]).toContain('Zulu rule');

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Rule' }));
    expect(rowNames()[0]).toContain('Zulu rule');
    expect(screen.getByRole('columnheader', { name: /Rule/ })).toHaveAttribute('aria-sort', 'descending');

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Rule; currently desc' }));

    expect(rowNames()[0]).toContain('Alpha rule');
    expect(screen.getByRole('columnheader', { name: /Rule/ })).toHaveAttribute('aria-sort', 'ascending');
  });
});
