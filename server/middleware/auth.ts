import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getSessionUser } from "../lib/sessionUsers";

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET environment variable is required in production. Set it via Replit Secrets.");
  }
  JWT_SECRET = crypto.randomBytes(48).toString("hex");
  console.warn("[auth] JWT_SECRET not set — generated ephemeral dev secret. Sessions will be invalidated on restart.");
}

export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthRequest extends Request {
  user?: { id: number; email: string; role: string; full_name?: string; status?: string };
}

/**
 * The token only identifies the account and its session generation (`tv`).
 * Role and status are read live on each request, so a role change or a
 * disabled account takes effect without waiting for the token to expire.
 */
export function generateToken(user: { id: number; token_version: number }) {
  return jwt.sign({ id: user.id, tv: user.token_version }, JWT_SECRET as string, { expiresIn: "7d" });
}

/** Tokens issued before token versions existed carry no `tv`; they count as version 0. */
export function verifyToken(token: string): { id: number; tv: number } {
  const payload = jwt.verify(token, JWT_SECRET as string) as { id?: unknown; tv?: unknown };
  const id = Number(payload.id);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Malformed token");
  return { id, tv: typeof payload.tv === "number" ? payload.tv : 0 };
}

export function readToken(req: Request): string | undefined {
  return req.cookies?.token || req.headers.authorization?.replace("Bearer ", "") || undefined;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
  };
}

function unauthorized(res: Response, detail = "Please log in again.") {
  return res.status(401).json({ message: "Invalid or expired token", detail });
}

async function authenticate(req: AuthRequest, res: Response, next: NextFunction, allowPending: boolean) {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ message: "Authentication required", detail: "You must be logged in to perform this operation." });
  }
  let claims: { id: number; tv: number };
  try {
    claims = verifyToken(token);
  } catch {
    return unauthorized(res);
  }
  let user;
  try {
    user = await getSessionUser(claims.id);
  } catch (e: any) {
    console.error("[auth] Session lookup failed:", e?.message || e);
    return res.status(503).json({ message: "Service unavailable", detail: "Couldn't check your session. Try again shortly." });
  }
  if (!user || user.token_version !== claims.tv) return unauthorized(res, "Your session has ended. Please log in again.");
  if (user.status === "disabled" || user.status === "invited") {
    return res.status(403).json({ message: "Account disabled", code: "account_disabled", detail: "This account has been disabled. Contact an administrator." });
  }
  if (user.status === "pending" && !allowPending) {
    return res.status(403).json({ message: "Awaiting approval", code: "account_pending", detail: "An administrator needs to approve your account first." });
  }
  req.user = { id: user.id, email: user.email, role: user.role, full_name: user.full_name || undefined, status: user.status };
  next();
}

/** Requires a valid session for an active account. */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  return authenticate(req, res, next, false);
}

/** Like authMiddleware but lets accounts awaiting approval through (for /auth/me and sign-out). */
export function authAllowPending(req: AuthRequest, res: Response, next: NextFunction) {
  return authenticate(req, res, next, true);
}

export function adminOnly(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden", detail: "Admin access required." });
  }
  next();
}
