// Pure account rules shared by the auth and user-admin routes.
import crypto from "crypto";

export const USER_STATUSES = ["pending", "invited", "active", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt ignores everything after 72 bytes, so a longer password would
// silently match any password sharing its first 72 bytes.
export const MAX_PASSWORD_BYTES = 72;

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // emailed reset links
export const ADMIN_RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // links an admin hands over
export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type TokenPurpose = "reset" | "invite";

export interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  full_name: string | null;
  role: string | null;
  status: string;
  token_version: number;
  last_login_at: Date | null;
  approved_at: Date | null;
  approved_by: string | null;
  disabled_at: Date | null;
  disabled_reason: string | null;
  password_changed_at: Date | null;
  created_date: Date | null;
  /** Operates the shared data and sees every organization (migration 0020). */
  is_platform_admin?: boolean;
  terms_accepted_at?: Date | null;
  terms_version?: string | null;
}

/** Trimmed, lower-cased email, or null when it isn't a plausible address. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** An error message for an unacceptable new password, or null. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return `Password must be at most ${MAX_PASSWORD_BYTES} bytes`;
  }
  return null;
}

export function normalizeRole(role: unknown): UserRole | null {
  return (USER_ROLES as readonly string[]).includes(role as string) ? (role as UserRole) : null;
}

export function cleanName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim().slice(0, 255);
  return trimmed || null;
}

/** What the browser and the admin screens may see about an account. */
export function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    full_name: u.full_name,
    role: u.role || "user",
    status: u.status,
    is_platform_admin: !!u.is_platform_admin,
  };
}

export function adminUserView(u: UserRow) {
  return {
    ...publicUser(u),
    terms_accepted_at: u.terms_accepted_at ?? null,
    last_login_at: u.last_login_at,
    approved_at: u.approved_at,
    approved_by: u.approved_by,
    disabled_at: u.disabled_at,
    disabled_reason: u.disabled_reason,
    password_changed_at: u.password_changed_at,
    created_date: u.created_date,
  };
}

export function isActiveAdmin(u: Pick<UserRow, "role" | "status">): boolean {
  return u.role === "admin" && u.status === "active";
}

/** A random URL-safe token and the hash stored for it. */
export function newToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function looksLikeToken(raw: unknown): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(raw);
}

/**
 * The base URL for links in emails. Never derived from the request's Host
 * header: a forged Host would put an attacker's domain in a reset email.
 * Development falls back to the Vite dev server.
 */
export function appBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = (env.PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  return env.NODE_ENV === "production" ? null : "http://localhost:5000";
}

export function tokenLink(base: string, raw: string): string {
  return `${base}/reset-password?token=${encodeURIComponent(raw)}`;
}

export type AdminAction = "role" | "disable" | "revoke" | "delete";

/**
 * Why an admin may not perform `action` on `target`, or null when allowed.
 * `activeAdmins` is the number of active admins, read under a lock.
 */
export function adminActionProblem(input: {
  actorId: number;
  target: Pick<UserRow, "id" | "role" | "status">;
  action: AdminAction;
  newRole?: UserRole;
  activeAdmins: number;
}): string | null {
  const { actorId, target, action, newRole, activeAdmins } = input;
  if (target.id === actorId) {
    return action === "revoke"
      ? "Use “Sign out everywhere” to end your own sessions."
      : "You can't change your own account here. Ask another admin.";
  }
  const removesAdmin =
    isActiveAdmin(target) && ((action === "role" && newRole !== "admin") || action === "disable" || action === "delete");
  if (removesAdmin && activeAdmins <= 1) return "This is the last active admin. Make someone else an admin first.";
  if (action === "disable" && target.status === "invited") {
    return "This invite hasn't been accepted yet. Delete it instead.";
  }
  if (action === "delete" && !["pending", "invited"].includes(target.status)) {
    return "Only accounts that were never approved can be deleted. Disable this account instead.";
  }
  return null;
}
