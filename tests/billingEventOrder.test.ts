/**
 * Stripe stamps an event to the second. Two events about one subscription can carry the same time and arrive in
 * either order, so a tie with the last event applied is settled by reading the subscription from Stripe, not by
 * trusting the event's copy of it. A second Checkout that completes for an organization that already pays is
 * flagged in the audit trail, and a Checkout request is made under an idempotency key.
 */
import { describe, expect, it, vi } from "vitest";
import { applyStripeEvent, billingAuditEntries, checkoutIdempotencyKey, CHECKOUT_REUSE_MS } from "../server/lib/billing";

const T = 1_790_000_000; // the event time, to the second
const PLANS = [
  { code: "county_pack", stripe_price_id: "price_cp", seat_limit: 3, territory_scope: "county_pack", max_counties: 5 },
  { code: "state", stripe_price_id: "price_state", seat_limit: 10, territory_scope: "state", max_counties: null },
];
const quiet = { log() {}, warn() {} };

/** An organization row; `lastEventAt` is the time of the last event applied to it (seconds). */
function fakeDb(org: { id: number; sub: string | null; lastEventAt: number | null }) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  return {
    queries,
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      if (sql.startsWith("SELECT id, stripe_subscription_id, territory FROM organizations")) return { rows: [{ id: org.id, stripe_subscription_id: org.sub, territory: { states: [], county_fips: ["42003"] } }] };
      if (sql.startsWith("SELECT code, stripe_price_id")) return { rows: PLANS };
      // The tie probe: the stored event time equals this event's.
      if (sql.startsWith("SELECT 1 FROM organizations WHERE id = $1 AND stripe_event_at")) {
        const at = params[1] as Date;
        return { rows: org.lastEventAt != null && at && at.getTime() === org.lastEventAt * 1000 ? [{ "?column?": 1 }] : [] };
      }
      if (sql.startsWith("UPDATE organizations")) return { rows: [{ id: org.id }] };
      return { rows: [] };
    },
  };
}
const updates = (db: ReturnType<typeof fakeDb>) => db.queries.filter((q) => q.sql.startsWith("UPDATE organizations"));
const live = (status: string) => ({ id: "sub_9", status, customer: "cus_9", items: { data: [{ price: { id: "price_state" } }] }, current_period_end: T + 86_400 });

describe("events that tie with the last one applied", () => {
  it("apply the live subscription: a late 'updated' can't reopen what a same-second 'deleted' closed", async () => {
    const db = fakeDb({ id: 3, sub: "sub_9", lastEventAt: T });
    const fetchSubscription = vi.fn(async () => live("canceled"));
    // The 'updated' event carries a copy from before the cancellation.
    const r = await applyStripeEvent({ type: "customer.subscription.updated", created: T, data: { object: { ...live("active"), id: "sub_9" } } }, db, quiet, { fetchSubscription });
    expect(fetchSubscription).toHaveBeenCalledWith("sub_9");
    expect(r).toEqual({ handled: true, org_id: 3, status: "canceled" });
    const [update] = updates(db);
    expect(update.params.slice(1, 3)).toEqual(["canceled", "canceled"]);
  });

  it("apply the live state for a tied 'deleted' event, a tied invoice.paid and a tied invoice.payment_failed too", async () => {
    for (const [type, obj, status] of [
      ["customer.subscription.deleted", { id: "sub_9", customer: "cus_9" }, "past_due"],
      ["invoice.paid", { customer: "cus_9", subscription: "sub_9" }, "active"],
      ["invoice.payment_failed", { customer: "cus_9", subscription: "sub_9" }, "past_due"],
    ] as const) {
      const db = fakeDb({ id: 3, sub: "sub_9", lastEventAt: T });
      const fetchSubscription = vi.fn(async () => live(status));
      const r = await applyStripeEvent({ type, created: T, data: { object: obj } }, db, quiet, { fetchSubscription });
      expect(fetchSubscription, type).toHaveBeenCalledTimes(1);
      expect(r, type).toEqual({ handled: true, org_id: 3, status });
    }
  });

  it("let a failed read through: the webhook answers 5xx and Stripe sends the event again", async () => {
    const db = fakeDb({ id: 3, sub: "sub_9", lastEventAt: T });
    const fetchSubscription = vi.fn(async () => { throw new Error("connect ETIMEDOUT"); });
    await expect(applyStripeEvent({ type: "customer.subscription.updated", created: T, data: { object: live("active") } }, db, quiet, { fetchSubscription })).rejects.toThrow("ETIMEDOUT");
    expect(updates(db)).toHaveLength(0);
  });
});

describe("events that don't tie", () => {
  it("are applied from their own copy, without asking Stripe", async () => {
    const db = fakeDb({ id: 3, sub: "sub_9", lastEventAt: T - 5 });
    const fetchSubscription = vi.fn(async () => live("canceled"));
    const r = await applyStripeEvent({ type: "customer.subscription.updated", created: T, data: { object: live("active") } }, db, quiet, { fetchSubscription });
    expect(fetchSubscription).not.toHaveBeenCalled();
    expect(r).toEqual({ handled: true, org_id: 3, status: "active" });
  });

  it("still work without a way to read Stripe (the copy is all there is)", async () => {
    const db = fakeDb({ id: 3, sub: "sub_9", lastEventAt: T });
    const r = await applyStripeEvent({ type: "customer.subscription.updated", created: T, data: { object: live("past_due") } }, db, quiet);
    expect(r).toEqual({ handled: true, org_id: 3, status: "past_due" });
  });

  it("don't ask for an event that names no subscription", async () => {
    const db = fakeDb({ id: 3, sub: "sub_9", lastEventAt: T });
    const fetchSubscription = vi.fn(async () => live("active"));
    await applyStripeEvent({ type: "invoice.paid", created: T, data: { object: { customer: "cus_9" } } }, db, quiet, { fetchSubscription });
    expect(fetchSubscription).not.toHaveBeenCalled();
  });
});

describe("a second Checkout for an organization that already pays", () => {
  const checkoutDone = { id: "evt_dup", type: "checkout.session.completed", created: T, data: { object: { customer: "cus_9", subscription: "sub_new", metadata: { org_id: "3", plan_code: "state" } } } };

  it("is reported with both subscriptions, so the one that keeps billing is found", async () => {
    const db = fakeDb({ id: 3, sub: "sub_old", lastEventAt: null });
    const warn = vi.fn();
    const entries: any[] = [];
    const r = await applyStripeEvent(checkoutDone, db, { log() {}, warn }, { audit: async (e) => { entries.push(e); } });
    expect(r).toMatchObject({ handled: true, org_id: 3, duplicate_subscription: { kept: "sub_new", previous: "sub_old" } });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/sub_new besides sub_old: cancel one of them/));
    expect(entries).toContainEqual({
      event_type: "billing", action: "duplicate_subscription", user_email: "stripe", entity_type: "Organization", entity_id: 3,
      details: { kept: "sub_new", previous: "sub_old", event_id: "evt_dup" }, org_id: 3,
    });
    // Nothing is cancelled automatically: it is money the customer paid.
    expect(db.queries.some((q) => /cancel/i.test(q.sql) && !q.sql.startsWith("UPDATE organizations"))).toBe(false);
  });

  it("is not reported for the first subscription, or for the same one again", async () => {
    for (const sub of [null, "sub_new"]) {
      const r = await applyStripeEvent(checkoutDone, fakeDb({ id: 3, sub, lastEventAt: null }), quiet);
      expect(r.duplicate_subscription, String(sub)).toBeUndefined();
    }
    expect(billingAuditEntries(checkoutDone, { handled: true, org_id: 3, status: "active" }).map((e) => e.action)).toEqual(["subscribed"]);
  });
});

describe("checkoutIdempotencyKey", () => {
  const params = { mode: "subscription", line_items: [{ price: "price_cp", quantity: 1 }] };
  const noon = Date.parse("2026-10-12T12:00:00Z");

  it("is the same for the same organization and request within the window, and differs otherwise", () => {
    const key = checkoutIdempotencyKey(2, params, noon);
    expect(key).toMatch(/^checkout-2-\d+-[0-9a-f]{24}$/);
    expect(checkoutIdempotencyKey(2, { ...params }, noon + 60_000)).toBe(key);
    expect(checkoutIdempotencyKey(2, { ...params, line_items: [{ price: "price_state", quantity: 1 }] }, noon)).not.toBe(key);
    expect(checkoutIdempotencyKey(3, params, noon)).not.toBe(key);
    expect(checkoutIdempotencyKey(2, params, noon + CHECKOUT_REUSE_MS)).not.toBe(key);
  });
});
