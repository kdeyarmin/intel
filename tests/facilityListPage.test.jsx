// @vitest-environment jsdom
/**
 * The facility list's columns follow the kind of facility: CMS-certified ones have a rating,
 * discharges and payments; a state-licensed home has a capacity and a license, so its list
 * must not put bed counts under "Payments" beside two columns that are always empty.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';

afterEach(cleanup);

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke: (...a) => invoke(...a) } } }));

import FacilityListPage from '../src/components/facilities/FacilityListPage';

function UrlProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><span data-testid="url">{location.search}</span><button onClick={() => navigate('?type=snf&zip=16501&miles=50')}>Open radius link</button></>;
}

function renderList(facilityGroup, facilities, path = '/Facilities') {
  invoke.mockReset().mockResolvedValue({ data: { facilities, total: facilities.length, available_states: ['PA'] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}><FacilityListPage facilityGroup={facilityGroup} title="Facilities" icon={Building2} /><UrlProbe /></MemoryRouter>
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

  it('restores radius with other URL filters and shows zero distance', async () => {
    renderList('snf', [{ provider_id: '395001', facility_name: 'Nearby Home', distance_miles: 0 }], '/Facilities?type=snf&q=Nearby&state=PA&zip=15213&miles=10&page=2');
    expect(await screen.findByText('≈ 0.0 miles from 15213')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Radius ZIP code' })).toHaveValue('15213');
    expect(invoke).toHaveBeenCalledWith('listFacilities', expect.objectContaining({
      facility_group: 'snf', search: 'Nearby', state: 'PA', radius_zip: '15213', radius_miles: 10, page: 2,
    }));
  });

  it('applies and clears radius without losing type, state or search, resetting pagination', async () => {
    renderList('snf', [], '/Facilities?type=snf&state=PA&q=Kane&page=3');
    fireEvent.change(screen.getByRole('textbox', { name: 'Radius ZIP code' }), { target: { value: '15213' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply radius' }));
    await waitFor(() => expect(invoke).toHaveBeenLastCalledWith('listFacilities', expect.objectContaining({
      state: 'PA', search: 'Kane', page: 1, radius_zip: '15213', radius_miles: 25,
    })));
    expect(screen.getByTestId('url')).toHaveTextContent('type=snf');
    fireEvent.click(screen.getByRole('button', { name: 'Clear radius' }));
    await waitFor(() => {
      const payload = invoke.mock.calls.at(-1)[1];
      expect(payload.radius_zip).toBeUndefined();
      expect(payload.state).toBe('PA');
      expect(payload.search).toBe('Kane');
    });
  });

  it('updates controls and requests when navigating to another radius URL', async () => {
    renderList('snf', [], '/Facilities?type=snf&zip=15213&miles=5');
    fireEvent.click(screen.getByRole('button', { name: 'Open radius link' }));
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Radius ZIP code' })).toHaveValue('16501'));
    expect(screen.getByRole('combobox', { name: 'Radius distance in miles' })).toHaveTextContent('50 miles');
    await waitFor(() => expect(invoke).toHaveBeenLastCalledWith('listFacilities', expect.objectContaining({ radius_zip: '16501', radius_miles: 50 })));
  });
});
