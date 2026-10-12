// @vitest-environment jsdom
/**
 * The list dialog's member details. Each member's provider, location,
 * utilization, etc. are picked per NPI on the server; a row limit shared by a
 * chunk of NPIs let one NPI with many rows leave the other members blank.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

// A busy organization (many locations and HCPCS lines) and a small practice.
const BUSY = '1111111111';
const SMALL = '2222222222';
const DATA = {
  Provider: [
    { id: 1, npi: SMALL, entity_type: 'Individual', first_name: 'Ann', last_name: 'Small' },
    { id: 2, npi: BUSY, entity_type: 'Organization', organization_name: 'Busy Health System' },
  ],
  LeadScore: [],
  ProviderLocation: [
    { id: 1, npi: SMALL, city: 'Scranton', state: 'PA', is_primary: true },
    ...Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, npi: BUSY, city: 'Allentown', state: 'PA', is_primary: i === 0 })),
  ],
  ProviderServiceUtilization: [
    { id: 1, npi: SMALL, total_unique_benes: '77' },
    ...Array.from({ length: 40 }, (_, i) => ({ id: 100 + i, npi: BUSY, total_unique_benes: '5' })),
  ],
  CMSReferral: [],
  ProviderTaxonomy: [],
};
const KEYS = {
  providers: 'Provider', scores: 'LeadScore', locations: 'ProviderLocation',
  utilizations: 'ProviderServiceUtilization', referrals: 'CMSReferral', taxonomies: 'ProviderTaxonomy',
};
const newestFirst = (rows) => [...rows].sort((a, b) => b.id - a.id);

const { base44 } = vi.hoisted(() => ({ base44: { entities: {}, functions: {}, auth: {} } }));
vi.mock('@/api/base44Client', () => ({ base44 }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { role: 'user' } }), useOptionalAuth: () => ({ user: { role: 'user' } }) }));
vi.mock('../src/components/shared/PageHeader', () => ({ default: () => null }));
vi.mock('../src/components/leadlists/LeadListAnalytics', () => ({ default: () => null }));
// Its export helpers fetch a logo over the network when imported.
vi.mock('../src/components/leadlists/LeadListStatusExport', () => ({ default: () => null }));

// The entity API: `npi $in` with one row limit for the whole request, newest first.
for (const [entity, rows] of Object.entries(DATA)) {
  base44.entities[entity] = {
    filter: vi.fn(async (filters, _sort, limit = 100) =>
      newestFirst(rows.filter((r) => filters.npi.$in.includes(r.npi))).slice(0, limit)),
  };
}
base44.entities.LeadList = {
  list: vi.fn(async () => [{ id: 5, name: 'PA targets', member_count: 2, created_date: '2026-10-01' }]),
  filter: vi.fn(async () => [{ id: 5, name: 'PA targets', member_count: 2, created_date: '2026-10-01' }]),
};
base44.entities.LeadListMember = {
  filter: vi.fn(async () => [
    { id: 1, list_id: 5, npi: BUSY, status: 'New' },
    { id: 2, list_id: 5, npi: SMALL, status: 'New' },
  ]),
};
// The server: each table's preferred row (primary first), else its newest, per NPI.
base44.functions.invoke = vi.fn(async (name, { npis }) => {
  if (name !== 'getLeadListMemberDetails') throw new Error(`unexpected function ${name}`);
  const data = {};
  for (const [key, entity] of Object.entries(KEYS)) {
    data[key] = npis.flatMap((npi) => {
      const mine = newestFirst(DATA[entity].filter((r) => r.npi === npi));
      return (mine.find((r) => r.is_primary) || mine[0]) ?? [];
    });
  }
  return { data };
});

import LeadLists from '../src/pages/LeadLists';

describe('Lead list dialog details', () => {
  it("shows every member's details, even next to a provider with many rows", async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <LeadLists />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /view/i }));

    expect(await screen.findByText('Scranton, PA')).toBeInTheDocument();
    expect(screen.getByText('Allentown, PA')).toBeInTheDocument();
    expect(screen.getByText('77')).toBeInTheDocument();
    expect(base44.functions.invoke).toHaveBeenCalledWith('getLeadListMemberDetails', { npis: expect.arrayContaining([BUSY, SMALL]) });
  });
});
