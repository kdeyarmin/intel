// Billing for organizations: status for the Billing page and the sidebar
// widget, Stripe Checkout and the customer portal (owners), territory
// choice within the plan, and an export counter. Stripe's events arrive on
// /api/webhooks/stripe (server/routes/webhooks.ts).
import { Router, Response } from "express";
import { pool } from "../db";
import { AuthRequest, authMiddleware, isOrgAdmin } from "../middleware/auth";
import { rateLimit } from "../middleware/rateLimit";
import { appBaseUrl } from "../lib/accounts";
import { recordAudit } from "../lib/audit";
import { billingView, buildCheckoutParams, checkoutIdempotencyKey, mapSubscriptionStatus, periodEnd, priceIdFor, stripeConfigured, territoryForPlan, type PlanRow } from "../lib/billing";
import { needsTerritoryChoice, stateFipsOf } from "../lib/entitlements";
import { getOrg, normalizeTerritory, seatUsage } from "../lib/orgs";
import { consumeQuota, QuotaError, usageToday } from "../lib/orgQuota";

const router = Router();

async function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const { default: Stripe } = await import("stripe");
  return new Stripe(key);
}

async function loadPlans(): Promise<PlanRow[]> {
  const { rows } = await pool.query("SELECT * FROM plans ORDER BY sort_order, code").catch(() => ({ rows: [] as any[] }));
  return rows;
}

function needOrg(req: AuthRequest, res: Response): number | null {
  const orgId = req.user?.orgId;
  if (!orgId) {
    res.status(404).json({ message: "Your account isn't part of an organization yet." });
    return null;
  }
  return orgId;
}

function ownerOnly(req: AuthRequest, res: Response): boolean {
  if (isOrgAdmin(req.user)) return true;
  res.status(403).json({ message: "Only an organization owner can change billing." });
  return false;
}

router.get("/plans", async (_req, res) => {
  const plans = await loadPlans();
  res.json({ plans: billingView({ org: {}, plan: null, plans, seats: { used: 0, limit: 0 }, usage: null, stripe: stripeConfigured() }).plans });
});

router.get("/status", authMiddleware, async (req: AuthRequest, res: Response) => {
  // A platform admin may pass ?org_id= to inspect an organization's billing state.
  const requested = Number(req.query.org_id);
  const orgId = req.user?.isPlatformAdmin && Number.isInteger(requested) && requested > 0 ? requested : needOrg(req, res);
  if (!orgId) return;
  try {
    const [org, plans, seats, usage] = await Promise.all([getOrg(orgId), loadPlans(), seatUsage(orgId), usageToday(orgId).catch(() => null)]);
    if (!org) return res.status(404).json({ message: "Organization not found." });
    const plan = plans.find((p) => p.code === org.plan_code) ?? null;
    // A plan that covers chosen places covers none until an owner chooses: the page says so.
    const needsChoice = needsTerritoryChoice({ isPlatformAdmin: req.user?.isPlatformAdmin, role: req.user?.role, planCode: org.plan_code, territory: org.territory });
    res.json({ ...billingView({ org, plan, plans, seats, usage, stripe: stripeConfigured() }), is_owner: isOrgAdmin(req.user), is_platform_admin: !!req.user?.isPlatformAdmin, needs_territory_choice: needsChoice });
  } catch (e: any) {
    console.error("[billing] status failed:", e?.message || e);
    res.status(500).json({ message: "Couldn't load billing status." });
  }
});

/** Starts Stripe Checkout for a plan; answers the URL to send the browser to. */
router.post("/checkout", authMiddleware, rateLimit("billing_checkout", 10, 60_000), async (req: AuthRequest, res: Response) => {
  const orgId = needOrg(req, res);
  if (!orgId || !ownerOnly(req, res)) return;
  const stripe = await stripeClient();
  if (!stripe) return res.status(503).json({ message: "Online checkout isn't set up yet. Contact us to subscribe." });
  const base = appBaseUrl();
  if (!base) return res.status(503).json({ message: "Set PUBLIC_APP_URL so Stripe can send you back to the app." });
  try {
    const [org, plans] = await Promise.all([getOrg(orgId), loadPlans()]);
    const plan = plans.find((p) => p.code === String(req.body?.plan_code ?? "") && p.active);
    if (!org || !plan) return res.status(400).json({ message: "Pick a plan." });
    const priceId = priceIdFor(plan);
    if (!priceId) return res.status(409).json({ message: `The ${plan.name} plan isn't available for online checkout yet. Contact us.` });
    // An organization that already pays changes its subscription (prorated) instead of starting a second
    // one: a second subscription would bill twice, and the old one's events would fight the new one's.
    if (org.stripe_subscription_id && org.status !== "canceled") {
      // Only a subscription Stripe says doesn't exist can be replaced by a new Checkout. A timeout, a rate limit
      // or an outage says nothing about it, and falling through would start a second subscription for an
      // organization that still has its first: that fails the request instead (the caller answers 502).
      const current = await stripe.subscriptions.retrieve(org.stripe_subscription_id).catch((e: any) => {
        if (e?.code === "resource_missing" || e?.statusCode === 404) return null;
        throw e;
      });
      if (current && ["active", "trialing", "past_due"].includes(current.status)) {
        const item = current.items.data[0];
        if (item?.price?.id === priceId) return res.status(409).json({ message: `You're already on the ${plan.name} plan.` });
        const updatedSub = await stripe.subscriptions.update(current.id, {
          items: [{ id: item.id, price: priceId }],
          proration_behavior: "create_prorations",
          metadata: { org_id: String(orgId), plan_code: plan.code },
        });
        await recordAudit({ event_type: "billing", action: "plan_changed", user_email: req.user!.email, entity_type: "Organization", entity_id: orgId, details: { from: org.plan_code, to: plan.code }, org_id: orgId });
        // The new plan's seats, quotas and territory take effect immediately
        // instead of staying stale until the webhook lands; the
        // subscription.updated event reconciles afterwards.
        await pool.query(
          `UPDATE organizations SET plan_code = $2, status = $3, subscription_status = $4, seat_limit = $5,
                  territory = $6::jsonb, current_period_end = COALESCE($7, current_period_end), updated_date = now()
             WHERE id = $1`,
          [orgId, plan.code, mapSubscriptionStatus(updatedSub.status), updatedSub.status ?? null, plan.seat_limit,
            JSON.stringify(territoryForPlan(org.territory, plan)), periodEnd(updatedSub)],
        );
        const { publishSessionUserChange } = await import("../lib/sessionUsers");
        const { rows: memberRows } = await pool.query("SELECT user_id FROM organization_members WHERE org_id = $1", [orgId]);
        for (const r of memberRows) publishSessionUserChange(Number(r.user_id));
        return res.json({ changed: true, plan_code: plan.code });
      }
    }
    const params = buildCheckoutParams({
      orgId, orgName: org.name, email: req.user!.email, plan, priceId, customerId: org.stripe_customer_id, baseUrl: base,
    });
    // A repeat of this request (double click, second tab) gets the same session back from Stripe, not another.
    const session = await stripe.checkout.sessions.create(params as any, { idempotencyKey: checkoutIdempotencyKey(orgId, params) });
    await recordAudit({ event_type: "billing", action: "checkout_started", user_email: req.user!.email, entity_type: "Organization", entity_id: orgId, details: { plan_code: plan.code }, org_id: orgId });
    res.json({ url: session.url });
  } catch (e: any) {
    console.error("[billing] checkout failed:", e?.message || e);
    res.status(502).json({ message: "Couldn't start checkout. Try again in a moment." });
  }
});

/** The Stripe customer portal (payment method, invoices, cancel). */
router.post("/portal", authMiddleware, rateLimit("billing_portal", 10, 60_000), async (req: AuthRequest, res: Response) => {
  const orgId = needOrg(req, res);
  if (!orgId || !ownerOnly(req, res)) return;
  const stripe = await stripeClient();
  if (!stripe) return res.status(503).json({ message: "Online billing isn't set up yet." });
  const base = appBaseUrl();
  const org = await getOrg(orgId);
  if (!org?.stripe_customer_id) return res.status(409).json({ message: "No Stripe customer yet: subscribe to a plan first." });
  try {
    const session = await stripe.billingPortal.sessions.create({ customer: org.stripe_customer_id, return_url: `${base || ""}/Billing` });
    res.json({ url: session.url });
  } catch (e: any) {
    console.error("[billing] portal failed:", e?.message || e);
    res.status(502).json({ message: "Couldn't open the billing portal." });
  }
});

/** Owners pick the counties (county pack) or the state (state plan) their plan covers. */
router.patch("/territory", authMiddleware, async (req: AuthRequest, res: Response) => {
  const orgId = needOrg(req, res);
  if (!orgId || !ownerOnly(req, res)) return;
  const [org, plans] = await Promise.all([getOrg(orgId), loadPlans()]);
  if (!org) return res.status(404).json({ message: "Organization not found." });
  const plan = plans.find((p) => p.code === org.plan_code);
  const scope = plan?.territory_scope ?? "county_pack";
  const wanted = normalizeTerritory(req.body);
  if (scope === "national") {
    wanted.states = [];
    wanted.county_fips = [];
  } else if (scope === "state") {
    if (wanted.states.length !== 1) return res.status(400).json({ message: "A state plan covers exactly one state." });
    wanted.county_fips = [];
  } else {
    const max = plan?.max_counties ?? 5;
    if (wanted.county_fips.length === 0) return res.status(400).json({ message: "Pick at least one county." });
    if (wanted.county_fips.length > max) return res.status(400).json({ message: `Your plan covers up to ${max} counties.` });
    wanted.states = [];
  }
  if (!req.user?.isPlatformAdmin && scope !== "national" && wanted.states.some((s) => !stateFipsOf(s))) {
    return res.status(400).json({ message: "Unknown state." });
  }
  await pool.query("UPDATE organizations SET territory = $2, updated_date = now() WHERE id = $1", [orgId, JSON.stringify(wanted)]);
  const { publishSessionUserChange } = await import("../lib/sessionUsers");
  const { rows } = await pool.query("SELECT user_id FROM organization_members WHERE org_id = $1", [orgId]);
  for (const r of rows) publishSessionUserChange(Number(r.user_id));
  await recordAudit({ event_type: "billing", action: "territory_changed", user_email: req.user!.email, entity_type: "Organization", entity_id: orgId, details: { ...wanted }, org_id: orgId });
  res.json({ territory: wanted });
});

/** Counts an export against today's quota before the browser builds the file. */
router.post("/usage/export", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    await consumeQuota(req.user, "exports");
    res.json({ ok: true, counted: true });
  } catch (e: any) {
    if (e instanceof QuotaError) return res.status(429).json({ message: e.message, code: e.code, kind: e.kind, limit: e.limit });
    // The file is built only after a confirmed count, so a count that failed is an error, not a free export.
    console.error("[billing] export count failed:", e?.message || e);
    res.status(503).json({ message: "Couldn't count this export against your daily allowance. Try again in a moment.", counted: false });
  }
});

export default router;
