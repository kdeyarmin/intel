/**
 * POST /api/maintenance/:task through the real router: the service token for
 * unattended cron, and otherwise a signed-in platform administrator. An
 * organization's owner administers their own people, not the platform's
 * workers, so they are refused.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { signedIn, startHarness, type Harness } from "./helpers/accountHarness";

vi.mock("../server/db", () => ({ db: {}, pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock("../server/functions/scheduledImports", () => ({ handleRunScheduledImports: vi.fn(async () => ({ ran: "scheduled" })) }));
vi.mock("../server/lib/maintenance", () => ({
  runAutoRetryFailedImports: vi.fn(async () => ({ ran: "retry" })),
  runAutoResumePausedImports: vi.fn(async () => ({ ran: "resume" })),
  runCancelStalledImports: vi.fn(async () => ({ ran: "cancel" })),
}));

import maintenanceRouter from "../server/routes/maintenance";

let h: Harness;
let server: Server;
let base: string;

beforeEach(async () => {
  h = await startHarness();
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/maintenance", maintenanceRouter);
  server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  h.orgs.orgs.push({ id: 2, name: "Riverbend Hospice", status: "active", seat_limit: 5, plan_code: "county_pack", territory: { states: [], county_fips: ["42003"] } });
  await h.seed({ email: "platform@example.com", role: "admin" });
  await h.seed({ email: "roleonly@example.com", role: "admin", is_platform_admin: false });
  await h.seed({ email: "owner@riverbend.org", role: "user", org_id: 2, org_role: "owner" });
  await h.seed({ email: "member@riverbend.org", role: "user", org_id: 2 });
});

afterEach(async () => {
  delete process.env.MAINTENANCE_TOKEN;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await h.close();
});

async function run(task: string, who?: string | { token: string }) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof who === "string") headers.Cookie = (await signedIn(h, who)).cookie!;
  else if (who) headers["x-maintenance-token"] = who.token;
  const res = await fetch(`${base}/api/maintenance/${task}`, { method: "POST", headers, body: "{}" });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe("maintenance route authorization", () => {
  it("runs a task for a platform administrator", async () => {
    expect(await run("autoRetryFailedImports", "platform@example.com")).toEqual({ status: 200, body: { ran: "retry" } });
  });

  it("treats the admin role as a platform administrator even when the flag was never set", async () => {
    expect((await run("autoRetryFailedImports", "roleonly@example.com")).status).toBe(200);
  });

  it("refuses an organization's owner and its members", async () => {
    expect((await run("autoRetryFailedImports", "owner@riverbend.org")).status).toBe(403);
    expect((await run("autoRetryFailedImports", "member@riverbend.org")).status).toBe(403);
  });

  it("refuses a caller with no session and no token", async () => {
    expect((await run("autoRetryFailedImports")).status).toBe(401);
  });

  it("accepts the service token for unattended cron, and nothing else in its place", async () => {
    process.env.MAINTENANCE_TOKEN = "cron-secret-token";
    expect(await run("runScheduledImports", { token: "cron-secret-token" })).toEqual({ status: 200, body: { ran: "scheduled" } });
    expect((await run("runScheduledImports", { token: "wrong-token-value" })).status).toBe(401);
  });

  it("ignores a token header when no token is configured", async () => {
    expect((await run("runScheduledImports", { token: "anything" })).status).toBe(401);
  });

  it("answers 404 for an unknown task, including names inherited from Object", async () => {
    expect((await run("noSuchTask", "platform@example.com")).status).toBe(404);
    expect((await run("constructor", "platform@example.com")).status).toBe(404);
  });
});
