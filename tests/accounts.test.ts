import { afterEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import {
  adminActionProblem,
  appBaseUrl,
  hashToken,
  looksLikeToken,
  newToken,
  normalizeEmail,
  passwordProblem,
  tokenLink,
} from "../server/lib/accounts";
import { parseTrustProxy } from "../server/lib/trustProxy";
import { createFailureCounter } from "../server/middleware/rateLimit";
import { seedAdmin } from "../server/lib/adminSeed";
import { memoryUserRepo } from "./helpers/accountHarness";

describe("normalizeEmail", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  Jane.Doe@Example.COM ")).toBe("jane.doe@example.com");
  });
  it("rejects non-addresses", () => {
    for (const bad of [undefined, 42, "", "jane", "jane@", "@x.com", "a b@c.com", `${"x".repeat(250)}@a.com`]) {
      expect(normalizeEmail(bad), String(bad)).toBeNull();
    }
  });
});

describe("passwordProblem", () => {
  it("needs 8 characters and at most 72 bytes (bcrypt's limit)", () => {
    expect(passwordProblem("1234567")).toMatch(/at least 8/);
    expect(passwordProblem(12345678)).toMatch(/at least 8/);
    expect(passwordProblem("12345678")).toBeNull();
    expect(passwordProblem("a".repeat(72))).toBeNull();
    expect(passwordProblem("a".repeat(73))).toMatch(/72 bytes/);
    // 36 two-byte characters fit; 37 don't.
    expect(passwordProblem("é".repeat(36))).toBeNull();
    expect(passwordProblem("é".repeat(37))).toMatch(/72 bytes/);
  });
});

describe("tokens", () => {
  it("stores only a hash of a random URL-safe token", () => {
    const a = newToken();
    const b = newToken();
    expect(a.raw).not.toBe(b.raw);
    expect(looksLikeToken(a.raw)).toBe(true);
    expect(a.hash).toBe(hashToken(a.raw));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(looksLikeToken("short")).toBe(false);
    expect(looksLikeToken("../".repeat(20))).toBe(false);
  });

  it("builds links only from PUBLIC_APP_URL in production", () => {
    expect(appBaseUrl({ PUBLIC_APP_URL: "https://app.example.com/", NODE_ENV: "production" } as any)).toBe("https://app.example.com");
    expect(appBaseUrl({ NODE_ENV: "production" } as any)).toBeNull();
    expect(appBaseUrl({ NODE_ENV: "development" } as any)).toBe("http://localhost:5000");
    expect(tokenLink("https://a.example", "abc")).toBe("https://a.example/reset-password?token=abc");
  });
});

describe("adminActionProblem", () => {
  const admin = { id: 2, role: "admin", status: "active" };
  const user = { id: 3, role: "user", status: "active" };

  it("blocks acting on yourself", () => {
    expect(adminActionProblem({ actorId: 2, target: admin, action: "role", newRole: "user", activeAdmins: 3 })).toMatch(/your own/);
    expect(adminActionProblem({ actorId: 2, target: admin, action: "revoke", activeAdmins: 3 })).toMatch(/Sign out everywhere/);
  });

  it("keeps at least one active admin", () => {
    expect(adminActionProblem({ actorId: 1, target: admin, action: "role", newRole: "user", activeAdmins: 1 })).toMatch(/last active admin/);
    expect(adminActionProblem({ actorId: 1, target: admin, action: "disable", activeAdmins: 1 })).toMatch(/last active admin/);
    expect(adminActionProblem({ actorId: 1, target: admin, action: "role", newRole: "admin", activeAdmins: 1 })).toBeNull();
    expect(adminActionProblem({ actorId: 1, target: admin, action: "role", newRole: "user", activeAdmins: 2 })).toBeNull();
    expect(adminActionProblem({ actorId: 1, target: user, action: "disable", activeAdmins: 1 })).toBeNull();
  });

  it("only deletes accounts that never got in", () => {
    expect(adminActionProblem({ actorId: 1, target: user, action: "delete", activeAdmins: 2 })).toMatch(/Disable this account instead/);
    expect(adminActionProblem({ actorId: 1, target: { ...user, status: "pending" }, action: "delete", activeAdmins: 2 })).toBeNull();
    expect(adminActionProblem({ actorId: 1, target: { ...user, status: "invited" }, action: "disable", activeAdmins: 2 })).toMatch(/Delete it instead/);
  });
});

describe("createFailureCounter", () => {
  afterEach(() => vi.useRealTimers());
  it("locks after max failures, clears on success, and expires", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const c = createFailureCounter(3, 60_000);
    c.fail("a");
    c.fail("a");
    expect(c.lockedFor("a")).toBe(0);
    c.fail("a");
    expect(c.lockedFor("a")).toBe(60_000);
    expect(c.lockedFor("b")).toBe(0);
    vi.setSystemTime(60_000);
    expect(c.lockedFor("a")).toBe(0);
    c.fail("b");
    c.clear("b");
    c.fail("b");
    c.fail("b");
    expect(c.lockedFor("b")).toBe(0);
  });
});

describe("parseTrustProxy", () => {
  it("keeps the old behaviour by default and accepts hop counts and lists", () => {
    expect(parseTrustProxy(undefined)).toBe(true);
    expect(parseTrustProxy("false")).toBe(false);
    expect(parseTrustProxy("1")).toBe(1);
    expect(parseTrustProxy("loopback, 10.0.0.0/8")).toBe("loopback, 10.0.0.0/8");
  });
});

describe("seedAdmin", () => {
  const hashPassword = async (pw: string) => `h:${pw}`;
  const verifyPassword = async (pw: string, h: string) => h === `h:${pw}`;

  it("creates an active, approved admin once", async () => {
    const repo = memoryUserRepo();
    const env = { ADMIN_EMAIL: "Boss@Example.com", ADMIN_PASSWORD: "s3cret-pass" } as any;
    expect(await seedAdmin(repo, { env, hashPassword, verifyPassword })).toEqual({ outcome: "seeded", email: "boss@example.com" });
    expect(repo.users[0]).toMatchObject({ role: "admin", status: "active", approved_by: "system" });
    expect((await seedAdmin(repo, { env, hashPassword, verifyPassword })).outcome).toBe("exists");
  });

  it("needs ADMIN_PASSWORD in production", async () => {
    const repo = memoryUserRepo();
    expect((await seedAdmin(repo, { env: { NODE_ENV: "production" } as any, hashPassword, verifyPassword })).outcome).toBe("skipped_no_password");
    expect(repo.users).toHaveLength(0);
  });

  it("doesn't undo a deliberate demotion while another admin exists", async () => {
    const repo = memoryUserRepo();
    await repo.create({ email: "boss@example.com", password_hash: "h:s3cret-pass", full_name: null, role: "user", status: "active" });
    await repo.create({ email: "other@example.com", password_hash: "h:x", full_name: null, role: "admin", status: "active" });
    const env = { ADMIN_EMAIL: "boss@example.com", ADMIN_PASSWORD: "s3cret-pass" } as any;
    expect((await seedAdmin(repo, { env, hashPassword, verifyPassword })).outcome).toBe("left_alone");
    expect(repo.users[0].role).toBe("user");
  });

  it("restores the admin address when nobody can administer, only with the right password", async () => {
    const repo = memoryUserRepo();
    await repo.create({ email: "boss@example.com", password_hash: "h:squatter-pass", full_name: null, role: "user", status: "pending" });
    const env = { ADMIN_EMAIL: "boss@example.com", ADMIN_PASSWORD: "s3cret-pass" } as any;
    expect((await seedAdmin(repo, { env, hashPassword, verifyPassword })).outcome).toBe("left_alone");
    repo.users[0].password_hash = "h:s3cret-pass";
    expect((await seedAdmin(repo, { env, hashPassword, verifyPassword })).outcome).toBe("restored");
    expect(repo.users[0]).toMatchObject({ role: "admin", status: "active" });
  });
});

describe("auth middleware tokens", () => {
  it("accepts tokens issued before token versions (no tv) as version 0", async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-for-legacy-token-check";
    vi.resetModules();
    const { verifyToken } = await import("../server/middleware/auth");
    const legacy = jwt.sign({ id: 7, email: "a@b.c", role: "admin" }, process.env.JWT_SECRET!, { expiresIn: "7d" });
    expect(verifyToken(legacy)).toEqual({ id: 7, tv: 0 });
    const bad = jwt.sign({ email: "a@b.c" }, process.env.JWT_SECRET!);
    expect(() => verifyToken(bad)).toThrow();
  });
});
