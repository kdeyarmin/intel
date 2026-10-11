// Stripe subscriptions for organizations. The pure parts (status mapping,
// applying a webhook event to the organization row, checkout parameters) live
// here so they can be tested without Stripe; server/routes/billing.ts and the
// webhook handler call them. Prices are configured in Stripe and matched to
// plans by plans.stripe_price_id (or STRIPE_PRICE_<CODE> at runtime).
import { TERMS_VERSION } from "./orgs";

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

/**
 * Applies one Stripe event to the organizations table. Returns what changed
 * for the log. Unknown events and events for no known organization are
 * ignored (Stripe retries on 5xx only, so answer 200 to those).
 */
export async function applyStripeEvent(event: { type: string; data: { object: any } }, db: BillingDb, log: Pick<Console, "log" | "warn"> = console): Promise<{ handled: boolean; org_id?: number; status?: string }> {
  const obj = event.data?.object ?? {};
  const orgIdFromMeta = Number(obj.metadata?.org_id ?? obj.client_reference_id);
  const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id ?? null;

  const findOrg = async (): Promise<{ id: number } | null> => {
    if (Number.isInteger(orgIdFromMeta) && orgIdFromMeta > 0) {
      const { rows } = await db.query("SELECT id FROM organizations WHERE id = $1", [orgIdFromMeta]);
      if (rows[0]) return { id: Number(rows[0].id) };
    }
    if (customerId) {
      const { rows } = await db.query("SELECT id FROM organizations WHERE stripe_customer_id = $1", [customerId]);
      if (rows[0]) return { id: Number(rows[0].id) };
    }
    return null;
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const org = await findOrg();
      if (!org) { log.warn(`[billing] checkout for unknown organization (customer ${customerId})`); return { handled: false }; }
      const planCode = obj.metadata?.plan_code ?? null;
      const subscriptionId = typeof obj.subscription === "string" ? obj.subscription : obj.subscription?.id ?? null;
      await db.query(
        `UPDATE organizations SET stripe_customer_id = COALESCE($2, stripe_customer_id), stripe_subscription_id = COALESCE($3, stripe_subscription_id),
                plan_code = COALESCE($4, plan_code), status = 'active', subscription_status = 'active',
                seat_limit = COALESCE((SELECT seat_limit FROM plans WHERE code = $4), seat_limit), terms_version = COALESCE(terms_version, $5), updated_date = now()
          WHERE id = $1`,
        [org.id, customerId, subscriptionId, planCode, TERMS_VERSION],
      );
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
      const status = mapSubscriptionStatus(obj.status);
      const priceId = obj.items?.data?.[0]?.price?.id ?? null;
      await db.query(
        `UPDATE organizations SET status = $2, subscription_status = $3, stripe_subscription_id = COALESCE($4, stripe_subscription_id),
                current_period_end = COALESCE($5, current_period_end), trial_ends_at = COALESCE($6, trial_ends_at),
                plan_code = COALESCE((SELECT code FROM plans WHERE stripe_price_id = $7), plan_code),
                seat_limit = COALESCE((SELECT seat_limit FROM plans WHERE stripe_price_id = $7), seat_limit), updated_date = now()
          WHERE id = $1`,
        [org.id, status, obj.status ?? null, obj.id ?? null, toDate(obj.current_period_end), toDate(obj.trial_end), priceId],
      );
      return { handled: true, org_id: org.id, status };
    }
    case "customer.subscription.deleted": {
      const org = await findOrg();
      if (!org) return { handled: false };
      await db.query("UPDATE organizations SET status = 'canceled', subscription_status = 'canceled', updated_date = now() WHERE id = $1", [org.id]);
      return { handled: true, org_id: org.id, status: "canceled" };
    }
    case "invoice.payment_failed": {
      const org = await findOrg();
      if (!org) return { handled: false };
      await db.query("UPDATE organizations SET status = 'past_due', subscription_status = 'past_due', updated_date = now() WHERE id = $1 AND status <> 'canceled'", [org.id]);
      return { handled: true, org_id: org.id, status: "past_due" };
    }
    case "invoice.paid": {
      const org = await findOrg();
      if (!org) return { handled: false };
      await db.query("UPDATE organizations SET status = 'active', subscription_status = 'active', updated_date = now() WHERE id = $1 AND status IN ('past_due', 'trial')", [org.id]);
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
