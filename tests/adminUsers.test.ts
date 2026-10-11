import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signedIn, startHarness, type Client, type Harness } from "./helpers/accountHarness";

let h: Harness;
let admin: Client;

beforeEach(async () => {
  h = await startHarness();
  await h.seed({ email: "admin@example.com", role: "admin", full_name: "Ada Admin" });
  admin = await signedIn(h, "admin@example.com");
});
afterEach(async () => {
  await h.close();
});

const idOf = (email: string) => h.repo.users.find((u) => u.email === email)!.id;

/** Lands another admin's change right after this request reads the account. */
function changeAfterRead(id: number, change: () => void) {
  const findById = h.repo.findById;
  h.repo.findById = async (x: number) => {
    const row = await findById(x);
    if (x === id) {
      h.repo.findById = findById;
      change();
    }
    return row;
  };
}

describe("access", () => {
  it("is admin-only, and pending accounts can't reach it", async () => {
    await h.seed({ email: "rep@example.com" });
    const rep = await signedIn(h, "rep@example.com");
    expect((await rep.call("GET", "/api/admin/users")).status).toBe(403);
    expect((await h.client().call("GET", "/api/admin/users")).status).toBe(401);
    const list = await admin.call("GET", "/api/admin/users");
    expect(list.status).toBe(200);
    expect(list.body.users.map((u: any) => u.email).sort()).toEqual(["admin@example.com", "rep@example.com"]);
    expect(JSON.stringify(list.body)).not.toContain("password_hash");
  });

  it("applies a role change on the next request, without a new sign-in", async () => {
    await h.seed({ email: "rep@example.com" });
    const rep = await signedIn(h, "rep@example.com");
    expect((await admin.call("PATCH", `/api/admin/users/${idOf("rep@example.com")}`, { role: "admin" })).status).toBe(200);
    expect((await rep.call("GET", "/api/admin/users")).status).toBe(200);
    expect(h.audits.find((a) => a.action === "role_change")?.details).toMatchObject({ from: "user", to: "admin", target_email: "rep@example.com" });
  });
});

describe("approval", () => {
  it("approves a pending signup, which can then use the app", async () => {
    const browser = h.client();
    await browser.call("POST", "/api/auth/signup", { email: "new@example.com", password: "longenough", accept_terms: true });
    expect((await admin.call("GET", "/api/admin/users/pending-count")).body).toEqual({ count: 1, latest_id: expect.any(Number) });
    expect((await browser.call("POST", "/api/audit", { event_type: "export" })).status).toBe(403);

    const r = await admin.call("POST", `/api/admin/users/${idOf("new@example.com")}/approve`);
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ status: "active", approved_by: "admin@example.com" });
    expect(h.mail.some((m) => m.to === "new@example.com" && /approved/.test(m.subject))).toBe(true);
    // Same cookie, now allowed.
    expect((await browser.call("POST", "/api/audit", { event_type: "export", details: { action: "csv_export" } })).status).toBe(201);
    expect((await admin.call("POST", `/api/admin/users/${idOf("new@example.com")}/approve`)).status).toBe(409);
  });

  it("deletes a rejected signup but not an approved account", async () => {
    await h.seed({ email: "wait@example.com", status: "pending" });
    await h.seed({ email: "rep@example.com" });
    expect((await admin.call("DELETE", `/api/admin/users/${idOf("rep@example.com")}`)).status).toBe(409);
    expect((await admin.call("DELETE", `/api/admin/users/${idOf("wait@example.com")}`)).status).toBe(200);
    expect(h.repo.users.map((u) => u.email)).not.toContain("wait@example.com");
  });

  it("answers 409, without a second email or audit entry, when another admin approved first", async () => {
    await h.seed({ email: "wait@example.com", status: "pending" });
    const id = idOf("wait@example.com");
    changeAfterRead(id, () => {
      Object.assign(h.repo.users.find((u) => u.id === id)!, { status: "active", approved_by: "other@example.com" });
    });
    const r = await admin.call("POST", `/api/admin/users/${id}/approve`);
    expect(r.status).toBe(409);
    expect(h.repo.users.find((u) => u.id === id)!.approved_by).toBe("other@example.com");
    expect(h.mail.filter((m) => m.to === "wait@example.com")).toHaveLength(0);
    expect(h.audits.some((a) => a.action === "approve")).toBe(false);
  });

  it("answers 404, not an error, when the signup is deleted while being approved", async () => {
    await h.seed({ email: "wait@example.com", status: "pending" });
    const id = idOf("wait@example.com");
    changeAfterRead(id, () => {
      void h.repo.delete(id);
    });
    expect((await admin.call("POST", `/api/admin/users/${id}/approve`)).status).toBe(404);
  });

  it("keeps an account that was approved while being deleted", async () => {
    await h.seed({ email: "wait@example.com", status: "pending" });
    const id = idOf("wait@example.com");
    changeAfterRead(id, () => {
      h.repo.users.find((u) => u.id === id)!.status = "active";
    });
    const r = await admin.call("DELETE", `/api/admin/users/${id}`);
    expect(r.status).toBe(409);
    expect(h.repo.users.map((u) => u.email)).toContain("wait@example.com");
    expect(h.audits.some((a) => a.action === "delete")).toBe(false);
  });

  it("enables an account once when two admins enable it together", async () => {
    await h.seed({ email: "rep@example.com", status: "disabled" });
    const id = idOf("rep@example.com");
    changeAfterRead(id, () => {
      h.repo.users.find((u) => u.id === id)!.status = "active";
    });
    expect((await admin.call("POST", `/api/admin/users/${id}/enable`)).status).toBe(409);
    expect(h.audits.some((a) => a.action === "enable")).toBe(false);
  });
});

describe("guards", () => {
  it("won't let an admin demote, disable or sign out themselves", async () => {
    const me = idOf("admin@example.com");
    expect((await admin.call("PATCH", `/api/admin/users/${me}`, { role: "user" })).status).toBe(409);
    expect((await admin.call("POST", `/api/admin/users/${me}/disable`)).status).toBe(409);
    expect((await admin.call("POST", `/api/admin/users/${me}/revoke-sessions`)).status).toBe(409);
    // Renaming yourself is fine.
    expect((await admin.call("PATCH", `/api/admin/users/${me}`, { full_name: "Ada A." })).status).toBe(200);
  });

  it("never removes the last active admin, even acting on a stale session", async () => {
    await h.seed({ email: "second@example.com", role: "admin" });
    const second = await signedIn(h, "second@example.com");
    expect((await second.call("GET", "/api/admin/users")).status).toBe(200); // session now cached as admin
    // Another instance demotes "second"; this instance's cache still says admin
    // for up to 30s, so the request below gets past adminOnly.
    h.repo.users.find((u) => u.email === "second@example.com")!.role = "user";
    const r = await second.call("PATCH", `/api/admin/users/${idOf("admin@example.com")}`, { role: "user" });
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/last active admin/);
    expect((await second.call("POST", `/api/admin/users/${idOf("admin@example.com")}/disable`)).status).toBe(409);
    expect(h.repo.users.find((u) => u.email === "admin@example.com")!.role).toBe("admin");
  });

  it("lets one of two admins demote the other", async () => {
    await h.seed({ email: "second@example.com", role: "admin" });
    expect((await admin.call("PATCH", `/api/admin/users/${idOf("second@example.com")}`, { role: "user" })).status).toBe(200);
  });

  it("asks for a delete instead of disabling an unaccepted invite", async () => {
    const r = await admin.call("POST", "/api/admin/users/invite", { email: "invitee@example.com" });
    expect((await admin.call("POST", `/api/admin/users/${r.body.user.id}/disable`)).body.message).toMatch(/Delete it instead/);
  });
});

describe("disable and enable", () => {
  it("ends the account's sessions at once and blocks sign-in until enabled", async () => {
    await h.seed({ email: "rep@example.com" });
    const rep = await signedIn(h, "rep@example.com");
    const id = idOf("rep@example.com");
    const r = await admin.call("POST", `/api/admin/users/${id}/disable`, { reason: "Left the company" });
    expect(r.body.user).toMatchObject({ status: "disabled", disabled_reason: "Left the company" });
    expect((await rep.call("GET", "/api/auth/me")).status).toBe(401);
    expect((await h.client().call("POST", "/api/auth/login", { email: "rep@example.com", password: "password123" })).status).toBe(403);

    expect((await admin.call("POST", `/api/admin/users/${id}/enable`)).body.user.status).toBe("active");
    expect((await h.client().call("POST", "/api/auth/login", { email: "rep@example.com", password: "password123" })).status).toBe(200);
  });

  it("sends a never-approved account back to awaiting approval", async () => {
    await h.seed({ email: "wait@example.com", status: "pending" });
    const id = idOf("wait@example.com");
    await admin.call("POST", `/api/admin/users/${id}/disable`);
    expect((await admin.call("POST", `/api/admin/users/${id}/enable`)).body.user.status).toBe("pending");
  });
});

describe("links", () => {
  it("invites someone who sets a password and is active without approval", async () => {
    const r = await admin.call("POST", "/api/admin/users/invite", { email: "Invitee@Example.com", full_name: "Ivy", role: "admin" });
    expect(r.status).toBe(201);
    expect(r.body.user).toMatchObject({ email: "invitee@example.com", status: "invited", role: "admin" });
    expect(r.body.emailed).toBe(true);
    const token = new URL(r.body.link).searchParams.get("token")!;
    expect(h.mail.find((m) => m.to === "invitee@example.com")!.text).toContain(r.body.link);

    // Can't sign in before accepting.
    expect((await h.client().call("POST", "/api/auth/login", { email: "invitee@example.com", password: "anything1" })).status).toBe(401);

    const ivy = h.client();
    const info = await ivy.call("GET", `/api/auth/token-info?token=${token}`);
    expect(info.body).toMatchObject({ valid: true, purpose: "invite", email: "invitee@example.com" });
    const done = await ivy.call("POST", "/api/auth/reset-password", { token, password: "ivy-password" });
    expect(done.body).toMatchObject({ status: "active", role: "admin" });
    expect((await ivy.call("GET", "/api/admin/users/pending-count")).status).toBe(200);
  });

  it("gives an admin a one-time reset link (24h) for someone without email", async () => {
    await h.seed({ email: "rep@example.com" });
    const r = await admin.call("POST", `/api/admin/users/${idOf("rep@example.com")}/reset-link`);
    expect(r.body.purpose).toBe("reset");
    const hours = (new Date(r.body.expires_at).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(23);
    expect(hours).toBeLessThanOrEqual(24);
    // A second link replaces the first.
    const again = await admin.call("POST", `/api/admin/users/${idOf("rep@example.com")}/reset-link`);
    const first = new URL(r.body.link).searchParams.get("token");
    expect((await h.client().call("GET", `/api/auth/token-info?token=${first}`)).body.valid).toBe(false);
    expect(again.body.link).not.toBe(r.body.link);
    expect(h.audits.some((a) => a.action === "reset_link" && a.user_email === "admin@example.com")).toBe(true);
  });

  it("refuses to make links that would point at the wrong host", async () => {
    await h.close();
    h = await startHarness({ baseUrl: null });
    await h.seed({ email: "admin@example.com", role: "admin" });
    admin = await signedIn(h, "admin@example.com");
    const r = await admin.call("POST", "/api/admin/users/invite", { email: "x@example.com" });
    expect(r.status).toBe(409);
    expect(r.body.message).toMatch(/PUBLIC_APP_URL/);
  });
});

describe("POST /api/audit", () => {
  it("stamps the signed-in user and rejects event types the browser may not write", async () => {
    const ok = await admin.call("POST", "/api/audit", { event_type: "export", details: { action: "csv_export", entity: "lead_list", row_count: 3 } });
    expect(ok.status).toBe(201);
    const entry = h.audits.at(-1)!;
    expect(entry).toMatchObject({ event_type: "export", user_email: "admin@example.com", action: "csv_export", entity_type: "lead_list" });
    expect((await admin.call("POST", "/api/audit", { event_type: "account", details: { action: "approve" } })).status).toBe(400);
    expect((await admin.call("POST", "/api/audit", { event_type: "maintenance_fanout" })).status).toBe(400);
  });
});
