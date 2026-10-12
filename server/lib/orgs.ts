// Organizations: the customer a user belongs to, its plan, territory and
// seats. Every customer-owned row carries org_id (migration 0020); the
// session carries the user's membership so routes can scope without a join.
import { pool } from "../db";

export interface Territory {
  states: string[];
  county_fips: string[];
}

export interface OrgSummary {
  id: number;
  name: string;
  slug: string;
  status: string;
  plan_code: string | null;
  seat_limit: number;
  territory: Territory;
  quotas: Record<string, number> | null;
  sender: Record<string, string> | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  terms_version: string | null;
}

export const TERMS_VERSION = "2026-10";
export const TRIAL_DAYS = 14;
/** The organization existing data was folded into (migration 0020). */
export const LEGACY_ORG_ID = 1;

export function normalizeTerritory(value: unknown): Territory {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const list = (x: unknown) => (Array.isArray(x) ? x.map((s) => String(s).trim().toUpperCase()).filter(Boolean) : []);
  return {
    states: [...new Set(list(v.states).filter((s) => /^[A-Z]{2}$/.test(s)))],
    county_fips: [...new Set(list(v.county_fips).filter((s) => /^\d{5}$/.test(s)))],
  };
}

/** "Sunny Hill Personal Care, LLC" → "sunny-hill-personal-care-llc" (unique with a suffix when taken). */
export function slugify(name: string): string {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "org";
}

/** The organization name for a signup: what they typed, else the email's domain, else the person's name. */
export function orgNameFor(input: { organization_name?: unknown; email: string; full_name?: string | null }): string {
  const typed = String(input.organization_name ?? "").trim();
  if (typed) return typed.slice(0, 120);
  const domain = input.email.split("@")[1]?.toLowerCase() ?? "";
  const generic = /^(gmail|yahoo|hotmail|outlook|live|aol|icloud|me|comcast|verizon|att|msn|proton|protonmail)\./.test(domain);
  if (domain && !generic) return domain.replace(/\.(com|org|net|us|io|co)$/, "").split(".").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ").slice(0, 120);
  const person = String(input.full_name ?? "").trim();
  return person ? `${person}'s organization`.slice(0, 120) : "New organization";
}

function rowToSummary(r: any): OrgSummary {
  return {
    id: Number(r.id), name: r.name, slug: r.slug, status: r.status, plan_code: r.plan_code ?? null, seat_limit: Number(r.seat_limit ?? 3),
    territory: normalizeTerritory(r.territory), quotas: r.quotas ?? null, sender: r.sender ?? null,
    trial_ends_at: r.trial_ends_at ? new Date(r.trial_ends_at).toISOString() : null,
    current_period_end: r.current_period_end ? new Date(r.current_period_end).toISOString() : null,
    subscription_status: r.subscription_status ?? null, stripe_customer_id: r.stripe_customer_id ?? null,
    stripe_subscription_id: r.stripe_subscription_id ?? null, terms_version: r.terms_version ?? null,
  };
}

export async function getOrg(orgId: number, db: any = pool): Promise<OrgSummary | null> {
  const { rows } = await db.query("SELECT * FROM organizations WHERE id = $1", [orgId]);
  return rows[0] ? rowToSummary(rows[0]) : null;
}

export async function getOrgByStripeCustomer(customerId: string, db: any = pool): Promise<OrgSummary | null> {
  const { rows } = await db.query("SELECT * FROM organizations WHERE stripe_customer_id = $1", [customerId]);
  return rows[0] ? rowToSummary(rows[0]) : null;
}

/** Creates an organization in trial with the user as its owner. Runs inside the caller's client when given. */
export async function createOrgWithOwner(client: any, input: { name: string; ownerUserId: number; planCode?: string | null; termsVersion?: string | null }): Promise<OrgSummary> {
  const base = slugify(input.name);
  const trialEnds = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  // A taken slug is not an error to catch: inside the caller's transaction a unique violation would abort
  // it, and every later statement (the next attempt included) would fail. ON CONFLICT answers "taken" with
  // no row instead, so the next suffix can be tried in the same transaction.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const { rows } = await client.query(
      `INSERT INTO organizations (name, slug, status, plan_code, trial_ends_at, terms_version, billing_status_since)
       VALUES ($1, $2, 'trial', $3, $4, $5, now()) ON CONFLICT (slug) DO NOTHING RETURNING *`,
      [input.name, slug, input.planCode ?? null, trialEnds, input.termsVersion ?? null],
    );
    if (!rows[0]) continue;
    await client.query("INSERT INTO organization_members (org_id, user_id, org_role) VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING", [rows[0].id, input.ownerUserId]);
    return rowToSummary(rows[0]);
  }
  throw new Error("Couldn't create the organization");
}

/** Active and pending members of an organization, for the seat limit. */
export async function seatUsage(orgId: number, db: any = pool): Promise<{ used: number; limit: number }> {
  const { rows } = await db.query(
    `SELECT o.seat_limit, (SELECT count(*)::int FROM organization_members m JOIN users u ON u.id = m.user_id
                             WHERE m.org_id = o.id AND u.status IN ('active', 'invited', 'pending')) AS used
       FROM organizations o WHERE o.id = $1`, [orgId]);
  return { used: Number(rows[0]?.used ?? 0), limit: Number(rows[0]?.seat_limit ?? 0) };
}

/** Which organization a user belongs to (the first by id when several). */
export async function membershipFor(userId: number, db: any = pool): Promise<{ org_id: number; org_role: string } | null> {
  const { rows } = await db.query("SELECT org_id, org_role FROM organization_members WHERE user_id = $1 ORDER BY org_id LIMIT 1", [userId]);
  return rows[0] ? { org_id: Number(rows[0].org_id), org_role: rows[0].org_role } : null;
}

export interface Membership {
  org_id: number;
  user_id: number;
  org_role: string;
  org_name: string;
}

/**
 * What the auth and user-admin routes need to know about organizations.
 * Behind an interface so the routes can be tested against an in-memory
 * implementation (tests/helpers/accountHarness.ts).
 */
export interface OrgRepo {
  /** Creates an organization in trial with the user as its owner. */
  createWithOwner(input: { name: string; ownerUserId: number; termsVersion?: string | null }): Promise<{ id: number; name: string }>;
  /** Every membership, or one organization's. */
  memberships(orgId?: number | null): Promise<Membership[]>;
  /** The user's membership (the first organization by id when several), or null. */
  membershipOf(userId: number): Promise<Membership | null>;
  addMember(orgId: number, userId: number, orgRole: "owner" | "member"): Promise<void>;
  setMemberRole(orgId: number, userId: number, orgRole: "owner" | "member"): Promise<boolean>;
  /** Removes a user from an organization. True when a membership was removed. */
  removeMember(orgId: number, userId: number): Promise<boolean>;
  seatUsage(orgId: number): Promise<{ used: number; limit: number }>;
}

const MEMBERSHIP_SQL = `SELECT m.org_id, m.user_id, m.org_role, o.name AS org_name
                          FROM organization_members m JOIN organizations o ON o.id = m.org_id`;

export function pgOrgRepo(db: any = pool): OrgRepo {
  const toMembership = (r: any): Membership => ({ org_id: Number(r.org_id), user_id: Number(r.user_id), org_role: r.org_role, org_name: r.org_name });
  return {
    async createWithOwner(input) {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const org = await createOrgWithOwner(client, input);
        await client.query("COMMIT");
        return { id: org.id, name: org.name };
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async memberships(orgId) {
      const { rows } = orgId == null
        ? await db.query(`${MEMBERSHIP_SQL} ORDER BY m.org_id, m.user_id`)
        : await db.query(`${MEMBERSHIP_SQL} WHERE m.org_id = $1 ORDER BY m.user_id`, [orgId]);
      return rows.map(toMembership);
    },
    async membershipOf(userId) {
      const { rows } = await db.query(`${MEMBERSHIP_SQL} WHERE m.user_id = $1 ORDER BY m.org_id LIMIT 1`, [userId]);
      return rows[0] ? toMembership(rows[0]) : null;
    },
    async addMember(orgId, userId, orgRole) {
      await db.query(
        "INSERT INTO organization_members (org_id, user_id, org_role) VALUES ($1, $2, $3) ON CONFLICT (org_id, user_id) DO UPDATE SET org_role = EXCLUDED.org_role",
        [orgId, userId, orgRole],
      );
    },
    async setMemberRole(orgId, userId, orgRole) {
      const { rowCount } = await db.query("UPDATE organization_members SET org_role = $3 WHERE org_id = $1 AND user_id = $2", [orgId, userId, orgRole]);
      return rowCount > 0;
    },
    async removeMember(orgId, userId) {
      const { rowCount } = await db.query("DELETE FROM organization_members WHERE org_id = $1 AND user_id = $2", [orgId, userId]);
      return rowCount > 0;
    },
    seatUsage: (orgId) => seatUsage(orgId, db),
  };
}
