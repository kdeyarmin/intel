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
  create(data: { email: string; password_hash: string; full_name: string | null; role: string; status: string; approved_at?: Date | null; approved_by?: string | null }): Promise<UserRow>;
  /** Applies the patch; `endSessions` also bumps token_version. */
  update(id: number, patch: UserPatch, opts?: { endSessions?: boolean }): Promise<UserRow | null>;
  delete(id: number): Promise<void>;
  /**
   * Runs `fn` while holding a lock on the admin accounts, so two admins can't
   * both demote each other and leave nobody in charge.
   */
  withAdminLock<T>(fn: (activeAdminCount: number, repo: UserRepo) => Promise<T>): Promise<T>;

  createToken(data: { user_id: number; purpose: TokenPurpose; token_hash: string; expires_at: Date; created_by: string | null }): Promise<void>;
  /** The unused, unexpired token with this hash, without consuming it. */
  peekToken(tokenHash: string): Promise<TokenRow | null>;
  /** Marks the token used and returns it, or null if it was used, expired, or unknown. Atomic. */
  consumeToken(tokenHash: string): Promise<TokenRow | null>;
  /** Invalidates every outstanding token of the user (optionally of one purpose). */
  revokeTokens(userId: number, purpose?: TokenPurpose): Promise<void>;
  /**
   * Revokes the user's outstanding tokens of this purpose and stores this one,
   * as one step: two concurrent requests can't both leave a live link.
   */
  replaceToken(data: { user_id: number; purpose: TokenPurpose; token_hash: string; expires_at: Date; created_by: string | null }): Promise<void>;
}

const USER_COLUMNS = `id, email, password_hash, full_name, role, status, token_version, last_login_at, approved_at,
  approved_by, disabled_at, disabled_reason, password_changed_at, created_date`;

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
]);

const INSERT_TOKEN = `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at, created_by) VALUES ($1, $2, $3, $4, $5)`;

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
        `INSERT INTO users (email, password_hash, full_name, role, status, approved_at, approved_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${USER_COLUMNS}`,
        [data.email, data.password_hash, data.full_name, data.role, data.status, data.approved_at ?? null, data.approved_by ?? null],
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
      const { rows } = await pool.query(
        `UPDATE users SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${USER_COLUMNS}`,
        values,
      );
      return rows[0] || null;
    },
    async delete(id) {
      await pool.query("DELETE FROM users WHERE id = $1", [id]);
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
        `SELECT id, user_id, purpose, expires_at, used_at, created_by FROM auth_tokens
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
        [tokenHash],
      );
      return rows[0] || null;
    },
    async consumeToken(tokenHash) {
      const { rows } = await pool.query(
        `UPDATE auth_tokens SET used_at = now()
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
          RETURNING id, user_id, purpose, expires_at, used_at, created_by`,
        [tokenHash],
      );
      return rows[0] || null;
    },
    async revokeTokens(userId, purpose) {
      await pool.query(
        `UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL AND ($2::varchar IS NULL OR purpose = $2)`,
        [userId, purpose ?? null],
      );
    },
  };
}
