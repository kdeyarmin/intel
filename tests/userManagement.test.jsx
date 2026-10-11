// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

afterEach(cleanup);

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, email: 'admin@example.com', role: 'admin', status: 'active' } }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { confirmMock, api, USERS } = vi.hoisted(() => {
  const org = { org_id: 1, org_name: 'Test organization' };
  const USERS = [
    { id: 1, email: 'admin@example.com', full_name: 'Ada', role: 'admin', status: 'active', created_date: '2026-01-01', ...org, org_role: 'owner' },
    { id: 2, email: 'new@example.com', full_name: 'Newt', role: 'user', status: 'pending', created_date: '2026-10-01', ...org, org_role: 'member' },
    { id: 3, email: 'rep@example.com', full_name: 'Rex', role: 'user', status: 'active', created_date: '2026-02-01', ...org, org_role: 'member' },
    { id: 4, email: 'gone@example.com', full_name: null, role: 'user', status: 'disabled', disabled_reason: 'Left', created_date: '2026-03-01', ...org, org_role: 'member' },
  ];
  const api = {
    // A platform admin's view: every organization, no seat limit of its own.
    list: vi.fn(() => Promise.resolve({ users: USERS, email_enabled: false, platform_admin: true, organization: null })),
    activity: vi.fn(() => Promise.resolve({ events: [{ id: 9, action: 'signup', user_email: 'new@example.com', details: { target_email: 'new@example.com' }, created_date: '2026-10-01T10:00:00Z' }] })),
    approve: vi.fn(() => Promise.resolve({ user: { ...USERS[1], status: 'active' }, emailed: false })),
    enable: vi.fn(() => Promise.resolve({})),
    update: vi.fn(() => Promise.resolve({})),
    invite: vi.fn(() => Promise.resolve({ user: { id: 5, email: 'ivy@example.com' }, link: 'https://app.example.com/reset-password?token=abc', expires_at: '2026-10-17T00:00:00Z', emailed: false })),
    resetLink: vi.fn(),
    revokeSessions: vi.fn(),
    disable: vi.fn(),
    remove: vi.fn(),
  };
  return { confirmMock: vi.fn(() => Promise.resolve(true)), api, USERS };
});
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => confirmMock }));

vi.mock('@/api/base44Client', () => ({ base44: { admin: { users: api } } }));

import UserManagement from '../src/components/admin/UserManagement';

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <UserManagement />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('UserManagement', () => {
  beforeEach(() => {
    for (const fn of Object.values(api)) fn.mockClear();
    confirmMock.mockClear();
  });

  it('tells a platform admin that they approve new sign-ups (or payment does), not an owner', async () => {
    // A self-serve sign-up starts its own organization, so no owner can see it: the wrong approver in this line left it waiting.
    renderIt();
    await screen.findByRole('table');
    expect(screen.getByText(/New sign-ups wait here until you approve them or they subscribe/)).toBeInTheDocument();
    expect(screen.queryByText(/until an owner approves/)).toBeNull();
  });

  it('tells an owner nothing about approving sign-ups: their organization\'s people are invited, not approved', async () => {
    api.list.mockImplementationOnce(() => Promise.resolve({ users: USERS, email_enabled: true, platform_admin: false, organization: { name: 'Acme Homes', seats: { used: 2, limit: 5 } } }));
    renderIt();
    await screen.findByRole('table');
    expect(screen.getByText(/People in Acme Homes\./)).toBeInTheDocument();
    expect(screen.queryByText(/approves them|you approve them/)).toBeNull();
  });

  it('opens on the people waiting for approval, and approves one', async () => {
    renderIt();
    const table = await screen.findByRole('table');
    expect(within(table).getByText('new@example.com')).toBeInTheDocument();
    expect(within(table).queryByText('rep@example.com')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Awaiting approval 1/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/links are shown here for you to pass on/)).toBeInTheDocument();

    fireEvent.click(within(table).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(api.approve).toHaveBeenCalledWith(2));
  });

  it("filters, searches, and doesn't offer actions on your own account", async () => {
    renderIt();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: /^All 4/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search users' }), { target: { value: 'ada' } });
    const table = screen.getByRole('table');
    expect(within(table).getByText('(you)')).toBeInTheDocument();
    expect(within(table).queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
    expect(within(table).getByRole('combobox', { name: 'Organization role for admin@example.com' })).toBeDisabled();
    expect(within(table).getByRole('combobox', { name: 'Platform role for admin@example.com' })).toBeDisabled();
  });

  it("shows an organization's owner their own people and seats, without platform roles", async () => {
    api.list.mockResolvedValueOnce({
      users: USERS.filter((u) => u.id !== 1),
      email_enabled: false,
      platform_admin: false,
      organization: { id: 1, name: 'Test organization', seats: { used: 3, limit: 3 } },
    });
    renderIt();
    const table = await screen.findByRole('table');
    expect(screen.getByText(/People in Test organization/)).toBeInTheDocument();
    expect(screen.getAllByText(/3 of 3 seats used/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /^All 3/ }));
    expect(within(table).getByRole('combobox', { name: 'Organization role for rep@example.com' })).toBeEnabled();
    expect(within(table).queryByRole('combobox', { name: /Platform role/ })).not.toBeInTheDocument();
    // The seat limit is reached: no more invites until the plan grows.
    expect(screen.getByRole('button', { name: /Create invite/ })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'upgrade the plan' })).toHaveAttribute('href', '/Billing');
  });

  it('shows why a disabled account was disabled and can enable it', async () => {
    renderIt();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: /^Disabled 1/ }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Left')).toBeInTheDocument();
    fireEvent.click(within(table).getByRole('button', { name: 'Enable' }));
    await waitFor(() => expect(api.enable).toHaveBeenCalledWith(4));
  });

  it('shows an invite link once, to pass on when email is off', async () => {
    renderIt();
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ivy@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Create invite/ }));
    await waitFor(() => expect(api.invite).toHaveBeenCalledWith({ email: 'ivy@example.com', full_name: '', role: 'user', org_role: 'member' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: 'One-time link' })).toHaveValue('https://app.example.com/reset-password?token=abc');
    expect(within(dialog).getByText(/Send this to ivy@example.com yourself/)).toBeInTheDocument();
  });

  it('starts the disable dialog fresh for each account', async () => {
    renderIt();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: /^All 4/ }));
    const openDisable = async (email) => {
      fireEvent.keyDown(screen.getByRole('button', { name: `More actions for ${email}` }), { key: 'Enter' });
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Disable account' }));
      return screen.findByRole('dialog');
    };
    let dialog = await openDisable('rep@example.com');
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'Left the team' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    dialog = await openDisable('new@example.com');
    expect(within(dialog).getByLabelText(/Reason/)).toHaveValue('');
  });

  it('lists recent account activity', async () => {
    renderIt();
    expect(await screen.findByText(/signed up/)).toBeInTheDocument();
  });
});
