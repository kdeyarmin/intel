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

const s = vi.hoisted(() => ({
  org: null as Record<string, unknown> | null,
  subscription: null as Record<string, unknown> | null,
  retrieved: [] as string[],
  updated: [] as Array<[string, any]>,
  sessions: [] as any[],
  audits: [] as any[],
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
        if (!s.subscription) throw new Error("No such subscription");
        return s.subscription;
      },
      update: async (id: string, params: unknown) => { s.updated.push([id, params]); return {}; },
    };
    checkout = { sessions: { create: async (params: unknown) => { s.sessions.push(params); return { url: "https://checkout.stripe.test/c_1" }; } } };
  },
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
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  process.env.PUBLIC_APP_URL = "https://app.example.com";
  s.org = paying();
  s.subscription = subscription("price_cp");
  s.retrieved.length = 0;
  s.updated.length = 0;
  s.sessions.length = 0;
  s.audits.length = 0;
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
