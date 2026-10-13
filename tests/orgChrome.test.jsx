// @vitest-environment jsdom
/**
 * Billing remains available to authorized users through the account dialog,
 * without displaying subscription status or quotas in the sidebar.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

afterEach(cleanup);

const h = vi.hoisted(() => ({ user: { value: null }, status: vi.fn() }));
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: h.user.value, logoutEverywhere: vi.fn(), login: vi.fn(), signup: vi.fn(), isAuthenticated: false, isLoadingAuth: false, authError: null }),
}));
vi.mock('@/api/base44Client', () => ({ base44: { billing: { status: h.status }, auth: { changePassword: vi.fn() } } }));

import AccountDialog from '../src/components/auth/AccountDialog';
import Login from '../src/pages/Login';
import { ConfirmProvider } from '../src/components/shared/ConfirmDialog';

const OWNER = { email: 'owner@riverbend.org', role: 'user', orgId: 2, orgRole: 'owner', orgName: 'Riverbend Hospice' };
const MEMBER = { email: 'member@riverbend.org', role: 'user', orgId: 2, orgRole: 'member', orgName: 'Riverbend Hospice' };
describe('Sidebar billing removal', () => {
  it('removes the subscription widget and its sidebar request entirely', () => {
    const layout = readFileSync(resolve(process.cwd(), 'src/components/layout/AppLayout.jsx'), 'utf8');
    expect(layout).not.toContain('BillingStatusWidget');
    expect(layout).not.toContain('billing.status');
    expect(existsSync(resolve(process.cwd(), 'src/components/layout/BillingStatusWidget.jsx'))).toBe(false);
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
    fireEvent.click(screen.getByRole('button', { name: /Create an account/ }));
    const note = screen.getByRole('status');
    expect(note).toHaveTextContent(/New accounts require administrator approval/);
    expect(note).not.toHaveTextContent(/choosing a plan/i);
  });
});
