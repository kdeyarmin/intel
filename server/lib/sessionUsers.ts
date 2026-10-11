// The signed-in user's live role, status and token version, looked up on every
// authenticated request. A short cache keeps that off the database for most
// requests. A change (role, status, sign out everywhere) is published with
// Postgres NOTIFY, so every instance listening drops its entry at once; if an
// instance's listener is down, its entries still expire after SESSION_CACHE_MS.

export interface SessionUser {
  id: number;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  token_version: number;
  is_platform_admin?: boolean;
  terms_accepted_at?: string | Date | null;
  /** The user's organization (migration 0020); null for an account with no membership. */
  org_id?: number | null;
  org_role?: string | null;
  org_name?: string | null;
  org_status?: string | null;
  plan_code?: string | null;
  territory?: { states: string[]; county_fips: string[] } | null;
}

export const SESSION_CACHE_MS = 30_000;
const MAX_ENTRIES = 5_000;

type Loader = (id: number) => Promise<SessionUser | null>;

async function defaultLoader(id: number): Promise<SessionUser | null> {
  const { pool } = await import("../db");
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.role, u.status, u.token_version, u.is_platform_admin, u.terms_accepted_at,
            m.org_id, m.org_role, o.name AS org_name, o.status AS org_status, o.plan_code, o.territory
       FROM users u
       LEFT JOIN LATERAL (SELECT org_id, org_role FROM organization_members WHERE user_id = u.id ORDER BY org_id LIMIT 1) m ON true
       LEFT JOIN organizations o ON o.id = m.org_id
      WHERE u.id = $1`,
    [id],
  );
  const row = rows[0];
  return row ? { ...row, role: row.role || "user", is_platform_admin: !!row.is_platform_admin } : null;
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

const CHANNEL = "session_user_changed";

/** Drop a user's cached session data here and on every other instance. */
export function publishSessionUserChange(id: number, notify: (id: number) => Promise<unknown> = pgNotify) {
  invalidateSessionUser(id);
  notify(id).catch((e: any) => {
    console.warn(`[sessionUsers] Couldn't notify other instances (they catch up within ${SESSION_CACHE_MS / 1000}s):`, e?.message);
  });
}

async function pgNotify(id: number) {
  const { pool } = await import("../db");
  await pool.query("SELECT pg_notify($1, $2)", [CHANNEL, String(id)]);
}

export interface ListenerClient {
  connect(): Promise<unknown>;
  query(sql: string): Promise<unknown>;
  on(event: "notification", fn: (msg: { channel: string; payload?: string }) => void): unknown;
  on(event: "error" | "end", fn: (err?: Error) => void): unknown;
  end(): Promise<unknown>;
}

/**
 * Listen for other instances' changes on a dedicated connection (not a pool
 * client), reconnecting after `retryMs` if it fails or drops. Returns a stop
 * function.
 */
export function startSessionUserListener(makeClient: () => ListenerClient, retryMs = 5_000): () => void {
  let stopped = false;
  let current: ListenerClient | null = null;
  let timer: NodeJS.Timeout | null = null;

  const retry = () => {
    if (stopped || timer) return;
    current = null;
    timer = setTimeout(() => { timer = null; void connect(); }, retryMs);
    timer.unref?.();
  };

  const connect = async () => {
    const client = makeClient();
    current = client;
    client.on("notification", (msg) => {
      if (msg.channel !== CHANNEL) return;
      const id = Number(msg.payload);
      if (Number.isInteger(id)) cache.delete(id);
      else cache.clear();
    });
    client.on("error", (err) => {
      console.warn("[sessionUsers] Listener connection error:", err?.message);
      client.end().catch(() => {});
      retry();
    });
    client.on("end", () => retry());
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      // Changes made while we weren't listening were missed: start clean.
      cache.clear();
    } catch (e: any) {
      console.warn("[sessionUsers] Couldn't start the listener:", e?.message);
      client.end().catch(() => {});
      retry();
    }
  };

  void connect();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    current?.end().catch(() => {});
  };
}

/** Tests: swap the database lookup and start from an empty cache. */
export function setSessionUserLoader(fn: Loader | null) {
  loader = fn || defaultLoader;
  cache.clear();
}
