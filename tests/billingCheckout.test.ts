/**
 * POST /api/billing/checkout through the real router, with Stripe faked: an organization that already
 * pays changes its subscription in place (a second subscription would bill twice, and the old one's
 * events would fight the new one's); one that doesn't, or whose subscription has ended, is sent to
 * Stripe Checkout; only an owner may do either.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { signedIn, startHarness, type Harness } from "./helpers/accountHarness";
import { resetRateLimits } from "../server/middleware/rateLimit";

const s = vi.hoisted(() => ({
  org: null as Record<string, unknown> | null,
  subscription: null as Record<string, unknown> | null,
  retrieved: [] as string[],
  /** What retrieving a subscription fails with (an outage), when it should. */
  retrieveFailure: null as Error | null,
  updated: [] as Array<[string, any]>,
  sessions: [] as any[],
  sessionOptions: [] as any[],
  audits: [] as any[],
  /** What counting an export does: nothing, or fail. */
  countFailure: null as Error | null,
}));

vi.mock("../server/db", () => ({
  db: {},
  pool: {
    connect: vi.fn(),
    query: async (sql: string) => {
      if (/FROM plans/.test(sql)) return { rows: PLANS };
      if (/FROM organizations WHERE id = \$1/.test(sql)) return { rows: s.org ? [s.org] : [] };
      return { rows: [] };
    },
  },
}));
vi.mock("stripe", () => ({
  default: class {
    subscriptions = {
      retrieve: async (id: string) => {
        s.retrieved.push(id);
        if (s.retrieveFailure) throw s.retrieveFailure;
        // What Stripe answers for an id it doesn't know.
        if (!s.subscription) throw Object.assign(new Error("No such subscription"), { code: "resource_missing", statusCode: 404 });
        return s.subscription;
      },
      update: async (id: string, params: unknown) => { s.updated.push([id, params]); return {}; },
    };
    checkout = { sessions: { create: async (params: unknown, options?: unknown) => { s.sessions.push(params); s.sessionOptions.push(options); return { url: "https://checkout.stripe.test/c_1" }; } } };
  },
}));
vi.mock("../server/lib/orgQuota", async (original) => ({
  ...(await original<typeof import("../server/lib/orgQuota")>()),
  consumeQuota: async () => { if (s.countFailure) throw s.countFailure; },
}));
vi.mock("../server/lib/audit", async (original) => ({
  ...(await original<typeof import("../server/lib/audit")>()),
  recordAudit: async (entry: unknown) => { s.audits.push(entry); },
}));

const PLANS = [
  { code: "county_pack", name: "County Pack", active: true, stripe_price_id: "price_cp", seat_limit: 3, territory_scope: "county_pack", max_counties: 5, sort_order: 1 },
  { code: "state", name: "State", active: true, stripe_price_id: "price_state", seat_limit: 10, territory_scope: "state", max_counties: null, sort_order: 2 },
  { code: "national", name: "National", active: true, stripe_price_id: null, seat_limit: 25, territory_scope: "national", max_counties: null, sort_order: 3 },
];

import billingRouter from "../server/routes/billing";

let h: Harness;
let server: Server;
let base: string;

const paying = (over: Record<string, unknown> = {}) => ({
  id: 2, name: "Riverbend Hospice", slug: "riverbend", status: "active", plan_code: "county_pack", seat_limit: 3, territory: { states: [], county_fips: ["42003"] },
  stripe_customer_id: "cus_2", stripe_subscription_id: "sub_2", subscription_status: "active", ...over,
});
const subscription = (price: string, status = "active") => ({ id: "sub_2", status, items: { data: [{ id: "si_1", price: { id: price } }] } });

beforeEach(async () => {
  // The checkout route is rate-limited per user (10 a minute) in a process-wide map; every test here
  // checks out as the same owner, and the idempotency tests move the clock, so start each test clean.
  resetRateLimits();
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  process.env.PUBLIC_APP_URL = "https://app.example.com";
  s.org = paying();
  s.subscription = subscription("price_cp");
  s.retrieved.length = 0;
  s.updated.length = 0;
  s.sessions.length = 0;
  s.sessionOptions.length = 0;
  s.audits.length = 0;
  s.retrieveFailure = null;
  s.countFailure = null;
  h = await startHarness();
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/billing", billingRouter);
  server = await new Promise((resolve) => {
    const srv = app.listen(0, "127.0.0.1", () => resolve(srv));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  h.orgs.orgs.push({ id: 2, name: "Riverbend Hospice", status: "active", seat_limit: 3, plan_code: "county_pack", territory: { states: [], county_fips: ["42003"] } });
  await h.seed({ email: "owner@riverbend.org", role: "user", org_id: 2, org_role: "owner" });
  await h.seed({ email: "member@riverbend.org", role: "user", org_id: 2 });
});

afterEach(async () => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.PUBLIC_APP_URL;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await h.close();
});

async function checkout(as: string, plan_code: string) {
  const cookie = (await signedIn(h, as)).cookie!;
  const res = await fetch(`${base}/api/billing/checkout`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify({ plan_code }) });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe("checkout for an organization that already pays", () => {
  it("changes the existing subscription in place, prorated, instead of starting a second one", async () => {
    const r = await checkout("owner@riverbend.org", "state");
    expect(r).toEqual({ status: 200, body: { changed: true, plan_code: "state" } });
    expect(s.retrieved).toEqual(["sub_2"]);
    expect(s.updated).toEqual([["sub_2", { items: [{ id: "si_1", price: "price_state" }], proration_behavior: "create_prorations", metadata: { org_id: "2", plan_code: "state" } }]]);
    expect(s.sessions).toHaveLength(0);
    expect(s.audits).toEqual([expect.objectContaining({ event_type: "billing", action: "plan_changed", org_id: 2, details: { from: "county_pack", to: "state" } })]);
  });

  it("says so when it is already on that plan, and changes nothing", async () => {
    const r = await checkout("owner@riverbend.org", "county_pack");
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/already on the County Pack plan/);
    expect(s.updated).toHaveLength(0);
    expect(s.sessions).toHaveLength(0);
  });

  it("goes through Checkout when the subscription has ended", async () => {
    s.subscription = subscription("price_cp", "canceled");
    const r = await checkout("owner@riverbend.org", "state");
    expect(r).toEqual({ status: 200, body: { url: "https://checkout.stripe.test/c_1" } });
    expect(s.updated).toHaveLength(0);
    expect(s.sessions).toHaveLength(1);
  });

  it("goes through Checkout when Stripe no longer knows the subscription", async () => {
    s.subscription = null;
    expect((await checkout("owner@riverbend.org", "state")).body).toEqual({ url: "https://checkout.stripe.test/c_1" });
    expect(s.updated).toHaveLength(0);
  });
});

describe("checkout when Stripe can't say whether the organization's subscription still exists", () => {
  it("starts no second subscription: a timeout, an outage or a rate limit fails the request instead", async () => {
    for (const failure of [
      Object.assign(new Error("connect ETIMEDOUT"), { type: "StripeConnectionError" }),
      Object.assign(new Error("An error occurred with our API"), { type: "StripeAPIError", statusCode: 500 }),
      Object.assign(new Error("Too many requests"), { type: "StripeRateLimitError", statusCode: 429, code: "rate_limit" }),
    ]) {
      s.retrieveFailure = failure;
      const r = await checkout("owner@riverbend.org", "state");
      expect(r.status).toBe(502);
      expect(r.body.message).toMatch(/Couldn't start checkout/);
    }
    // Nothing was changed or opened for any of them.
    expect(s.sessions).toHaveLength(0);
    expect(s.updated).toHaveLength(0);
    expect(s.audits).toHaveLength(0);
  });

  it("opens Checkout only for a subscription Stripe says does not exist (resource_missing / 404)", async () => {
    s.retrieveFailure = Object.assign(new Error("No such subscription: 'sub_2'"), { type: "StripeInvalidRequestError", code: "resource_missing", statusCode: 404 });
    expect((await checkout("owner@riverbend.org", "state")).body).toEqual({ url: "https://checkout.stripe.test/c_1" });
    expect(s.sessions).toHaveLength(1);
    s.retrieveFailure = Object.assign(new Error("Not found"), { statusCode: 404 });
    expect((await checkout("owner@riverbend.org", "state")).status).toBe(200);
    expect(s.sessions).toHaveLength(2);
  });
});

describe("the Checkout session is created under an idempotency key", () => {
  beforeEach(() => {
    s.org = paying({ status: "trial", stripe_subscription_id: null, subscription_status: "trialing", plan_code: null });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T10:07:00Z"));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("so a double click or a second tab gets the same session back from Stripe, not another", async () => {
    await checkout("owner@riverbend.org", "county_pack");
    await checkout("owner@riverbend.org", "county_pack");
    const [first, second] = s.sessionOptions.map((o) => o.idempotencyKey);
    expect(first).toMatch(/^checkout-2-\d+-[0-9a-f]{24}$/);
    expect(second).toBe(first);
  });

  it("but another plan, or the same plan half an hour later, is a new request", async () => {
    await checkout("owner@riverbend.org", "county_pack");
    await checkout("owner@riverbend.org", "state");
    vi.setSystemTime(new Date("2026-10-12T10:41:00Z"));
    await checkout("owner@riverbend.org", "county_pack");
    const keys = s.sessionOptions.map((o) => o.idempotencyKey);
    expect(new Set(keys).size).toBe(3);
  });
});

describe("counting an export", () => {
  async function count(as: string) {
    const cookie = (await signedIn(h, as)).cookie!;
    const res = await fetch(`${base}/api/billing/usage/export`, { method: "POST", headers: { Cookie: cookie } });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  it("confirms it was counted", async () => {
    expect(await count("owner@riverbend.org")).toEqual({ status: 200, body: { ok: true, counted: true } });
  });

  it("fails when it couldn't be counted: the browser builds the file only after a confirmed count", async () => {
    s.countFailure = new Error("connection terminated");
    const r = await count("owner@riverbend.org");
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ counted: false, message: expect.stringMatching(/Couldn't count this export/) });
  });

  it("stops an organization that has used up its day with a 429", async () => {
    const { QuotaError } = await import("../server/lib/orgQuota");
    s.countFailure = new QuotaError("Your organization has used its 50 exports for today.", "exports", 50);
    const r = await count("member@riverbend.org");
    expect(r.status).toBe(429);
    expect(r.body.message).toMatch(/50 exports/);
  });
});

describe("checkout for an organization that doesn't pay yet", () => {
  it("starts Checkout for the organization, with its customer and plan in the metadata", async () => {
    s.org = paying({ status: "trial", stripe_subscription_id: null, subscription_status: "trialing", plan_code: null });
    const r = await checkout("owner@riverbend.org", "county_pack");
    expect(r).toEqual({ status: 200, body: { url: "https://checkout.stripe.test/c_1" } });
    expect(s.retrieved).toHaveLength(0);
    expect(s.sessions[0]).toMatchObject({ mode: "subscription", customer: "cus_2", line_items: [{ price: "price_cp", quantity: 1 }], metadata: { org_id: "2", plan_code: "county_pack" } });
    expect(s.audits).toEqual([expect.objectContaining({ action: "checkout_started", org_id: 2 })]);
  });
});

describe("who may start checkout, and for what", () => {
  it("refuses a member", async () => {
    const r = await checkout("member@riverbend.org", "state");
    expect(r.status).toBe(403);
    expect(s.updated).toHaveLength(0);
    expect(s.sessions).toHaveLength(0);
  });

  it("won't check out a plan with no price, or one that doesn't exist", async () => {
    expect((await checkout("owner@riverbend.org", "national")).status).toBe(409);
    expect((await checkout("owner@riverbend.org", "gold")).status).toBe(400);
    expect(s.updated).toHaveLength(0);
    expect(s.sessions).toHaveLength(0);
  });
});
