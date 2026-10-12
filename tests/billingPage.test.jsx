// @vitest-environment jsdom
/**
 * The Billing page: a county pack opens on the state its counties are in,
 * an owner is told to choose a territory when the plan covers none yet, and a
 * plan change on an existing subscription happens in place (no Stripe page).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const h = vi.hoisted(() => ({
  status: vi.fn(), checkout: vi.fn(), portal: vi.fn(), setTerritory: vi.fn(), invoke: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }, checkAppState: vi.fn(),
}));
vi.mock('@/api/base44Client', () => ({
  base44: { billing: { status: h.status, checkout: h.checkout, portal: h.portal, setTerritory: h.setTerritory }, functions: { invoke: h.invoke } },
}));
vi.mock('@/lib/AuthContext', () => {
  const value = { user: { email: 'owner@riverbend.org', role: 'user', orgId: 2, orgRole: 'owner' }, checkAppState: h.checkAppState };
  return { useAuth: () => value, useOptionalAuth: () => value };
});
vi.mock('sonner', () => ({ toast: h.toast }));

import Billing from '../src/pages/Billing';

const PLANS = [
  { code: 'county_pack', name: 'County Pack', description: '', monthly_price_cents: 29900, seat_limit: 3, territory_scope: 'county_pack', max_counties: 5, quotas: null, checkout_available: true },
  { code: 'state', name: 'State', description: '', monthly_price_cents: 89900, seat_limit: 10, territory_scope: 'state', max_counties: null, quotas: null, checkout_available: true },
];

const status = (over = {}) => ({
  organization: { id: 2, name: 'Riverbend Hospice', status: 'active', plan_code: 'county_pack', territory: { states: [], county_fips: ['39035'] }, has_customer: true, trial_ends_at: null, current_period_end: '2026-11-01T00:00:00Z' },
  plan: PLANS[0],
  seats: { used: 2, limit: 3 },
  usage: null,
  stripe_configured: true,
  plans: PLANS,
  is_owner: true,
  needs_territory_choice: false,
  ...over,
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/Billing']}><Billing /></MemoryRouter>
    </QueryClientProvider>,
  );
}

let assign;
beforeEach(() => {
  for (const fn of [h.status, h.checkout, h.portal, h.setTerritory, h.invoke, h.checkAppState, ...Object.values(h.toast)]) fn.mockReset();
  assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
  h.invoke.mockImplementation((fn, args) => Promise.resolve({
    data: { counties: args.state === 'OH' ? [{ fips: '39035', name: 'Cuyahoga County' }, { fips: '39049', name: 'Franklin County' }] : [{ fips: '42003', name: 'Allegheny County' }] },
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('territory editor', () => {
  it("opens a county pack on the state its counties are in, with them checked (not on Pennsylvania)", async () => {
    h.status.mockResolvedValue(status());
    renderPage();
    const box = await screen.findByRole('checkbox', { name: 'Cuyahoga County' });
    expect(box).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Franklin County' })).not.toBeChecked();
    expect(h.invoke).toHaveBeenCalledWith('getGeoCounties', { state: 'OH' });
    expect(h.invoke).not.toHaveBeenCalledWith('getGeoCounties', { state: 'PA' });
  });

  it('saves the chosen counties', async () => {
    h.status.mockResolvedValue(status());
    h.setTerritory.mockResolvedValue({ territory: {} });
    renderPage();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Franklin County' }));
    fireEvent.click(screen.getByRole('button', { name: /Save territory/ }));
    await waitFor(() => expect(h.setTerritory).toHaveBeenCalledWith({ states: [], county_fips: expect.arrayContaining(['39035', '39049']) }));
  });
});

describe('a plan that covers chosen places but none are chosen', () => {
  const empty = { organization: { ...status().organization, territory: { states: [], county_fips: [] } }, needs_territory_choice: true };

  it('tells an owner to choose, and says the views are locked until then', async () => {
    h.status.mockResolvedValue(status(empty));
    renderPage();
    expect(await screen.findByText(/Choose the places your plan covers below/)).toBeInTheDocument();
    expect(screen.getByText(/stay locked/)).toBeInTheDocument();
  });

  it('tells a member to ask an owner', async () => {
    h.status.mockResolvedValue(status({ ...empty, is_owner: false }));
    renderPage();
    expect(await screen.findByText(/An owner needs to choose the places your plan covers/)).toBeInTheDocument();
  });

  it("says nothing when the territory is chosen", async () => {
    h.status.mockResolvedValue(status());
    renderPage();
    await screen.findByText(/Riverbend Hospice/);
    expect(screen.queryByText(/Choose the places your plan covers/)).toBeNull();
  });
});

describe('choosing a plan', () => {
  it('changes an existing subscription in place: no Stripe page, a note, and a fresh status', async () => {
    h.status.mockResolvedValue(status());
    h.checkout.mockResolvedValue({ changed: true, plan_code: 'state' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Choose plan' }));
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith(expect.stringMatching(/Plan change submitted/)));
    expect(h.checkout).toHaveBeenCalledWith('state');
    expect(assign).not.toHaveBeenCalled();
    await waitFor(() => expect(h.status).toHaveBeenCalledTimes(2));
    expect(h.checkAppState).toHaveBeenCalled();
  });

  it('sends a first subscription to Stripe Checkout', async () => {
    h.status.mockResolvedValue(status());
    h.checkout.mockResolvedValue({ url: 'https://checkout.stripe.test/c/1' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Choose plan' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout.stripe.test/c/1'));
    expect(h.toast.success).not.toHaveBeenCalled();
  });
});
