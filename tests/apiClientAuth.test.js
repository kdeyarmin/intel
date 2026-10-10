// @vitest-environment jsdom
/**
 * Session-expiry handling in src/api/client.js and the login return-URL
 * helpers in src/lib/returnUrl.js.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AUTH_EXPIRED_EVENT,
  base44,
  buildErrorMessage,
  resetAuthExpired,
} from '../src/api/client';
import { buildLoginUrl, safeReturnUrl } from '../src/lib/returnUrl';

function jsonResponse(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'x',
    json: () => Promise.resolve(body),
  });
}

describe('buildErrorMessage', () => {
  it('combines message and detail', () => {
    expect(buildErrorMessage({ message: 'Forbidden', detail: 'Admin access is required.' }, 403))
      .toBe('Forbidden: Admin access is required.');
  });

  it('falls back to `error` when there is no `message`', () => {
    expect(buildErrorMessage({ error: 'An import of this type is already running' }, 409))
      .toBe('An import of this type is already running');
  });

  it('uses the status when the body has nothing useful', () => {
    expect(buildErrorMessage({}, 500)).toBe('Request failed: 500');
    expect(buildErrorMessage(null, 502)).toBe('Request failed: 502');
  });
});

describe('401 handling', () => {
  let events;
  const onExpired = () => events.push('expired');

  beforeEach(() => {
    events = [];
    resetAuthExpired();
    localStorage.setItem('auth_token', 'stale');
    window.history.pushState({}, '', '/Providers?state=PA');
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
  });

  afterEach(() => {
    window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('clears the token and fires one event even when many requests fail together', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(401, { message: 'Invalid or expired token' })));
    const results = await Promise.allSettled([
      base44.entities.Provider.list(),
      base44.entities.LeadList.list(),
      base44.functions.invoke('getDashboardStats'),
    ]);
    expect(results.every((r) => r.status === 'rejected' && r.reason.status === 401)).toBe(true);
    expect(events).toEqual(['expired']);
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('ignores 401s from sign-in and from the startup session probe', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(401, { message: 'Invalid credentials' })));
    await expect(base44.auth.login('a@b.c', 'wrong')).rejects.toThrow('Invalid credentials');
    await expect(base44.auth.me({ probe: true })).rejects.toThrow();
    expect(events).toEqual([]);
    expect(localStorage.getItem('auth_token')).toBe('stale');
  });

  it('treats a 401 from /auth/me outside the probe as an expired session', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(401, {})));
    await expect(base44.auth.me()).rejects.toThrow();
    expect(events).toEqual(['expired']);
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it("ignores a 401 for the old session that arrives after signing in again", async () => {
    let finishOld;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => {
      finishOld = () => resolve({ ok: false, status: 401, statusText: 'x', json: () => Promise.resolve({}) });
    })));
    const old = base44.entities.Provider.list();

    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(200, { id: 1, token: 'fresh' })));
    await base44.auth.login('a@b.c', 'right');

    finishOld();
    await expect(old).rejects.toThrow();
    expect(events).toEqual([]);
    expect(localStorage.getItem('auth_token')).toBe('fresh');
  });

  it('does nothing while already on the login page', async () => {
    window.history.pushState({}, '', '/login');
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(401, { message: 'nope' })));
    await expect(base44.entities.Provider.list()).rejects.toThrow();
    expect(events).toEqual([]);
  });

  it('fires again after a successful login', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(401, {})));
    await expect(base44.entities.Provider.list()).rejects.toThrow();
    expect(events).toHaveLength(1);

    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(200, { id: 1, token: 'fresh' })));
    await base44.auth.login('a@b.c', 'right');

    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(401, {})));
    await expect(base44.entities.Provider.list()).rejects.toThrow();
    expect(events).toHaveLength(2);
  });

  it('does not treat 403 as an expired session', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(403, { message: 'Forbidden', detail: 'Admin only.' })));
    await expect(base44.entities.ImportBatch.list()).rejects.toThrow('Forbidden: Admin only.');
    expect(events).toEqual([]);
  });
});

describe('safeReturnUrl', () => {
  const origin = 'https://app.example.com';

  it('keeps same-origin paths with their query string', () => {
    expect(safeReturnUrl('/ProviderDetail?npi=123', origin)).toBe('/ProviderDetail?npi=123');
    expect(safeReturnUrl(`${origin}/LeadLists?list=4#x`, origin)).toBe('/LeadLists?list=4#x');
  });

  it('rejects other origins and protocol-relative URLs', () => {
    expect(safeReturnUrl('https://evil.example/phish', origin)).toBe('/');
    expect(safeReturnUrl('//evil.example/phish', origin)).toBe('/');
  });

  it('never sends a signed-in user back to the login page', () => {
    expect(safeReturnUrl('/login', origin)).toBe('/');
    expect(safeReturnUrl('/Login?returnUrl=%2Flogin', origin)).toBe('/');
    expect(safeReturnUrl(`${origin}/login#x`, origin)).toBe('/');
    expect(safeReturnUrl('/LoginHistory', origin)).toBe('/LoginHistory');
  });

  it('defaults to the home page', () => {
    expect(safeReturnUrl(null, origin)).toBe('/');
    expect(safeReturnUrl('', origin)).toBe('/');
  });
});

describe('buildLoginUrl', () => {
  it('carries the current path and query string', () => {
    const url = buildLoginUrl({ pathname: '/ProviderDetail', search: '?npi=1234567890' });
    expect(url).toBe('/login?returnUrl=%2FProviderDetail%3Fnpi%3D1234567890');
  });

  it('adds the expiry reason when given', () => {
    expect(buildLoginUrl({ pathname: '/Providers', search: '' }, { reason: 'expired' }))
      .toBe('/login?returnUrl=%2FProviders&reason=expired');
  });

  it('omits returnUrl for the home page', () => {
    expect(buildLoginUrl({ pathname: '/', search: '' })).toBe('/login');
  });
});
