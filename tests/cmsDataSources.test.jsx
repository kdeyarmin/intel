// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CMSDataSources from '../src/pages/CMSDataSources';

const invoke = vi.fn();
vi.mock('@/api/base44Client', () => ({
  base44: {
    functions: { invoke: (...args) => invoke(...args) },
    entities: { ImportBatch: { list: async () => [
      { import_type: 'provider_ownership', status: 'completed' },
      { import_type: 'home_health_pdgm', status: 'processing' },
    ] } },
  },
}));
vi.mock('@/components/layout/PageTabs', () => ({ default: () => null }));
vi.mock('@/components/shared/PageHeader', () => ({ default: ({ children }) => <header>{children}</header> }));
vi.mock('@/components/analytics/DataFreshnessPanel', () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CMS Dataset Catalog', () => {
  it.each([true, false])('hides retired/unavailable entries and offers only active imports (wrapped=%s)', async wrapped => {
    const dataset = { description: 'CMS data', priority: 'high', records: '~100', category: 'Home Health' };
    const catalog = {
      datasets: [
        { ...dataset, id: 'home_health_all_owners', title: 'Home Health Ownership' },
        { ...dataset, id: 'provider_ownership', title: 'Provider Ownership', category: 'Retired Only' },
        { ...dataset, id: 'home_health_pdgm', title: 'PDGM' },
        { ...dataset, id: 'unavailable_example', title: 'Unavailable Example', unavailable: true },
        { ...dataset, id: 'retired_example', title: 'Retired Example', retired: true },
      ],
      categories: ['Home Health', 'Retired Only'],
    };
    invoke.mockResolvedValue(wrapped ? { data: catalog } : catalog);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><CMSDataSources /></QueryClientProvider>);
    expect(await screen.findByText('1 datasets available')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByText('0 imported')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByText('0 active')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Retired Only' })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Expand All' }));
    expect(screen.getByText('Home Health Ownership')).toBeInTheDocument();
    for (const title of ['Provider Ownership', 'PDGM', 'Unavailable Example', 'Retired Example']) {
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: 'Import' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Import' }));
    expect(invoke).toHaveBeenCalledWith('triggerImport', expect.objectContaining({ import_type: 'home_health_all_owners' }));
    client.clear();
  });
});
