// @vitest-environment jsdom
/**
 * Role-aware UI: admin-only pages are blocked by URL (not just hidden from the
 * nav), admin-only data isn't requested for regular users, and PageHeader
 * renders actions passed as children.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

afterEach(cleanup);

const authState = {
  user: { role: 'user', email: 'rep@example.com', status: 'active' },
  isAuthenticated: true,
  isLoadingAuth: false,
  sessionExpired: false,
  checkAppState: vi.fn(),
  logout: vi.fn(),
};

vi.mock('@/lib/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => authState,
}));

vi.mock('@/lib/NavigationTracker', () => ({ default: () => null }));

vi.mock('../src/pages.config.js', () => ({
  pagesConfig: {
    mainPage: 'Dashboard',
    Pages: {
      Dashboard: () => <div>dashboard page</div>,
      Providers: () => <div>providers page</div>,
      ImportMonitoring: () => <div>import monitoring page</div>,
      Campaigns: () => <div>campaigns page</div>,
    },
    Layout: ({ children }) => <div data-testid="layout">{children}</div>,
    preloadPage: () => {},
  },
}));

const listImportBatches = vi.fn(() => Promise.resolve([]));
const filterAlerts = vi.fn(() => Promise.resolve([]));
const pendingCount = vi.fn(() => Promise.resolve({ count: 2 }));
vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {
      ImportBatch: { list: (...a) => listImportBatches(...a) },
      DataQualityAlert: { filter: (...a) => filterAlerts(...a) },
    },
    admin: { users: { pendingCount: (...a) => pendingCount(...a) } },
  },
}));

import App from '../src/App';
import PageHeader from '../src/components/shared/PageHeader';
import NotificationBell from '../src/components/shared/NotificationBell';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function renderAt(path) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

describe('ProtectedRoute page access', () => {
  beforeEach(() => {
    authState.user = { role: 'user', email: 'rep@example.com', status: 'active' };
  });

  it('shows Access denied inside the layout for a user on an admin page', async () => {
    renderAt('/ImportMonitoring');
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
    expect(screen.getByTestId('layout')).toBeInTheDocument();
    expect(screen.queryByText('import monitoring page')).not.toBeInTheDocument();
  });

  it('blocks alias routes of admin pages too', async () => {
    renderAt('/Campaigns');
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });

  it('lets a user open pages their role allows', async () => {
    renderAt('/Providers');
    expect(await screen.findByText('providers page')).toBeInTheDocument();
  });

  it('sends an account awaiting approval to the waiting screen from any page', async () => {
    authState.user = { role: 'user', email: 'new@example.com', status: 'pending' };
    renderAt('/Providers');
    expect(await screen.findByText('Waiting for approval')).toBeInTheDocument();
    expect(screen.queryByText('providers page')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/pending');
  });

  it('sends an approved account away from the waiting screen', async () => {
    renderAt('/pending');
    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
  });

  it('lets an admin open admin pages', async () => {
    authState.user = { role: 'admin', email: 'admin@example.com' };
    renderAt('/ImportMonitoring');
    expect(await screen.findByText('import monitoring page')).toBeInTheDocument();
  });
});

describe('PageHeader', () => {
  it('renders actions passed as children', () => {
    render(
      <MemoryRouter>
        <PageHeader title="API Connectors">
          <button type="button">Add Custom Connector</button>
        </PageHeader>
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Add Custom Connector' })).toBeInTheDocument();
  });

  it('links breadcrumbs that name a page', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Utilization" breadcrumbs={[{ label: 'Analytics', page: 'AdvancedAnalytics' }, { label: 'Utilization' }]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/AdvancedAnalytics');
  });
});

describe('NotificationBell', () => {
  function renderBell() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    listImportBatches.mockClear();
    filterAlerts.mockClear();
    pendingCount.mockClear();
  });

  it('does not request admin-only import batches or account approvals for a regular user', async () => {
    authState.user = { role: 'user' };
    renderBell();
    await vi.waitFor(() => expect(filterAlerts).toHaveBeenCalled());
    expect(listImportBatches).not.toHaveBeenCalled();
    expect(pendingCount).not.toHaveBeenCalled();
  });

  it('tells an admin how many accounts are waiting for approval', async () => {
    authState.user = { role: 'admin' };
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(await screen.findByText('2 accounts awaiting approval')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2 accounts awaiting approval/ })).toHaveAttribute('href', '/AdminSettings');
  });

  it('requests import batches for an admin', async () => {
    authState.user = { role: 'admin' };
    renderBell();
    await vi.waitFor(() => expect(listImportBatches).toHaveBeenCalled());
  });
});
