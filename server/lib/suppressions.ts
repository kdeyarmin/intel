import { inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { emailSuppressions } from "../db/schema";

export const normalizeEmail = (email: string) => String(email || "").trim().toLowerCase();

export async function isSuppressed(email: string): Promise<boolean> {
  const e = normalizeEmail(email);
  if (!e) return false;
  const rows = await db.select({ email: emailSuppressions.email }).from(emailSuppressions)
    .where(inArray(emailSuppressions.email, [e])).limit(1);
  return rows.length > 0;
}

/** Suppressed addresses among these (normalized, lowercase) → why (unsubscribed, bounced, spam_report). */
export async function loadSuppressionReasons(emails: string[]): Promise<Map<string, string>> {
  const list = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  const out = new Map<string, string>();
  for (let i = 0; i < list.length; i += 1000) {
    const rows = await db.select({ email: emailSuppressions.email, reason: emailSuppressions.reason }).from(emailSuppressions)
      .where(inArray(emailSuppressions.email, list.slice(i, i + 1000)));
    rows.forEach((r) => out.set(r.email, r.reason || "suppressed"));
  }
  return out;
}

/** Which of these addresses are suppressed (normalized, lowercase). */
export async function loadSuppressed(emails: string[]): Promise<Set<string>> {
  return new Set((await loadSuppressionReasons(emails)).keys());
}

export async function addSuppression(email: string, reason: string, source: string): Promise<void> {
  const e = normalizeEmail(email);
  if (!e) return;
  await db.insert(emailSuppressions).values({ email: e, reason, source })
    .onConflictDoUpdate({ target: emailSuppressions.email, set: { reason, source, created_date: sql`now()` } });
}
