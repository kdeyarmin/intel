// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const { invoke, list } = vi.hoisted(() => ({ invoke: vi.fn(), list: vi.fn() }));
vi.mock('@/api/base44Client', () => ({
  base44: {
    functions: { invoke: (...a) => invoke(...a) },
    entities: { ProviderLocation: { list: (...a) => list(...a) }, SavedFilter: { filter: () => Promise.resolve([]) } },
  },
}));
vi.mock('../src/components/compliance/DataSourcesFooter', () => ({ default: () => null }));
vi.mock('../src/components/exports/ExportDialog', () => ({ default: () => null }));
vi.mock('../src/components/filters/SavedFilterBar', () => ({ default: () => null }));

import Locations from '../src/pages/Locations';

function renderAt(path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><Locations /></MemoryRouter>
    </QueryClientProvider>,
  );
}

const LOC = { id: 7, npi: '1990000014', address_1: '100 Forbes Ave', city: 'Pittsburgh', state: 'PA', zip: '15213', location_type: 'Practice' };

describe('Locations', () => {
  it('browses the newest locations when nothing is searched, and says so', async () => {
    list.mockResolvedValue([LOC]);
    renderAt('/Locations');
    expect(await screen.findByText(/Browsing the 1 most recently added locations/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('NPI, ZIP, or "City, ST"')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Primary' })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('searches the server for "City, ST" with the type filter', async () => {
    invoke.mockResolvedValue({ data: { locations: [LOC], truncated: true, label: 'Pittsburgh, PA', interpretation: 'city_state' } });
    renderAt('/Locations?q=Pittsburgh%2C%20PA&type=Practice');
    expect(await screen.findByText('1+ locations · Pittsburgh, PA')).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('searchLocations', { q: 'Pittsburgh, PA', location_type: 'Practice', limit: 500 });
    expect(screen.getByRole('link', { name: '100 Forbes Ave' })).toHaveAttribute('href', '/LocationDetail?id=7');
  });

  it('asks for a state instead of scanning for a bare city', async () => {
    invoke.mockResolvedValue({ data: { locations: [], needsState: true, message: 'Add a state to search by city, e.g. "Springfield, PA", or pick a state.' } });
    renderAt('/Locations?q=Springfield');
    expect((await screen.findAllByText(/Add a state to search by city/)).length).toBeGreaterThan(0);
  });
});
