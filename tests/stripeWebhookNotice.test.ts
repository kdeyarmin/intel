/**
 * The Stripe webhook answers Stripe first and only then tells the admins about a second live subscription, so a
 * slow or broken mail provider can never delay or fail the acknowledgement (which would make Stripe resend the event).
 */
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  result: { handled: true, org_id: 3, status: "active" } as any,
  notify: vi.fn(),
  orgName: "Acme Home Care" as string | null,
}));

vi.mock("../server/db", () => ({
  db: {},
  pool: {
    query: async (sql: string) => {
      if (sql.startsWith("SELECT user_id FROM organization_members")) return { rows: [{ user_id: 11 }] };
      if (sql.startsWith("SELECT name FROM organizations")) return { rows: h.orgName == null ? [] : [{ name: h.orgName }] };
      return { rows: [] };
    },
  },
}));
vi.mock("../server/middleware/rateLimit", () => ({ rateLimit: () => (_req: any, _res: any, next: () => void) => next() }));
vi.mock("stripe", () => ({
  default: class {
    webhooks = { constructEvent: (body: Buffer) => JSON.parse(body.toString("utf8")) };
    subscriptions = { retrieve: async () => ({}) };
  },
}));
vi.mock("../server/lib/billing", () => ({ applyStripeEvent: async () => h.result }));
vi.mock("../server/lib/audit", () => ({ recordAudit: async () => {} }));
vi.mock("../server/lib/sessionUsers", () => ({ publishSessionUserChange: () => {} }));
vi.mock("../server/lib/accountDeps", () => ({ defaultAccountDeps: () => ({ tag: "account deps" }) }));
vi.mock("../server/lib/billingNotices", () => ({ notifyDuplicateSubscription: (...args: unknown[]) => h.notify(...args) }));

import router from "../server/routes/webhooks";

let server: Server;
let url: string;

beforeAll(async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_unit";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_unit";
  const app = express();
  app.use("/api/webhooks", router);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/webhooks/stripe`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  h.notify.mockReset();
  h.notify.mockResolvedValue(2);
  h.orgName = "Acme Home Care";
  h.result = { handled: true, org_id: 3, status: "active" };
});

const post = () => fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=unit" },
  body: JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: {} } }),
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 25));

describe("POST /api/webhooks/stripe and a second live subscription", () => {
  it("tells the admins which organization and which two subscriptions", async () => {
    h.result = { handled: true, org_id: 3, status: "active", duplicate_subscription: { kept: "sub_new", previous: "sub_old" } };
    const res = await post();
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(h.notify).toHaveBeenCalledTimes(1));
    expect(h.notify).toHaveBeenCalledWith({ tag: "account deps" }, { id: 3, name: "Acme Home Care" }, { kept: "sub_new", previous: "sub_old" });
  });

  it("answers Stripe even when the notice never finishes", async () => {
    h.result = { handled: true, org_id: 3, status: "active", duplicate_subscription: { kept: "sub_new", previous: "sub_old" } };
    h.notify.mockImplementation(() => new Promise(() => {}));
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, handled: true, duplicate_subscription: { kept: "sub_new", previous: "sub_old" } });
  });

  it("answers Stripe when the notice fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    h.result = { handled: true, org_id: 3, status: "active", duplicate_subscription: { kept: "sub_new", previous: "sub_old" } };
    h.notify.mockRejectedValue(new Error("mail provider down"));
    const res = await post();
    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(expect.stringMatching(/couldn't notify the admins/), "mail provider down"));
    warn.mockRestore();
  });

  it("names the organization by its id when it can't be read", async () => {
    h.orgName = null;
    h.result = { handled: true, org_id: 3, status: "active", duplicate_subscription: { kept: "sub_new", previous: "sub_old" } };
    await post();
    await vi.waitFor(() => expect(h.notify).toHaveBeenCalledTimes(1));
    expect(h.notify.mock.calls[0][1]).toEqual({ id: 3, name: "organization 3" });
  });

  it("says nothing for an ordinary event", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    await settle();
    expect(h.notify).not.toHaveBeenCalled();
  });
});
