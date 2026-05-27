// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Module-level mocks for the API client and auth context. base44.entities and
// base44.functions are the only surface the panel touches; useAuth is what
// gates the admin controls.
const filterMock = vi.fn();
const invokeMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: { AuditEvent: { filter: (...args) => filterMock(...args) } },
    functions: { invoke: (...args) => invokeMock(...args) },
  },
}));
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

import MaintenanceHealthPanel from '@/components/imports/MaintenanceHealthPanel';

const HEARTBEAT = {
  id: 1,
  created_date: new Date().toISOString(),
  details: {
    invoked_by: 'cron',
    workers: [
      { worker: 'autoResumePausedImports', ok: true, duration_ms: 12 },
      { worker: 'autoRetryFailedImports', ok: true, duration_ms: 7 },
      { worker: 'cancelStalledImports', ok: true, duration_ms: 3 },
    ],
    succeeded: 3,
    failed: 0,
  },
};

beforeEach(() => {
  filterMock.mockReset();
  invokeMock.mockReset();
  useAuthMock.mockReset();
  filterMock.mockResolvedValue([HEARTBEAT]);
});

afterEach(cleanup);

describe('MaintenanceHealthPanel — admin gating', () => {
  it('does not render the manual controls for non-admin users', async () => {
    useAuthMock.mockReturnValue({ user: { id: 1, role: 'user', email: 'u@x' } });
    render(<MaintenanceHealthPanel />);
    await waitFor(() => expect(filterMock).toHaveBeenCalled());
    // Headline still renders for everyone
    await screen.findByText(/Maintenance ran/);
    // But the manual-controls block is admin-only
    expect(screen.queryByTestId('maintenance-actions')).toBeNull();
    expect(screen.queryByRole('button', { name: /Run all maintenance/i })).toBeNull();
  });

  it('renders Run-now buttons for admin users', async () => {
    useAuthMock.mockReturnValue({ user: { id: 1, role: 'admin', email: 'a@x' } });
    render(<MaintenanceHealthPanel />);
    await screen.findByTestId('maintenance-actions');
    expect(screen.getByRole('button', { name: /Run all maintenance/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resume paused imports/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry failed imports/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel stalled imports/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cleanup all imports/i })).toBeInTheDocument();
  });

  it('invokes the function endpoint on Run-now click and surfaces the result', async () => {
    useAuthMock.mockReturnValue({ user: { id: 1, role: 'admin', email: 'a@x' } });
    invokeMock.mockResolvedValue({ data: { success: true, worker: {
      worker: 'autoRetryFailedImports', ok: true, durationMs: 5, details: { scanned: 4, retried_count: 1 },
    } } });
    render(<MaintenanceHealthPanel />);
    const user = userEvent.setup();
    const btn = await screen.findByRole('button', { name: /Retry failed imports/i });
    await user.click(btn);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('autoRetryFailedImports'));
    expect(await screen.findByText(/4 scanned, 1 retried/)).toBeInTheDocument();
  });

  it('shows a confirm dialog for destructive cleanup and only invokes on confirm', async () => {
    useAuthMock.mockReturnValue({ user: { id: 1, role: 'admin', email: 'a@x' } });
    invokeMock.mockResolvedValue({ data: { success: true, worker: { worker: 'cleanupAllImports', ok: true, durationMs: 9, details: {} } } });
    render(<MaintenanceHealthPanel />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Cleanup all imports/i }));
    // Confirm dialog should appear
    const runAnyway = await screen.findByRole('button', { name: /Run anyway/i });
    // Nothing fired yet
    expect(invokeMock).not.toHaveBeenCalled();
    await user.click(runAnyway);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('cleanupAllImports'));
  });

  it('cancel button in the confirm dialog does not invoke the function', async () => {
    useAuthMock.mockReturnValue({ user: { id: 1, role: 'admin', email: 'a@x' } });
    render(<MaintenanceHealthPanel />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Cleanup all imports/i }));
    await user.click(await screen.findByRole('button', { name: /^Cancel$/ }));
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
