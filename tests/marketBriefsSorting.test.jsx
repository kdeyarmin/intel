// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MarketBriefs from '../src/pages/MarketBriefs';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/api/functionResult', () => ({ invokeOrThrow: (...args) => invoke(...args) }));
vi.mock('@/lib/BusinessLineContext', () => ({ useBusinessLine: () => ({ profile: null }) }));
vi.mock('@/components/layout/PageTabs', () => ({ default: () => null }));

afterEach(cleanup);

function Probe() {
  return <output data-testid="url">{useLocation().search}</output>;
}

function renderReport(search) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/MarketBriefs?${search}`]}>
        <MarketBriefs /><Probe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const counties = [
  { fips: '42001', name: 'Alpha County', values: { hospice_users_pct: 9, hospice_providers: 3, std_per_capita_hospice: 900 }, volume: { hospice_users: 900, hospice_users_change_pct: 3, hospice_providers_change_pct: 0 } },
  { fips: '42003', name: 'Beta County', values: { hospice_users_pct: 12, hospice_providers: 2, std_per_capita_hospice: 1200 }, volume: { hospice_users: 1200, hospice_users_change_pct: 12, hospice_providers_change_pct: -2 } },
  { fips: '42005', name: 'Gamma County', values: { hospice_users_pct: null, hospice_providers: null, std_per_capita_hospice: null }, volume: { hospice_users: 40 } },
  { fips: '42007', name: 'Missing County', values: {}, volume: {} },
];

function tableIn(title) {
  return within(screen.getByRole('heading', { name: title }).closest('section')).getByRole('table');
}

function names(table) {
  return within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);
}

describe('Market Briefs header sorting', () => {
  it.each([
    ['County', 'name', ['Gamma County', 'Beta County', 'Alpha County'], ['Alpha County', 'Beta County', 'Gamma County']],
    ['Users', 'users', ['Beta County', 'Alpha County', 'Gamma County'], ['Gamma County', 'Alpha County', 'Beta County']],
    ['Share of FFS', 'usersPct', ['Beta County', 'Alpha County', 'Gamma County'], ['Alpha County', 'Beta County', 'Gamma County']],
    ['Vs last year', 'usersChange', ['Beta County', 'Alpha County', 'Gamma County'], ['Alpha County', 'Beta County', 'Gamma County']],
    ['Hospices', 'billing', ['Alpha County', 'Beta County', 'Gamma County'], ['Beta County', 'Alpha County', 'Gamma County']],
    ['Users each', 'usersPerProvider', ['Beta County', 'Alpha County', 'Gamma County'], ['Alpha County', 'Beta County', 'Gamma County']],
    ['Spend / beneficiary', 'spend', ['Beta County', 'Alpha County', 'Gamma County'], ['Alpha County', 'Beta County', 'Gamma County']],
  ])('maps %s to %s and toggles both directions with missing values last', async (label, key, descending, ascending) => {
    invoke.mockReset().mockResolvedValue({ counties });
    renderReport('report=expand-hospice&sort=billing&direction=asc');
    await screen.findByText('Largest counties');
    const table = tableIn('Largest counties');
    const header = within(table).getByRole('columnheader', { name: label });
    const button = within(header).getByRole('button', { name: label });
    expect(button).toHaveClass('cursor-pointer', 'hover:text-cyan-400');
    fireEvent.click(button);
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(names(table)).toEqual(descending);
    expect(new URLSearchParams(screen.getByTestId('url').textContent).get('sort') || 'users').toBe(key);
    fireEvent.click(button);
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(names(table)).toEqual(ascending);
    expect(screen.getByTestId('url')).toHaveTextContent('direction=asc');
    expect(screen.queryByRole('columnheader', { name: /billing/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Missing County')).not.toBeInTheDocument();
  });

  it('toggles the default Users sort through the keyboard without changing the narrative', async () => {
    invoke.mockReset().mockResolvedValue({ counties });
    renderReport('report=expand-hospice');
    await screen.findByText('Largest counties');
    const table = tableIn('Largest counties');
    expect(names(table)).toEqual(['Beta County', 'Alpha County', 'Gamma County']);
    const narrative = screen.getByText(/PA has hospice user counts/);
    const original = narrative.textContent;
    within(table).getByRole('button', { name: 'Users' }).focus();
    await userEvent.keyboard('{Enter}');
    expect(names(table)).toEqual(['Gamma County', 'Alpha County', 'Beta County']);
    expect(narrative.textContent).toBe(original);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('sorts the rising counties independently using raw numeric values', async () => {
    invoke.mockReset().mockResolvedValue({ counties });
    renderReport('report=expand-hospice');
    await screen.findByText('Largest counties');
    const rising = tableIn('Use rose; hospices did not');
    const largest = tableIn('Largest counties');
    expect(names(rising)).toEqual(['Beta County', 'Alpha County']);
    fireEvent.click(within(rising).getByRole('button', { name: 'Their change' }));
    expect(names(rising)).toEqual(['Alpha County', 'Beta County']);
    fireEvent.click(within(rising).getByRole('button', { name: 'Their change' }));
    expect(names(rising)).toEqual(['Beta County', 'Alpha County']);
    expect(names(largest)).toEqual(['Beta County', 'Alpha County', 'Gamma County']);
  });

  it('sorts all counties before selecting the 15 displayed rows', async () => {
    invoke.mockReset().mockResolvedValue({ counties: Array.from({ length: 20 }, (_, i) => ({
      fips: String(i), name: `County ${i}`, values: { hospice_providers: 1 }, volume: { hospice_users: i + 1 },
    })) });
    renderReport('report=expand-hospice');
    await screen.findByText('Largest counties');
    const table = tableIn('Largest counties');
    expect(names(table)).toHaveLength(15);
    expect(names(table)[0]).toBe('County 19');
    fireEvent.click(within(table).getByRole('button', { name: 'Users' }));
    expect(names(table)[0]).toBe('County 0');
    expect(names(table)[14]).toBe('County 14');
  });

  it('keeps the dropdown synchronized with header sorting and resets it to descending', async () => {
    window.HTMLElement.prototype.scrollIntoView = () => {};
    invoke.mockReset().mockResolvedValue({ counties });
    renderReport('report=expand-hospice');
    await screen.findByText('Largest counties');
    const table = tableIn('Largest counties');
    fireEvent.click(within(table).getByRole('button', { name: 'Hospices' }));
    fireEvent.click(within(table).getByRole('button', { name: 'Hospices' }));
    const select = document.getElementById('brief-sort');
    expect(select).toHaveTextContent('Hospices');
    fireEvent.click(select);
    fireEvent.click(await screen.findByRole('option', { name: 'Users' }));
    expect(within(table).getByRole('columnheader', { name: 'Users' })).toHaveAttribute('aria-sort', 'descending');
    expect(names(table)).toEqual(['Beta County', 'Alpha County', 'Gamma County']);
  });

  it('sorts acquisition tables numerically and by provider name, keeping links intact', async () => {
    invoke.mockReset().mockResolvedValue({ rows: [
      { ccn: '1', name: 'Alpha Hospice', benes: 900, share: 0.09, payment: 900, dual_pct: 9, counties_served: 9 },
      { ccn: '2', name: 'Beta Hospice', benes: 1200, share: 0.12, payment: 1200, dual_pct: 12, counties_served: 12 },
      { ccn: '3', name: 'Gamma Hospice', benes: null, share: null, payment: null, dual_pct: null, counties_served: null },
    ] });
    renderReport('report=acquire-hospice');
    await screen.findByRole('link', { name: 'Alpha Hospice' });
    const table = tableIn('Largest by Medicare beneficiaries');
    for (const label of ['Beneficiaries', 'Share', 'Payment', 'Dual %', 'Counties served']) {
      fireEvent.click(within(table).getByRole('button', { name: label }));
      expect(names(table)).toEqual(['Beta Hospice', 'Alpha Hospice', 'Gamma Hospice']);
      fireEvent.click(within(table).getByRole('button', { name: label }));
      expect(names(table)).toEqual(['Alpha Hospice', 'Beta Hospice', 'Gamma Hospice']);
    }
    fireEvent.click(within(table).getByRole('button', { name: 'Provider' }));
    expect(names(table)).toEqual(['Gamma Hospice', 'Beta Hospice', 'Alpha Hospice']);
    expect(screen.getByRole('link', { name: 'Alpha Hospice' })).toHaveAttribute('href', '/FacilityDetail?id=1&group=hospital');
  });
});
