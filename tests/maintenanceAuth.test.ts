/**
 * Tests for the maintenance-endpoint authentication logic added in this PR.
 *
 * .env.example now documents MAINTENANCE_TOKEN, which enables the unattended
 * cron path in server/routes/maintenance.ts.  The key security primitives are
 * module-private, so their logic is replicated here verbatim (following the
 * same approach used in tests/functionsAuthGuard.test.ts).  If the production
 * implementation changes, update this file accordingly.
 */
import { describe, it, expect } from "vitest";
import crypto from "crypto";

// ─── timingSafeEqualStr — replicated from server/routes/maintenance.ts ────────

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// ─── TASKS prototype-safety — replicated from server/routes/maintenance.ts ───
// The real TASKS object uses Object.create(null) so that inherited prototype
// keys like "toString", "constructor", "__proto__" can never match a caller's
// task name.  We replicate that structure to test the invariant.

const TASK_NAMES = ["runScheduledImports", "autoRetryFailedImports", "autoResumePausedImports", "cancelStalledImports"];

function buildTasks(): Record<string, () => string> {
  return Object.assign(Object.create(null) as Record<string, () => string>, {
    runScheduledImports: () => "ran",
    autoRetryFailedImports: () => "ran",
    autoResumePausedImports: () => "ran",
    cancelStalledImports: () => "ran",
  });
}

// ─── maintenanceAuth logic — replicated from server/routes/maintenance.ts ────
// Returns true if the provided token matches the configured token (both must
// be non-empty), mirroring the guard condition in maintenanceAuth().

function isTokenAuthorized(configuredToken: string | undefined, providedToken: string | undefined): boolean {
  if (!configuredToken || !providedToken) return false;
  return timingSafeEqualStr(providedToken, configuredToken);
}

// ─── Tests: timingSafeEqualStr ────────────────────────────────────────────────

describe("timingSafeEqualStr", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqualStr("secret", "secret")).toBe(true);
  });

  it("returns false when strings differ", () => {
    expect(timingSafeEqualStr("secret", "Secret")).toBe(false);
    expect(timingSafeEqualStr("abc", "abd")).toBe(false);
  });

  it("returns false when lengths differ (short-circuits before timingSafeEqual)", () => {
    expect(timingSafeEqualStr("short", "much-longer-value")).toBe(false);
    expect(timingSafeEqualStr("longer-value", "x")).toBe(false);
  });

  it("returns true for empty strings (both empty)", () => {
    expect(timingSafeEqualStr("", "")).toBe(true);
  });

  it("returns false when one string is empty and the other is not", () => {
    expect(timingSafeEqualStr("", "x")).toBe(false);
    expect(timingSafeEqualStr("x", "")).toBe(false);
  });

  it("handles multi-byte UTF-8 characters correctly", () => {
    const s = "tôken-üñícode";
    expect(timingSafeEqualStr(s, s)).toBe(true);
    expect(timingSafeEqualStr(s, "tôken-üñícode ")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(timingSafeEqualStr("ABC", "abc")).toBe(false);
    expect(timingSafeEqualStr("Token123", "token123")).toBe(false);
  });

  it("handles long secrets without error", () => {
    const long = "x".repeat(4096);
    expect(timingSafeEqualStr(long, long)).toBe(true);
    expect(timingSafeEqualStr(long, long.slice(0, -1))).toBe(false);
  });
});

// ─── Tests: maintenanceAuth token check ──────────────────────────────────────

describe("maintenanceAuth — MAINTENANCE_TOKEN check", () => {
  it("authorizes when configured token matches provided token", () => {
    expect(isTokenAuthorized("my-secret", "my-secret")).toBe(true);
  });

  it("rejects when tokens do not match", () => {
    expect(isTokenAuthorized("correct-token", "wrong-token")).toBe(false);
  });

  it("rejects when MAINTENANCE_TOKEN env var is not set (undefined)", () => {
    expect(isTokenAuthorized(undefined, "any-token")).toBe(false);
  });

  it("rejects when MAINTENANCE_TOKEN env var is empty string", () => {
    // An empty MAINTENANCE_TOKEN means 'disabled'; cron must fall back to admin auth.
    expect(isTokenAuthorized("", "any-token")).toBe(false);
  });

  it("rejects when caller sends no x-maintenance-token header (undefined)", () => {
    expect(isTokenAuthorized("configured-secret", undefined)).toBe(false);
  });

  it("rejects when caller sends an empty x-maintenance-token header", () => {
    expect(isTokenAuthorized("configured-secret", "")).toBe(false);
  });

  it("rejects when both configured and provided tokens are empty", () => {
    expect(isTokenAuthorized("", "")).toBe(false);
  });

  it("is case-sensitive (upper vs lower case token)", () => {
    expect(isTokenAuthorized("SecretToken", "secrettoken")).toBe(false);
    expect(isTokenAuthorized("SecretToken", "SecretToken")).toBe(true);
  });

  it("rejects a token that is a prefix of the configured token", () => {
    expect(isTokenAuthorized("full-secret-value", "full-secret")).toBe(false);
  });

  it("rejects a token that is a superset of the configured token", () => {
    expect(isTokenAuthorized("short", "short-extra-suffix")).toBe(false);
  });
});

// ─── Tests: TASKS prototype pollution safety ──────────────────────────────────

describe("TASKS object — prototype pollution safety", () => {
  const TASKS = buildTasks();

  it("dispatches all four maintenance task names", () => {
    for (const name of TASK_NAMES) {
      expect(TASKS[name]).toBeTypeOf("function");
    }
  });

  it("returns undefined for an unknown task name (no 404 false-positives)", () => {
    expect(TASKS["unknownTask"]).toBeUndefined();
    expect(TASKS["doSomethingDangerous"]).toBeUndefined();
  });

  it("does NOT inherit Object.prototype keys — 'constructor' is not a task", () => {
    // If the object had a prototype, TASKS["constructor"] would return a
    // function; Object.create(null) ensures it is undefined instead.
    expect(TASKS["constructor"]).toBeUndefined();
  });

  it("does NOT inherit Object.prototype keys — 'toString' is not a task", () => {
    expect(TASKS["toString"]).toBeUndefined();
  });

  it("does NOT inherit Object.prototype keys — 'hasOwnProperty' is not a task", () => {
    expect(TASKS["hasOwnProperty"]).toBeUndefined();
  });

  it("does NOT inherit Object.prototype keys — '__proto__' is not a task", () => {
    expect(TASKS["__proto__"]).toBeUndefined();
  });

  it("does NOT inherit Object.prototype keys — 'valueOf' is not a task", () => {
    expect(TASKS["valueOf"]).toBeUndefined();
  });

  it("has exactly the four documented task names", () => {
    const keys = Object.keys(TASKS);
    expect(keys).toHaveLength(4);
    expect(keys.sort()).toEqual([...TASK_NAMES].sort());
  });
});
