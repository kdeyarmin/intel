// Organizations in the account routes: signup starts an organization, owners
// manage only their own people, seats are limited, and the admin role stays
// platform-wide.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signedIn, startHarness, type Client, type Harness } from "./helpers/accountHarness";

let h: Harness;
beforeEach(async () => {
  h = await startHarness();
});
afterEach(async () => {
  await h.close();
});

const idOf = (email: string) => h.repo.users.find((u) => u.email === email)!.id;

describe("signup", () => {
  it("requires accepting the terms, then starts an organization owned by the signer", async () => {
    const c = h.client();
    const refused = await c.call("POST", "/api/auth/signup", { email: "owner@sunnyhill.com", password: "longenough", full_name: "Olivia Owner" });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("terms_required");

    const r = await c.call("POST", "/api/auth/signup", { email: "owner@sunnyhill.com", password: "longenough", full_name: "Olivia Owner", organization_name: "  Sunny Hill Personal Care  ", accept_terms: true });
    expect(r.status).toBe(201);
    const org = h.orgs.orgs.find((o) => o.name === "Sunny Hill Personal Care")!;
    expect(org).toMatchObject({ status: "trial" });
    expect(h.orgs.members).toContainEqual({ org_id: org.id, user_id: r.body.id, org_role: "owner" });
    const user = h.repo.users.find((u) => u.id === r.body.id)!;
    expect(user.terms_accepted_at).toBeInstanceOf(Date);
    expect(user.terms_version).toBe("2026-10");

    // The session carries the membership (even while awaiting approval).
    const me = await c.call("GET", "/api/auth/me");
    expect(me.body).toMatchObject({ status: "pending", orgId: org.id, orgRole: "owner", orgName: "Sunny Hill Personal Care", orgStatus: "trial", isPlatformAdmin: false });
    expect(h.audits.find((a) => a.action === "signup")!.details).toMatchObject({ org_id: org.id, organization: "Sunny Hill Personal Care" });
  });

  it("names the organization after the email's domain when none is typed", async () => {
    const c = h.client();
    await c.call("POST", "/api/auth/signup", { email: "pat@riverbend-hospice.org", password: "longenough", accept_terms: true });
    expect(h.orgs.orgs.map((o) => o.name)).toContain("Riverbend-hospice");
    await h.client().call("POST", "/api/auth/signup", { email: "pat@gmail.com", password: "longenough", full_name: "Pat Jones", accept_terms: true });
    expect(h.orgs.orgs.map((o) => o.name)).toContain("Pat Jones's organization");
  });
});

describe("an organization's owner", () => {
  let owner: Client;
  beforeEach(async () => {
    // Organization 2 belongs to a customer; organization 1 is the platform's.
    h.orgs.orgs.push({ id: 2, name: "Riverbend Hospice", status: "active", seat_limit: 3, plan_code: "county_pack", territory: { states: [], county_fips: ["42003"] } });
    await h.seed({ email: "platform@example.com", role: "admin" });
    await h.seed({ email: "other@example.com", org_id: 1 });
    await h.seed({ email: "owner@riverbend.org", role: "user", org_id: 2, org_role: "owner" });
    await h.seed({ email: "member@riverbend.org", org_id: 2 });
    await h.seed({ email: "pending@riverbend.org", org_id: 2, status: "pending" });
    owner = await signedIn(h, "owner@riverbend.org");
  });

  it("may open the admin routes and sees only their organization's people", async () => {
    const r = await owner.call("GET", "/api/admin/users");
    expect(r.status).toBe(200);
    expect(r.body.users.map((u: any) => u.email).sort()).toEqual(["member@riverbend.org", "owner@riverbend.org", "pending@riverbend.org"]);
    expect(r.body.users.find((u: any) => u.email === "owner@riverbend.org")).toMatchObject({ org_role: "owner", org_name: "Riverbend Hospice" });
    expect(r.body.platform_admin).toBe(false);
    expect(r.body.organization).toEqual({ id: 2, name: "Riverbend Hospice", seats: { used: 3, limit: 3 } });
    expect((await owner.call("GET", "/api/admin/users/pending-count")).body).toEqual({ count: 1, latest_id: idOf("pending@riverbend.org") });
  });

  it("can't see or act on accounts outside the organization", async () => {
    const other = idOf("other@example.com");
    expect((await owner.call("POST", `/api/admin/users/${other}/approve`)).status).toBe(404);
    expect((await owner.call("POST", `/api/admin/users/${other}/disable`)).status).toBe(404);
    expect((await owner.call("PATCH", `/api/admin/users/${other}`, { full_name: "X" })).status).toBe(404);
    expect((await owner.call("POST", `/api/admin/users/${other}/reset-link`)).status).toBe(404);
    expect(h.repo.users.find((u) => u.email === "other@example.com")!.status).toBe("active");
  });

  it("approves and manages their own people", async () => {
    const r = await owner.call("POST", `/api/admin/users/${idOf("pending@riverbend.org")}/approve`);
    expect(r.status).toBe(200);
    expect(r.body.user.status).toBe("active");
    const promoted = await owner.call("PATCH", `/api/admin/users/${idOf("member@riverbend.org")}`, { org_role: "owner" });
    expect(promoted.status).toBe(200);
    expect(promoted.body.user.org_role).toBe("owner");
    expect(h.audits.filter((a) => a.action === "role_change").at(-1)!.details).toMatchObject({ from: "member", to: "owner", org_id: 2 });
  });

  it("can't hand out the platform-wide admin role", async () => {
    const r = await owner.call("PATCH", `/api/admin/users/${idOf("member@riverbend.org")}`, { role: "admin" });
    expect(r.status).toBe(403);
    expect(h.repo.users.find((u) => u.email === "member@riverbend.org")!.role).toBe("user");
    expect((await owner.call("POST", "/api/admin/users/invite", { email: "new@riverbend.org", role: "admin" })).status).toBe(403);
  });

  it("stops inviting at the seat limit, and invites join the organization", async () => {
    const full = await owner.call("POST", "/api/admin/users/invite", { email: "fourth@riverbend.org" });
    expect(full.status).toBe(409);
    expect(full.body).toMatchObject({ code: "seat_limit", seats: { used: 3, limit: 3 } });
    expect(h.repo.users.some((u) => u.email === "fourth@riverbend.org")).toBe(false);

    h.orgs.orgs.find((o) => o.id === 2)!.seat_limit = 4;
    const ok = await owner.call("POST", "/api/admin/users/invite", { email: "fourth@riverbend.org", full_name: "Fay" });
    expect(ok.status).toBe(201);
    expect(ok.body.user).toMatchObject({ status: "invited", role: "user", org_id: 2, org_role: "member" });
    expect(h.orgs.members).toContainEqual({ org_id: 2, user_id: ok.body.user.id, org_role: "member" });

    const token = new URL(ok.body.link).searchParams.get("token")!;
    const fay = h.client();
    expect((await fay.call("POST", "/api/auth/reset-password", { token, password: "fay-password" })).status).toBe(200);
    expect((await fay.call("GET", "/api/auth/me")).body).toMatchObject({ orgId: 2, orgRole: "member", orgName: "Riverbend Hospice" });
    // A plain member isn't an administrator.
    expect((await fay.call("GET", "/api/admin/users")).status).toBe(403);
  });
});

describe("a platform admin", () => {
  it("sees every organization's people and may invite into another organization", async () => {
    h.orgs.orgs.push({ id: 2, name: "Riverbend Hospice", status: "active", seat_limit: 3, plan_code: null, territory: { states: [], county_fips: [] } });
    await h.seed({ email: "platform@example.com", role: "admin" });
    await h.seed({ email: "owner@riverbend.org", org_id: 2, org_role: "owner" });
    const admin = await signedIn(h, "platform@example.com");
    const r = await admin.call("GET", "/api/admin/users");
    expect(r.body.platform_admin).toBe(true);
    expect(r.body.organization).toBeNull();
    expect(r.body.users.map((u: any) => [u.email, u.org_name])).toEqual(expect.arrayContaining([["platform@example.com", "Test organization"], ["owner@riverbend.org", "Riverbend Hospice"]]));

    const invited = await admin.call("POST", "/api/admin/users/invite", { email: "new@riverbend.org", org_id: 2 });
    expect(invited.status).toBe(201);
    expect(invited.body.user).toMatchObject({ org_id: 2, org_role: "member" });
    const promoted = await admin.call("PATCH", `/api/admin/users/${idOf("owner@riverbend.org")}`, { role: "admin" });
    expect(promoted.status).toBe(200);
    expect(promoted.body.user.role).toBe("admin");
  });

  it("is the legacy admin role: a seeded admin is a platform admin unless said otherwise", async () => {
    await h.seed({ email: "legacy@example.com", role: "admin" });
    await h.seed({ email: "scoped@example.com", role: "admin", is_platform_admin: false });
    expect((await (await signedIn(h, "legacy@example.com")).call("GET", "/api/auth/me")).body.isPlatformAdmin).toBe(true);
    const scoped = await signedIn(h, "scoped@example.com");
    expect((await scoped.call("GET", "/api/auth/me")).body.isPlatformAdmin).toBe(false);
    // Still an administrator of their organization.
    expect((await scoped.call("GET", "/api/admin/users")).body.organization).toMatchObject({ id: 1 });
  });
});
