// @vitest-environment jsdom
/**
 * The dataset catalog lists only datasets whose rows are in the tables. A dataset whose very first import
 * failed has none (its status is "failed", not "never imported"), so it stays out; one whose latest refresh
 * failed keeps its earlier import and stays in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke: (...a) => invoke(...a) } } }));

import DataFreshnessPanel from '../src/components/analytics/DataFreshnessPanel';

const row = (over) => ({ import_type: 'x', label: 'X', status: 'current', data_year: '2025', cadence: null, catalog_modified: null, catalog_checked_at: null, imported_at: null, row_count: null, ...over });
const DATASETS = [
  row({ import_type: 'a', label: 'Loaded and current', imported_at: '2026-09-01T00:00:00Z', row_count: 10 }),
  row({ import_type: 'b', label: 'First import failed', status: 'failed', data_year: null }),
  row({ import_type: 'c', label: 'Refresh failed, earlier import kept', status: 'failed', imported_at: '2026-06-01T00:00:00Z', row_count: 5 }),
  row({ import_type: 'd', label: 'Never imported', status: 'never_imported', data_year: null }),
];

function renderPanel(props) {
  invoke.mockReset().mockResolvedValue({ data: { datasets: DATASETS } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><DataFreshnessPanel {...props} /></QueryClientProvider>);
}

describe('DataFreshnessPanel', () => {
  it('lists only datasets whose rows are loaded when asked, whatever their latest refresh did', async () => {
    renderPanel({ onlyLoaded: true });
    expect(await screen.findByText('Loaded and current')).toBeInTheDocument();
    expect(screen.getByText('Refresh failed, earlier import kept')).toBeInTheDocument();
    expect(screen.queryByText('First import failed')).toBeNull();
    expect(screen.queryByText('Never imported')).toBeNull();
  });

  it('lists everything otherwise', async () => {
    renderPanel({});
    expect(await screen.findByText('First import failed')).toBeInTheDocument();
    expect(screen.getByText('Never imported')).toBeInTheDocument();
  });
});
