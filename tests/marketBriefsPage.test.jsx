// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axe from 'axe-core';
import { CAREMETRIC_LOGO_URL, CAREMETRIC_NAME } from '../src/lib/branding';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  countExport: vi.fn(),
  toastError: vi.fn(),
  profile: null,
}));
vi.mock('@/api/functionResult', () => ({ invokeOrThrow: (...args) => h.invoke(...args) }));
vi.mock('@/lib/BusinessLineContext', () => ({ useBusinessLine: () => ({ profile: h.profile }) }));
vi.mock('@/components/layout/PageTabs', () => ({ default: () => null }));
vi.mock('sonner', () => ({ toast: { error: h.toastError } }));
vi.mock('@/components/exports/exportUtils', async (importOriginal) => ({
  ...await importOriginal(),
  countExport: (...args) => h.countExport(...args),
}));

import MarketBriefs from '../src/pages/MarketBriefs';

const LAYER = {
  counties: [
    { fips: '42003', name: 'Allegheny County', values: { benes: 200000, hha_users_pct: 9.1, hha_providers: 80, hha_agencies: 30, std_per_capita_hha: 400 }, volume: { hha_users: 12000, hha_users_change_pct: 2, hha_providers_change_pct: 4 } },
    { fips: '42019', name: 'Butler County', values: { benes: 40000, hha_users_pct: 11, hha_providers: 4, hha_agencies: 2, std_per_capita_hha: 520 }, volume: { hha_users: 2000, hha_users_change_pct: 8, hha_providers_change_pct: 0 } },
  ],
  rollups: { county_market_profile: { status: 'completed', refreshed_at: '2026-10-01T12:00:00Z' } },
};
const MARKET = {
  county: { name: 'Allegheny County' },
  profile: { available: true, benes: 200000, ma_penetration: 0.55, hha_users: 12000, hha_users_pct: 9.1, hha_users_change_pct: 2, hha_providers: 80, hha_agencies: 30, std_per_capita_hha: 400 },
  hospital_sources: {
    total: 1,
    data_year: 2024,
    rows: [{ ccn: '390001', name: 'Mercy Hospital', cases: 500, share: 0.2, discharge_mix: { pct_hha: 12, pct_hospice: 3, pct_snf: 40, state: { pct_hha: 10, pct_hospice: 2, pct_snf: 35 } } }],
  },
  competitors: { hha: { data_year: 2023, rows: [{ ccn: '397001', name: 'Riverbend Home Health', facility_group: 'hha', benes: 6000, share: 0.6, payment: 1000000 }] } },
};
const LEADERS = {
  data_year: 2023,
  providers_in_market: 30,
  rows: [{ ccn: '397001', name: 'Riverbend Home Health', facility_group: 'hha', city: 'Pittsburgh', state: 'PA', benes: 6000, share: 0.25, payment: 1000000, dual_pct: 15, counties_served: 8 }],
};
const SOURCES = {
  data_year: 2023,
  certifications_year: 2024,
  index_note: 'Patient-setting counts are not unique beneficiaries.',
  rows: [{ npi: '1000000001', name: 'Ann Chen', specialty: 'Internal Medicine', benes: 300, hh_cert_benes: null, hospice_oversight_benes: 40, chronic: { chf: 0.2, copd: 0.1, alzheimer: 0.05 } }],
};

function UrlProbe() {
  return <output data-testid="url">{useLocation().search}</output>;
}

function renderPage(search = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/MarketBriefs${search}`]}><MarketBriefs /><UrlProbe /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.profile = null;
  h.countExport.mockReset().mockResolvedValue({ ok: true });
  h.toastError.mockReset();
  h.invoke.mockReset().mockImplementation((name) => {
    const data = {
      getGeoCounties: { counties: [{ fips: '42003', name: 'Allegheny County' }] },
      getCountyMarketLayer: LAYER,
      getCountyMarket: MARKET,
      getStateMarketLeaders: LEADERS,
      getReferralSources: SOURCES,
    };
    return Promise.resolve(data[name]);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MarketBriefs restored report route', () => {
  it('renders the report catalog and selects reports without querying unrelated report data', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(9);
    expect(h.invoke).not.toHaveBeenCalledWith('getCountyMarketLayer', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: /Where to open or staff home health/ }));
    expect(await screen.findByRole('region', { name: 'County comparison' })).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent('report=expand-hha');
    expect(h.invoke).toHaveBeenCalledWith('getCountyMarketLayer', { state: 'PA', all: true });
    expect(h.invoke).not.toHaveBeenCalledWith('getStateMarketLeaders', expect.anything());
  });

  it('preserves business-line filtering of the catalog', () => {
    h.profile = { reports: ['expand-hha'], blurb: 'Home health market research' };
    renderPage();
    expect(screen.getByText('Home health market research')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Where to open or staff home health/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Where to open or staff hospice/ })).not.toBeInTheDocument();
  });

  it('uses providers billing for residents in expansion ratios and retains county drill-down', async () => {
    renderPage('?report=expand-hha');
    const comparison = await screen.findByRole('region', { name: 'County comparison' });
    const row = within(comparison).getByRole('button', { name: 'Allegheny County' }).closest('tr');
    expect(within(row).getByText('80')).toBeInTheDocument();
    expect(within(row).getByText('150')).toBeInTheDocument(); // 12,000 / 80, not 12,000 / 30.
    expect(within(comparison).getByText(/not only providers located there/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Counties with rising use and stable or declining provider counts' })).toHaveTextContent('billing for county residents');
    fireEvent.click(within(row).getByRole('button', { name: 'Allegheny County' }));
    const demand = await screen.findByRole('region', { name: 'Home health demand' });
    expect(within(demand).getByRole('columnheader', { name: 'Providers serving residents' })).toBeInTheDocument();
    expect(within(demand).getByRole('columnheader', { name: 'Providers located in county' })).toBeInTheDocument();
    expect(within(demand).getByText('80')).toBeInTheDocument();
    expect(within(demand).getByText('30')).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent('from=expand-hha');
    expect(h.invoke).toHaveBeenCalledWith('getCountyMarket', { state: 'PA', county_fips: '42003' });
    expect(screen.getByText(/Share of beneficiaries served by providers located in this county, not all county residents/)).toBeInTheDocument();
  });

  it('preserves acquisition provider links and located-provider beneficiary share', async () => {
    renderPage('?report=acquire-hha&state=OH');
    const list = await screen.findByRole('region', { name: 'Largest by Medicare beneficiaries' });
    expect(within(list).getByRole('link', { name: 'Riverbend Home Health' })).toHaveAttribute('href', '/FacilityDetail?id=397001&group=hha');
    expect(within(list).getByText('25%')).toBeInTheDocument();
    expect(screen.getByText(/Share is of beneficiaries served by providers located in the state, not all state residents/)).toBeInTheDocument();
    expect(h.invoke).toHaveBeenCalledWith('getStateMarketLeaders', { state: 'OH', setting: 'hha', limit: 15 });
  });

  it('preserves the hospital spending proxy rather than presenting transfers as measured referrals', async () => {
    renderPage('?report=hospital-partners&county=42003');
    expect(await screen.findByRole('link', { name: 'Mercy Hospital' })).toHaveAttribute('href', '/FacilityDetail?id=390001&group=hospital');
    expect(screen.getByText(/This spending proxy does not count patient transfers or confirmed referrals/)).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('CMS suppresses counts under 11');
    expect(screen.getByRole('note')).toHaveTextContent('no patient-level data');
  });

  it('retains clinician links, missing-value dashes, and independent certification years', async () => {
    renderPage('?report=calls-hha&county=42003');
    const list = await screen.findByRole('region', { name: 'Call list' });
    const row = within(list).getByRole('link', { name: 'Ann Chen' }).closest('tr');
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Ann Chen' })).toHaveAttribute('href', '/ProviderDetail?npi=1000000001');
    expect(within(list).getByText(/Physician year 2023. Certifications 2024./)).toBeInTheDocument();
    expect(screen.getAllByText(/Not confirmed referrals/).length).toBeGreaterThan(0);
    expect(h.invoke).toHaveBeenCalledWith('getReferralSources', { state: 'PA', county_fips: '42003', setting: 'hha', limit: 25 });
  });

  it('does not load a county report before a county is selected', () => {
    renderPage('?report=calls-hha');
    expect(screen.getByText('Select a county to open this report.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    expect(h.invoke).not.toHaveBeenCalledWith('getCountyMarket', expect.anything());
    expect(h.invoke).not.toHaveBeenCalledWith('getReferralSources', expect.anything());
  });

  it('does not bypass a territory denial or print an unavailable report', async () => {
    h.invoke.mockRejectedValue(new Error('This state is outside your plan territory.'));
    renderPage('?report=expand-hha&state=OH');
    expect(await screen.findByRole('alert')).toHaveTextContent('outside your plan territory');
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    expect(h.countExport).not.toHaveBeenCalled();
  });

  it('keeps a clinician fetch failure distinct from an empty call list', async () => {
    h.invoke.mockImplementation((name) => name === 'getReferralSources'
      ? Promise.reject(new Error('Clinician data is temporarily unavailable.'))
      : Promise.resolve(name === 'getGeoCounties' ? { counties: [] } : MARKET));
    renderPage('?report=calls-hha&county=42003');
    expect(await screen.findByRole('alert')).toHaveTextContent('Clinician data is temporarily unavailable.');
    expect(screen.queryByRole('region', { name: 'Call list' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
  });

  it('brands print output and counts the export before opening the print dialog', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPage('?report=expand-hha');
    await screen.findByRole('region', { name: 'County comparison' });
    const masthead = screen.getByLabelText('Report masthead');
    expect(masthead).toHaveTextContent(CAREMETRIC_NAME);
    expect(masthead.querySelector('img')).toHaveAttribute('src', CAREMETRIC_LOGO_URL);
    expect(screen.getByText(/^Source:/)).toHaveTextContent(`${CAREMETRIC_NAME} analytics`);
    expect(screen.getByText(/^Source:/)).toHaveTextContent('counts under 11 are suppressed');
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    expect(h.countExport).toHaveBeenCalledOnce();
    expect(h.countExport.mock.invocationCallOrder[0]).toBeLessThan(print.mock.invocationCallOrder[0]);
  });

  it('does not print when the export quota is rejected', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    h.countExport.mockResolvedValue({ ok: false, message: 'Daily export limit reached.' });
    renderPage('?report=acquire-hha');
    await screen.findByRole('region', { name: 'Largest by Medicare beneficiaries' });
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Daily export limit reached.'));
    expect(print).not.toHaveBeenCalled();
  });

  it('keeps controls and report tables accessible', async () => {
    const { container } = renderPage('?report=hospital-partners&county=42003');
    await screen.findByRole('link', { name: 'Mercy Hospital' });
    expect(screen.getByRole('combobox', { name: 'State' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'County' })).toBeInTheDocument();
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
