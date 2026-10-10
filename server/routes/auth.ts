import crypto from "crypto";
import { Router, Request, Response } from "express";
import {
  cleanName,
  hashToken,
  looksLikeToken,
  newToken,
  normalizeEmail,
  passwordProblem,
  publicUser,
  RESET_TOKEN_TTL_MS,
  tokenLink,
  type UserRow,
} from "../lib/accounts";
import { sendQuietly, type AccountDeps } from "../lib/accountDeps";
import { ACCOUNT_EVENT } from "../lib/audit";
import { resetEmail, signupPendingEmail } from "../lib/accountEmails";
import { authAllowPending, authMiddleware, cookieOptions, generateToken, AuthRequest } from "../middleware/auth";
import { clientIp, consumeToken, createFailureCounter, ipRateLimit } from "../middleware/rateLimit";


const INVALID_LINK = "This link is invalid or has expired. Ask for a new one.";
const BAD_LOGIN = "Invalid email or password";

function isProd() {
  return process.env.NODE_ENV === "production";
}

function serverError(res: Response, e: any, label: string) {
  console.error(`[auth] ${label} failed:`, e?.message || e);
  return res.status(500).json({ message: isProd() ? "Something went wrong. Please try again." : e?.message || "Internal error" });
}

export function setSessionCookie(res: Response, user: Pick<UserRow, "id" | "token_version">) {
  res.cookie("token", generateToken(user), cookieOptions());
}

function clearSessionCookie(res: Response) {
  const { maxAge: _maxAge, ...opts } = cookieOptions();
  res.clearCookie("token", opts);
}

export function createAuthRouter(deps: AccountDeps) {
  const router = Router();
  const { repo } = deps;

  // Per-IP throttle to blunt credential stuffing / brute force / signup abuse,
  // plus a per-email limit on failed logins that address rotation can't dodge.
  const authThrottle = ipRateLimit("auth", 10, 60_000);
  const linkThrottle = ipRateLimit("auth_links", 20, 60_000);
  const loginFailures = createFailureCounter(10, 15 * 60_000);

  // Compared against when no account matches, so a login for an unknown
  // email takes as long as one with a wrong password.
  let dummyHash: Promise<string> | null = null;
  const timingDummy = () => (dummyHash ??= deps.hashPassword(crypto.randomBytes(16).toString("hex")));

  const audit = (req: Request, action: string, actorEmail: string | null, target: Pick<UserRow, "id" | "email"> | null, details: Record<string, unknown> = {}) =>
    deps.audit({
      event_type: ACCOUNT_EVENT,
      action,
      user_email: actorEmail,
      entity_type: "User",
      entity_id: target?.id ?? null,
      details: { target_email: target?.email ?? null, ...details },
      ip_address: clientIp(req),
    });

  router.get("/options", (_req, res) => {
    res.json({ emailReset: deps.mailerConfigured() && !!deps.baseUrl() });
  });

  router.post("/signup", authThrottle, async (req: Request, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      if (!email) return res.status(400).json({ message: "Enter a valid email address" });
      const problem = passwordProblem(req.body?.password);
      if (problem) return res.status(400).json({ message: problem });
      const taken = { message: "An account with this email already exists", detail: "Sign in instead, or reset your password." };
      if (email === deps.reservedEmail()) return res.status(409).json(taken);
      if ((await repo.findByEmail(email)).length > 0) return res.status(409).json(taken);

      let user: UserRow;
      try {
        user = await repo.create({
          email,
          password_hash: await deps.hashPassword(req.body.password),
          full_name: cleanName(req.body?.full_name),
          role: "user",
          status: "pending",
        });
      } catch (e: any) {
        if (e?.code === "23505") return res.status(409).json(taken);
        throw e;
      }
      await audit(req, "signup", email, user);
      // Signed in so the "awaiting approval" screen can watch for approval.
      setSessionCookie(res, user);
      res.status(201).json(publicUser(user));

      const base = deps.baseUrl();
      if (base && deps.mailerConfigured()) {
        const admins = await repo.activeAdmins().catch(() => [] as UserRow[]);
        for (const admin of admins) await sendQuietly(deps, signupPendingEmail(admin.email, user, base), "Signup notice");
      }
    } catch (e: any) {
      if (!res.headersSent) serverError(res, e, "Signup");
    }
  });

  router.post("/login", authThrottle, async (req: Request, res: Response) => {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = req.body?.password;
      if (!email || typeof password !== "string" || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      const wait = loginFailures.lockedFor(email);
      if (wait > 0) {
        res.setHeader("Retry-After", Math.ceil(wait / 1000));
        return res.status(429).json({ message: "Too many failed sign-ins", detail: "Wait a few minutes, or reset your password." });
      }

      const candidates = await repo.findByEmail(email);
      let user: UserRow | null = null;
      for (const c of candidates) {
        if (await deps.verifyPassword(password, c.password_hash)) {
          user = c;
          break;
        }
      }
      if (candidates.length === 0) await deps.verifyPassword(password, await timingDummy());
      if (!user) {
        loginFailures.fail(email);
        await audit(req, "login_failed", email, candidates[0] ?? null, { reason: candidates.length ? "bad_password" : "unknown_email" });
        return res.status(401).json({ message: BAD_LOGIN });
      }
      if (user.status === "disabled") {
        await audit(req, "login_blocked", email, user, { reason: "disabled" });
        return res.status(403).json({ message: "Account disabled", code: "account_disabled", detail: "This account has been disabled. Contact an administrator." });
      }
      loginFailures.clear(email);
      const updated = (await repo.update(user.id, { last_login_at: new Date() })) || user;
      await audit(req, "login", user.email, user);
      setSessionCookie(res, updated);
      res.json(publicUser(updated));
    } catch (e: any) {
      serverError(res, e, "Login");
    }
  });

  router.get("/me", authAllowPending, (req: AuthRequest, res: Response) => {
    res.json(req.user);
  });

  router.post("/logout", (_req: Request, res: Response) => {
    clearSessionCookie(res);
    res.json({ success: true });
  });

  // Ends every session of the signed-in account (all devices).
  router.post("/logout-all", authAllowPending, async (req: AuthRequest, res: Response) => {
    try {
      const user = await repo.update(req.user!.id, {}, { endSessions: true });
      deps.onUserChanged(req.user!.id);
      if (user) await audit(req, "logout_all", user.email, user);
      clearSessionCookie(res);
      res.json({ success: true });
    } catch (e: any) {
      serverError(res, e, "Sign out everywhere");
    }
  });

  router.post("/change-password", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const user = await repo.findById(req.user!.id);
      if (!user) return res.status(401).json({ message: "Your session has ended. Please log in again." });
      const wait = loginFailures.lockedFor(user.email);
      if (wait > 0) return res.status(429).json({ message: "Too many failed attempts", detail: "Wait a few minutes and try again." });
      if (typeof req.body?.current_password !== "string" || !(await deps.verifyPassword(req.body.current_password, user.password_hash))) {
        loginFailures.fail(user.email);
        return res.status(400).json({ message: "Your current password is incorrect" });
      }
      const problem = passwordProblem(req.body?.new_password);
      if (problem) return res.status(400).json({ message: problem });
      const updated = await repo.update(
        user.id,
        { password_hash: await deps.hashPassword(req.body.new_password), password_changed_at: new Date() },
        { endSessions: true },
      );
      await repo.revokeTokens(user.id, "reset");
      deps.onUserChanged(user.id);
      await audit(req, "password_change", user.email, user);
      // Other devices are signed out; this one gets a fresh session.
      setSessionCookie(res, updated!);
      res.json({ success: true });
    } catch (e: any) {
      serverError(res, e, "Change password");
    }
  });

  // Always answers the same way, whether or not the email has an account.
  router.post("/forgot-password", linkThrottle, async (req: Request, res: Response) => {
    const email = normalizeEmail(req.body?.email);
    const base = deps.baseUrl();
    const available = deps.mailerConfigured() && !!base;
    res.json({
      success: true,
      emailReset: available,
      message: available
        ? "If that email has an account, a reset link is on its way."
        : "Password reset by email isn't set up. Ask an administrator for a reset link.",
    });
    if (!email || !available) return;
    // At most 3 reset emails per address per hour, so the form can't be used to flood an inbox.
    if (!consumeToken(`forgot:${email}`, 3, 60 * 60_000)) return;
    try {
      const user = (await repo.findByEmail(email)).find((u) => u.status === "active" || u.status === "pending");
      if (!user) return;
      await repo.revokeTokens(user.id, "reset");
      const token = newToken();
      await repo.createToken({ user_id: user.id, purpose: "reset", token_hash: token.hash, expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS), created_by: "self" });
      await sendQuietly(deps, resetEmail(user.email, tokenLink(base!, token.raw)), "Password reset");
      await audit(req, "reset_requested", user.email, user);
    } catch (e: any) {
      console.error("[auth] Forgot password failed:", e?.message || e);
    }
  });

  // Lets the reset/invite screen say what the link is for before asking for a password.
  router.get("/token-info", linkThrottle, async (req: Request, res: Response) => {
    try {
      const raw = req.query.token;
      if (!looksLikeToken(raw)) return res.json({ valid: false });
      const token = await repo.peekToken(hashToken(raw));
      const user = token ? await repo.findById(token.user_id) : null;
      if (!token || !user || user.status === "disabled") return res.json({ valid: false });
      res.json({
        valid: true,
        purpose: token.purpose,
        email: user.email,
        full_name: user.full_name,
        expires_at: token.expires_at,
      });
    } catch (e: any) {
      serverError(res, e, "Token lookup");
    }
  });

  // Completes a password reset or an invite. Single use; ends every other session.
  router.post("/reset-password", linkThrottle, async (req: Request, res: Response) => {
    try {
      const raw = req.body?.token;
      if (!looksLikeToken(raw)) return res.status(400).json({ message: INVALID_LINK });
      const problem = passwordProblem(req.body?.password);
      if (problem) return res.status(400).json({ message: problem });
      const tokenHash = hashToken(raw);
      const peek = await repo.peekToken(tokenHash);
      const user = peek ? await repo.findById(peek.user_id) : null;
      if (!peek || !user || user.status === "disabled") return res.status(400).json({ message: INVALID_LINK });

      const passwordHash = await deps.hashPassword(req.body.password);
      const token = await repo.consumeToken(tokenHash);
      if (!token) return res.status(400).json({ message: INVALID_LINK });

      const now = new Date();
      const invite = token.purpose === "invite";
      const updated = await repo.update(
        user.id,
        {
          password_hash: passwordHash,
          password_changed_at: now,
          // The link signs them in.
          last_login_at: now,
          ...(invite
            ? { status: "active", approved_at: now, approved_by: token.created_by, full_name: user.full_name || cleanName(req.body?.full_name) }
            : {}),
        },
        { endSessions: true },
      );
      await repo.revokeTokens(user.id);
      deps.onUserChanged(user.id);
      await audit(req, invite ? "invite_accepted" : "password_reset", user.email, user, { link_created_by: token.created_by });
      setSessionCookie(res, updated!);
      res.json(publicUser(updated!));
    } catch (e: any) {
      serverError(res, e, "Password reset");
    }
  });

  return router;
}
