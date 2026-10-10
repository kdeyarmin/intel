// Admin user management: /api/admin/users. Every route requires an active admin.
import crypto from "crypto";
import { Router, Request, Response } from "express";
import {
  ADMIN_RESET_TOKEN_TTL_MS,
  adminActionProblem,
  adminUserView,
  cleanName,
  INVITE_TOKEN_TTL_MS,
  newToken,
  normalizeEmail,
  normalizeRole,
  tokenLink,
  type AdminAction,
  type TokenPurpose,
  type UserRow,
} from "../lib/accounts";
import { sendQuietly, type AccountDeps } from "../lib/accountDeps";
import { ACCOUNT_EVENT } from "../lib/audit";
import { approvedEmail, inviteEmail } from "../lib/accountEmails";
import { adminOnly, authMiddleware, AuthRequest } from "../middleware/auth";
import { clientIp, rateLimit } from "../middleware/rateLimit";
import type { UserRepo } from "../lib/userRepo";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const ACCOUNT_ACTIONS = [
  "signup",
  "login",
  "login_failed",
  "login_blocked",
  "approve",
  "role_change",
  "rename",
  "disable",
  "enable",
  "invite",
  "invite_accepted",
  "reset_link",
  "reset_requested",
  "password_reset",
  "password_change",
  "revoke_sessions",
  "logout_all",
  "delete",
];

export function createAdminUsersRouter(deps: AccountDeps) {
  const router = Router();
  const { repo } = deps;
  router.use(authMiddleware, adminOnly, rateLimit("admin_users", 120, 60_000));

  const audit = (req: AuthRequest, action: string, target: Pick<UserRow, "id" | "email"> | null, details: Record<string, unknown> = {}) =>
    deps.audit({
      event_type: ACCOUNT_EVENT,
      action,
      user_email: req.user!.email,
      entity_type: "User",
      entity_id: target?.id ?? null,
      details: { target_email: target?.email ?? null, ...details },
      ip_address: clientIp(req),
    });

  const handle = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      await fn(req as AuthRequest, res);
    } catch (e: any) {
      if (e instanceof HttpError) return res.status(e.status).json({ message: e.message });
      console.error("[admin/users] Failed:", e?.message || e);
      res.status(500).json({ message: process.env.NODE_ENV === "production" ? "Something went wrong. Please try again." : e?.message });
    }
  };

  async function load(r: UserRepo, idParam: string): Promise<UserRow> {
    const id = Number(idParam);
    const user = Number.isInteger(id) && id > 0 ? await r.findById(id) : null;
    if (!user) throw new HttpError(404, "User not found");
    return user;
  }

  /** Loads the target and checks the guards while admin rows are locked. */
  async function guarded<T>(req: AuthRequest, action: AdminAction, fn: (target: UserRow, r: UserRepo) => Promise<T>, newRole?: "user" | "admin"): Promise<T> {
    return repo.withAdminLock(async (activeAdmins, r) => {
      const target = await load(r, req.params.id as string);
      const problem = adminActionProblem({ actorId: req.user!.id, target, action, newRole, activeAdmins });
      if (problem) throw new HttpError(409, problem);
      return fn(target, r);
    });
  }

  async function issueLink(req: AuthRequest, user: UserRow, purpose: TokenPurpose) {
    const base = deps.baseUrl();
    if (!base) throw new HttpError(409, "Set PUBLIC_APP_URL so links point at this app.");
    await repo.revokeTokens(user.id, purpose);
    const token = newToken();
    const ttl = purpose === "invite" ? INVITE_TOKEN_TTL_MS : ADMIN_RESET_TOKEN_TTL_MS;
    const expires_at = new Date(Date.now() + ttl);
    await repo.createToken({ user_id: user.id, purpose, token_hash: token.hash, expires_at, created_by: req.user!.email });
    return { link: tokenLink(base, token.raw), expires_at };
  }

  router.get("/", handle(async (_req, res) => {
    const users = await repo.list();
    res.json({ users: users.map(adminUserView), email_enabled: deps.mailerConfigured() && !!deps.baseUrl() });
  }));

  router.get("/pending-count", handle(async (_req, res) => {
    res.json({ count: await repo.countPending() });
  }));

  // Recent account activity for the admin screen.
  router.get("/activity", handle(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const { pool } = await import("../db");
    const { rows } = await pool.query(
      `SELECT id, action, user_email, entity_id, details, ip_address, created_date
         FROM audit_events WHERE event_type = $1 AND action = ANY($2)
        ORDER BY created_date DESC LIMIT $3`,
      [ACCOUNT_EVENT, ACCOUNT_ACTIONS, limit],
    );
    res.json({ events: rows });
  }));

  router.post("/invite", handle(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) throw new HttpError(400, "Enter a valid email address");
    const role = normalizeRole(req.body?.role ?? "user");
    if (!role) throw new HttpError(400, "Role must be user or admin");
    if ((await repo.findByEmail(email)).length) throw new HttpError(409, "An account with this email already exists");
    if (!deps.baseUrl()) throw new HttpError(409, "Set PUBLIC_APP_URL so invite links point at this app.");
    let user: UserRow;
    try {
      user = await repo.create({
        email,
        // Unknown random password: the account can't be signed into until the invite is accepted.
        password_hash: await deps.hashPassword(crypto.randomBytes(32).toString("hex")),
        full_name: cleanName(req.body?.full_name),
        role,
        status: "invited",
      });
    } catch (e: any) {
      if (e?.code === "23505") throw new HttpError(409, "An account with this email already exists");
      throw e;
    }
    const { link, expires_at } = await issueLink(req, user, "invite");
    const emailed = await sendQuietly(deps, inviteEmail(user.email, link, req.user!.full_name || req.user!.email), "Invite");
    await audit(req, "invite", user, { role, emailed });
    res.status(201).json({ user: adminUserView(user), link, expires_at, emailed });
  }));

  router.patch("/:id", handle(async (req, res) => {
    const hasRole = req.body?.role !== undefined;
    const hasName = req.body?.full_name !== undefined;
    if (!hasRole && !hasName) throw new HttpError(400, "Nothing to change");
    const role = hasRole ? normalizeRole(req.body.role) : undefined;
    if (hasRole && !role) throw new HttpError(400, "Role must be user or admin");

    const updated = await (hasRole
      ? guarded(req, "role", async (target, r) => {
          const u = await r.update(target.id, { role: role!, ...(hasName ? { full_name: cleanName(req.body.full_name) } : {}) });
          if (target.role !== role) await audit(req, "role_change", target, { from: target.role || "user", to: role });
          if (hasName) await audit(req, "rename", target);
          return u;
        }, role!)
      : (async () => {
          const target = await load(repo, req.params.id as string);
          const u = await repo.update(target.id, { full_name: cleanName(req.body.full_name) });
          await audit(req, "rename", target);
          return u;
        })());
    deps.onUserChanged(updated!.id);
    res.json({ user: adminUserView(updated!) });
  }));

  router.post("/:id/approve", handle(async (req, res) => {
    const target = await load(repo, req.params.id as string);
    if (target.status !== "pending") throw new HttpError(409, "Only accounts awaiting approval can be approved");
    const updated = await repo.update(target.id, { status: "active", approved_at: new Date(), approved_by: req.user!.email });
    deps.onUserChanged(target.id);
    await audit(req, "approve", target);
    const base = deps.baseUrl();
    const emailed = base ? await sendQuietly(deps, approvedEmail(target.email, base), "Approval") : false;
    res.json({ user: adminUserView(updated!), emailed });
  }));

  router.post("/:id/disable", handle(async (req, res) => {
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) || null : null;
    const updated = await guarded(req, "disable", async (target, r) => {
      if (target.status === "disabled") throw new HttpError(409, "This account is already disabled");
      const u = await r.update(target.id, { status: "disabled", disabled_at: new Date(), disabled_reason: reason }, { endSessions: true });
      await r.revokeTokens(target.id);
      await audit(req, "disable", target, { reason, previous_status: target.status });
      return u;
    });
    deps.onUserChanged(updated!.id);
    res.json({ user: adminUserView(updated!) });
  }));

  router.post("/:id/enable", handle(async (req, res) => {
    const target = await load(repo, req.params.id as string);
    if (target.status !== "disabled") throw new HttpError(409, "This account isn't disabled");
    // An account disabled before anyone approved it goes back to awaiting approval.
    const status = target.approved_at ? "active" : "pending";
    const updated = await repo.update(target.id, { status, disabled_at: null, disabled_reason: null });
    deps.onUserChanged(target.id);
    await audit(req, "enable", target, { status });
    res.json({ user: adminUserView(updated!) });
  }));

  // A one-time link the admin passes on (shown once, never stored in clear).
  router.post("/:id/reset-link", handle(async (req, res) => {
    const target = await load(repo, req.params.id as string);
    if (target.status === "disabled") throw new HttpError(409, "Enable the account before sending a reset link");
    if (target.id === req.user!.id) throw new HttpError(409, "Use “Change password” for your own account.");
    const purpose: TokenPurpose = target.status === "invited" ? "invite" : "reset";
    const { link, expires_at } = await issueLink(req, target, purpose);
    const emailed = purpose === "invite"
      ? await sendQuietly(deps, inviteEmail(target.email, link, req.user!.full_name || req.user!.email), "Invite")
      : false;
    await audit(req, purpose === "invite" ? "invite" : "reset_link", target, { resent: purpose === "invite", emailed });
    res.json({ link, expires_at, purpose, emailed });
  }));

  router.post("/:id/revoke-sessions", handle(async (req, res) => {
    const updated = await guarded(req, "revoke", async (target, r) => {
      const u = await r.update(target.id, {}, { endSessions: true });
      await audit(req, "revoke_sessions", target);
      return u;
    });
    deps.onUserChanged(updated!.id);
    res.json({ user: adminUserView(updated!) });
  }));

  // Only for accounts that never got in (pending signups, unaccepted invites).
  router.delete("/:id", handle(async (req, res) => {
    const target = await guarded(req, "delete", async (t, r) => {
      await r.delete(t.id);
      await audit(req, "delete", t, { status: t.status });
      return t;
    });
    deps.onUserChanged(target.id);
    res.json({ success: true });
  }));

  return router;
}
