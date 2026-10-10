// @vitest-environment jsdom
/**
 * Accessibility checks with axe-core for the app shell and key screens, plus
 * keyboard behaviour of the sidebar and global search. Colour contrast is
 * left out: jsdom doesn't compute styles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axe from 'axe-core';

afterEach(cleanup);

const { auth, adminApi, search } = vi.hoisted(() => ({
  auth: {
    value: {
      user: { id: 1, email: 'admin@example.com', full_name: 'Ada Admin', role: 'admin', status: 'active' },
      login: vi.fn(), signup: vi.fn(), logout: vi.fn(), isAuthenticated: false, isLoadingAuth: false, authError: null,
    },
  },
  adminApi: {
    list: vi.fn(() => Promise.resolve({
      users: [
        { id: 1, email: 'admin@example.com', full_name: 'Ada', role: 'admin', status: 'active', created_date: '2026-01-01' },
        { id: 2, email: 'new@example.com', full_name: 'Newt', role: 'user', status: 'pending', created_date: '2026-10-01' },
      ],
      email_enabled: false,
    })),
    activity: vi.fn(() => Promise.resolve({ events: [] })),
  },
  search: { invoke: vi.fn() },
}));

vi.mock('@/lib/AuthContext', () => ({ useAuth: () => auth.value, useOptionalAuth: () => auth.value }));
vi.mock('@/pages.config.js', () => ({ pagesConfig: { preloadPage: () => {} } }));
vi.mock('../src/components/shared/NotificationBell', () => ({ default: () => <button type="button" aria-label="Notifications">!</button> }));
vi.mock('../src/components/auth/AccountDialog', () => ({ default: () => null }));
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => async () => true }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/api/base44Client', () => ({
  base44: {
    admin: { users: adminApi },
    functions: { invoke: (...a) => search.invoke(...a) },
    entities: new Proxy({}, { get: () => ({ list: () => Promise.resolve([]), filter: () => Promise.resolve([]) }) }),
  },
}));

import AppLayout from '../src/components/layout/AppLayout';
import GlobalSearchDialog from '../src/components/search/GlobalSearchDialog';
import Login from '../src/pages/Login';
import UserManagement from '../src/components/admin/UserManagement';

function wrap(ui, path = '/Dashboard') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

async function violations(node = document.body) {
  const results = await axe.run(node, {
    rules: { 'color-contrast': { enabled: false } },
    resultTypes: ['violations'],
  });
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

function setWidth(width) {
  window.innerWidth = width;
  window.matchMedia = (query) => ({
    matches: /min-width: 1024px/.test(query) ? width >= 1024 : false,
    media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
}

beforeEach(() => {
  // jsdom doesn't implement scrolling.
  Element.prototype.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
  localStorage.clear();
  setWidth(1280);
  auth.value = { ...auth.value, isAuthenticated: false, user: { id: 1, email: 'admin@example.com', full_name: 'Ada Admin', role: 'admin', status: 'active' } };
});

describe('axe in jsdom', () => {
  it('does report real problems (so the clean results below mean something)', async () => {
    const { container } = render(<div><input type="text" /><button type="button"><svg /></button></div>);
    const found = await violations(container);
    expect(found.some((v) => v.startsWith('label:'))).toBe(true);
    expect(found.some((v) => v.startsWith('button-name:'))).toBe(true);
  });
});

describe('app shell', () => {
  it('has no axe violations, landmarks and a working skip link', async () => {
    wrap(<AppLayout currentPageName="Dashboard"><h1>Dashboard</h1></AppLayout>);
    expect(await violations()).toEqual([]);
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    const main = screen.getByRole('main');
    fireEvent.click(screen.getByRole('link', { name: 'Skip to main content' }));
    expect(document.activeElement).toBe(main);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('section toggles report whether they are expanded', () => {
    wrap(<AppLayout currentPageName="Dashboard"><h1>Dashboard</h1></AppLayout>);
    const toggle = screen.getByRole('button', { name: 'Directory' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'All Providers' })).not.toBeInTheDocument();
  });

  it('takes a collapsed sidebar out of the tab order', () => {
    wrap(<AppLayout currentPageName="Dashboard"><h1>Dashboard</h1></AppLayout>);
    const aside = screen.getByRole('complementary', { name: 'Sidebar' });
    expect(aside.hasAttribute('inert')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(aside.hasAttribute('inert')).toBe(true);
  });

  it('on a small screen, Escape closes the open sidebar and focus returns to its button', async () => {
    setWidth(500);
    wrap(<AppLayout currentPageName="Dashboard"><h1>Dashboard</h1></AppLayout>);
    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Collapse sidebar' })));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open sidebar' })));
  });
});

describe('global search', () => {
  it('is a labelled dialog whose input drives a listbox with the keyboard', async () => {
    search.invoke.mockResolvedValue({ data: {
      providers: [
        { npi: '1000000001', first_name: 'Ann', last_name: 'Chen', entity_type: 'Individual' },
        { npi: '1000000002', first_name: 'Bo', last_name: 'Chen', entity_type: 'Individual' },
      ],
    } });
    wrap(<GlobalSearchDialog open onOpenChange={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Search' })).toBeInTheDocument();
    const box = screen.getByRole('combobox', { name: 'Search' });
    fireEvent.change(box, { target: { value: 'chen' } });
    await screen.findByRole('listbox', { name: 'Search results' }, { timeout: 3000 });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    const active = box.getAttribute('aria-activedescendant');
    expect(active).toBeTruthy();
    expect(document.getElementById(active)).toHaveAttribute('aria-selected', 'true');
    expect(box).toHaveAttribute('aria-expanded', 'true');
    expect(await violations()).toEqual([]);
  });
});

describe('screens', () => {
  it('sign-in has no axe violations', async () => {
    const { container } = wrap(<Login />, '/login');
    await screen.findByRole('button', { name: /sign in/i });
    expect(await violations(container)).toEqual([]);
  });

  it('user management has no axe violations', async () => {
    const { container } = wrap(<UserManagement />);
    await screen.findByText('new@example.com');
    await act(async () => {});
    expect(await violations(container)).toEqual([]);
  });
});
