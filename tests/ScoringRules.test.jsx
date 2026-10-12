// @vitest-environment jsdom
/**
 * Scoring Rules edits weights (and, for two rules, Conditions) and starts
 * the server-side scoring job. Each signal's cutoffs are fixed in the server
 * calculation, so there is no threshold field.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const { base44, state } = vi.hoisted(() => {
  const state = {
    rules: [
      { id: 3, name: 'Patient Volume', rule_type: 'patient_volume', weight: 20, description: 'Estimated Medicare beneficiary count', enabled: true, conditions: { threshold: 250 } },
      { id: 5, name: 'Geographic Priority', rule_type: 'geographic_priority', weight: 10, description: 'Target states', enabled: true, conditions: { states: ['PA'], counties: [] } },
    ],
    invocations: [],
  };
  const base44 = {
    auth: { me: async () => ({ email: 'admin@example.com', role: 'admin' }) },
    entities: { ScoringRule: { update: null } },
    functions: {
      invoke: async (name, payload) => {
        state.invocations.push([name, payload]);
        if (name === 'getLeadScoringStatus') {
          return { data: { rules: state.rules, territory: { states: ['PA'], counties: [] }, total_weight: 30, job: { running: false, status: 'success', last_success_at: '2026-10-10T12:00:00Z', scored: 1200, candidates: 1500, scored_total: 1200 } } };
        }
        if (name === 'recalculateLeadScores') return { data: { success: true, started: true, territory: { states: ['PA'], counties: [] } } };
        throw new Error(`unexpected ${name}`);
      },
    },
  };
  return { base44, state };
});
vi.mock('@/api/base44Client', () => ({ base44 }));
vi.mock('../src/components/shared/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => async () => true }));

import ScoringRules from '../src/pages/ScoringRules';

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ScoringRules />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Scoring Rules with conditions stored as text', () => {
  it('shows and edits a rule whose list was saved as comma-separated text instead of crashing', async () => {
    const saved = state.rules;
    state.rules = [
      { id: 5, name: 'Geographic Priority', rule_type: 'geographic_priority', weight: 10, description: 'Target states', enabled: true, conditions: { states: 'PA, oh', counties: null } },
    ];
    base44.entities.ScoringRule.update = vi.fn(async (id, data) => ({ id, ...data }));
    try {
      renderPage();
      expect(await screen.findByText(/PA, oh/)).toBeInTheDocument();
      expect(screen.getByText('none')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      expect(screen.getByDisplayValue('PA, oh')).toBeInTheDocument();
    } finally {
      state.rules = saved;
    }
  });
});

describe('Scoring Rules', () => {
  it('edits and saves the weight alone, with no threshold field', async () => {
    base44.entities.ScoringRule.update = vi.fn(async (id, data) => ({ id, ...data }));
    renderPage();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[0]);
    expect(screen.queryByRole('columnheader', { name: 'Threshold' })).not.toBeInTheDocument();
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs).toHaveLength(1);

    fireEvent.change(inputs[0], { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(base44.entities.ScoringRule.update).toHaveBeenCalledWith(3, { weight: 25 }));
  });

  it('edits the scored states and priority counties of the geographic rule', async () => {
    base44.entities.ScoringRule.update = vi.fn(async (id, data) => ({ id, ...data }));
    renderPage();

    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit' }))[1]);
    const states = screen.getByRole('textbox', { name: /States for Geographic Priority/i });
    const counties = screen.getByRole('textbox', { name: /Priority counties for Geographic Priority/i });
    fireEvent.change(states, { target: { value: 'pa, oh' } });
    fireEvent.change(counties, { target: { value: '42003 42019' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(base44.entities.ScoringRule.update).toHaveBeenCalledWith(5, { weight: 10, conditions: { states: ['PA', 'OH'], counties: ['42003', '42019'] } }));
  });

  it('shows the last run and starts the server-side job', async () => {
    renderPage();
    expect(await screen.findByText(/1,200 of 1,500 candidates scored/)).toBeInTheDocument();
    expect(screen.getByText(/Scored states:/)).toHaveTextContent('PA');
    state.invocations.length = 0;
    fireEvent.click(screen.getByRole('button', { name: /recalculate scores/i }));
    await waitFor(() => expect(state.invocations.map(([n]) => n)).toContain('recalculateLeadScores'));
  });
});
