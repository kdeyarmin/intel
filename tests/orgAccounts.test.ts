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

describe("signup when the organization can't be made", () => {
  it("removes the account again, so the same address can sign up later", async () => {
    const make = h.orgs.createWithOwner;
    h.orgs.createWithOwner = async () => {
      throw new Error("organization insert failed");
    };
    const body = { email: "owner@sunnyhill.com", password: "longenough", full_name: "Olivia Owner", accept_terms: true };
    const failed = await h.client().call("POST", "/api/auth/signup", body);
    expect(failed.status).toBeGreaterThanOrEqual(500);
    // Nothing stranded: no account without an organization.
    expect(h.repo.users.some((u) => u.email === "owner@sunnyhill.com")).toBe(false);

    h.orgs.createWithOwner = make;
    const retried = await h.client().call("POST", "/api/auth/signup", body);
    expect(retried.status).toBe(201);
    expect(h.orgs.members.filter((m) => m.user_id === retried.body.id)).toHaveLength(1);
  });
});

describe("audit events carry the organization they belong to", () => {
  beforeEach(async () => {
    h.orgs.orgs.push({ id: 2, name: "Riverbend Hospice", status: "active", seat_limit: 5, plan_code: "county_pack", territory: { states: [], county_fips: ["42003"] } });
    await h.seed({ email: "platform@example.com", role: "admin" });
    await h.seed({ email: "owner@riverbend.org", role: "user", org_id: 2, org_role: "owner" });
    await h.seed({ email: "member@riverbend.org", org_id: 2 });
    await h.seed({ email: "pending@riverbend.org", org_id: 2, status: "pending" });
  });

  it("stamps signup with the organization it just created, and sign-ins with the person's own", async () => {
    const r = await h.client().call("POST", "/api/auth/signup", { email: "pat@riverbend-hospice.org", password: "longenough", full_name: "Pat Jones", accept_terms: true });
    const org = h.orgs.orgs.find((o) => o.name === "Riverbend-hospice")!;
    expect(h.audits.find((a) => a.action === "signup")!.org_id).toBe(org.id);
    expect(r.status).toBe(201);

    await signedIn(h, "member@riverbend.org");
    expect(h.audits.find((a) => a.action === "login" && a.user_email === "member@riverbend.org")!.org_id).toBe(2);
    await h.client().call("POST", "/api/auth/login", { email: "member@riverbend.org", password: "wrong-password" });
    expect(h.audits.find((a) => a.action === "login_failed" && a.details?.target_email === "member@riverbend.org")!.org_id).toBe(2);
  });

  it("stamps an administrator's action with the organization of the person it is about", async () => {
    const admin = await signedIn(h, "platform@example.com");
    expect((await admin.call("POST", `/api/admin/users/${idOf("pending@riverbend.org")}/approve`)).status).toBe(200);
    // The platform admin belongs to organization 1, but the approval is organization 2's business.
    expect(h.audits.find((a) => a.action === "approve")!.org_id).toBe(2);

    const owner = await signedIn(h, "owner@riverbend.org");
    expect((await owner.call("POST", `/api/admin/users/${idOf("member@riverbend.org")}/revoke-sessions`)).status).toBe(200);
    expect(h.audits.find((a) => a.action === "revoke_sessions")!.org_id).toBe(2);
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

  it("keeps the platform-admin flag with the admin role when it is invited, granted and taken away", async () => {
    await h.seed({ email: "platform@example.com", role: "admin" });
    const admin = await signedIn(h, "platform@example.com");
    const flagOf = (email: string) => h.repo.users.find((u) => u.email === email)!.is_platform_admin;

    expect((await admin.call("POST", "/api/admin/users/invite", { email: "second@example.com", role: "admin" })).status).toBe(201);
    expect(flagOf("second@example.com")).toBe(true);
    expect((await admin.call("POST", "/api/admin/users/invite", { email: "plain@example.com" })).status).toBe(201);
    expect(flagOf("plain@example.com")).toBe(false);

    expect((await admin.call("PATCH", `/api/admin/users/${idOf("plain@example.com")}`, { role: "admin" })).status).toBe(200);
    expect(flagOf("plain@example.com")).toBe(true);
    expect((await admin.call("PATCH", `/api/admin/users/${idOf("second@example.com")}`, { role: "user" })).status).toBe(200);
    expect(flagOf("second@example.com")).toBe(false);
    expect(h.repo.users.find((u) => u.email === "second@example.com")!.role).toBe("user");
  });

  it("is one thing with the admin role: either the role or the flag makes a platform admin", async () => {
    await h.seed({ email: "legacy@example.com", role: "admin" });
    // The flag and the role are kept together, but a row where only one is set is still a platform admin.
    await h.seed({ email: "roleonly@example.com", role: "admin", is_platform_admin: false });
    await h.seed({ email: "flagonly@example.com", role: "user", is_platform_admin: true });
    await h.seed({ email: "plain@example.com", role: "user" });
    for (const email of ["legacy@example.com", "roleonly@example.com", "flagonly@example.com"]) {
      expect((await (await signedIn(h, email)).call("GET", "/api/auth/me")).body.isPlatformAdmin, email).toBe(true);
    }
    expect((await (await signedIn(h, "plain@example.com")).call("GET", "/api/auth/me")).body.isPlatformAdmin).toBe(false);
  });
});

describe("an owner in the platform's own organization", () => {
  // Every account from before organizations was folded into organization 1, and a platform admin who delegates
  // by inviting an owner puts them there too: so the owner and the platform admin can share an organization.
  let owner: Client;
  let platform: Client;
  beforeEach(async () => {
    await h.seed({ email: "platform@example.com", role: "admin" });
    await h.seed({ email: "owner@example.com", role: "user", org_id: 1, org_role: "owner" });
    await h.seed({ email: "member@example.com", role: "user", org_id: 1 });
    owner = await signedIn(h, "owner@example.com");
    platform = await signedIn(h, "platform@example.com");
  });

  it("doesn't see platform admins among the organization's people", async () => {
    const r = await owner.call("GET", "/api/admin/users");
    expect(r.status).toBe(200);
    expect(r.body.users.map((u: any) => u.email).sort()).toEqual(["member@example.com", "owner@example.com"]);
    // The platform admin still sees everyone, platform admins included.
    expect((await platform.call("GET", "/api/admin/users")).body.users.map((u: any) => u.email).sort())
      .toEqual(["member@example.com", "owner@example.com", "platform@example.com"]);
  });

  it("can't reset, disable, sign out, rename, re-role or delete a platform admin: the account answers 404", async () => {
    const admin = idOf("platform@example.com");
    for (const [method, path, body] of [
      ["POST", `/api/admin/users/${admin}/reset-link`, undefined],
      ["POST", `/api/admin/users/${admin}/disable`, undefined],
      ["POST", `/api/admin/users/${admin}/revoke-sessions`, undefined],
      ["POST", `/api/admin/users/${admin}/enable`, undefined],
      ["POST", `/api/admin/users/${admin}/approve`, undefined],
      ["PATCH", `/api/admin/users/${admin}`, { full_name: "Not the admin" }],
      ["PATCH", `/api/admin/users/${admin}`, { org_role: "member" }],
      ["DELETE", `/api/admin/users/${admin}`, undefined],
    ] as const) {
      const r = await owner.call(method, path, body);
      expect(r.status, `${method} ${path}`).toBe(404);
    }
    const stored = h.repo.users.find((u) => u.email === "platform@example.com")!;
    expect(stored).toMatchObject({ status: "active", full_name: null });
    // No reset link was minted for it, and its session still works.
    expect(h.repo.tokens.filter((t) => t.user_id === admin)).toEqual([]);
    expect((await platform.call("GET", "/api/auth/me")).status).toBe(200);
  });

  it("also can't touch an account that carries only the platform-admin flag", async () => {
    await h.seed({ email: "flagged@example.com", role: "user", is_platform_admin: true, org_id: 1 });
    const flagged = idOf("flagged@example.com");
    expect((await owner.call("POST", `/api/admin/users/${flagged}/reset-link`)).status).toBe(404);
    expect((await owner.call("POST", `/api/admin/users/${flagged}/disable`)).status).toBe(404);
    expect(h.repo.tokens.filter((t) => t.user_id === flagged)).toEqual([]);
  });

  it("still manages the organization's ordinary people, and a platform admin still manages the owner", async () => {
    const member = idOf("member@example.com");
    expect((await owner.call("POST", `/api/admin/users/${member}/revoke-sessions`)).status).toBe(200);
    expect((await owner.call("PATCH", `/api/admin/users/${member}`, { full_name: "Mia Member" })).status).toBe(200);
    expect((await platform.call("POST", `/api/admin/users/${idOf("owner@example.com")}/revoke-sessions`)).status).toBe(200);
  });
});
