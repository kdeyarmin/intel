// The signed-in user's live role, status and token version, looked up on every
// authenticated request. A short cache keeps that off the database for most
// requests; admin changes invalidate it immediately on this instance, and
// other instances catch up within SESSION_CACHE_MS.

export interface SessionUser {
  id: number;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  token_version: number;
}

export const SESSION_CACHE_MS = 30_000;
const MAX_ENTRIES = 5_000;

type Loader = (id: number) => Promise<SessionUser | null>;

async function defaultLoader(id: number): Promise<SessionUser | null> {
  const { pool } = await import("../db");
  const { rows } = await pool.query(
    "SELECT id, email, full_name, role, status, token_version FROM users WHERE id = $1",
    [id],
  );
  const row = rows[0];
  return row ? { ...row, role: row.role || "user" } : null;
}

let loader: Loader = defaultLoader;
const cache = new Map<number, { user: SessionUser | null; expires: number }>();

export async function getSessionUser(id: number): Promise<SessionUser | null> {
  const now = Date.now();
  const hit = cache.get(id);
  if (hit && hit.expires > now) return hit.user;
  const user = await loader(id);
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(id, { user, expires: now + SESSION_CACHE_MS });
  return user;
}

export function invalidateSessionUser(id: number) {
  cache.delete(id);
}

/** Tests: swap the database lookup and start from an empty cache. */
export function setSessionUserLoader(fn: Loader | null) {
  loader = fn || defaultLoader;
  cache.clear();
}
