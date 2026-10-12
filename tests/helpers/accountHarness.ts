// In-memory accounts backend and a real Express app around the auth and
// user-admin routers, for route tests (no database).
import express from "express";
import cookieParser from "cookie-parser";
import type { AddressInfo } from "net";
import type { Server } from "http";
import type { UserRow } from "../../server/lib/accounts";
import type { AccountDeps } from "../../server/lib/accountDeps";
import type { AuditEntry } from "../../server/lib/audit";
import type { MailMessage } from "../../server/lib/mailer";
import type { Membership, OrgRepo } from "../../server/lib/orgs";
import { LastOwnerError } from "../../server/lib/orgs";
import type { TokenRow, UserRepo } from "../../server/lib/userRepo";
import { invalidateSessionUser, setSessionUserLoader } from "../../server/lib/sessionUsers";
import { createAuthRouter } from "../../server/routes/auth";
import { createAdminUsersRouter } from "../../server/routes/adminUsers";
import { createAuditRouter } from "../../server/routes/audit";

interface StoredToken extends TokenRow {
  token_hash: string;
}

export function memoryUserRepo(): UserRepo & { users: UserRow[]; tokens: StoredToken[] } {
  const users: UserRow[] = [];
  const tokens: StoredToken[] = [];
  const attempts = new Map<string, { count: number; endsAt: number }>();
  let nextId = 1;
  const liveToken = (hash: string) => tokens.find((x) => x.token_hash === hash && !x.used_at && x.expires_at > new Date());
  const clone = <T,>(x: T): T => (x ? { ...x } : x);
  const repo = {
    users,
    tokens,
    async findByEmail(email: string) {
      return users.filter((u) => u.email.toLowerCase() === email.toLowerCase()).map(clone);
    },
    async findById(id: number) {
      return clone(users.find((u) => u.id === id) ?? null);
    },
    async list() {
      return users.map(clone);
    },
    async pendingSummary() {
      const pending = users.filter((u) => u.status === "pending");
      return { count: pending.length, latest_id: pending.length ? Math.max(...pending.map((u) => u.id)) : null };
    },
    async activeAdmins() {
      return users.filter((u) => u.role === "admin" && u.status === "active").map(clone);
    },
    async create(data: any) {
      if (users.some((u) => u.email.toLowerCase() === data.email.toLowerCase())) {
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      }
      const row: UserRow = {
        id: nextId++,
        email: data.email,
        password_hash: data.password_hash,
        full_name: data.full_name ?? null,
        role: data.role,
        status: data.status,
        token_version: 0,
        last_login_at: null,
        approved_at: data.approved_at ?? null,
        approved_by: data.approved_by ?? null,
        disabled_at: null,
        disabled_reason: null,
        password_changed_at: null,
        created_date: new Date(),
        is_platform_admin: data.is_platform_admin ?? false,
        terms_accepted_at: data.terms_accepted_at ?? null,
        terms_version: data.terms_version ?? null,
      };
      users.push(row);
      return clone(row);
    },
    async update(id: number, patch: any, opts: { endSessions?: boolean; ifStatus?: string[] } = {}) {
      const row = users.find((u) => u.id === id);
      if (!row || (opts.ifStatus && !opts.ifStatus.includes(row.status))) return null;
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) (row as any)[k] = v;
      if (opts.endSessions) row.token_version += 1;
      return clone(row);
    },
    async delete(id: number, opts: { ifStatus?: string[] } = {}) {
      const i = users.findIndex((u) => u.id === id);
      if (i < 0 || (opts.ifStatus && !opts.ifStatus.includes(users[i].status))) return false;
      users.splice(i, 1);
      // ON DELETE CASCADE
      for (let t = tokens.length - 1; t >= 0; t -= 1) if (tokens[t].user_id === id) tokens.splice(t, 1);
      return true;
    },
    async withAdminLock<T>(fn: (n: number, r: UserRepo) => Promise<T>) {
      return fn(users.filter((u) => u.role === "admin" && u.status === "active").length, repo as UserRepo);
    },
    async createToken(data: any) {
      tokens.push({ id: tokens.length + 1, used_at: null, ...data });
    },
    async peekToken(hash: string) {
      const t = liveToken(hash);
      return t ? { ...t } : null;
    },
    // No await between the checks and the writes, so it is atomic here.
    async redeemToken(hash: string, patchFor: (token: TokenRow, user: UserRow) => any) {
      const t = liveToken(hash);
      const row = t && users.find((u) => u.id === t.user_id);
      if (!t || !row) return null;
      const patch = patchFor({ ...t }, clone(row));
      if (!patch) return null;
      t.used_at = new Date();
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) (row as any)[k] = v;
      row.token_version += 1;
      for (const other of tokens) if (other.user_id === row.id && !other.used_at) other.used_at = new Date();
      return { token: { ...t }, user: clone(row) };
    },
    async revokeTokens(userId: number, purpose?: string) {
      for (const t of tokens) if (t.user_id === userId && !t.used_at && (!purpose || t.purpose === purpose)) t.used_at = new Date();
    },
    async replaceToken(data: any) {
      await repo.revokeTokens(data.user_id, data.purpose);
      await repo.createToken(data);
    },
    async countLoginAttempt(email: string, windowMs: number) {
      const now = Date.now();
      let a = attempts.get(email);
      if (!a || a.endsAt <= now) {
        a = { count: 0, endsAt: now + windowMs };
        attempts.set(email, a);
      }
      a.count += 1;
      return { count: a.count, retryMs: a.endsAt - now };
    },
    async clearLoginAttempts(email: string) {
      attempts.delete(email);
    },
  };
  return repo;
}

export interface MemoryOrg {
  id: number;
  name: string;
  status: string;
  seat_limit: number;
  plan_code: string | null;
  territory: { states: string[]; county_fips: string[] };
}

/** In-memory organizations and memberships. Organization 1 is the default every seeded user joins. */
export function memoryOrgRepo(users: UserRow[]): OrgRepo & { orgs: MemoryOrg[]; members: { org_id: number; user_id: number; org_role: string }[] } {
  const orgs: MemoryOrg[] = [{ id: 1, name: "Test organization", status: "active", seat_limit: 100, plan_code: "state", territory: { states: [], county_fips: [] } }];
  const members: { org_id: number; user_id: number; org_role: string }[] = [];
  const nameOf = (orgId: number) => orgs.find((o) => o.id === orgId)?.name ?? "";
  const toMembership = (m: { org_id: number; user_id: number; org_role: string }): Membership => ({ ...m, org_name: nameOf(m.org_id) });
  const orgLocks = new Map<number, Promise<unknown>>();
  const withOrgLock = async <T>(orgId: number, fn: () => Promise<T> | T): Promise<T> => {
    const prev = orgLocks.get(orgId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const run = prev.then(fn, fn);
    orgLocks.set(orgId, gate);
    try {
      return await run;
    } finally {
      release();
    }
  };
  const refuseLastOwner = (orgId: number, userId: number, nextRole: "owner" | "member" | null) => {
    const target = members.find((m) => m.org_id === orgId && m.user_id === userId);
    if (!target || target.org_role !== "owner") return;
    if (nextRole === "owner") return;
    const owners = members.filter((m) => m.org_id === orgId && m.org_role === "owner");
    if (owners.length <= 1) throw new LastOwnerError();
  };
  return {
    orgs,
    members,
    async createWithOwner(input) {
      const org: MemoryOrg = { id: orgs.length + 1, name: input.name, status: "trial", seat_limit: 3, plan_code: null, territory: { states: [], county_fips: [] } };
      orgs.push(org);
      members.push({ org_id: org.id, user_id: input.ownerUserId, org_role: "owner" });
      return { id: org.id, name: org.name };
    },
    async memberships(orgId) {
      return members.filter((m) => orgId == null || m.org_id === orgId).map(toMembership);
    },
    async membershipOf(userId) {
      const m = members.filter((x) => x.user_id === userId).sort((a, b) => a.org_id - b.org_id)[0];
      return m ? toMembership(m) : null;
    },
    async addMember(orgId, userId, orgRole) {
      const existing = members.find((m) => m.org_id === orgId && m.user_id === userId);
      if (existing) existing.org_role = orgRole;
      else members.push({ org_id: orgId, user_id: userId, org_role: orgRole });
    },
    async setMemberRole(orgId, userId, orgRole) {
      return withOrgLock(orgId, () => {
        const existing = members.find((m) => m.org_id === orgId && m.user_id === userId);
        if (!existing) return false;
        refuseLastOwner(orgId, userId, orgRole);
        existing.org_role = orgRole;
        return true;
      });
    },
    async removeMember(orgId, userId) {
      return withOrgLock(orgId, () => {
        const i = members.findIndex((m) => m.org_id === orgId && m.user_id === userId);
        if (i < 0) return false;
        refuseLastOwner(orgId, userId, null);
        members.splice(i, 1);
        return true;
      });
    },
    async seatUsage(orgId) {
      const ids = new Set(members.filter((m) => m.org_id === orgId).map((m) => m.user_id));
      const used = users.filter((u) => ids.has(u.id) && ["active", "invited", "pending"].includes(u.status)).length;
      return { used, limit: orgs.find((o) => o.id === orgId)?.seat_limit ?? 0 };
    },
  };
}

// Module-wide so every client in a test file gets a distinct address.
let clients = 0;

/** Trivial reversible "hash" so tests don't pay for bcrypt. */
// Like bcrypt, only the first 72 bytes count.
const fakeHash = (pw: string) => `hashed:${Buffer.from(pw, "utf8").subarray(0, 72).toString("latin1")}`;

export interface Harness {
  url: string;
  repo: ReturnType<typeof memoryUserRepo>;
  orgs: ReturnType<typeof memoryOrgRepo>;
  mail: MailMessage[];
  audits: AuditEntry[];
  deps: AccountDeps;
  close(): Promise<void>;
  /**
   * Creates a user directly in the store, as a member of organization 1 (or
   * `org_id`), an owner when an admin. Admins are platform admins unless
   * `is_platform_admin: false`, like the accounts migration 0020 backfilled.
   */
  seed(user: Partial<UserRow> & { email: string; password?: string; org_id?: number | null; org_role?: "owner" | "member" }): Promise<UserRow>;
  /** A cookie jar per "browser", each from its own IP unless one is given. */
  client(ip?: string): Client;
}

export interface Client {
  cookie: string | null;
  call(method: string, path: string, body?: unknown): Promise<{ status: number; body: any; setCookie: string | null }>;
}

/** `repo`: another harness's store, to act as a second server instance on the same database. */
export async function startHarness(opts: { mailer?: boolean; baseUrl?: string | null; repo?: Harness["repo"]; orgs?: Harness["orgs"] } = {}): Promise<Harness> {
  const repo = opts.repo ?? memoryUserRepo();
  const orgs = opts.orgs ?? memoryOrgRepo(repo.users);
  const mail: MailMessage[] = [];
  const audits: AuditEntry[] = [];
  const deps: AccountDeps = {
    repo,
    orgs,
    audit: async (e) => {
      audits.push(e);
    },
    sendMail: async (m) => {
      mail.push(m);
    },
    mailerConfigured: () => opts.mailer ?? true,
    hashPassword: async (pw) => fakeHash(pw),
    verifyPassword: async (pw, hash) => fakeHash(pw) === hash,
    reservedEmail: () => "admin@caremetric.local",
    baseUrl: () => (opts.baseUrl === undefined ? "https://app.example.com" : opts.baseUrl),
    onUserChanged: invalidateSessionUser,
  };
  setSessionUserLoader(async (id) => {
    const u = await repo.findById(id);
    if (!u) return null;
    const m = await orgs.membershipOf(u.id);
    const org = m ? orgs.orgs.find((o) => o.id === m.org_id) : null;
    return {
      id: u.id, email: u.email, full_name: u.full_name, role: u.role || "user", status: u.status, token_version: u.token_version,
      is_platform_admin: !!u.is_platform_admin, terms_accepted_at: u.terms_accepted_at ?? null,
      org_id: m?.org_id ?? null, org_role: m?.org_role ?? null, org_name: org?.name ?? null, org_status: org?.status ?? null,
      plan_code: org?.plan_code ?? null, territory: org?.territory ?? null,
    };
  });

  const app = express();
  // Each test client sends its own X-Forwarded-For so per-IP throttles don't
  // leak between tests.
  app.set("trust proxy", true);
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", createAuthRouter(deps));
  app.use("/api/admin/users", createAdminUsersRouter(deps));
  app.use("/api/audit", createAuditRouter(async (e) => { audits.push(e); }));
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const client = (ip?: string): Client => {
    clients += 1;
    const addr = ip ?? `10.0.${Math.floor(clients / 250)}.${clients % 250}`;
    const c: Client = {
      cookie: null,
      async call(method, path, body) {
        const res = await fetch(`${url}${path}`, {
          method,
          headers: { "Content-Type": "application/json", "X-Forwarded-For": addr, ...(c.cookie ? { Cookie: c.cookie } : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const setCookie = res.headers.get("set-cookie");
        if (setCookie) {
          const value = setCookie.split(";")[0];
          c.cookie = value.endsWith("=") ? null : value;
        }
        const text = await res.text();
        return { status: res.status, body: text ? JSON.parse(text) : null, setCookie };
      },
    };
    return c;
  };

  return {
    url,
    repo,
    orgs,
    mail,
    audits,
    deps,
    client,
    async seed(u) {
      const role = u.role ?? "user";
      const row = await repo.create({
        email: u.email,
        password_hash: fakeHash(u.password ?? "password123"),
        full_name: u.full_name ?? null,
        role,
        status: u.status ?? "active",
        approved_at: u.approved_at ?? (u.status === "pending" || u.status === "invited" ? null : new Date()),
        is_platform_admin: u.is_platform_admin ?? role === "admin",
        terms_accepted_at: u.terms_accepted_at ?? null,
        terms_version: u.terms_version ?? null,
      });
      const orgId = u.org_id === undefined ? 1 : u.org_id;
      if (orgId !== null) await orgs.addMember(orgId, row.id, u.org_role ?? (role === "admin" ? "owner" : "member"));
      return row;
    },
    async close() {
      setSessionUserLoader(null);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

/** Signs in and returns the browser. */
export async function signedIn(h: Harness, email: string, password = "password123"): Promise<Client> {
  const c = h.client();
  const r = await c.call("POST", "/api/auth/login", { email, password });
  if (r.status !== 200) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.body)}`);
  return c;
}
