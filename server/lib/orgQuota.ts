// Per-organization daily quotas (AI calls, emails, exports) counted in
// org_usage. The limit comes from the organization's quotas, else its plan's
// features.quotas, else the defaults; platform admins are never limited.
import { pool } from "../db";

export type QuotaKind = "ai_calls" | "emails_sent" | "exports";

export const DEFAULT_QUOTAS: Record<QuotaKind, number> = { ai_calls: 100, emails_sent: 500, exports: 50 };

export class QuotaError extends Error {
  status = 429;
  code = "quota_exceeded";
  constructor(message: string, public kind: QuotaKind, public limit: number) {
    super(message);
  }
}

const LABELS: Record<QuotaKind, string> = { ai_calls: "AI requests", emails_sent: "emails", exports: "exports" };

export function quotaLimit(kind: QuotaKind, org: { quotas?: any } | null | undefined, plan: { features?: any } | null | undefined): number {
  const own = Number(org?.quotas?.[kind]);
  if (Number.isFinite(own) && own >= 0) return own;
  const fromPlan = Number(plan?.features?.quotas?.[kind]);
  if (Number.isFinite(fromPlan) && fromPlan >= 0) return fromPlan;
  return DEFAULT_QUOTAS[kind];
}

/** Today's usage and limits for an organization. */
export async function usageToday(orgId: number, db: any = pool): Promise<{ day: string; used: Record<QuotaKind, number>; limits: Record<QuotaKind, number> }> {
  const { rows } = await db.query(
    `SELECT o.quotas, p.features, u.ai_calls, u.emails_sent, u.exports, current_date::text AS day
       FROM organizations o
       LEFT JOIN plans p ON p.code = o.plan_code
       LEFT JOIN org_usage u ON u.org_id = o.id AND u.day = current_date
      WHERE o.id = $1`, [orgId]);
  const r = rows[0] ?? {};
  const kinds: QuotaKind[] = ["ai_calls", "emails_sent", "exports"];
  return {
    day: r.day ?? new Date().toISOString().slice(0, 10),
    used: Object.fromEntries(kinds.map((k) => [k, Number(r[k] ?? 0)])) as Record<QuotaKind, number>,
    limits: Object.fromEntries(kinds.map((k) => [k, quotaLimit(k, r, r)])) as Record<QuotaKind, number>,
  };
}

/**
 * Counts `amount` against today's quota and throws a 429 QuotaError when the
 * day's limit would be passed. One statement, so parallel requests can't
 * both squeeze under the limit; the day's first call is checked too (a limit
 * of 0 admits nothing).
 */
export async function consumeQuota(user: { orgId?: number | null; isPlatformAdmin?: boolean } | null | undefined, kind: QuotaKind, amount = 1, db: any = pool): Promise<void> {
  if (!user?.orgId || user.isPlatformAdmin) return;
  const { rows } = await db.query(
    `WITH lim AS (
       SELECT COALESCE((o.quotas->>$3)::int, (p.features->'quotas'->>$3)::int, $4::int) AS limit_value
         FROM organizations o LEFT JOIN plans p ON p.code = o.plan_code WHERE o.id = $1),
     upsert AS (
       INSERT INTO org_usage (org_id, day, ${kind}) SELECT $1::int, current_date, $2::int FROM lim WHERE $2::int <= lim.limit_value
       ON CONFLICT (org_id, day) DO UPDATE SET ${kind} = org_usage.${kind} + EXCLUDED.${kind}
       WHERE org_usage.${kind} + EXCLUDED.${kind} <= (SELECT limit_value FROM lim)
       RETURNING ${kind} AS used)
     SELECT (SELECT used FROM upsert) AS used, (SELECT limit_value FROM lim) AS limit_value`,
    [user.orgId, amount, kind, DEFAULT_QUOTAS[kind]],
  );
  const r = rows[0] ?? {};
  if (r.used == null) {
    const limit = Number(r.limit_value ?? DEFAULT_QUOTAS[kind]);
    throw new QuotaError(`Today's limit of ${limit.toLocaleString("en-US")} ${LABELS[kind]} for your organization has been reached. It resets at midnight UTC; an owner can raise it on the Billing page.`, kind, limit);
  }
}
