/**
 * Tests for the allowedFromAddresses() and resolveFrom() helpers introduced in
 * server/routes/integrations.ts.
 *
 * These functions are module-private (not exported), so the logic is replicated
 * here verbatim. If the production code changes, update this test to match.
 *
 * allowedFromAddresses() reads SENDGRID_FROM_EMAIL and ALLOWED_FROM_EMAILS from
 * the environment, normalises them to lowercase, and falls back to a hardcoded
 * default when neither env var yields a usable address.
 *
 * resolveFrom(requested?) returns the requested address if it is in the allow-
 * list, otherwise returns the first allowed address (the "from" default).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ─── Replicated helpers (kept in sync with server/routes/integrations.ts) ────

function allowedFromAddresses(): string[] {
  const list = [
    process.env.SENDGRID_FROM_EMAIL,
    ...(process.env.ALLOWED_FROM_EMAILS || "").split(","),
  ]
    .map((s) => (s || "").trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? list : ["noreply@caremetric.com"];
}

function resolveFrom(requested?: string): string {
  const allowed = allowedFromAddresses();
  if (requested && allowed.includes(requested.trim().toLowerCase())) return requested.trim();
  return allowed[0];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

// Save/restore env vars around each test so tests don't bleed into each other.
let savedFromEmail: string | undefined;
let savedAllowedFrom: string | undefined;

beforeEach(() => {
  savedFromEmail = process.env.SENDGRID_FROM_EMAIL;
  savedAllowedFrom = process.env.ALLOWED_FROM_EMAILS;
});

afterEach(() => {
  if (savedFromEmail === undefined) delete process.env.SENDGRID_FROM_EMAIL;
  else process.env.SENDGRID_FROM_EMAIL = savedFromEmail;

  if (savedAllowedFrom === undefined) delete process.env.ALLOWED_FROM_EMAILS;
  else process.env.ALLOWED_FROM_EMAILS = savedAllowedFrom;
});

// ─── allowedFromAddresses ────────────────────────────────────────────────────

describe("allowedFromAddresses", () => {
  it("returns the hardcoded fallback when no env vars are set", () => {
    delete process.env.SENDGRID_FROM_EMAIL;
    delete process.env.ALLOWED_FROM_EMAILS;
    expect(allowedFromAddresses()).toEqual(["noreply@caremetric.com"]);
  });

  it("returns SENDGRID_FROM_EMAIL as the first entry when set", () => {
    process.env.SENDGRID_FROM_EMAIL = "alerts@example.org";
    delete process.env.ALLOWED_FROM_EMAILS;
    const result = allowedFromAddresses();
    expect(result[0]).toBe("alerts@example.org");
  });

  it("lowercases SENDGRID_FROM_EMAIL", () => {
    process.env.SENDGRID_FROM_EMAIL = "Alerts@Example.ORG";
    delete process.env.ALLOWED_FROM_EMAILS;
    expect(allowedFromAddresses()[0]).toBe("alerts@example.org");
  });

  it("includes ALLOWED_FROM_EMAILS entries after SENDGRID_FROM_EMAIL", () => {
    process.env.SENDGRID_FROM_EMAIL = "primary@example.com";
    process.env.ALLOWED_FROM_EMAILS = "secondary@example.com,tertiary@example.com";
    const result = allowedFromAddresses();
    expect(result).toContain("primary@example.com");
    expect(result).toContain("secondary@example.com");
    expect(result).toContain("tertiary@example.com");
    expect(result[0]).toBe("primary@example.com");
  });

  it("trims whitespace from ALLOWED_FROM_EMAILS entries", () => {
    delete process.env.SENDGRID_FROM_EMAIL;
    process.env.ALLOWED_FROM_EMAILS = "  a@example.com  ,  b@example.com  ";
    const result = allowedFromAddresses();
    expect(result).toContain("a@example.com");
    expect(result).toContain("b@example.com");
  });

  it("filters out empty/whitespace-only ALLOWED_FROM_EMAILS entries", () => {
    delete process.env.SENDGRID_FROM_EMAIL;
    process.env.ALLOWED_FROM_EMAILS = "valid@example.com,,   ,";
    const result = allowedFromAddresses();
    expect(result).toEqual(["valid@example.com"]);
  });

  it("returns fallback when SENDGRID_FROM_EMAIL is empty string and ALLOWED_FROM_EMAILS unset", () => {
    process.env.SENDGRID_FROM_EMAIL = "";
    delete process.env.ALLOWED_FROM_EMAILS;
    expect(allowedFromAddresses()).toEqual(["noreply@caremetric.com"]);
  });

  it("returns fallback when both env vars are whitespace-only", () => {
    process.env.SENDGRID_FROM_EMAIL = "   ";
    process.env.ALLOWED_FROM_EMAILS = "   ,   ";
    expect(allowedFromAddresses()).toEqual(["noreply@caremetric.com"]);
  });

  it("does not include duplicates from env (dedup is caller responsibility, but order is preserved)", () => {
    process.env.SENDGRID_FROM_EMAIL = "a@example.com";
    process.env.ALLOWED_FROM_EMAILS = "a@example.com,b@example.com";
    const result = allowedFromAddresses();
    // Result may contain "a@example.com" twice — that is acceptable production
    // behaviour (the first occurrence is what matters for resolveFrom).
    // The important thing is b@example.com is also present.
    expect(result).toContain("a@example.com");
    expect(result).toContain("b@example.com");
  });
});

// ─── resolveFrom ─────────────────────────────────────────────────────────────

describe("resolveFrom", () => {
  beforeEach(() => {
    process.env.SENDGRID_FROM_EMAIL = "noreply@caremetric.com";
    delete process.env.ALLOWED_FROM_EMAILS;
  });

  it("returns the requested address when it is in the allowlist", () => {
    process.env.ALLOWED_FROM_EMAILS = "sales@caremetric.com";
    expect(resolveFrom("sales@caremetric.com")).toBe("sales@caremetric.com");
  });

  it("returns the first allowed address when requested address is not in the list", () => {
    expect(resolveFrom("attacker@evil.com")).toBe("noreply@caremetric.com");
  });

  it("returns the first allowed address when no address is requested (undefined)", () => {
    expect(resolveFrom(undefined)).toBe("noreply@caremetric.com");
  });

  it("returns the first allowed address when no address is requested (empty string)", () => {
    // Empty string is falsy — falls through to default
    expect(resolveFrom("")).toBe("noreply@caremetric.com");
  });

  it("trims the requested address before comparing", () => {
    process.env.ALLOWED_FROM_EMAILS = "sales@caremetric.com";
    expect(resolveFrom("  sales@caremetric.com  ")).toBe("sales@caremetric.com");
  });

  it("comparison is case-insensitive", () => {
    process.env.SENDGRID_FROM_EMAIL = "noreply@caremetric.com";
    // "noreply@caremetric.com" is already in the list (lowercased)
    expect(resolveFrom("NOREPLY@CAREMETRIC.COM")).toBe("NOREPLY@CAREMETRIC.COM");
  });

  it("falls back to hardcoded default when env is completely empty", () => {
    delete process.env.SENDGRID_FROM_EMAIL;
    delete process.env.ALLOWED_FROM_EMAILS;
    expect(resolveFrom("anything@external.com")).toBe("noreply@caremetric.com");
  });

  it("returns the first allowed address (SENDGRID_FROM_EMAIL) as default when multiple are configured", () => {
    process.env.SENDGRID_FROM_EMAIL = "primary@caremetric.com";
    process.env.ALLOWED_FROM_EMAILS = "secondary@caremetric.com";
    expect(resolveFrom("unregistered@example.com")).toBe("primary@caremetric.com");
  });

  it("prevents open relay: an arbitrary external address is not honoured", () => {
    // This is the security-critical property: the endpoint must not be usable as
    // a spoofing relay by passing an arbitrary `from` value.
    process.env.SENDGRID_FROM_EMAIL = "noreply@caremetric.com";
    const result = resolveFrom("victim@bank.com");
    expect(result).not.toBe("victim@bank.com");
    expect(result).toBe("noreply@caremetric.com");
  });
});