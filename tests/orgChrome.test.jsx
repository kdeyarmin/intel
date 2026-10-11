// @vitest-environment jsdom
/**
 * What the app shows an organization's people about their plan: the sidebar
 * widget and the account dialog link to Billing only for those who may open
 * it (owners and platform admins), and members are told to ask an owner.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const h = vi.hoisted(() => ({ user: { value: null }, status: vi.fn() }));
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: h.user.value, logoutEverywhere: vi.fn(), login: vi.fn(), signup: vi.fn(), isAuthenticated: false, isLoadingAuth: false, authError: null }),
}));
vi.mock('@/api/base44Client', () => ({ base44: { billing: { status: h.status }, auth: { changePassword: vi.fn() } } }));

import BillingStatusWidget from '../src/components/layout/BillingStatusWidget';
import AccountDialog from '../src/components/auth/AccountDialog';
import Login from '../src/pages/Login';
import { ConfirmProvider } from '../src/components/shared/ConfirmDialog';

const OWNER = { email: 'owner@riverbend.org', role: 'user', orgId: 2, orgRole: 'owner', orgName: 'Riverbend Hospice' };
const MEMBER = { email: 'member@riverbend.org', role: 'user', orgId: 2, orgRole: 'member', orgName: 'Riverbend Hospice' };
const ADMIN = { email: 'platform@example.com', role: 'admin', isPlatformAdmin: true, orgId: 1, orgRole: 'owner', orgName: 'CareMetric (legacy)' };

const STATUS = (overrides = {}) => ({
  organization: { id: 2, name: 'Riverbend Hospice', status: 'active', trial_ends_at: null, ...overrides },
  plan: { code: 'county_pack', name: 'County Pack' },
  usage: { used: { ai_calls: 4 }, limits: { ai_calls: 100 } },
});

function renderWidget(user, props = { sidebarOpen: true }) {
  h.user.value = user;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><BillingStatusWidget {...props} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => h.status.mockReset());

describe('BillingStatusWidget', () => {
  it('links an owner to the billing page', async () => {
    h.status.mockResolvedValue(STATUS());
    renderWidget(OWNER);
    expect(await screen.findByRole('link', { name: /County Pack/ })).toHaveAttribute('href', '/Billing');
  });

  it('shows a member the plan without a link they could not open', async () => {
    h.status.mockResolvedValue(STATUS());
    renderWidget(MEMBER);
    expect(await screen.findByText('County Pack')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('tells a member to ask an owner when a payment failed, and an owner where to fix it', async () => {
    h.status.mockResolvedValue(STATUS({ status: 'past_due' }));
    renderWidget(MEMBER);
    expect(await screen.findByText(/Ask an owner to fix it/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Fix it' })).toBeNull();
    cleanup();
    renderWidget(OWNER);
    expect(await screen.findByRole('link', { name: 'Fix it' })).toHaveAttribute('href', '/Billing');
  });

  it('gives the collapsed sidebar a link for an owner and a label for a member', async () => {
    h.status.mockResolvedValue(STATUS());
    renderWidget(OWNER, { sidebarOpen: false });
    expect(await screen.findByRole('link', { name: 'Plan and billing' })).toHaveAttribute('href', '/Billing');
    cleanup();
    renderWidget(MEMBER, { sidebarOpen: false });
    expect(await screen.findByRole('img', { name: 'Plan: Active' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows a platform admin the link as well', async () => {
    h.status.mockResolvedValue(STATUS());
    renderWidget(ADMIN);
    expect(await screen.findByRole('link', { name: /County Pack/ })).toHaveAttribute('href', '/Billing');
  });
});

describe('AccountDialog', () => {
  function renderDialog(user) {
    h.user.value = user;
    return render(
      <MemoryRouter><ConfirmProvider><AccountDialog open onOpenChange={() => {}} /></ConfirmProvider></MemoryRouter>,
    );
  }

  it('offers plan and billing to an owner only', () => {
    renderDialog(OWNER);
    expect(screen.getByRole('link', { name: 'Plan and billing' })).toHaveAttribute('href', '/Billing');
    cleanup();
    renderDialog(MEMBER);
    expect(screen.getByText(/Signed in as member@riverbend.org \(member of Riverbend Hospice\)/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Plan and billing' })).toBeNull();
  });
});

describe('Login', () => {
  it("says new accounts wait for an administrator's approval, and doesn't promise that choosing a plan activates one", () => {
    h.user.value = null;
    render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Create one/ }));
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent(/reviews new accounts before they can sign in/);
    expect(note).not.toHaveTextContent(/choosing a plan/i);
  });
});
