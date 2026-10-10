// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/api/functionResult', () => ({ invokeOrThrow: (...a) => invoke(...a), toastFunctionError: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { entities: { LeadList: { list: () => Promise.resolve([{ id: 4, name: 'Pittsburgh cardiology' }]) } } } }));
vi.mock('../src/components/compliance/DataSourcesFooter', () => ({ default: () => null }));

import HubAnalysisTable from '../src/components/referralNetwork/HubAnalysisTable';
import NodeDetailPanel from '../src/components/referralNetwork/NodeDetailPanel';
import ReferralNetworkIntelligence, { graphNote } from '../src/pages/ReferralNetworkIntelligence';

describe('network tables with missing fields', () => {
  it("HubAnalysisTable doesn't crash on providers without volumes or names", () => {
    render(
      <MemoryRouter>
        <HubAnalysisTable hubs={[{ npi: '1234567890' }, { npi: '2222222222', label: 'Mercy', outbound: 1500, hubScore: 91.6 }]} sortKey="hubScore" sortDir="desc" onSort={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText('1234567890', { selector: 'span.font-medium' })).toBeInTheDocument();
    expect(screen.getByText('1.5K')).toBeInTheDocument();
    expect(screen.getByText('92')).toBeInTheDocument();
  });

  it("NodeDetailPanel doesn't crash on a provider with no volumes", () => {
    const onFocus = vi.fn();
    render(
      <MemoryRouter>
        <NodeDetailPanel node={{ npi: '1234567890' }} edges={[{ source: '1234567890', target: '9', volume: undefined }]} nodes={[]} onClose={() => {}} onFocus={onFocus} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Sends to (1)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show all of this provider's partners/ }));
    expect(onFocus).toHaveBeenCalledWith({ npi: '1234567890' });
  });

  it('NodeDetailPanel says when it lists only the top 5 edges', () => {
    const edges = Array.from({ length: 7 }, (_, i) => ({ source: '1234567890', target: String(i), volume: 10 - i }));
    render(
      <MemoryRouter>
        <NodeDetailPanel node={{ npi: '1234567890' }} edges={edges} nodes={[]} onClose={() => {}} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Sends to (top 5 of 7)')).toBeInTheDocument();
  });
});

describe('graphNote', () => {
  it('says what was left out, and only that', () => {
    expect(graphNote({ network_nodes: 4, network_edges: 3, shown_edges: 1 }, 2))
      .toBe('Showing the 2 busiest of 4 providers and 1 of 3 relationships.');
    expect(graphNote({ network_nodes: 150, network_edges: 300, shown_edges: 200 }, 150))
      .toBe('Showing 200 of 300 relationships; the graph draws the busiest 60.');
    expect(graphNote({ network_nodes: 90, network_edges: 100, shown_edges: 100 }, 90)).toBe('The graph draws the busiest 60.');
    expect(graphNote({ network_nodes: 20, network_edges: 30, shown_edges: 30 }, 20)).toBeNull();
  });
});

function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="url">{loc.search}</output>;
}

function renderPage(path = '/ReferralNetworkIntelligence') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/ReferralNetworkIntelligence" element={<><ReferralNetworkIntelligence /><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const NETWORK = {
  nodes: [
    { npi: '1000000001', label: 'Ann Chen', entityType: 'Individual', state: 'PA', city: 'Pittsburgh', specialtyGroup: 'cardiology', specialtyGroupLabel: 'Cardiology', outbound: 150, inbound: 15, totalVolume: 165, partners: 3, hubScore: 100, isHub: true, inScope: true },
    { npi: '1000000002', label: 'Mercy Hospital', entityType: 'Organization', state: 'PA', city: 'Pittsburgh', specialtyGroup: 'hospital', specialtyGroupLabel: 'Hospital', outbound: 0, inbound: 120, totalVolume: 120, partners: 1, hubScore: 40, isHub: false, inScope: true },
  ],
  edges: [{ source: '1000000001', target: '1000000002', volume: 120 }],
  scope: { type: 'state', state: 'PA', label: 'Providers practicing in PA', seed_count: 2, truncated: false },
  summary: { network_nodes: 4, network_edges: 3, total_volume: 165, shown_nodes: 2, shown_edges: 1, display_capped: true },
};

describe('ReferralNetworkIntelligence', () => {
  it('loads the scope from the URL and shows real hub volumes', async () => {
    invoke.mockReset().mockResolvedValue(NETWORK);
    renderPage('/ReferralNetworkIntelligence?state=PA&tab=hubs');
    expect(await screen.findByText('Providers practicing in PA')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('getReferralNetworkData', { state: 'PA' });
    expect(screen.getByText('Showing the 2 busiest of 4 providers and 1 of 3 relationships.')).toBeInTheDocument();
    const row = screen.getByRole('row', { name: /Ann Chen/ });
    expect(within(row).getByText('150')).toBeInTheDocument();
    expect(within(row).getByText('Cardiology · Pittsburgh · PA')).toBeInTheDocument();
  });

  it('filters by specialty group and keeps it in the URL', async () => {
    invoke.mockReset().mockResolvedValue(NETWORK);
    renderPage('/ReferralNetworkIntelligence?state=PA&tab=hubs&group=hospital');
    await screen.findByRole('row', { name: /Mercy Hospital/ });
    expect(screen.queryByRole('row', { name: /Ann Chen/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('url').textContent).toContain('group=hospital');
  });

  it('ignores a malformed list id or NPI in a shared URL', async () => {
    invoke.mockReset().mockResolvedValue(NETWORK);
    renderPage('/ReferralNetworkIntelligence?state=PA&list=4.5&npi=123');
    await screen.findByText('Providers practicing in PA');
    expect(invoke).toHaveBeenCalledWith('getReferralNetworkData', { state: 'PA' });
  });

  it('explains when no referral data has been imported', async () => {
    invoke.mockReset().mockResolvedValue({ notConfigured: true, message: 'No referral data has been imported yet.', nodes: [], edges: [] });
    renderPage();
    expect(await screen.findByText('No referral data yet')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('getReferralNetworkData', {});
  });

  it('shows the error with a retry', async () => {
    invoke.mockReset().mockRejectedValue(Object.assign(new Error('The referral data took too long to load.'), { status: 503 }));
    renderPage();
    // The page retries once before showing the error.
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent('took too long');
    invoke.mockResolvedValue(NETWORK);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Providers practicing in PA')).toBeInTheDocument();
  });
});
