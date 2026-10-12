// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
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
    // Nothing fired yet (the panel reads the operations alerts on mount; only the cleanup waits for the confirmation).
    expect(invokeMock).not.toHaveBeenCalledWith('cleanupAllImports');
    await user.click(runAnyway);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('cleanupAllImports'));
  });

  it('cancel button in the confirm dialog does not invoke the function', async () => {
    useAuthMock.mockReturnValue({ user: { id: 1, role: 'admin', email: 'a@x' } });
    render(<MaintenanceHealthPanel />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Cleanup all imports/i }));
    await user.click(await screen.findByRole('button', { name: /^Cancel$/ }));
    expect(invokeMock).not.toHaveBeenCalledWith('cleanupAllImports');
  });

  it('lists what needs attention for platform admins, and nothing for others', async () => {
    useAuthMock.mockReturnValue({ user: { id: 1, role: 'admin', email: 'a@x' } });
    invokeMock.mockImplementation(async (name) => (name === 'getOperationsAlerts'
      ? { data: { alerts: [{ key: 'dataset_behind:x', severity: 'critical', subject: 'Hospital Service Area', message: 'A newer release hasn’t been imported.', since: null }], checked_at: '2026-10-11T12:00:00Z' } }
      : { data: {} }));
    render(<MaintenanceHealthPanel />);
    expect(await screen.findByText('Needs attention (1)')).toBeInTheDocument();
    expect(screen.getByText('Hospital Service Area:')).toBeInTheDocument();
    expect(screen.getByText('critical')).toBeInTheDocument();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith('getOperationsAlerts', {}));
  });

  it("says so when the alerts can't be read, instead of showing nothing (or 'nothing open')", async () => {
    useAuthMock.mockReturnValue({ user: { id: 1, role: 'admin', email: 'a@x' } });
    invokeMock.mockImplementation(async (name) => {
      if (name === 'getOperationsAlerts') throw new Error('Request failed (500)');
      return { data: {} };
    });
    render(<MaintenanceHealthPanel />);
    const section = await screen.findByTestId('operations-alerts');
    expect(await within(section).findByRole('alert')).toHaveTextContent(/Couldn.t load the operations alerts/);
    expect(within(section).getByRole('alert')).toHaveTextContent(/Request failed \(500\)/);
    expect(within(section).getByRole('alert')).toHaveTextContent(/nothing is checking the pipeline from here/);
    expect(screen.queryByText(/Nothing open/)).toBeNull();
  });

  it("shows the alerts again once a later read works", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      useAuthMock.mockReturnValue({ user: { id: 1, role: 'admin', email: 'a@x' } });
      let calls = 0;
      invokeMock.mockImplementation(async (name) => {
        if (name !== 'getOperationsAlerts') return { data: {} };
        calls += 1;
        if (calls === 1) throw new Error('Request failed (503)');
        return { data: { alerts: [], checked_at: '2026-10-11T12:00:00Z' } };
      });
      render(<MaintenanceHealthPanel />);
      expect(await screen.findByText(/Couldn.t load the operations alerts/)).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);
      expect(await screen.findByText(/Nothing open/)).toBeInTheDocument();
      expect(screen.queryByText(/Couldn.t load the operations alerts/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not read or show the operations alerts for an organization's owner", async () => {
    useAuthMock.mockReturnValue({ user: { id: 2, role: 'user', orgRole: 'owner', email: 'o@x' } });
    render(<MaintenanceHealthPanel />);
    await screen.findAllByText(/Maintenance ran|No maintenance runs/);
    expect(screen.queryByTestId('operations-alerts')).not.toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalledWith('getOperationsAlerts', {});
  });
});
