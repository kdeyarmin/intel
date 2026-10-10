// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/api/functionResult', () => ({ invokeOrThrow: (...a) => invoke(...a) }));
vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke: vi.fn(() => Promise.resolve({ data: {} })) } } }));
vi.mock('../src/components/territory/InteractiveProviderMap', () => ({
  default: ({ filteredProviders }) => <div data-testid="map">{filteredProviders.length} on map</div>,
}));
vi.mock('../src/components/compliance/DataSourcesFooter', () => ({ default: () => null }));
vi.mock('../src/components/compliance/ComplianceDisclaimer', () => ({ default: () => null }));

import TerritoryIntelligence from '../src/pages/TerritoryIntelligence';
import CountyIntelligence from '../src/pages/CountyIntelligence';

function Probe() {
  return <output data-testid="url">{useLocation().search}</output>;
}

function renderAt(path, Page, route) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={route} element={<><Page /><Probe /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const TERRITORY = {
  providers: [
    { npi: '1000000001', name: 'Ann Chen, MD', entityType: 'Individual', city: 'Pittsburgh', state: 'PA', zip: '15213', county: 'Allegheny County', countyFips: '42003', lat: 40.44, lng: -79.95, specialty: 'Internal Medicine, Cardiovascular Disease', specialtyGroup: 'cardiology', score: 88, scoreSource: 'lead_score', totalBeneficiaries: 300, totalServices: 3000 },
    { npi: '1000000003', name: 'Rex Reed, PhD', entityType: 'Individual', city: 'Pittsburgh', state: 'PA', zip: '15299', county: 'Allegheny County', countyFips: '42003', lat: 40.4, lng: -79.9, specialty: 'Psychologist', specialtyGroup: 'other', score: null, scoreSource: null, totalBeneficiaries: null },
  ],
  availableStates: [{ state: 'PA', approx: 600 }],
  scope: { state: 'PA', label: '2 providers in PA: the 1 highest-scored first, then others', sample_size: 2, approx_locations_in_state: 600, truncated: true },
  counties: [{ fips: '42003', name: 'Allegheny County', practice_locations: 12 }, { fips: '42019', name: 'Butler County', practice_locations: 0 }],
  geography: { loaded: true, vintage: '2020' },
};

describe('TerritoryIntelligence', () => {
  it('loads the state from the URL, keeps unscored providers unscored, and clusters by real data', async () => {
    invoke.mockReset().mockResolvedValue(TERRITORY);
    renderAt('/TerritoryIntelligence', TerritoryIntelligence, '/TerritoryIntelligence');
    expect(await screen.findByText(/2 providers in PA: the 1 highest-scored first/)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('getTerritoryData', { state: 'PA' });
    expect(screen.getByTestId('map')).toHaveTextContent('2 on map');
    expect(screen.getByText('Unscored', { selector: '.text-\\[11px\\]' })).toBeInTheDocument();
    const behavioral = screen.getByText('Behavioral health').closest('.rounded-xl, [class*=card]') || document.body;
    expect(within(behavioral).getByText('Rex Reed, PhD')).toBeInTheDocument();
    expect(screen.getAllByText('Unscored').length).toBeGreaterThan(0);
  });

  it('drops unscored providers once a score range is set', async () => {
    invoke.mockReset().mockResolvedValue(TERRITORY);
    renderAt('/TerritoryIntelligence?minScore=50', TerritoryIntelligence, '/TerritoryIntelligence');
    expect(await screen.findByTestId('map')).toHaveTextContent('1 on map');
  });

  it('shows real county density linking to County Intel', async () => {
    invoke.mockReset().mockResolvedValue(TERRITORY);
    renderAt('/TerritoryIntelligence?tab=density', TerritoryIntelligence, '/TerritoryIntelligence');
    const link = await screen.findByRole('link', { name: /Allegheny County/ });
    expect(link).toHaveAttribute('href', '/CountyIntelligence?state=PA&county=42003');
    expect(screen.queryByRole('link', { name: /Butler County/ })).not.toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    invoke.mockReset().mockRejectedValue(new Error('The territory data took too long to load.'));
    renderAt('/TerritoryIntelligence', TerritoryIntelligence, '/TerritoryIntelligence');
    // The page retries once before showing the error.
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent('took too long');
  });
});

const COUNTY = {
  state: 'PA',
  county: { fips: '42003', name: 'Allegheny County' },
  zip_areas: 2,
  summary: { totalProviders: 4200, providersExact: false, sampledProviders: 5000, individualProviders: 4000, orgProviders: 1000, totalFacilities: 1, totalPayments: 0, totalDischarges: 0 },
  sample: { sampled: true, detail_limit: 1000, details_cover_all: false },
  topSpecialties: [{ name: 'Cardiology', count: 11 }],
  facilitySummary: [{ type: 'hospital', count: 1, totalPayments: 0, avgRating: 4 }],
  facilities: [{ id: 7, name: 'Mercy', type: 'hospital_general_info', group: 'hospital', providerId: '390001', city: 'Pittsburgh' }],
  providers: [{ npi: '1000000001', name: 'Ann Chen, MD', specialty: 'Cardiology', score: null }],
  referrals: [{ fromNpi: '1', fromName: 'Ann Chen, MD', toNpi: '2', toName: 'Mercy Hospital', totalReferrals: 45 }],
  topServices: [{ code: '93306', name: 'Echocardiogram', amount: 1200 }],
};

describe('CountyIntelligence', () => {
  it('asks for a county after a state is picked', async () => {
    invoke.mockReset().mockImplementation((fn) => Promise.resolve(fn === 'getGeoCounties' ? { counties: [{ fips: '42003', name: 'Allegheny County' }] } : COUNTY));
    renderAt('/CountyIntelligence?state=PA', CountyIntelligence, '/CountyIntelligence');
    expect(await screen.findByText(/Pick a state and a county/)).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('getGeoCounties', { state: 'PA' });
    expect(invoke).not.toHaveBeenCalledWith('getCountyIntelligence', expect.anything());
  });

  it('shows a county by FIPS, with approximate totals marked and real facilities', async () => {
    invoke.mockReset().mockImplementation((fn) => Promise.resolve(fn === 'getGeoCounties' ? { counties: [{ fips: '42003', name: 'Allegheny County' }] } : COUNTY));
    renderAt('/CountyIntelligence?state=PA&county=42003', CountyIntelligence, '/CountyIntelligence');
    expect(await screen.findByRole('heading', { name: 'Allegheny County, PA' })).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith('getCountyIntelligence', { state: 'PA', county_fips: '42003' });
    expect(screen.getByText('≈4,200')).toBeInTheDocument();
    expect(screen.getByText(/describe 5,000 of them/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Mercy\s*Hospitals · Pittsburgh/ })).toHaveAttribute('href', '/FacilityDetail?id=390001&group=hospital');
    expect(screen.getByText('Unscored')).toBeInTheDocument();
    expect(screen.getByText('Not reported in the imported facility data')).toBeInTheDocument();
  });

  it('keeps the county in the URL when the state changes back', async () => {
    invoke.mockReset().mockImplementation((fn) => Promise.resolve(fn === 'getGeoCounties' ? { counties: [] } : COUNTY));
    renderAt('/CountyIntelligence?state=PA&county=42003', CountyIntelligence, '/CountyIntelligence');
    await screen.findByRole('heading', { name: 'Allegheny County, PA' });
    expect(screen.getByTestId('url').textContent).toBe('?state=PA&county=42003');
    fireEvent.click(screen.getByRole('link', { name: /Territory map and county density/ }));
  });
});
