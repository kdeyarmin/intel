// Admin user management: /api/admin/users. Every route requires an active
// admin. An organization's owner sees and manages that organization's people;
// a platform admin sees everyone and may make other platform-wide admins.
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
import { isPlatformAdmin } from "../lib/roles";
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
  "recover_admin", // scripts/admin-recover.ts
];

export function createAdminUsersRouter(deps: AccountDeps) {
  const router = Router();
  const { repo } = deps;
  router.use(authMiddleware, adminOnly, rateLimit("admin_users", 120, 60_000));

  // The event belongs to the organization of the person it is about, so that organization's owners see it on
  // their activity feed even when a platform admin (who belongs to another organization) acted.
  const audit = async (req: AuthRequest, action: string, target: Pick<UserRow, "id" | "email"> | null, details: Record<string, unknown> = {}) => {
    const targetOrg = typeof details.org_id === "number" ? details.org_id : target ? (await deps.orgs.membershipOf(target.id).catch(() => null))?.org_id : undefined;
    return deps.audit({
      event_type: ACCOUNT_EVENT,
      action,
      user_email: req.user!.email,
      entity_type: "User",
      entity_id: target?.id ?? null,
      details: { target_email: target?.email ?? null, ...details },
      ip_address: clientIp(req),
      org_id: targetOrg ?? req.user!.orgId ?? null,
    });
  };

  // Sentinel for an admin with no organization: nothing is in their scope.
  const NO_ORG = -1;
  /** The organization the caller may manage, or null for a platform admin (every organization). */
  const scopeOf = (req: AuthRequest): number | null => (req.user!.isPlatformAdmin ? null : req.user!.orgId ?? NO_ORG);
  const orgRoleOf = (value: unknown): "owner" | "member" | null => (value === "owner" || value === "member" ? value : null);
  /** Operates the platform: the admin role or the platform-admin flag (one thing, see lib/roles.ts). */
  const isPlatformAccount = (u: Pick<UserRow, "role" | "is_platform_admin">) => isPlatformAdmin({ role: u.role, isPlatformAdmin: u.is_platform_admin });

  const handle = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      await fn(req as AuthRequest, res);
    } catch (e: any) {
      if (e instanceof HttpError) return res.status(e.status).json({ message: e.message });
      console.error("[admin/users] Failed:", e?.message || e);
      res.status(500).json({ message: process.env.NODE_ENV === "production" ? "Something went wrong. Please try again." : e?.message });
    }
  };

  /**
   * The target account, which must be in the caller's organization unless they are a platform admin. A platform
   * admin's account is never an organization owner's to manage, even when the two share an organization (the
   * platform's own is the one every account from before organizations was folded into, and where an admin who
   * delegates by inviting an owner puts them): a reset link or a disable on it would be a takeover of the platform.
   * It answers 404, like an account in another organization.
   */
  async function load(req: AuthRequest, r: UserRepo): Promise<UserRow> {
    const idParam = req.params.id as string;
    // Plain decimal only: Number() would also read "1e3" or "0x10" as an id.
    const id = /^\d{1,15}$/.test(idParam) ? Number(idParam) : NaN;
    const user = Number.isSafeInteger(id) && id > 0 ? await r.findById(id) : null;
    if (!user) throw new HttpError(404, "User not found");
    const scope = scopeOf(req);
    if (scope !== null && (await deps.orgs.membershipOf(user.id))?.org_id !== scope) throw new HttpError(404, "User not found");
    if (scope !== null && isPlatformAccount(user)) throw new HttpError(404, "User not found");
    return user;
  }

  /**
   * For a status-conditional write that matched nothing because the account
   * changed after it was read: 404 if it was deleted, otherwise 409.
   */
  async function changedMeanwhile(r: UserRepo, id: number, message: string): Promise<never> {
    if (!(await r.findById(id))) throw new HttpError(404, "User not found");
    throw new HttpError(409, message);
  }

  /** Loads the target and checks the guards while admin rows are locked. */
  async function guarded<T>(req: AuthRequest, action: AdminAction, fn: (target: UserRow, r: UserRepo) => Promise<T>, newRole?: "user" | "admin"): Promise<T> {
    return repo.withAdminLock(async (activeAdmins, r) => {
      const target = await load(req, r);
      const problem = adminActionProblem({ actorId: req.user!.id, target, action, newRole, activeAdmins });
      if (problem) throw new HttpError(409, problem);
      return fn(target, r);
    });
  }

  async function issueLink(req: AuthRequest, user: UserRow, purpose: TokenPurpose) {
    const base = deps.baseUrl();
    if (!base) throw new HttpError(409, "Set PUBLIC_APP_URL so links point at this app.");
    const token = newToken();
    const ttl = purpose === "invite" ? INVITE_TOKEN_TTL_MS : ADMIN_RESET_TOKEN_TTL_MS;
    const expires_at = new Date(Date.now() + ttl);
    // Replaces any earlier link of this kind in one step.
    await repo.replaceToken({ user_id: user.id, purpose, token_hash: token.hash, expires_at, created_by: req.user!.email });
    return { link: tokenLink(base, token.raw), expires_at };
  }

  router.get("/", handle(async (req, res) => {
    const scope = scopeOf(req);
    const memberships = await deps.orgs.memberships(scope);
    const byUser = new Map(memberships.map((m) => [m.user_id, m]));
    // An organization's owner manages their people, never the platform's own accounts (see load()).
    const users = (await repo.list()).filter((u) => scope === null || (byUser.has(u.id) && !isPlatformAccount(u)));
    const seats = scope === null || scope === NO_ORG ? null : await deps.orgs.seatUsage(scope);
    res.json({
      users: users.map((u) => {
        const m = byUser.get(u.id);
        return { ...adminUserView(u), org_id: m?.org_id ?? null, org_role: m?.org_role ?? null, org_name: m?.org_name ?? null };
      }),
      email_enabled: deps.mailerConfigured() && !!deps.baseUrl(),
      platform_admin: req.user!.isPlatformAdmin === true,
      organization: scope === null ? null : { id: scope, name: req.user!.orgName ?? null, seats },
    });
  }));

  router.get("/pending-count", handle(async (req, res) => {
    // latest_id lets the notification bell tell a new signup from ones already seen.
    const scope = scopeOf(req);
    if (scope === null) return res.json(await repo.pendingSummary());
    const members = new Set((await deps.orgs.memberships(scope)).map((m) => m.user_id));
    const pending = (await repo.list()).filter((u) => u.status === "pending" && members.has(u.id));
    res.json({ count: pending.length, latest_id: pending.length ? Math.max(...pending.map((u) => u.id)) : null });
  }));

  // Recent account activity for the admin screen (the caller's organization's, unless a platform admin).
  router.get("/activity", handle(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const scope = scopeOf(req);
    const { pool } = await import("../db");
    const { rows } = await pool.query(
      `SELECT id, action, user_email, entity_id, details, ip_address, created_date
         FROM audit_events WHERE event_type = $1 AND action = ANY($2) AND ($4::int IS NULL OR org_id = $4)
        ORDER BY created_date DESC LIMIT $3`,
      [ACCOUNT_EVENT, ACCOUNT_ACTIONS, limit, scope],
    );
    res.json({ events: rows });
  }));

  router.post("/invite", handle(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) throw new HttpError(400, "Enter a valid email address");
    const role = normalizeRole(req.body?.role ?? "user");
    if (!role) throw new HttpError(400, "Role must be user or admin");
    if (role === "admin" && !req.user!.isPlatformAdmin) throw new HttpError(403, "Only platform administrators can invite platform admins. Invite them as an owner of your organization instead.");
    // Platform admins may invite into another organization; everyone else invites into their own.
    const requestedOrg = req.body?.org_id;
    const orgId = req.user!.isPlatformAdmin && Number.isInteger(requestedOrg) && requestedOrg > 0 ? Number(requestedOrg) : req.user!.orgId ?? null;
    if (orgId === null && !req.user!.isPlatformAdmin) throw new HttpError(409, "Your account isn't in an organization, so it can't invite people.");
    const orgRole = orgRoleOf(req.body?.org_role) ?? (role === "admin" ? "owner" : "member");
    if ((await repo.findByEmail(email)).length) throw new HttpError(409, "An account with this email already exists");
    if (!deps.baseUrl()) throw new HttpError(409, "Set PUBLIC_APP_URL so invite links point at this app.");
    if (orgId !== null) {
      const seats = await deps.orgs.seatUsage(orgId);
      if (seats.used >= seats.limit) {
        return res.status(409).json({ message: `Seat limit reached (${seats.used} of ${seats.limit})`, code: "seat_limit", detail: "Upgrade the plan under Billing to add more people.", seats });
      }
    }
    let user: UserRow;
    try {
      user = await repo.create({
        email,
        // Unknown random password: the account can't be signed into until the invite is accepted.
        password_hash: await deps.hashPassword(crypto.randomBytes(32).toString("hex")),
        full_name: cleanName(req.body?.full_name),
        role,
        // The admin role is the platform-admin flag: one thing, kept together.
        is_platform_admin: role === "admin",
        status: "invited",
      });
    } catch (e: any) {
      if (e?.code === "23505") throw new HttpError(409, "An account with this email already exists");
      throw e;
    }
    if (orgId !== null) await deps.orgs.addMember(orgId, user.id, orgRole);
    const { link, expires_at } = await issueLink(req, user, "invite");
    const emailed = await sendQuietly(deps, inviteEmail(user.email, link, req.user!.full_name || req.user!.email), "Invite");
    await audit(req, "invite", user, { role, org_id: orgId, org_role: orgId !== null ? orgRole : null, emailed });
    res.status(201).json({ user: { ...adminUserView(user), org_id: orgId, org_role: orgId !== null ? orgRole : null }, link, expires_at, emailed });
  }));

  router.patch("/:id", handle(async (req, res) => {
    const hasRole = req.body?.role !== undefined;
    const hasName = req.body?.full_name !== undefined;
    const hasOrgRole = req.body?.org_role !== undefined;
    if (!hasRole && !hasName && !hasOrgRole) throw new HttpError(400, "Nothing to change");
    const role = hasRole ? normalizeRole(req.body.role) : undefined;
    if (hasRole && !role) throw new HttpError(400, "Role must be user or admin");
    // The admin role is platform-wide (every organization): only platform admins hand it out or take it away.
    if (hasRole && !req.user!.isPlatformAdmin) throw new HttpError(403, "Only platform administrators can change roles. Make someone an owner of your organization instead.");
    const orgRole = hasOrgRole ? orgRoleOf(req.body.org_role) : undefined;
    if (hasOrgRole && !orgRole) throw new HttpError(400, "Organization role must be owner or member");

    const updated = await (hasRole
      ? guarded(req, "role", async (target, r) => {
          const u = await r.update(target.id, { role: role!, is_platform_admin: role === "admin", ...(hasName ? { full_name: cleanName(req.body.full_name) } : {}) });
          if (target.role !== role) await audit(req, "role_change", target, { from: target.role || "user", to: role });
          if (hasName) await audit(req, "rename", target);
          return u;
        }, role!)
      : (async () => {
          const target = await load(req, repo);
          if (hasOrgRole && target.id === req.user!.id) throw new HttpError(409, "You can't change your own organization role. Ask another owner.");
          const u = hasName ? await repo.update(target.id, { full_name: cleanName(req.body.full_name) }) : target;
          if (hasName) await audit(req, "rename", target);
          return u;
        })());
    if (hasOrgRole) {
      const membership = await deps.orgs.membershipOf(updated!.id);
      if (!membership) throw new HttpError(409, "This account isn't in an organization");
      if (membership.org_role !== orgRole) {
        await deps.orgs.setMemberRole(membership.org_id, updated!.id, orgRole!);
        await audit(req, "role_change", updated!, { from: membership.org_role, to: orgRole, org_id: membership.org_id });
      }
    }
    deps.onUserChanged(updated!.id);
    const membership = await deps.orgs.membershipOf(updated!.id);
    res.json({ user: { ...adminUserView(updated!), org_id: membership?.org_id ?? null, org_role: membership?.org_role ?? null, org_name: membership?.org_name ?? null } });
  }));

  router.post("/:id/approve", handle(async (req, res) => {
    const notPending = "Only accounts awaiting approval can be approved";
    const target = await load(req, repo);
    if (target.status !== "pending") throw new HttpError(409, notPending);
    // Still pending is checked in the same statement, so when two admins
    // approve at once only one sends the email and records the approval.
    const updated = await repo.update(target.id, { status: "active", approved_at: new Date(), approved_by: req.user!.email }, { ifStatus: ["pending"] });
    if (!updated) await changedMeanwhile(repo, target.id, notPending);
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
    const notDisabled = "This account isn't disabled";
    const target = await load(req, repo);
    if (target.status !== "disabled") throw new HttpError(409, notDisabled);
    // An account disabled before anyone approved it goes back to awaiting approval.
    const status = target.approved_at ? "active" : "pending";
    const updated = await repo.update(target.id, { status, disabled_at: null, disabled_reason: null }, { ifStatus: ["disabled"] });
    if (!updated) await changedMeanwhile(repo, target.id, notDisabled);
    deps.onUserChanged(target.id);
    await audit(req, "enable", target, { status });
    res.json({ user: adminUserView(updated!) });
  }));

  // A one-time link the admin passes on (shown once, never stored in clear).
  router.post("/:id/reset-link", handle(async (req, res) => {
    const target = await load(req, repo);
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
      // Only while still never approved, checked in the same statement: an
      // approval or an accepted invite that lands first keeps the account.
      if (!(await r.delete(t.id, { ifStatus: ["pending", "invited"] }))) {
        await changedMeanwhile(r, t.id, "Only accounts that were never approved can be deleted. Disable this account instead.");
      }
      await audit(req, "delete", t, { status: t.status });
      return t;
    });
    deps.onUserChanged(target.id);
    res.json({ success: true });
  }));

  return router;
}
