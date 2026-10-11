/**
 * consumeQuota counts in one statement and checks the limit on every path,
 * the day's first call included; the direct email route counts against the
 * emails allowance and answers 429 when it is used up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { generateToken } from "../server/middleware/auth";
import { setSessionUserLoader } from "../server/lib/sessionUsers";

const h = vi.hoisted(() => ({ consume: vi.fn(), sent: [] as any[], suppressed: false }));
vi.mock("../server/db", () => ({ db: {}, pool: {} }));
vi.mock("../server/lib/mailer", () => ({ sendMail: async (m: unknown) => { h.sent.push(m); } }));
vi.mock("../server/lib/suppressions", () => ({ isSuppressed: async () => h.suppressed }));
vi.mock("../server/functions/outreach", () => ({ sendingRequirements: () => [], withComplianceFooter: (_to: string, m: any) => m }));
vi.mock("../server/functions/outreachHelpers", () => ({ textToHtml: (t: string) => `<p>${t}</p>` }));
vi.mock("../server/lib/orgQuota", async (orig) => {
  const real: any = await orig();
  return { ...real, consumeQuota: (...a: unknown[]) => h.consume(...a) };
});

import { QuotaError } from "../server/lib/orgQuota";
import integrationRoutes from "../server/routes/integrations";

describe("consumeQuota statement", () => {
  function fakeDb(row: Record<string, unknown>) {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    return { calls, query: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return { rows: [row] }; } };
  }

  it("checks the limit on the insert for the day's first call as well as on the update", async () => {
    // The real function, past the route's mock.
    const { consumeQuota } = await vi.importActual<typeof import("../server/lib/orgQuota")>("../server/lib/orgQuota");
    const db = fakeDb({ used: 1, limit_value: 50 });
    await consumeQuota({ orgId: 2 }, "exports", 1, db);
    const { sql, params } = db.calls[0];
    expect(sql).toMatch(/INSERT INTO org_usage \(org_id, day, exports\) SELECT \$1::int, current_date, \$2::int FROM lim WHERE \$2::int <= lim\.limit_value/);
    expect(sql).toMatch(/ON CONFLICT \(org_id, day\) DO UPDATE .* WHERE org_usage\.exports \+ EXCLUDED\.exports <= \(SELECT limit_value FROM lim\)/s);
    expect(params).toEqual([2, 1, "exports", 50]);
  });

  it("answers 429 when nothing was counted, naming the limit; platform admins and accounts without an organization pass", async () => {
    const { consumeQuota } = await vi.importActual<typeof import("../server/lib/orgQuota")>("../server/lib/orgQuota");
    await expect(consumeQuota({ orgId: 2 }, "emails_sent", 1, fakeDb({ used: null, limit_value: 0 }))).rejects.toMatchObject({ status: 429, kind: "emails_sent", limit: 0 });
    const untouched = fakeDb({ used: null, limit_value: 0 });
    await consumeQuota({ orgId: 2, isPlatformAdmin: true }, "emails_sent", 1, untouched);
    await consumeQuota({ orgId: null }, "emails_sent", 1, untouched);
    await consumeQuota(null, "emails_sent", 1, untouched);
    expect(untouched.calls).toHaveLength(0);
  });
});

describe("POST /api/integrations/email/send", () => {
  let server: Server;
  let base: string;
  beforeEach(async () => {
    h.sent.length = 0;
    h.suppressed = false;
    h.consume.mockReset().mockResolvedValue(undefined);
    setSessionUserLoader(async (id) => ({ id, email: "owner@riverbend.org", role: "user", status: "active", token_version: 0, full_name: null, org_id: 2, org_role: "owner", org_name: "Riverbend", org_status: "active" }));
    const app = express();
    app.use(express.json());
    app.use("/api/integrations", integrationRoutes);
    server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/integrations`;
  });
  afterEach(async () => {
    setSessionUserLoader(null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const send = (body: object = { to: "doc@example.com", subject: "Hello", body: "Hi" }) =>
    fetch(`${base}/email/send`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${generateToken({ id: 9, token_version: 0 })}` }, body: JSON.stringify(body) });

  it("counts the email against the organization's allowance before sending it", async () => {
    const res = await send();
    expect(res.status).toBe(200);
    expect(h.consume).toHaveBeenCalledWith(expect.objectContaining({ orgId: 2, orgRole: "owner" }), "emails_sent");
    expect(h.sent).toHaveLength(1);
  });

  it("answers 429 and sends nothing once the day's allowance is used up", async () => {
    h.consume.mockRejectedValue(new QuotaError("Today's limit of 500 emails for your organization has been reached.", "emails_sent", 500));
    const res = await send();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "quota_exceeded", kind: "emails_sent", limit: 500 });
    expect(h.sent).toHaveLength(0);
  });

  it("doesn't count an email that is refused before it would be sent", async () => {
    expect((await send({ subject: "x" })).status).toBe(400);
    h.suppressed = true;
    expect((await send()).status).toBe(409);
    expect(h.consume).not.toHaveBeenCalled();
    expect(h.sent).toHaveLength(0);
  });
});

