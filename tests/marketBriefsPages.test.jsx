// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/api/functionResult', () => ({ invokeOrThrow: (...args) => invoke(...args) }));
vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke: vi.fn() } } }));
vi.mock('@/components/layout/PageTabs', () => ({ default: () => null }));
vi.mock('@/components/exports/exportUtils', () => ({ countExport: vi.fn() }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  BarChart: ({ children }) => <div>{children}</div>,
  Bar: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, Legend: () => null, CartesianGrid: () => null,
}));

import CountyIntelligence from '../src/pages/CountyIntelligence';
import MarketBriefs from '../src/pages/MarketBriefs';

const county = { state: 'PA', county: { fips: '42003', name: 'Allegheny County' } };
const emptyCounty = {
  ...county, summary: {}, sample: { sampled: false, details_cover_all: true },
  facilities: [], facilitySummary: [], providers: [], topSpecialties: [], topServices: [], referrals: [],
};
const answers = new Map();
beforeEach(() => {
  answers.clear();
  answers.set('getGeoCounties', { counties: [county.county] });
  invoke.mockReset().mockImplementation((name) => {
    const answer = answers.get(name) ?? null;
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  });
});
afterEach(cleanup);

function open(Page, search) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/?state=PA&county=42003&${search}`]}><Page /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('County Intelligence response guards', () => {
  it.each([null, {}, { county: null }, { county: 'invalid' }])('offers recovery for an unavailable county response %j', async (payload) => {
    answers.set('getCountyIntelligence', payload);
    open(CountyIntelligence, '');
    expect(await screen.findByRole('alert')).toHaveTextContent('County intelligence is unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry county data' }));
    expect(invoke.mock.calls.filter(([name]) => name === 'getCountyIntelligence').length).toBeGreaterThan(1);
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
  });

  it('preserves a valid county with missing sample, metrics and malformed collections without inventing zeros', async () => {
    answers.set('getCountyIntelligence', {
      ...county, topSpecialties: {}, topServices: [null], facilities: 'invalid', providers: [null],
      facilitySummary: null, referrals: [{ fromNpi: '1000000001', toNpi: '1000000002' }],
    });
    open(CountyIntelligence, '');
    expect(await screen.findByRole('heading', { name: 'Allegheny County, PA' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Missing measurements are not zero');
    expect(screen.getAllByText('Not available').length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText('$0')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '1000000001' })).toBeInTheDocument();
    expect(screen.getAllByText(/This section is unavailable/).length).toBeGreaterThan(0);
  });

  it('does not dereference missing sample limits and preserves published zero quantities', async () => {
    answers.set('getCountyIntelligence', {
      ...emptyCounty, summary: { totalFacilities: 0, totalPayments: 0, totalDischarges: 12000 },
      sample: { sampled: true, details_cover_all: false, facilities_capped: true, providers_capped: true },
    });
    open(CountyIntelligence, '');
    await screen.findByRole('heading', { name: 'Allegheny County, PA' });
    expect(screen.getByText('$0')).toBeInTheDocument();
    expect(screen.getByText('12,000')).toBeInTheDocument();
    expect(screen.getByText(/limited sample/)).not.toHaveTextContent('undefined');
  });

  it('renders an unavailable market response instead of loading forever', async () => {
    answers.set('getCountyIntelligence', emptyCounty);
    open(CountyIntelligence, 'tab=hospitals');
    expect(await screen.findByText(/Market data is unavailable/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading market')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry market data' })).toBeInTheDocument();
  });

  it('handles malformed market collections and null competitors', async () => {
    answers.set('getCountyIntelligence', emptyCounty);
    answers.set('getCountyMarket', { hospital_sources: { rows: [null] }, competitors: null, trends: null, coverage: null, labels: null });
    open(CountyIntelligence, 'tab=competitors');
    expect(await screen.findByText(/No snf providers/)).toBeInTheDocument();
  });

  it('keeps a partial market profile usable with malformed reference collections', async () => {
    answers.set('getCountyIntelligence', emptyCounty);
    answers.set('getCountyMarket', {
      profile: { available: true, benes: 12000 },
      reference: { ma_plans: {}, ma_stars: [null], places: 'invalid', phc4: { payers: [{ category: 'Medicare', value: 50 }], ages: {} }, dme: { products: {}, locations: [null] } },
    });
    open(CountyIntelligence, 'tab=market');
    expect(await screen.findByText('12,000')).toBeInTheDocument();
    expect(screen.getByText('No plan enrollment for this county.')).toBeInTheDocument();
  });
});

describe('professional market report states', () => {
  it('uses professional report titles and accurate referral limitations', async () => {
    open(MarketBriefs, '');
    expect(screen.getByText('Home Health Market Expansion Analysis')).toBeInTheDocument();
    expect(screen.getByText('Hospital Discharge Sources')).toBeInTheDocument();
    expect(screen.getByText('Home Health Referral Source Prioritization')).toBeInTheDocument();
    expect(screen.getAllByText(/not confirmed referrals or guaranteed referral volume/)).toHaveLength(2);
  });

  it.each([null, {}, { counties: 'invalid' }, { counties: [null] }])('shows actionable county ranking states for %j', async (payload) => {
    answers.set('getCountyMarketLayer', payload);
    open(MarketBriefs, 'report=expand-hha');
    expect(await screen.findByText('County utilization ranking unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry data' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
  });

  it('distinguishes pending referral data from an empty report and prevents printing it', async () => {
    let resolve;
    answers.set('getReferralSources', new Promise((done) => { resolve = done; }));
    open(MarketBriefs, 'report=calls-hha');
    expect(await screen.findByText('Loading market data…')).toBeInTheDocument();
    expect(screen.queryByText('No published records for this selection')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    await act(async () => resolve({ rows: [] }));
    expect(await screen.findByText('No published records for this selection')).toBeInTheDocument();
  });

  it('distinguishes a failed referral request from an empty list, and supports retry', async () => {
    answers.set('getReferralSources', new Error('connection terminated'));
    open(MarketBriefs, 'report=calls-hha');
    expect(await screen.findByRole('alert')).toHaveTextContent('Referral source prioritization unavailable');
    expect(screen.queryByText('No published records for this selection')).not.toBeInTheDocument();
    answers.set('getReferralSources', { rows: [], data_year: 2024 });
    fireEvent.click(screen.getByRole('button', { name: 'Retry data' }));
    expect(await screen.findByText('No published records for this selection')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders referral records independently of an unrelated county market response and keeps years and IDs ungrouped', async () => {
    answers.set('getReferralSources', { rows: [{ npi: '1000000001', name: 'Clinician', benes: 12000 }], data_year: 2024 });
    open(MarketBriefs, 'report=calls-hha');
    expect(await screen.findByRole('link', { name: 'Clinician' })).toHaveAttribute('href', '/ProviderDetail?npi=1000000001');
    expect(screen.getByText('12,000')).toBeInTheDocument();
    expect(screen.getByText(/Physician year 2024/)).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('getCountyMarket', expect.anything());
    expect(screen.queryByText(/2,024/)).not.toBeInTheDocument();
  });

  it.each(['hospital-partners', 'county'])('offers recovery for a missing county report: %s', async (report) => {
    open(MarketBriefs, `report=${report}`);
    expect(await screen.findByText('County market report unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry data' })).toBeInTheDocument();
  });

  it('handles malformed provider leader rows without crashing', async () => {
    answers.set('getStateMarketLeaders', { rows: [null, 'invalid'] });
    open(MarketBriefs, 'report=acquire-hha');
    expect(await screen.findByText('No published records for this selection')).toBeInTheDocument();
  });
});
