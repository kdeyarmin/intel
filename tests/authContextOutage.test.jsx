// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

const { me } = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { auth: { me } } }));
vi.mock('@/lib/query-client', () => ({ queryClientInstance: { clear: vi.fn() } }));

import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from '../src/lib/AuthContext';
import PendingApproval from '../src/components/auth/PendingApproval';

const apiError = (status, data = {}) => Object.assign(new Error('x'), { status, data });

let auth;
function Probe() {
  auth = useAuth();
  return <p>{auth.isLoadingAuth ? 'loading' : auth.isAuthenticated ? `in:${auth.user.email}` : `out:${auth.authError?.type || ''}`}</p>;
}

beforeEach(() => me.mockReset());

describe('AuthContext session check', () => {
  it('reports an outage instead of signing out on startup', async () => {
    me.mockRejectedValueOnce(apiError(503, { detail: "Unable to check your session." }));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('out:unavailable')).toBeTruthy());
    expect(auth.authError.message).toBe("Unable to check your session.");
  });

  it('keeps a loaded session when a later check hits an outage', async () => {
    me.mockResolvedValueOnce({ email: 'ann@example.com', status: 'pending' });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('in:ann@example.com')).toBeTruthy());
    me.mockRejectedValueOnce(apiError(503));
    await act(async () => { await auth.checkAppState(); });
    expect(screen.getByText('in:ann@example.com')).toBeTruthy();
  });

  it('still signs out on a 401', async () => {
    me.mockRejectedValueOnce(apiError(401));
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('out:auth_required')).toBeTruthy());
  });
});

describe('PendingApproval during an outage', () => {
  it('offers a retry instead of sending a pending user to sign in', async () => {
    me.mockRejectedValueOnce(apiError(503, { detail: "Unable to check your session." }));
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/pending']}>
          <Routes>
            <Route path="/pending" element={<PendingApproval />} />
            <Route path="/login" element={<p>login screen</p>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent("Unable to check your session.");
    expect(screen.queryByText('login screen')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});
