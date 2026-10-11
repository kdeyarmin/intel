// @vitest-environment jsdom
/**
 * The facility list's columns follow the kind of facility: CMS-certified ones have a rating,
 * discharges and payments; a state-licensed home has a capacity and a license, so its list
 * must not put bed counts under "Payments" beside two columns that are always empty.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';

afterEach(cleanup);

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke: (...a) => invoke(...a) } } }));

import FacilityListPage from '../src/components/facilities/FacilityListPage';

function renderList(facilityGroup, facilities) {
  invoke.mockReset().mockResolvedValue({ data: { facilities, total: facilities.length, available_states: ['PA'] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><FacilityListPage facilityGroup={facilityGroup} title="Facilities" icon={Building2} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('FacilityListPage columns', () => {
  it('shows a licensed home with its capacity, and no rating, discharges or payments columns', async () => {
    renderList('licensed', [{ facility_key: 'a', facility_name: 'Elm Court', city: 'Erie', state: 'PA', zip: '16501', license_type: 'personal_care_home', license_number: 'PCH-1', status: 'Regular', capacity: 120 }]);
    expect(await screen.findByText('Elm Court')).toBeInTheDocument();
    expect(screen.getByText('Capacity')).toBeInTheDocument();
    expect(screen.getByText('120 beds')).toBeInTheDocument();
    expect(screen.queryByText('Payments')).toBeNull();
    expect(screen.queryByText('Rating')).toBeNull();
    expect(screen.queryByText('Discharges')).toBeNull();
  });

  it('keeps rating, discharges and payments for the CMS-certified facilities', async () => {
    renderList('snf', [{ provider_id: '395001', facility_name: 'Kane Regional', city: 'Pittsburgh', state: 'PA', zip: '15213', quality_rating: 4, total_discharges: 1200, total_payments: 2e7 }]);
    expect(await screen.findByText('Kane Regional')).toBeInTheDocument();
    expect(screen.getByText('Rating')).toBeInTheDocument();
    expect(screen.getByText('Discharges')).toBeInTheDocument();
    expect(screen.getByText('Payments')).toBeInTheDocument();
    expect(screen.queryByText('Capacity')).toBeNull();
    expect(screen.getByText('$20.0M')).toBeInTheDocument();
  });
});
