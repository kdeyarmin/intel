const isLoginPath = (path) => /^\/login(?:[/?#]|$)/i.test(path);

// Only same-origin paths are allowed as post-login redirect targets, so a
// crafted `?returnUrl=https://evil.example` can't bounce users off-site. The
// login page itself is never a target: a signed-in user would land back on it.
export function safeReturnUrl(raw, origin = window.location.origin) {
  const value = raw || '/';
  let path;
  try {
    const u = new URL(value, origin);
    path = u.origin === origin ? u.pathname + u.search + u.hash : '/';
  } catch {
    path = value.startsWith('/') && !value.startsWith('//') ? value : '/';
  }
  return isLoginPath(path) ? '/' : path;
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
