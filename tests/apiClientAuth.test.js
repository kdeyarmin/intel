// @vitest-environment jsdom
/**
 * Session-expiry handling in src/api/client.js and the login return-URL
 * helpers in src/lib/returnUrl.js.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ACCOUNT_STATUS_EVENT,
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
    window.history.pushState({}, '', '/Providers?state=PA');
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
  });

  afterEach(() => {
    window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('fires one event even when many requests fail together', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(401, { message: 'Invalid or expired token' })));
    const results = await Promise.allSettled([
      base44.entities.Provider.list(),
      base44.entities.LeadList.list(),
      base44.functions.invoke('getDashboardStats'),
    ]);
    expect(results.every((r) => r.status === 'rejected' && r.reason.status === 401)).toBe(true);
    expect(events).toEqual(['expired']);
  });

  it('relies on the session cookie, never a stored bearer token', async () => {
    const fetchMock = vi.fn(() => jsonResponse(200, []));
    vi.stubGlobal('fetch', fetchMock);
    await base44.entities.Provider.list();
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe('include');
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('ignores 401s from sign-in and from the startup session probe', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(401, { message: 'Invalid credentials' })));
    await expect(base44.auth.login('a@b.c', 'wrong')).rejects.toThrow('Invalid credentials');
    await expect(base44.auth.me({ probe: true })).rejects.toThrow();
    await expect(base44.auth.resetPassword('bad-token', 'x')).rejects.toThrow();
    expect(events).toEqual([]);
  });

  it('treats a 401 from /auth/me outside the probe as an expired session', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(401, {})));
    await expect(base44.auth.me()).rejects.toThrow();
    expect(events).toEqual(['expired']);
  });

  it('treats a 401 from the auth endpoints that need a session as an expired session', async () => {
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(401, {})));
    await expect(base44.auth.logoutEverywhere()).rejects.toThrow();
    expect(events).toEqual(['expired']);
    resetAuthExpired();
    await expect(base44.auth.changePassword('a', 'b')).rejects.toThrow();
    expect(events).toEqual(['expired', 'expired']);
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
  });

  it.each([
    ['deleting a conversation', () => base44.assistant.deleteConversation(5)],
    ['asking the assistant', () => base44.assistant.streamMessage(5, 'Hi', { onEvent: () => {} })],
    ['uploading a file', () => base44.integrations.Core.UploadFile(new Blob(['x']))],
  ])("ignores an old session's 401 from %s that arrives after signing in again", async (_, call) => {
    let finishOld;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => {
      finishOld = () => resolve({ ok: false, status: 401, statusText: 'x', json: () => Promise.resolve({}) });
    })));
    const old = call();

    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(200, { id: 1, token: 'fresh' })));
    await base44.auth.login('a@b.c', 'right');

    finishOld();
    await expect(old).rejects.toMatchObject({ status: 401 });
    expect(events).toEqual([]);

    // A 401 for the current session still signs the user out.
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(401, {})));
    await expect(call()).rejects.toMatchObject({ status: 401 });
    expect(events).toEqual(['expired']);
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

describe('account status handling', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('announces a pending or disabled account so the app can re-check it', async () => {
    const seen = [];
    const onStatus = (e) => seen.push(e.detail.code);
    window.addEventListener(ACCOUNT_STATUS_EVENT, onStatus);
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(403, { message: 'Awaiting approval', code: 'account_pending' })));
    await expect(base44.entities.Provider.list()).rejects.toThrow('Awaiting approval');
    vi.stubGlobal('fetch', vi.fn(() => jsonResponse(403, { message: 'Forbidden', detail: 'Admin access required.' })));
    await expect(base44.functions.invoke('triggerImport')).rejects.toThrow('Forbidden');
    window.removeEventListener(ACCOUNT_STATUS_EVENT, onStatus);
    expect(seen).toEqual(['account_pending']);
  });

  it('records audit events through the server and never throws', async () => {
    const fetchMock = vi.fn(() => jsonResponse(500, { message: 'down' }));
    vi.stubGlobal('fetch', fetchMock);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(base44.audit.record('export', { action: 'csv_export' })).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/audit');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ event_type: 'export', details: { action: 'csv_export' } });
    warn.mockRestore();
  });
});
