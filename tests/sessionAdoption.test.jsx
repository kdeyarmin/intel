// @vitest-environment jsdom
/**
 * After a reset or invite link the server answers the account only. The app
 * must read the session (organization, owner role, plan) from /auth/me before
 * it opens, as it does after sign-in: an invited owner would otherwise open
 * the app as a plain member until the next reload.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';

const { me } = vi.hoisted(() => ({ me: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { auth: { me } } }));
vi.mock('@/lib/query-client', () => ({ queryClientInstance: { clear: vi.fn() } }));

import { AuthProvider, useAuth } from '../src/lib/AuthContext';

const apiError = (status) => Object.assign(new Error('x'), { status });

let auth;
function Probe() {
  auth = useAuth();
  return <p>{auth.isLoadingAuth ? 'loading' : auth.isAuthenticated ? `in:${auth.user.email}:${auth.user.orgRole ?? 'none'}` : 'out'}</p>;
}

beforeEach(() => me.mockReset());
afterEach(cleanup);

async function signedOut() {
  me.mockRejectedValueOnce(apiError(401));
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(screen.getByText('out')).toBeTruthy());
}

describe('adoptSession', () => {
  it("reads the session from /auth/me, not the bare account the reset answered", async () => {
    await signedOut();
    me.mockResolvedValueOnce({ email: 'owner@example.com', status: 'active', orgId: 7, orgRole: 'owner' });
    let result;
    await act(async () => { result = await auth.adoptSession({ email: 'owner@example.com', status: 'active' }); });
    expect(me).toHaveBeenLastCalledWith({ probe: true });
    expect(result).toMatchObject({ orgId: 7, orgRole: 'owner' });
    expect(screen.getByText('in:owner@example.com:owner')).toBeTruthy();
  });

  it('falls back to the account when the session cannot be read', async () => {
    await signedOut();
    me.mockRejectedValueOnce(apiError(503));
    await act(async () => { await auth.adoptSession({ email: 'ola@example.com', status: 'active' }); });
    expect(screen.getByText('in:ola@example.com:none')).toBeTruthy();
  });
});
