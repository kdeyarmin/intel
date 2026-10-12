// Pure organization rules: names and territories, entitlements, quotas, the
// function ACL split and the Stripe event handler.
import { describe, expect, it } from "vitest";
import { normalizeTerritory, orgNameFor, slugify } from "../server/lib/orgs";
import { assertTerritory, entitledCounties, inTerritory, isUnrestricted, needsTerritoryChoice, SubscriptionError, TerritoryError } from "../server/lib/entitlements";
import { DEFAULT_QUOTAS, quotaLimit } from "../server/lib/orgQuota";
import { isFunctionAllowedFor, OWNER_FUNCTIONS, PLATFORM_FUNCTIONS, PUBLIC_FUNCTIONS } from "../server/lib/functionAcl";
import { applyStripeEvent, billingAuditEntries, billingView, buildCheckoutParams, mapSubscriptionStatus, periodEnd, planForPrice, priceIdFor, territoryForPlan } from "../server/lib/billing";

describe("organization names and territories", () => {
  it("prefers the typed name, then a company domain, then the person", () => {
    expect(orgNameFor({ organization_name: " Sunny Hill ", email: "a@gmail.com" })).toBe("Sunny Hill");
    expect(orgNameFor({ email: "a@riverbend-hospice.org" })).toBe("Riverbend-hospice");
    expect(orgNameFor({ email: "a@care.example.com" })).toBe("Care Example");
    expect(orgNameFor({ email: "a@gmail.com", full_name: "Pat" })).toBe("Pat's organization");
    expect(orgNameFor({ email: "a@outlook.com" })).toBe("New organization");
  });

  it("slugifies and normalizes territories", () => {
    expect(slugify("Sunny Hill Personal Care, LLC")).toBe("sunny-hill-personal-care-llc");
    expect(slugify("!!!")).toBe("org");
    expect(normalizeTerritory({ states: ["pa", "PA", "Penn"], county_fips: ["42003", "4200", "42003"] })).toEqual({ states: ["PA"], county_fips: ["42003"] });
    expect(normalizeTerritory(null)).toEqual({ states: [], county_fips: [] });
  });
});

describe("territory entitlements", () => {
  const countyPack = { territory: { states: [], county_fips: ["42003", "42129"] }, orgStatus: "active" };
  const statePlan = { territory: { states: ["PA"], county_fips: [] }, orgStatus: "trial" };

  it("lets platform admins and empty territories see everything", () => {
    expect(isUnrestricted({ isPlatformAdmin: true, territory: { states: [], county_fips: ["42003"] } })).toBe(true);
    expect(isUnrestricted({ territory: { states: [], county_fips: [] } })).toBe(true);
    expect(isUnrestricted(null)).toBe(true);
    expect(isUnrestricted(countyPack)).toBe(false);
  });

  it("covers nothing, not everything, for a county or state plan whose owner hasn't chosen places yet", () => {
    const empty = { territory: { states: [], county_fips: [] }, orgStatus: "active" };
    expect(isUnrestricted({ ...empty, planCode: "county_pack" })).toBe(false);
    expect(isUnrestricted({ ...empty, planCode: "state" })).toBe(false);
    expect(needsTerritoryChoice({ ...empty, planCode: "state" })).toBe(true);
    // A plan that covers everything, and a trial that hasn't picked a plan, still do.
    expect(isUnrestricted({ ...empty, planCode: "national" })).toBe(true);
    expect(isUnrestricted({ ...empty, planCode: null })).toBe(true);
    expect(isUnrestricted({ ...empty, planCode: "county_pack", isPlatformAdmin: true })).toBe(true);
    expect(isUnrestricted({ ...empty, planCode: "county_pack", role: "admin" })).toBe(true);
    expect(() => assertTerritory({ ...empty, planCode: "county_pack" }, { state: "PA", county_fips: "42003" })).toThrow(/pick them on the Billing page/);
    expect(() => assertTerritory({ ...empty, planCode: "national" }, { state: "PA", county_fips: "42003" })).not.toThrow();
    // Once places are chosen the plan is bounded by them.
    expect(isUnrestricted({ territory: { states: [], county_fips: ["42003"] }, planCode: "county_pack" })).toBe(false);
  });

  it("checks counties and states against the plan", () => {
    expect(inTerritory(countyPack, { state: "PA", county_fips: "42003" })).toBe(true);
    expect(inTerritory(countyPack, { state: "PA", county_fips: "42001" })).toBe(false);
    // A state is visible when any of its counties is in the pack (the county list is filtered).
    expect(inTerritory(countyPack, { state: "PA" })).toBe(true);
    expect(inTerritory(countyPack, { state: "OH" })).toBe(false);
    expect(inTerritory(statePlan, { state: "pa", county_fips: "42001" })).toBe(true);
    expect(inTerritory(statePlan, { county_fips: "39001" })).toBe(false);
    expect(entitledCounties(countyPack, "PA")).toEqual(["42003", "42129"]);
    expect(entitledCounties(countyPack, "OH")).toEqual([]);
    expect(entitledCounties(statePlan, "PA")).toBeNull();
    expect(entitledCounties({ isPlatformAdmin: true }, "PA")).toBeNull();
  });

  it("throws a 403 outside the plan and a 402 for a lapsed subscription", () => {
    expect(() => assertTerritory(countyPack, { state: "PA", county_fips: "42003" })).not.toThrow();
    expect(() => assertTerritory(countyPack, { state: "OH", county_fips: "39001", county_name: "Adams County" })).toThrow(TerritoryError);
    try {
      assertTerritory(countyPack, { state: "OH", county_name: "Adams County" });
    } catch (e: any) {
      expect(e.status).toBe(403);
      expect(e.message).toMatch(/Adams County, OH is outside your plan/);
    }
    expect(() => assertTerritory({ ...statePlan, orgStatus: "canceled" }, { state: "PA" })).toThrow(SubscriptionError);
    expect(() => assertTerritory({ ...statePlan, orgStatus: "canceled", isPlatformAdmin: true }, { state: "PA" })).not.toThrow();
  });
});

describe("quotas", () => {
  it("takes the organization's own limit, then the plan's, then the default", () => {
    expect(quotaLimit("ai_calls", { quotas: { ai_calls: 10 } }, { features: { quotas: { ai_calls: 50 } } })).toBe(10);
    expect(quotaLimit("ai_calls", { quotas: {} }, { features: { quotas: { ai_calls: 50 } } })).toBe(50);
    expect(quotaLimit("exports", null, null)).toBe(DEFAULT_QUOTAS.exports);
    expect(quotaLimit("emails_sent", { quotas: { emails_sent: "abc" } }, null)).toBe(DEFAULT_QUOTAS.emails_sent);
  });
});

describe("function ACL with organizations", () => {
  it("splits platform functions from an owner's", () => {
    for (const fn of PLATFORM_FUNCTIONS) expect(PUBLIC_FUNCTIONS.has(fn) || OWNER_FUNCTIONS.has(fn), fn).toBe(false);
    for (const fn of OWNER_FUNCTIONS) expect(PUBLIC_FUNCTIONS.has(fn), fn).toBe(false);
    expect(isFunctionAllowedFor("getCountyMarket", { role: "user", orgRole: "member" })).toBe(true);
    expect(isFunctionAllowedFor("triggerImport", { role: "user", orgRole: "owner" })).toBe(false);
    // The admin role is the platform-admin role (the Users screen keeps role and flag together): either grants it.
    expect(isFunctionAllowedFor("triggerImport", { role: "admin", orgRole: "owner" })).toBe(true);
    expect(isFunctionAllowedFor("triggerImport", { role: "admin" })).toBe(true);
    expect(isFunctionAllowedFor("triggerImport", { role: "user", isPlatformAdmin: true })).toBe(true);
    expect(isFunctionAllowedFor("sendCampaignMessages", { role: "user", orgRole: "owner" })).toBe(true);
    expect(isFunctionAllowedFor("sendCampaignMessages", { role: "user", orgRole: "member" })).toBe(false);
    expect(isFunctionAllowedFor("sendCampaignMessages", null)).toBe(false);
  });

  it("denies an owner every function nobody listed for them: a new function is platform-only until someone decides", () => {
    expect(isFunctionAllowedFor("aFunctionAddedNextYear", { role: "user", orgRole: "owner" })).toBe(false);
    expect(isFunctionAllowedFor("aFunctionAddedNextYear", { role: "admin" })).toBe(true);
    expect(isFunctionAllowedFor("aFunctionAddedNextYear", { role: "user", orgRole: "member" })).toBe(false);
    // An owner's list is exactly the campaign work.
    expect([...OWNER_FUNCTIONS].sort()).toEqual(["generateHyperPersonalizedMessages", "prepareCampaignMessages", "saveCampaignOutcomes", "sendCampaignMessages", "trackCampaignMetrics"]);
  });
});

describe("billing", () => {
  it("maps Stripe subscription statuses and builds checkout parameters", () => {
    expect(mapSubscriptionStatus("trialing")).toBe("trial");
    expect(mapSubscriptionStatus("unpaid")).toBe("past_due");
    expect(mapSubscriptionStatus("incomplete_expired")).toBe("canceled");
    expect(mapSubscriptionStatus(undefined)).toBe("active");
    expect(priceIdFor({ code: "county_pack", stripe_price_id: null } as any, { STRIPE_PRICE_COUNTY_PACK: "price_1" } as any)).toBe("price_1");
    expect(priceIdFor({ code: "county_pack", stripe_price_id: "price_db" } as any, {} as any)).toBe("price_db");
    const params = buildCheckoutParams({ priceId: "price_1", orgId: 7, orgName: "Riverbend", plan: { code: "state" } as any, customerId: null, email: "o@x.org", baseUrl: "https://app.example.com", trialDays: 14 });
    expect(params).toMatchObject({ mode: "subscription", line_items: [{ price: "price_1", quantity: 1 }], client_reference_id: "7", customer_email: "o@x.org", metadata: { org_id: "7", plan_code: "state" } });
    expect(params.success_url).toBe("https://app.example.com/Billing?checkout=success&session_id={CHECKOUT_SESSION_ID}");
    expect((params as any).subscription_data.trial_period_days).toBe(14);
    expect(buildCheckoutParams({ priceId: "p", orgId: 1, orgName: "x", plan: { code: "state" } as any, customerId: "cus_1", email: "o@x.org", baseUrl: "https://a" })).toMatchObject({ customer: "cus_1" });
  });

  const PLANS = [
    { code: "county_pack", stripe_price_id: "price_cp", seat_limit: 3, territory_scope: "county_pack", max_counties: 5 },
    { code: "state", stripe_price_id: null, seat_limit: 10, territory_scope: "state", max_counties: null },
    { code: "national", stripe_price_id: "price_nat", seat_limit: 25, territory_scope: "national", max_counties: null },
  ];

  function fakeDb(orgs: Record<number, any>, opts: { staleByTime?: boolean; approvedOwners?: Array<{ id: number; email: string }> } = {}) {
    const queries: { sql: string; params: unknown[] }[] = [];
    const row = (o: any) => ({ id: o.id, stripe_subscription_id: o.stripe_subscription_id ?? null, territory: o.territory ?? { states: [], county_fips: [] } });
    return {
      queries,
      orgs,
      async query(sql: string, params: unknown[] = []) {
        queries.push({ sql, params });
        if (sql.startsWith("SELECT id, stripe_subscription_id, territory FROM organizations WHERE id")) return { rows: orgs[params[0] as number] ? [row(orgs[params[0] as number])] : [] };
        if (sql.startsWith("SELECT id, stripe_subscription_id, territory FROM organizations WHERE stripe_customer_id")) {
          const hit = Object.values(orgs).find((o) => o.stripe_customer_id === params[0]);
          return { rows: hit ? [row(hit)] : [] };
        }
        if (sql.startsWith("SELECT code, stripe_price_id")) return { rows: PLANS };
        // An UPDATE that the event-time guard turns away matches no row.
        if (sql.startsWith("UPDATE organizations")) return { rows: opts.staleByTime ? [] : [{ id: params[0] }] };
        if (sql.startsWith("UPDATE users SET status = 'active'")) return { rows: opts.approvedOwners ?? [] };
        return { rows: [] };
      },
    };
  }
  const quiet = { log() {}, warn() {} };
  const updates = (db: { queries: { sql: string }[] }) => db.queries.filter((q) => q.sql.startsWith("UPDATE organizations"));

  it("activates the organization and its pending owners on a completed checkout, with the plan's seats and a territory that fits it", async () => {
    const db = fakeDb({ 7: { id: 7, territory: { states: ["PA"], county_fips: ["42003"] } } });
    const r = await applyStripeEvent({ type: "checkout.session.completed", created: 1_790_000_000, data: { object: { customer: "cus_1", subscription: "sub_1", client_reference_id: "7", metadata: { org_id: "7", plan_code: "state" } } } }, db, quiet);
    expect(r).toEqual({ handled: true, org_id: 7, status: "active" });
    const [update] = updates(db);
    // org, customer, subscription, plan, seats, territory (a state plan keeps exactly one state), terms version, event time
    expect(update.params).toEqual([7, "cus_1", "sub_1", "state", 10, JSON.stringify({ states: ["PA"], county_fips: [] }), "2026-10", new Date(1_790_000_000 * 1000)]);
    expect(db.queries.some((q) => q.sql.includes("UPDATE users SET status = 'active'") && q.params[0] === 7)).toBe(true);
  });

  it("does not take the organization from client_reference_id, which a payer can set on a Payment Link", async () => {
    // Org 7 has no Stripe customer yet; a stranger's checkout names it in client_reference_id only.
    const db = fakeDb({ 7: { id: 7 } });
    const r = await applyStripeEvent({ type: "checkout.session.completed", data: { object: { customer: "cus_stranger", subscription: "sub_x", client_reference_id: "7" } } }, db, quiet);
    expect(r).toEqual({ handled: false });
    expect(updates(db)).toHaveLength(0);
    expect(db.queries.some((q) => q.sql.startsWith("UPDATE users"))).toBe(false);
    // The metadata our own Checkout sets still identifies it.
    const ok = await applyStripeEvent({ type: "checkout.session.completed", data: { object: { customer: "cus_7", subscription: "sub_7", client_reference_id: "7", metadata: { org_id: "7" } } } }, fakeDb({ 7: { id: 7 } }), quiet);
    expect(ok).toMatchObject({ handled: true, org_id: 7 });
  });

  describe("audit trail", () => {
    const sink = () => {
      const entries: any[] = [];
      return { entries, audit: async (e: any) => { entries.push(e); } };
    };

    it("records the subscription and each owner a payment approved, under the organization", async () => {
      const db = fakeDb({ 7: { id: 7 } }, { approvedOwners: [{ id: 21, email: "owner@homes.example" }] });
      const { entries, audit } = sink();
      const r = await applyStripeEvent({ id: "evt_1", type: "checkout.session.completed", data: { object: { customer: "cus_1", subscription: "sub_1", metadata: { org_id: "7", plan_code: "state" } } } }, db, quiet, { audit });
      expect(r).toMatchObject({ handled: true, org_id: 7, status: "active", approved: [{ id: 21, email: "owner@homes.example" }] });
      expect(entries).toEqual([
        { event_type: "billing", action: "subscribed", user_email: "stripe", entity_type: "Organization", entity_id: 7, details: { status: "active", event: "checkout.session.completed", event_id: "evt_1" }, org_id: 7 },
        { event_type: "account", action: "approve", user_email: "stripe", entity_type: "User", entity_id: 21, details: { target_email: "owner@homes.example", by: "payment", event_id: "evt_1" }, org_id: 7 },
      ]);
    });

    it("records a cancellation and a failed payment, and nothing for events it ignored", async () => {
      const db = fakeDb({ 3: { id: 3, stripe_customer_id: "cus_9", stripe_subscription_id: "sub_9" } });
      const { entries, audit } = sink();
      await applyStripeEvent({ id: "evt_2", type: "invoice.payment_failed", data: { object: { customer: "cus_9", subscription: "sub_9" } } }, db, quiet, { audit });
      await applyStripeEvent({ id: "evt_3", type: "customer.subscription.deleted", data: { object: { customer: "cus_9", id: "sub_9" } } }, db, quiet, { audit });
      expect(entries.map((e) => [e.action, e.details.status, e.org_id])).toEqual([["payment_failed", "past_due", 3], ["canceled", "canceled", 3]]);
      // An old subscription's event, an unknown customer and an event we don't handle leave no trace.
      entries.length = 0;
      await applyStripeEvent({ type: "customer.subscription.deleted", data: { object: { customer: "cus_9", id: "sub_old" } } }, db, quiet, { audit });
      await applyStripeEvent({ type: "invoice.paid", data: { object: { customer: "cus_unknown" } } }, db, quiet, { audit });
      await applyStripeEvent({ type: "charge.refunded", data: { object: { customer: "cus_9" } } }, db, quiet, { audit });
      expect(entries).toEqual([]);
    });

    it("builds entries only for the events that change an organization", () => {
      expect(billingAuditEntries({ type: "charge.refunded", data: { object: {} } }, { handled: true, org_id: 1 })).toEqual([]);
      expect(billingAuditEntries({ type: "invoice.paid", data: { object: {} } }, { handled: false })).toEqual([]);
      expect(billingAuditEntries({ type: "invoice.paid", id: "evt_9", data: { object: {} } }, { handled: true, org_id: 4, status: "active" })[0])
        .toMatchObject({ action: "payment_received", org_id: 4, details: { status: "active", event_id: "evt_9" } });
    });
  });

  it("finds the organization by customer id, and ignores unknown ones", async () => {
    const db = fakeDb({ 3: { id: 3, stripe_customer_id: "cus_9" } });
    expect(await applyStripeEvent({ type: "invoice.payment_failed", data: { object: { customer: "cus_9" } } }, db)).toEqual({ handled: true, org_id: 3, status: "past_due" });
    expect(await applyStripeEvent({ type: "customer.subscription.deleted", data: { object: { customer: { id: "cus_9" } } } }, db)).toEqual({ handled: true, org_id: 3, status: "canceled" });
    expect(await applyStripeEvent({ type: "customer.subscription.updated", data: { object: { customer: "cus_9", status: "past_due", id: "sub_2", items: { data: [{ price: { id: "price_x" } }] }, current_period_end: 1_800_000_000 } } }, db)).toEqual({ handled: true, org_id: 3, status: "past_due" });
    expect(await applyStripeEvent({ type: "invoice.paid", data: { object: { customer: "cus_unknown" } } }, db)).toEqual({ handled: false });
    expect(await applyStripeEvent({ type: "charge.refunded", data: { object: { customer: "cus_9" } } }, db)).toEqual({ handled: false });
  });

  it("applies a subscription update to the plan its price belongs to (including prices set in the environment), with the period end from the item", async () => {
    const db = fakeDb({ 5: { id: 5, stripe_customer_id: "cus_5", stripe_subscription_id: "sub_5", territory: { states: [], county_fips: ["42003", "42019"] } } });
    const r = await applyStripeEvent(
      { type: "customer.subscription.updated", created: 1_790_000_100, data: { object: { id: "sub_5", customer: "cus_5", status: "active", items: { data: [{ price: { id: "price_from_env" }, current_period_end: 1_795_000_000 }] } } } },
      db, quiet, { env: { STRIPE_PRICE_STATE: "price_from_env" } as any },
    );
    expect(r).toEqual({ handled: true, org_id: 5, status: "active" });
    const [update] = updates(db);
    // The county pack's counties don't fit a state plan, so the territory is cleared for the owner to choose again.
    expect(update.params).toEqual([5, "active", "active", "sub_5", new Date(1_795_000_000 * 1000), null, "state", 10, JSON.stringify({ states: [], county_fips: [] }), new Date(1_790_000_100 * 1000)]);
  });

  it("ignores subscription and invoice events for a subscription the organization no longer has", async () => {
    const db = fakeDb({ 5: { id: 5, stripe_customer_id: "cus_5", stripe_subscription_id: "sub_new" } });
    const old = { customer: "cus_5", id: "sub_old", status: "canceled" };
    expect(await applyStripeEvent({ type: "customer.subscription.deleted", data: { object: old } }, db, quiet)).toEqual({ handled: false, ignored: "other_subscription" });
    expect(await applyStripeEvent({ type: "customer.subscription.updated", data: { object: { ...old, status: "past_due" } } }, db, quiet)).toEqual({ handled: false, ignored: "other_subscription" });
    expect(await applyStripeEvent({ type: "invoice.payment_failed", data: { object: { customer: "cus_5", subscription: "sub_old" } } }, db, quiet)).toEqual({ handled: false, ignored: "other_subscription" });
    expect(await applyStripeEvent({ type: "invoice.paid", data: { object: { customer: "cus_5", parent: { subscription_details: { subscription: "sub_old" } } } } }, db, quiet)).toEqual({ handled: false, ignored: "other_subscription" });
    expect(updates(db)).toHaveLength(0);
    // The current subscription's own events still apply.
    expect(await applyStripeEvent({ type: "customer.subscription.deleted", data: { object: { customer: "cus_5", id: "sub_new" } } }, db, quiet)).toEqual({ handled: true, org_id: 5, status: "canceled" });
  });

  it("guards every update with the event's time, so a late event can't undo a newer one", async () => {
    const db = fakeDb({ 5: { id: 5, stripe_customer_id: "cus_5" } }, { staleByTime: true });
    const cancel = { type: "customer.subscription.deleted", created: 1_790_000_000, data: { object: { customer: "cus_5", id: "sub_5" } } };
    expect(await applyStripeEvent(cancel, db, quiet)).toEqual({ handled: false, ignored: "stale" });
    expect(await applyStripeEvent({ type: "invoice.paid", created: 1_790_000_001, data: { object: { customer: "cus_5" } } }, db, quiet)).toEqual({ handled: false, ignored: "stale" });
    for (const u of updates(db)) {
      expect(u.sql).toMatch(/stripe_event_at IS NULL OR stripe_event_at <= \$\d+::timestamp/);
      expect(u.sql).toMatch(/stripe_event_at = COALESCE\(\$\d+::timestamp, stripe_event_at\)/);
    }
  });

  it("keeps the territory a plan can hold, and clears what doesn't fit", () => {
    const t = { states: ["PA"], county_fips: ["42003", "42019"] };
    expect(territoryForPlan(t, { territory_scope: "national", max_counties: null })).toEqual({ states: [], county_fips: [] });
    expect(territoryForPlan({ states: ["PA"], county_fips: [] }, { territory_scope: "state", max_counties: null })).toEqual({ states: ["PA"], county_fips: [] });
    expect(territoryForPlan({ states: ["PA", "OH"], county_fips: [] }, { territory_scope: "state", max_counties: null })).toEqual({ states: [], county_fips: [] });
    expect(territoryForPlan({ states: [], county_fips: ["42003", "42019"] }, { territory_scope: "county_pack", max_counties: 5 })).toEqual({ states: [], county_fips: ["42003", "42019"] });
    expect(territoryForPlan({ states: [], county_fips: ["42003", "42019", "42001"] }, { territory_scope: "county_pack", max_counties: 2 })).toEqual({ states: [], county_fips: [] });
    expect(territoryForPlan(t, null)).toEqual(t);
  });

  it("matches a price to a plan by the row's price id or STRIPE_PRICE_<CODE>, and reads the period end from the item", () => {
    expect(planForPrice(PLANS as any, "price_cp", {} as any)?.code).toBe("county_pack");
    expect(planForPrice(PLANS as any, "price_env", { STRIPE_PRICE_STATE: "price_env" } as any)?.code).toBe("state");
    expect(planForPrice(PLANS as any, "price_unknown", {} as any)).toBeNull();
    expect(periodEnd({ current_period_end: 1_790_000_000 })?.toISOString()).toBe(new Date(1_790_000_000 * 1000).toISOString());
    expect(periodEnd({ items: { data: [{ current_period_end: 1_795_000_000 }] } })?.toISOString()).toBe(new Date(1_795_000_000 * 1000).toISOString());
    expect(periodEnd({})).toBeNull();
  });

  it("describes the plan and usage for the Billing page", () => {
    const view = billingView({
      org: { id: 2, name: "Riverbend", status: "trial", plan_code: "county_pack", subscription_status: null, trial_ends_at: "2026-10-25T00:00:00.000Z", current_period_end: null, territory: { states: [], county_fips: ["42003"] }, stripe_customer_id: null },
      plan: { code: "county_pack", name: "County pack", territory_scope: "county", max_counties: 5, seat_limit: 3 } as any,
      plans: [
        { code: "state", name: "State", active: true, sort_order: 2, monthly_price_cents: 89900, seat_limit: 10, territory_scope: "state", max_counties: null, features: { quotas: { ai_calls: 500 } }, stripe_price_id: "price_s" },
        { code: "old", name: "Old", active: false, sort_order: 0 },
        { code: "county_pack", name: "County pack", active: true, sort_order: 1, monthly_price_cents: 29900, seat_limit: 3, territory_scope: "county", max_counties: 5, features: null, stripe_price_id: null },
      ] as any,
      seats: { used: 2, limit: 3 },
      usage: { day: "2026-10-11", used: { ai_calls: 4, emails_sent: 0, exports: 1 }, limits: { ai_calls: 100, emails_sent: 500, exports: 50 } },
      stripe: true,
      env: {} as any,
    });
    expect(view.organization).toMatchObject({ name: "Riverbend", has_customer: false });
    expect(view.plans.map((p) => p.code)).toEqual(["county_pack", "state"]);
    expect(view.plans.map((p) => p.checkout_available)).toEqual([false, true]);
    expect(view.plans[1].quotas).toEqual({ ai_calls: 500 });
  });
});
