// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MarketBriefs from '../src/pages/MarketBriefs';
import { REPORT_CATALOG } from '../src/lib/marketBriefs';

const state = vi.hoisted(() => ({
  url: {},
  queries: {},
  countExport: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/useUrlState', () => ({ useUrlState: () => [state.url, vi.fn()] }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }) => state.queries[queryKey[0]] || {},
}));
vi.mock('@/lib/BusinessLineContext', () => ({ useBusinessLine: () => ({ profile: null }) }));
vi.mock('@/components/layout/PageTabs', () => ({ default: () => null }));
vi.mock('@/components/market/MarketFreshness', () => ({ default: () => null }));
vi.mock('@/components/compliance/ComplianceDisclaimer', () => ({ default: () => null }));
vi.mock('@/components/exports/exportUtils', () => ({ countExport: state.countExport }));
vi.mock('sonner', () => ({ toast: { error: state.toastError } }));

function show() {
  return render(<MemoryRouter><MarketBriefs /></MemoryRouter>);
}

beforeEach(() => {
  state.url = { report: '', state: 'PA', county: '', from: '', setting: 'hha', sort: 'users' };
  state.queries = {};
  state.countExport.mockReset().mockResolvedValue({ ok: true });
  state.toastError.mockReset();
  vi.spyOn(window, 'print').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('market brief copy and print exports', () => {
  it('renders every updated catalog title and reason', () => {
    show();
    for (const report of REPORT_CATALOG) {
      expect(screen.getByText(report.title)).toBeTruthy();
      expect(screen.getByText(report.reason)).toBeTruthy();
    }
  });

  it.each(['hha', 'hospice', 'snf'])('prints the %s expansion brief with patient and billing-provider definitions', async (setting) => {
    state.url.report = `expand-${setting}`;
    state.queries.countyMarketLayer = { data: { counties: [{
      fips: '42003', name: 'Allegheny County',
      values: { [`${setting}_providers`]: 4, [`${setting}_users_pct`]: 10 },
      volume: { [`${setting}_users`]: 200, [`${setting}_users_change_pct`]: 5, [`${setting}_providers_change_pct`]: 0 },
    }] } };
    show();
    const brief = document.getElementById('market-brief');
    expect(within(brief).getByText(REPORT_CATALOG.find((r) => r.id === state.url.report).title)).toBeTruthy();
    expect(within(brief).getAllByRole('columnheader', { name: 'Medicare patients' })).toHaveLength(2);
    if (setting === 'hospice') expect(within(brief).getAllByRole('columnheader', { name: 'Hospices', exact: true })).toHaveLength(2);
    expect(within(brief).getByRole('heading', { name: /Demand grew/ })).toBeTruthy();
    expect(within(brief).getByText(/even when located outside the county/)).toBeTruthy();
    expect(brief.textContent).not.toMatch(/\bUsers\b|Use rose|Billing hospices/);
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(window.print).toHaveBeenCalledOnce());
    expect(state.countExport).toHaveBeenCalledOnce();
  });

  it('keeps acquisition shares tied to located providers rather than county residents', () => {
    state.url.report = 'acquire-hospice';
    state.queries.stateMarketLeaders = { data: { rows: [{
      ccn: '123', name: 'Example Hospice', benes: 200, share: 0.25,
    }] } };
    show();
    expect(screen.getByText(/not all state residents receiving care/)).toBeTruthy();
    expect(screen.getByText(/ZIP service areas, not patients’ counties of residence/)).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Medicare patients' })).toBeTruthy();
  });

  it('includes the hospital report title and spending caveat in the printable article', () => {
    state.url.report = 'hospital-partners';
    state.url.county = '42003';
    state.queries.countyMarket = { data: { county: { name: 'Allegheny County' }, hospital_sources: { rows: [] } } };
    show();
    const brief = document.getElementById('market-brief');
    expect(within(brief).getByRole('heading', { name: 'Hospital partnership landscape' })).toBeTruthy();
    expect(within(brief).getByText(/Spending is a proxy/)).toBeTruthy();
    expect(within(brief).getByText(/does not measure transfers/)).toBeTruthy();
    expect(within(brief).getByText('No records are available for this selection.')).toBeTruthy();
  });

  it('distinguishes clinician errors from empty results and retains referral caveats', () => {
    state.url.report = 'calls-hospice';
    state.url.county = '42003';
    state.queries.countyMarket = { data: { county: { name: 'Allegheny County' } } };
    state.queries.referralSources = { isError: true, error: new Error('Request failed.') };
    show();
    expect(screen.getByText('Unable to load clinician rankings. Request failed.')).toBeTruthy();
    expect(screen.queryByText('No records are available for this selection.')).toBeNull();
    expect(screen.getByText(/do not confirm referrals/)).toBeTruthy();
    expect(screen.getByText(/a patient may be counted more than once/)).toBeTruthy();
  });

  it('uses consistent no-data messages without claiming providers do not exist', () => {
    state.url.report = 'acquire-hospice';
    state.queries.stateMarketLeaders = { data: { rows: [] } };
    show();
    expect(screen.getByText('No Medicare provider records are available for hospice located in PA.')).toBeTruthy();
    expect(screen.getByText('No records are available for this selection.')).toBeTruthy();
  });

  it('does not print when the export allowance check fails', async () => {
    state.url.report = 'expand-hha';
    state.countExport.mockResolvedValue({ ok: false, message: 'Daily export limit reached.' });
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    await waitFor(() => expect(state.toastError).toHaveBeenCalledWith('Daily export limit reached.'));
    expect(window.print).not.toHaveBeenCalled();
  });
});
