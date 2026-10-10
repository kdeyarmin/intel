// Only same-origin paths are allowed as post-login redirect targets, so a
// crafted `?returnUrl=https://evil.example` can't bounce users off-site.
export function safeReturnUrl(raw, origin = window.location.origin) {
  const value = raw || '/';
  try {
    const u = new URL(value, origin);
    if (u.origin === origin) return u.pathname + u.search + u.hash;
    return '/';
  } catch {
    return value.startsWith('/') && !value.startsWith('//') ? value : '/';
  }
}

export function buildLoginUrl(location, { reason } = {}) {
  const params = new URLSearchParams();
  const current = `${location.pathname || '/'}${location.search || ''}`;
  if (current && current !== '/' && !current.startsWith('/login')) {
    params.set('returnUrl', current);
  }
  if (reason) params.set('reason', reason);
  const qs = params.toString();
  return qs ? `/login?${qs}` : '/login';
}
