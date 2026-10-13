// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ImportHealthView from '../src/components/imports/ImportHealthView';

const list = vi.fn();
vi.mock('@/api/base44Client', () => ({
  base44: { entities: {
    ImportBatch: { list: (...args) => list(...args) },
    ImportScheduleConfig: { list: async () => [] },
  } },
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: () => null,
  BarChart: () => null, Bar: () => null, XAxis: () => null, YAxis: () => null,
  Tooltip: () => null, CartesianGrid: () => null, Legend: () => null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Import Health stalled imports', () => {
  it('names quiet imports and explains automatic handling', async () => {
    const quietSince = minutes => new Date(Date.now() - minutes * 60_000).toISOString();
    list.mockResolvedValue([
      { id: 1, import_type: 'hospital_service_area', status: 'processing', updated_date: quietSince(16) },
      { id: 2, import_type: 'home_health_all_owners', status: 'validating', updated_date: quietSince(130) },
      { id: 3, import_type: 'nppes_registry', status: 'processing', updated_date: quietSince(20) },
      { id: 4, import_type: 'hospital_general_info', status: 'completed', updated_date: quietSince(130) },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ImportHealthView /></QueryClientProvider>);
    const warning = await screen.findByRole('status');
    expect(warning).toHaveTextContent('Potentially stalled imports (2)');
    expect(warning).toHaveTextContent('after 2 hours without progress');
    expect(within(warning).getAllByRole('listitem')).toHaveLength(2);
    expect(warning).toHaveTextContent('batch #1');
    expect(warning).toHaveTextContent('batch #2');
    expect(warning).not.toHaveTextContent('batch #3');
    expect(warning).not.toHaveTextContent('batch #4');
    client.clear();
  });
});
