// Pure organization rules: names and territories, entitlements, quotas, the
// function ACL split and the Stripe event handler.
import { describe, expect, it } from "vitest";
import { normalizeTerritory, orgNameFor, slugify } from "../server/lib/orgs";
import { assertTerritory, entitledCounties, inTerritory, isUnrestricted, SubscriptionError, TerritoryError } from "../server/lib/entitlements";
import { DEFAULT_QUOTAS, quotaLimit } from "../server/lib/orgQuota";
import { isFunctionAllowedFor, PLATFORM_FUNCTIONS, PUBLIC_FUNCTIONS } from "../server/lib/functionAcl";
import { applyStripeEvent, billingView, buildCheckoutParams, mapSubscriptionStatus, priceIdFor } from "../server/lib/billing";

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
    for (const fn of PLATFORM_FUNCTIONS) expect(PUBLIC_FUNCTIONS.has(fn)).toBe(false);
    expect(isFunctionAllowedFor("getCountyMarket", { role: "user", orgRole: "member" })).toBe(true);
    expect(isFunctionAllowedFor("triggerImport", { role: "user", orgRole: "owner" })).toBe(false);
    expect(isFunctionAllowedFor("triggerImport", { role: "admin", orgRole: "owner" })).toBe(false);
    expect(isFunctionAllowedFor("triggerImport", { role: "user", isPlatformAdmin: true })).toBe(true);
    expect(isFunctionAllowedFor("sendOutreachEmails", { role: "user", orgRole: "owner" })).toBe(true);
    expect(isFunctionAllowedFor("sendOutreachEmails", { role: "user", orgRole: "member" })).toBe(false);
    expect(isFunctionAllowedFor("sendOutreachEmails", null)).toBe(false);
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

  function fakeDb(orgs: Record<number, any>) {
    const queries: { sql: string; params: unknown[] }[] = [];
    return {
      queries,
      orgs,
      async query(sql: string, params: unknown[] = []) {
        queries.push({ sql, params });
        if (sql.startsWith("SELECT id FROM organizations WHERE id")) return { rows: orgs[params[0] as number] ? [{ id: params[0] }] : [] };
        if (sql.startsWith("SELECT id FROM organizations WHERE stripe_customer_id")) {
          const hit = Object.values(orgs).find((o) => o.stripe_customer_id === params[0]);
          return { rows: hit ? [{ id: hit.id }] : [] };
        }
        return { rows: [] };
      },
    };
  }

  it("activates the organization and its pending owners on a completed checkout", async () => {
    const db = fakeDb({ 7: { id: 7 } });
    const r = await applyStripeEvent({ type: "checkout.session.completed", data: { object: { customer: "cus_1", subscription: "sub_1", client_reference_id: "7", metadata: { org_id: "7", plan_code: "state" } } } }, db, { log() {}, warn() {} });
    expect(r).toEqual({ handled: true, org_id: 7, status: "active" });
    const update = db.queries.find((q) => q.sql.includes("UPDATE organizations"))!;
    expect(update.params).toEqual([7, "cus_1", "sub_1", "state", "2026-10"]);
    expect(db.queries.some((q) => q.sql.includes("UPDATE users SET status = 'active'") && q.params[0] === 7)).toBe(true);
  });

  it("finds the organization by customer id, and ignores unknown ones", async () => {
    const db = fakeDb({ 3: { id: 3, stripe_customer_id: "cus_9" } });
    expect(await applyStripeEvent({ type: "invoice.payment_failed", data: { object: { customer: "cus_9" } } }, db)).toEqual({ handled: true, org_id: 3, status: "past_due" });
    expect(await applyStripeEvent({ type: "customer.subscription.deleted", data: { object: { customer: { id: "cus_9" } } } }, db)).toEqual({ handled: true, org_id: 3, status: "canceled" });
    expect(await applyStripeEvent({ type: "customer.subscription.updated", data: { object: { customer: "cus_9", status: "past_due", id: "sub_2", items: { data: [{ price: { id: "price_x" } }] }, current_period_end: 1_800_000_000 } } }, db)).toEqual({ handled: true, org_id: 3, status: "past_due" });
    expect(await applyStripeEvent({ type: "invoice.paid", data: { object: { customer: "cus_unknown" } } }, db)).toEqual({ handled: false });
    expect(await applyStripeEvent({ type: "charge.refunded", data: { object: { customer: "cus_9" } } }, db)).toEqual({ handled: false });
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
