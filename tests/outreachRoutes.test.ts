/**
 * Route-level checks for direct email (/api/integrations/email/send) and the
 * SendGrid event webhook, with the database, mailer and auth mocked.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import crypto from "crypto";
import http from "http";
import { once } from "events";
import type { AddressInfo } from "net";

const { sendMail, isSuppressed, addSuppressions, poolQuery } = vi.hoisted(() => ({
  sendMail: vi.fn(async () => ({ messageId: "sg-1" })),
  isSuppressed: vi.fn(async () => false),
  addSuppressions: vi.fn(async () => 1),
  poolQuery: vi.fn(async () => ({ rows: [], rowCount: 1 })),
}));

vi.mock("../server/db", () => ({ db: {}, pool: { query: poolQuery } }));
vi.mock("../server/middleware/auth", () => ({
  authMiddleware: (req: any, _res: any, next: any) => { req.user = { id: 1, role: "admin", email: "admin@caremetric.test" }; next(); },
  adminOnly: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../server/middleware/rateLimit", () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
  consumeToken: () => true,
}));
vi.mock("../server/lib/mailer", () => ({
  sendMail,
  getMailerStatus: () => ({ configured: true, missing: [] }),
}));
vi.mock("../server/lib/suppressions", () => ({
  isSuppressed,
  addSuppressions,
  addSuppression: vi.fn(),
  loadSuppressed: vi.fn(async () => new Set()),
  normalizeEmail: (e: string) => String(e || "").trim().toLowerCase(),
}));

import express from "express";
import integrationRoutes from "../server/routes/integrations";
import webhookRoutes from "../server/routes/webhooks";
import { unsubscribeSecret } from "../server/functions/outreach";
import { verifyUnsubscribeToken } from "../server/functions/outreachHelpers";

let server: http.Server;
let port: number;

beforeAll(async () => {
  const app = express();
  app.use("/api/webhooks", webhookRoutes);
  app.use(express.json());
  app.use("/api/integrations", integrationRoutes);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  port = (server.address() as AddressInfo).port;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OUTREACH_PHYSICAL_ADDRESS = "1 Main St, Pittsburgh, PA 15222";
  process.env.PUBLIC_APP_URL = "https://app.test/";
});

function post(path: string, body: string, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: "POST", headers: { "content-type": "application/json", ...headers } },
      (res) => {
        let data = "";
        res.on("data", (c) => { data += c; });
        res.on("end", () => resolve({ status: res.statusCode || 0, json: data ? JSON.parse(data) : null }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

describe("POST /api/integrations/email/send", () => {
  it("adds the postal address, unsubscribe link and one-click headers", async () => {
    const res = await post("/api/integrations/email/send", JSON.stringify({ to: "Dr@Clinic.org", subject: "Hello", body: "Hi <there>" }));
    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const msg = (sendMail.mock.calls[0] as any[])[0];
    expect(msg).toMatchObject({ to: "Dr@Clinic.org", subject: "Hello" });
    expect(msg.text).toMatch(/^Hi <there>\n/);
    expect(msg.text).toContain("1 Main St, Pittsburgh, PA 15222");
    expect(msg.html).toContain("Hi &lt;there&gt;");
    expect(msg.html).toContain("1 Main St, Pittsburgh, PA 15222");

    const link = msg.headers["List-Unsubscribe"].match(/^<(https:\/\/app\.test\/api\/public\/unsubscribe\?t=[^>]+)>$/)?.[1];
    expect(link).toBeTruthy();
    expect(msg.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(msg.text).toContain(`Unsubscribe: ${link}`);
    const token = decodeURIComponent(new URL(link).searchParams.get("t") as string);
    expect(verifyUnsubscribeToken(token, unsubscribeSecret())).toBe("dr@clinic.org");
  });

  it("refuses to send until the postal address and app URL are configured", async () => {
    delete process.env.OUTREACH_PHYSICAL_ADDRESS;
    delete process.env.PUBLIC_APP_URL;
    const res = await post("/api/integrations/email/send", JSON.stringify({ to: "dr@clinic.org", subject: "Hello", body: "Hi" }));
    expect(res.status).toBe(503);
    expect(res.json.detail).toContain("OUTREACH_PHYSICAL_ADDRESS");
    expect(res.json.detail).toContain("PUBLIC_APP_URL");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("takes one recipient, since the unsubscribe link is per address", async () => {
    const res = await post("/api/integrations/email/send", JSON.stringify({ to: ["a@b.org", "c@d.org"], subject: "Hello", body: "Hi" }));
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/sendgrid", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });

  beforeEach(() => {
    process.env.SENDGRID_WEBHOOK_PUBLIC_KEY = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  });

  function signedPost(events: unknown[]) {
    const body = JSON.stringify(events);
    const timestamp = "1790000001";
    const signature = crypto.sign("sha256", Buffer.from(timestamp + body), { key: privateKey, dsaEncoding: "der" }).toString("base64");
    return post("/api/webhooks/sendgrid", body, {
      "X-Twilio-Email-Event-Webhook-Signature": signature,
      "X-Twilio-Email-Event-Webhook-Timestamp": timestamp,
    });
  }

  it("suppresses a bounce from a direct send (no message id) and updates only campaign messages", async () => {
    const res = await signedPost([
      { event: "bounce", email: "Direct@Send.org", reason: "550 no such user", timestamp: 1790000000 },
      { event: "open", message_id: "7", email: "dr@clinic.org", timestamp: 1790000000 },
    ]);
    expect(res.status).toBe(200);
    expect(addSuppressions).toHaveBeenCalledWith([{ email: "Direct@Send.org", reason: "bounced" }], "sendgrid");
    expect(poolQuery).toHaveBeenCalledTimes(1);
    const [, params] = poolQuery.mock.calls[0] as any[];
    expect(params[0]).toEqual([7]);
  });
});
