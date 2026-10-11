// Stripe subscriptions for organizations. The pure parts (status mapping,
// applying a webhook event to the organization row, checkout parameters) live
// here so they can be tested without Stripe; server/routes/billing.ts and the
// webhook handler call them. Prices are configured in Stripe and matched to
// plans by plans.stripe_price_id (or STRIPE_PRICE_<CODE> at runtime).
import { normalizeTerritory, TERMS_VERSION, type Territory } from "./orgs";

export interface PlanRow {
  code: string;
  name: string;
  description: string | null;
  stripe_price_id: string | null;
  monthly_price_cents: number | null;
  seat_limit: number;
  territory_scope: string;
  max_counties: number | null;
  features: any;
  active: boolean;
  sort_order: number;
}

export function stripeConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.STRIPE_SECRET_KEY;
}

/** A plan's Stripe price: the row's, else STRIPE_PRICE_<CODE> in the environment. */
export function priceIdFor(plan: Pick<PlanRow, "code" | "stripe_price_id">, env: NodeJS.ProcessEnv = process.env): string | null {
  return plan.stripe_price_id || env[`STRIPE_PRICE_${plan.code.toUpperCase()}`] || null;
}

/** Stripe subscription status → organization status. */
export function mapSubscriptionStatus(status: string | null | undefined): "trial" | "active" | "past_due" | "canceled" {
  switch (status) {
    case "trialing": return "trial";
    case "active": return "active";
    case "past_due": case "unpaid": case "incomplete": return "past_due";
    case "canceled": case "incomplete_expired": case "paused": return "canceled";
    default: return "active";
  }
}

export interface CheckoutInput {
  orgId: number;
  orgName: string;
  email: string;
  plan: PlanRow;
  priceId: string;
  customerId: string | null;
  baseUrl: string;
  trialDays?: number;
}

/** Parameters for stripe.checkout.sessions.create. */
export function buildCheckoutParams(input: CheckoutInput) {
  return {
    mode: "subscription" as const,
    line_items: [{ price: input.priceId, quantity: 1 }],
    ...(input.customerId ? { customer: input.customerId } : { customer_email: input.email }),
    client_reference_id: String(input.orgId),
    success_url: `${input.baseUrl}/Billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.baseUrl}/Billing?checkout=canceled`,
    allow_promotion_codes: true,
    metadata: { org_id: String(input.orgId), plan_code: input.plan.code },
    subscription_data: {
      metadata: { org_id: String(input.orgId), plan_code: input.plan.code },
      ...(input.trialDays ? { trial_period_days: input.trialDays } : {}),
    },
  };
}

export interface BillingDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

const toDate = (unix: unknown) => (typeof unix === "number" && unix > 0 ? new Date(unix * 1000) : null);

/** The plan a Stripe price belongs to: the plan row's price id, else STRIPE_PRICE_<CODE> in the environment. */
export function planForPrice<T extends Pick<PlanRow, "code" | "stripe_price_id">>(plans: T[], priceId: string | null | undefined, env: NodeJS.ProcessEnv = process.env): T | null {
  if (!priceId) return null;
  return plans.find((p) => priceIdFor(p, env) === priceId) ?? null;
}

/**
 * The territory an organization keeps when it moves to a plan. A plan that covers
 * everything has none to restrict to; a state plan keeps exactly one state; a
 * county pack keeps its counties up to the plan's limit. Anything that doesn't fit is
 * cleared, and the owner chooses again on the Billing page (until they do, the
 * plan covers no places, never "everything").
 */
export function territoryForPlan(current: unknown, plan: Pick<PlanRow, "territory_scope" | "max_counties"> | null): Territory {
  const t = normalizeTerritory(current);
  const none: Territory = { states: [], county_fips: [] };
  switch (plan?.territory_scope) {
    case "national": return none;
    case "state": return t.states.length === 1 ? { states: t.states, county_fips: [] } : none;
    case "county_pack": {
      const max = plan.max_counties ?? 5;
      return t.county_fips.length >= 1 && t.county_fips.length <= max ? { states: [], county_fips: t.county_fips } : none;
    }
    default: return t;
  }
}

/** The subscription period end: the subscription's own, else its first item's (newer Stripe API versions only carry it on items). */
export function periodEnd(subscription: any): Date | null {
  return toDate(subscription?.current_period_end) ?? toDate(subscription?.items?.data?.[0]?.current_period_end);
}

/** The subscription an invoice belongs to (a string, an expanded object, or the newer parent details). */
function invoiceSubscriptionId(invoice: any): string | null {
  const direct = invoice?.subscription;
  if (typeof direct === "string") return direct;
  if (direct?.id) return direct.id;
  const parent = invoice?.parent?.subscription_details?.subscription;
  return typeof parent === "string" ? parent : parent?.id ?? null;
}

/**
 * Applies one Stripe event to the organizations table. Returns what changed
 * for the log. Unknown events and events for no known organization are
 * ignored (Stripe retries on 5xx only, so answer 200 to those).
 *
 * Two guards keep a late or repeated event from undoing a newer state:
 * subscription and invoice events apply only to the subscription the
 * organization currently has (checkout.session.completed is what changes it),
 * and an event older than the last one applied is ignored (stripe_event_at).
 */
export async function applyStripeEvent(
  event: { type: string; created?: number; data: { object: any } },
  db: BillingDb,
  log: Pick<Console, "log" | "warn"> = console,
  opts: { env?: NodeJS.ProcessEnv } = {},
): Promise<{ handled: boolean; org_id?: number; status?: string; ignored?: string }> {
  const env = opts.env ?? process.env;
  const obj = event.data?.object ?? {};
  const orgIdFromMeta = Number(obj.metadata?.org_id ?? obj.client_reference_id);
  const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id ?? null;
  const eventAt = toDate(event.created);

  type OrgRef = { id: number; stripe_subscription_id: string | null; territory: unknown };
  const findOrg = async (): Promise<OrgRef | null> => {
    const pick = (r: any): OrgRef => ({ id: Number(r.id), stripe_subscription_id: r.stripe_subscription_id ?? null, territory: r.territory });
    if (Number.isInteger(orgIdFromMeta) && orgIdFromMeta > 0) {
      const { rows } = await db.query("SELECT id, stripe_subscription_id, territory FROM organizations WHERE id = $1", [orgIdFromMeta]);
      if (rows[0]) return pick(rows[0]);
    }
    if (customerId) {
      const { rows } = await db.query("SELECT id, stripe_subscription_id, territory FROM organizations WHERE stripe_customer_id = $1", [customerId]);
      if (rows[0]) return pick(rows[0]);
    }
    return null;
  };
  /** The event's time: a statement applies only while no later event has been applied (always when the event carries no time). */
  const FRESH = (param: number) => `AND ($${param}::timestamp IS NULL OR stripe_event_at IS NULL OR stripe_event_at <= $${param}::timestamp)`;
  const SET_AT = (param: number) => `stripe_event_at = COALESCE($${param}::timestamp, stripe_event_at)`;
  /** A subscription event for a subscription the organization no longer (or doesn't yet) have is not about its current one. */
  const staleSubscription = (org: OrgRef, subscriptionId: string | null) => !!org.stripe_subscription_id && !!subscriptionId && org.stripe_subscription_id !== subscriptionId;
  const loadPlans = async () => (await db.query("SELECT code, stripe_price_id, seat_limit, territory_scope, max_counties FROM plans", [])).rows as Array<Pick<PlanRow, "code" | "stripe_price_id" | "seat_limit" | "territory_scope" | "max_counties">>;

  switch (event.type) {
    case "checkout.session.completed": {
      const org = await findOrg();
      if (!org) { log.warn(`[billing] checkout for unknown organization (customer ${customerId})`); return { handled: false }; }
      const planCode = obj.metadata?.plan_code ?? null;
      const subscriptionId = typeof obj.subscription === "string" ? obj.subscription : obj.subscription?.id ?? null;
      const plan = planCode ? (await loadPlans()).find((p) => p.code === planCode) ?? null : null;
      if (staleSubscription(org, subscriptionId)) {
        log.warn(`[billing] organization ${org.id} now has subscription ${subscriptionId} besides ${org.stripe_subscription_id}: cancel the earlier one in Stripe`);
      }
      const { rows } = await db.query(
        `UPDATE organizations SET stripe_customer_id = COALESCE($2, stripe_customer_id), stripe_subscription_id = COALESCE($3, stripe_subscription_id),
                plan_code = COALESCE($4, plan_code), status = 'active', subscription_status = 'active',
                seat_limit = COALESCE($5::int, seat_limit), territory = COALESCE($6::jsonb, territory),
                terms_version = COALESCE(terms_version, $7), ${SET_AT(8)}, updated_date = now()
          WHERE id = $1 ${FRESH(8)} RETURNING id`,
        [org.id, customerId, subscriptionId, planCode, plan?.seat_limit ?? null, plan ? JSON.stringify(territoryForPlan(org.territory, plan)) : null, TERMS_VERSION, eventAt],
      );
      if (!rows[0]) return { handled: false, ignored: "stale" };
      // A self-serve signup still awaiting approval is approved by paying.
      await db.query(
        `UPDATE users SET status = 'active', approved_at = COALESCE(approved_at, now()), approved_by = COALESCE(approved_by, 'stripe'), updated_date = now()
          WHERE status = 'pending' AND id IN (SELECT user_id FROM organization_members WHERE org_id = $1 AND org_role = 'owner')`,
        [org.id],
      );
      log.log(`[billing] organization ${org.id} subscribed (${planCode ?? "plan unchanged"})`);
      return { handled: true, org_id: org.id, status: "active" };
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const org = await findOrg();
      if (!org) return { handled: false };
      if (staleSubscription(org, obj.id ?? null)) return { handled: false, ignored: "other_subscription" };
      const status = mapSubscriptionStatus(obj.status);
      const priceId = obj.items?.data?.[0]?.price?.id ?? null;
      const plan = planForPrice(await loadPlans(), priceId, env);
      const { rows } = await db.query(
        `UPDATE organizations SET status = $2, subscription_status = $3, stripe_subscription_id = COALESCE($4, stripe_subscription_id),
                current_period_end = COALESCE($5, current_period_end), trial_ends_at = COALESCE($6, trial_ends_at),
                plan_code = COALESCE($7, plan_code), seat_limit = COALESCE($8::int, seat_limit), territory = COALESCE($9::jsonb, territory),
                ${SET_AT(10)}, updated_date = now()
          WHERE id = $1 ${FRESH(10)} RETURNING id`,
        [org.id, status, obj.status ?? null, obj.id ?? null, periodEnd(obj), toDate(obj.trial_end), plan?.code ?? null, plan?.seat_limit ?? null,
          plan ? JSON.stringify(territoryForPlan(org.territory, plan)) : null, eventAt],
      );
      if (!rows[0]) return { handled: false, ignored: "stale" };
      return { handled: true, org_id: org.id, status };
    }
    case "customer.subscription.deleted": {
      const org = await findOrg();
      if (!org) return { handled: false };
      // An old subscription ending (after a plan change, say) must not cancel the one the organization pays for now.
      if (staleSubscription(org, obj.id ?? null)) return { handled: false, ignored: "other_subscription" };
      const { rows } = await db.query(
        `UPDATE organizations SET status = 'canceled', subscription_status = 'canceled', ${SET_AT(2)}, updated_date = now() WHERE id = $1 ${FRESH(2)} RETURNING id`,
        [org.id, eventAt],
      );
      if (!rows[0]) return { handled: false, ignored: "stale" };
      return { handled: true, org_id: org.id, status: "canceled" };
    }
    case "invoice.payment_failed": {
      const org = await findOrg();
      if (!org) return { handled: false };
      if (staleSubscription(org, invoiceSubscriptionId(obj))) return { handled: false, ignored: "other_subscription" };
      const { rows } = await db.query(
        `UPDATE organizations SET status = 'past_due', subscription_status = 'past_due', ${SET_AT(2)}, updated_date = now() WHERE id = $1 AND status <> 'canceled' ${FRESH(2)} RETURNING id`,
        [org.id, eventAt],
      );
      if (!rows[0]) return { handled: false, ignored: "stale" };
      return { handled: true, org_id: org.id, status: "past_due" };
    }
    case "invoice.paid": {
      const org = await findOrg();
      if (!org) return { handled: false };
      if (staleSubscription(org, invoiceSubscriptionId(obj))) return { handled: false, ignored: "other_subscription" };
      const { rows } = await db.query(
        `UPDATE organizations SET status = 'active', subscription_status = 'active', ${SET_AT(2)}, updated_date = now() WHERE id = $1 AND status IN ('past_due', 'trial') ${FRESH(2)} RETURNING id`,
        [org.id, eventAt],
      );
      if (!rows[0]) return { handled: false, ignored: "stale" };
      return { handled: true, org_id: org.id, status: "active" };
    }
    default:
      return { handled: false };
  }
}

/** What the Billing page shows: the organization, its plan, seats, usage and whether checkout is possible. */
export function billingView(input: {
  org: any; plan: PlanRow | null; plans: PlanRow[]; seats: { used: number; limit: number };
  usage: { day: string; used: Record<string, number>; limits: Record<string, number> } | null; stripe: boolean; env?: NodeJS.ProcessEnv;
}) {
  const env = input.env ?? process.env;
  return {
    organization: {
      id: input.org.id, name: input.org.name, status: input.org.status, plan_code: input.org.plan_code, subscription_status: input.org.subscription_status,
      trial_ends_at: input.org.trial_ends_at, current_period_end: input.org.current_period_end, territory: input.org.territory, sender: input.org.sender ?? null,
      has_customer: !!input.org.stripe_customer_id,
    },
    plan: input.plan ? { code: input.plan.code, name: input.plan.name, territory_scope: input.plan.territory_scope, max_counties: input.plan.max_counties, seat_limit: input.plan.seat_limit } : null,
    seats: input.seats,
    usage: input.usage,
    stripe_configured: input.stripe,
    plans: input.plans.filter((p) => p.active).sort((a, b) => a.sort_order - b.sort_order).map((p) => ({
      code: p.code, name: p.name, description: p.description, monthly_price_cents: p.monthly_price_cents, seat_limit: p.seat_limit,
      territory_scope: p.territory_scope, max_counties: p.max_counties, quotas: p.features?.quotas ?? null,
      checkout_available: input.stripe && !!priceIdFor(p, env),
    })),
  };
}
