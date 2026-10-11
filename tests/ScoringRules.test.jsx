// @vitest-environment jsdom
/**
 * Scoring Rules edits weights only. Each signal's cutoffs are fixed in the
 * score calculation, so a threshold field saved a value that changed nothing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const { base44 } = vi.hoisted(() => ({
  base44: {
    auth: { me: async () => ({ email: 'admin@example.com', role: 'admin' }) },
    entities: {
      ScoringRule: {
        list: async () => [{
          id: 3, name: 'Patient Volume', rule_type: 'patient_volume', weight: 20,
          description: 'Estimated Medicare beneficiary count', enabled: true, conditions: { threshold: 250 },
        }],
        update: null,
      },
    },
  },
}));
vi.mock('@/api/base44Client', () => ({ base44 }));
vi.mock('../src/components/shared/PageHeader', () => ({ default: () => null }));

import ScoringRules from '../src/pages/ScoringRules';

describe('Scoring Rules', () => {
  it('edits and saves the weight alone, with no threshold field', async () => {
    base44.entities.ScoringRule.update = vi.fn(async (id, data) => ({ id, ...data }));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <ScoringRules />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.queryByRole('columnheader', { name: 'Threshold' })).not.toBeInTheDocument();
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs).toHaveLength(1);

    fireEvent.change(inputs[0], { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(base44.entities.ScoringRule.update).toHaveBeenCalledWith(3, { weight: 25 }));
  });
});
