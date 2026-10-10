// What the auth and user-admin routes need from the outside world. Tests swap
// in an in-memory repo, a recording mailer and a fast hash.
import bcrypt from "bcryptjs";
import { appBaseUrl, normalizeEmail } from "./accounts";
import { recordAudit, type AuditWriter } from "./audit";
import { getMailerStatus, sendMail, type MailMessage } from "./mailer";
import { publishSessionUserChange } from "./sessionUsers";
import { pgUserRepo, type UserRepo } from "./userRepo";

export interface AccountDeps {
  repo: UserRepo;
  audit: AuditWriter;
  sendMail(msg: MailMessage): Promise<unknown>;
  mailerConfigured(): boolean;
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  /** The seeded admin's address, which signup refuses. */
  reservedEmail(): string | null;
  /** Base URL for emailed links, or null when links can't be emailed. */
  baseUrl(): string | null;
  /** Drops cached session data after a role/status/session change. */
  onUserChanged(id: number): void;
}

export const BCRYPT_COST = 10;

export function defaultAccountDeps(pool: any): AccountDeps {
  return {
    repo: pgUserRepo(pool),
    audit: recordAudit,
    sendMail,
    mailerConfigured: () => getMailerStatus().configured,
    hashPassword: (password) => bcrypt.hash(password, BCRYPT_COST),
    verifyPassword: (password, hash) => bcrypt.compare(password, hash),
    reservedEmail: () => normalizeEmail(process.env.ADMIN_EMAIL || "admin@caremetric.local"),
    baseUrl: () => appBaseUrl(),
    onUserChanged: (id) => publishSessionUserChange(id),
  };
}

/** Sends without letting a mail failure break the request that triggered it. */
export async function sendQuietly(deps: AccountDeps, msg: MailMessage, label: string): Promise<boolean> {
  if (!deps.mailerConfigured()) return false;
  try {
    await deps.sendMail(msg);
    return true;
  } catch (e: any) {
    console.warn(`[accounts] ${label} email to ${msg.to} failed:`, e?.message || e);
    return false;
  }
}
