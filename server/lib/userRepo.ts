// Account storage used by the auth and user-admin routes. Behind an interface
// so the routes can be tested against an in-memory implementation.
import type { TokenPurpose, UserRow } from "./accounts";

export interface TokenRow {
  id: number;
  user_id: number;
  purpose: TokenPurpose;
  expires_at: Date;
  used_at: Date | null;
  created_by: string | null;
}

export type UserPatch = Partial<
  Pick<
    UserRow,
    | "full_name"
    | "role"
    | "status"
    | "password_hash"
    | "last_login_at"
    | "approved_at"
    | "approved_by"
    | "disabled_at"
    | "disabled_reason"
    | "password_changed_at"
    | "is_platform_admin"
    | "terms_accepted_at"
    | "terms_version"
  >
>;

export interface UserRepo {
  /** Accounts whose email matches case-insensitively (normally 0 or 1). */
  findByEmail(email: string): Promise<UserRow[]>;
  findById(id: number): Promise<UserRow | null>;
  list(): Promise<UserRow[]>;
  /** How many accounts await approval, and the newest one's id (null when none). */
  pendingSummary(): Promise<{ count: number; latest_id: number | null }>;
  activeAdmins(): Promise<UserRow[]>;
  /** Throws an error with code "23505" when the email is taken. */
  create(data: {
    email: string; password_hash: string; full_name: string | null; role: string; status: string;
    approved_at?: Date | null; approved_by?: string | null; is_platform_admin?: boolean; terms_accepted_at?: Date | null; terms_version?: string | null;
  }): Promise<UserRow>;
  /**
   * Applies the patch; `endSessions` also bumps token_version. With
   * `ifStatus`, only while the account still has one of those statuses
   * (checked in the same statement). Null when nothing was updated.
   */
  update(id: number, patch: UserPatch, opts?: { endSessions?: boolean; ifStatus?: string[] }): Promise<UserRow | null>;
  /** Deletes the account (with `ifStatus`, only while it has one of those statuses); false when nothing was deleted. */
  delete(id: number, opts?: { ifStatus?: string[] }): Promise<boolean>;
  /**
   * Runs `fn` while holding a lock on the admin accounts, so two admins can't
   * both demote each other and leave nobody in charge.
   */
  withAdminLock<T>(fn: (activeAdminCount: number, repo: UserRepo) => Promise<T>): Promise<T>;

  createToken(data: { user_id: number; purpose: TokenPurpose; token_hash: string; expires_at: Date; created_by: string | null }): Promise<void>;
  /** The unused, unexpired token with this hash, without consuming it. */
  peekToken(tokenHash: string): Promise<TokenRow | null>;
  /** Invalidates every outstanding token of the user (optionally of one purpose). */
  revokeTokens(userId: number, purpose?: TokenPurpose): Promise<void>;
  /**
   * Revokes the user's outstanding tokens of this purpose and stores this one,
   * as one step: two concurrent requests can't both leave a live link.
   */
  replaceToken(data: { user_id: number; purpose: TokenPurpose; token_hash: string; expires_at: Date; created_by: string | null }): Promise<void>;
  /**
   * Uses a reset/invite link in one transaction: consumes the token, locks
   * the account, asks `patchFor` what to change (null refuses, e.g. for a
   * disabled account), applies that while ending the account's sessions, and
   * revokes its other links. Null, with nothing changed and the link still
   * unused, when the token is used, expired or unknown, the account is gone,
   * or `patchFor` refuses.
   */
  redeemToken(tokenHash: string, patchFor: (token: TokenRow, user: UserRow) => UserPatch | null): Promise<{ token: TokenRow; user: UserRow } | null>;

  /**
   * Counts a sign-in attempt for `email` in its current window (a new
   * `windowMs` window starts once the last one has ended) and returns the
   * count so far and the time left in the window. Atomic, and kept in the
   * database so every server instance shares it and a restart keeps it.
   */
  countLoginAttempt(email: string, windowMs: number): Promise<{ count: number; retryMs: number }>;
  /** Forgets the email's sign-in attempts (after a correct password). */
  clearLoginAttempts(email: string): Promise<void>;
}

const USER_COLUMNS = `id, email, password_hash, full_name, role, status, token_version, last_login_at, approved_at,
  approved_by, disabled_at, disabled_reason, password_changed_at, created_date, is_platform_admin, terms_accepted_at, terms_version`;

const PATCHABLE = new Set([
  "full_name",
  "role",
  "status",
  "password_hash",
  "last_login_at",
  "approved_at",
  "approved_by",
  "disabled_at",
  "disabled_reason",
  "password_changed_at",
  "is_platform_admin",
  "terms_accepted_at",
  "terms_version",
]);

const INSERT_TOKEN = `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at, created_by) VALUES ($1, $2, $3, $4, $5)`;
const TOKEN_COLUMNS = "id, user_id, purpose, expires_at, used_at, created_by";

// Ended windows are dropped now and then, so addresses that stop failing
// don't stay in login_attempts.
const ATTEMPT_SWEEP_MS = 10 * 60_000;
let lastAttemptSweep = 0;

/**
 * Postgres-backed repo. `pool` is a pg Pool (server/db) or, inside a
 * transaction, a client (`inTransaction`).
 */
export function pgUserRepo(pool: any, { inTransaction = false } = {}): UserRepo {
  return {
    async findByEmail(email) {
      const { rows } = await pool.query(
        `SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = lower($1) ORDER BY (email = $1) DESC, id LIMIT 5`,
        [email],
      );
      return rows;
    },
    async findById(id) {
      const { rows } = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
      return rows[0] || null;
    },
    async list() {
      const { rows } = await pool.query(`SELECT ${USER_COLUMNS} FROM users ORDER BY created_date DESC NULLS LAST, id DESC LIMIT 2000`);
      return rows;
    },
    async pendingSummary() {
      const { rows } = await pool.query(`SELECT count(*)::int AS n, max(id) AS latest_id FROM users WHERE status = 'pending'`);
      return { count: rows[0].n, latest_id: rows[0].latest_id ?? null };
    },
    async activeAdmins() {
      const { rows } = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id`);
      return rows;
    },
    async create(data) {
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, full_name, role, status, approved_at, approved_by, is_platform_admin, terms_accepted_at, terms_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING ${USER_COLUMNS}`,
        [data.email, data.password_hash, data.full_name, data.role, data.status, data.approved_at ?? null, data.approved_by ?? null,
         data.is_platform_admin ?? false, data.terms_accepted_at ?? null, data.terms_version ?? null],
      );
      return rows[0];
    },
    async update(id, patch, opts = {}) {
      const sets: string[] = [];
      const values: unknown[] = [];
      for (const [key, value] of Object.entries(patch)) {
        if (!PATCHABLE.has(key) || value === undefined) continue;
        values.push(value);
        sets.push(`${key} = $${values.length}`);
      }
      if (opts.endSessions) sets.push("token_version = token_version + 1");
      sets.push("updated_date = now()");
      values.push(id);
      let where = `id = $${values.length}`;
      if (opts.ifStatus) {
        values.push(opts.ifStatus);
        where += ` AND status = ANY($${values.length})`;
      }
      const { rows } = await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE ${where} RETURNING ${USER_COLUMNS}`, values);
      return rows[0] || null;
    },
    async delete(id, opts = {}) {
      const { rowCount } = opts.ifStatus
        ? await pool.query("DELETE FROM users WHERE id = $1 AND status = ANY($2)", [id, opts.ifStatus])
        : await pool.query("DELETE FROM users WHERE id = $1", [id]);
      return rowCount > 0;
    },
    async withAdminLock(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(`SELECT id FROM users WHERE role = 'admin' AND status = 'active' FOR UPDATE`);
        // The callback's writes must use this client: on another connection
        // they would wait for the very row locks held here.
        const result = await fn(rows.length, pgUserRepo(client, { inTransaction: true }));
        await client.query("COMMIT");
        return result;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async createToken(data) {
      await pool.query(INSERT_TOKEN, [data.user_id, data.purpose, data.token_hash, data.expires_at, data.created_by]);
    },
    async replaceToken(data) {
      const replace = async (c: any) => {
        // Serializes replacements of one user's links of one kind.
        await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`auth_token:${data.user_id}:${data.purpose}`]);
        await c.query(`UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`, [data.user_id, data.purpose]);
        await c.query(INSERT_TOKEN, [data.user_id, data.purpose, data.token_hash, data.expires_at, data.created_by]);
      };
      if (inTransaction) return replace(pool);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await replace(client);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async peekToken(tokenHash) {
      const { rows } = await pool.query(
        `SELECT ${TOKEN_COLUMNS} FROM auth_tokens
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
        [tokenHash],
      );
      return rows[0] || null;
    },
    async redeemToken(tokenHash, patchFor) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tx = pgUserRepo(client, { inTransaction: true });
        const redeem = async () => {
          const peek = await tx.peekToken(tokenHash);
          if (!peek) return null;
          // The account row before its tokens, the order a delete (which
          // cascades to auth_tokens) and a disable take them in, so neither
          // can deadlock with this. NO KEY UPDATE still lets replaceToken
          // insert a token meanwhile (its foreign key check needs KEY SHARE).
          const locked = await client.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1 FOR NO KEY UPDATE`, [peek.user_id]);
          if (!locked.rows[0]) return null;
          const consumed = await client.query(
            `UPDATE auth_tokens SET used_at = now()
              WHERE token_hash = $1 AND user_id = $2 AND used_at IS NULL AND expires_at > now()
              RETURNING ${TOKEN_COLUMNS}`,
            [tokenHash, peek.user_id],
          );
          const token: TokenRow | undefined = consumed.rows[0];
          if (!token) return null;
          const patch = patchFor(token, locked.rows[0]);
          if (!patch) return null;
          const user = await tx.update(token.user_id, patch, { endSessions: true });
          await tx.revokeTokens(token.user_id);
          return user && { token, user };
        };
        const result = await redeem();
        await client.query(result ? "COMMIT" : "ROLLBACK");
        return result;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async revokeTokens(userId, purpose) {
      await pool.query(
        `UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL AND ($2::varchar IS NULL OR purpose = $2)`,
        [userId, purpose ?? null],
      );
    },
    async countLoginAttempt(email, windowMs) {
      const { rows } = await pool.query(
        `INSERT INTO login_attempts AS a (email, attempts, window_ends_at)
         VALUES ($1, 1, now() + make_interval(secs => $2::float8 / 1000))
         ON CONFLICT (email) DO UPDATE SET
           attempts = CASE WHEN a.window_ends_at <= now() THEN 1 ELSE a.attempts + 1 END,
           window_ends_at = CASE WHEN a.window_ends_at <= now() THEN EXCLUDED.window_ends_at ELSE a.window_ends_at END
         RETURNING attempts, greatest(ceil(extract(epoch FROM window_ends_at - now()) * 1000), 0)::float8 AS retry_ms`,
        [email, windowMs],
      );
      if (!inTransaction && Date.now() - lastAttemptSweep > ATTEMPT_SWEEP_MS) {
        lastAttemptSweep = Date.now();
        pool.query("DELETE FROM login_attempts WHERE window_ends_at <= now()").catch((e: any) => {
          console.warn("[accounts] Clearing old login attempts failed:", e?.message || e);
        });
      }
      return { count: rows[0].attempts, retryMs: rows[0].retry_ms };
    },
    async clearLoginAttempts(email) {
      await pool.query("DELETE FROM login_attempts WHERE email = $1", [email]);
    },
  };
}
