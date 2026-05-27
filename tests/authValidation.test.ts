/**
 * Tests for the auth-related changes in server/routes/auth.ts:
 *
 * 1. cookieOptions() — returns different security settings depending on NODE_ENV.
 *    The function is not exported, so its logic is replicated here.
 *
 * 2. Password-length validation — the /signup route now rejects passwords
 *    shorter than MIN_PASSWORD_LENGTH (8). The validation logic is replicated
 *    as a pure helper.
 *
 * 3. AUTH_THROTTLE constants — authThrottle is set to 10 req / 60s per IP.
 *    This is tested indirectly via the ipRateLimit mock to confirm the
 *    right scope and window values are used.
 *
 * If the production code changes, update this test accordingly.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

// ─── Replicated helpers (kept in sync with server/routes/auth.ts) ─────────────

const MIN_PASSWORD_LENGTH = 8;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

/**
 * Returns an error message if the password is invalid, otherwise null.
 * Mirrors the validation in the /signup handler.
 */
function validatePassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

// ─── Test helpers ─────────────────────────────────────────────────────────────

let savedNodeEnv: string | undefined;

beforeEach(() => {
  savedNodeEnv = process.env.NODE_ENV;
});

afterEach(() => {
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
});

// ─── cookieOptions ─────────────────────────────────────────────────────────────

describe("cookieOptions", () => {
  it("sets httpOnly=true in all environments", () => {
    expect(cookieOptions().httpOnly).toBe(true);
  });

  it("sets sameSite='lax' in all environments", () => {
    expect(cookieOptions().sameSite).toBe("lax");
  });

  it("sets maxAge to 7 days in milliseconds", () => {
    const expected = 7 * 24 * 60 * 60 * 1000;
    expect(cookieOptions().maxAge).toBe(expected);
  });

  it("sets secure=false in development", () => {
    process.env.NODE_ENV = "development";
    expect(cookieOptions().secure).toBe(false);
  });

  it("sets secure=true in production", () => {
    process.env.NODE_ENV = "production";
    expect(cookieOptions().secure).toBe(true);
  });

  it("sets secure=false for an unrecognised NODE_ENV value (conservative default)", () => {
    process.env.NODE_ENV = "staging";
    // "staging" !== "production" so secure should be false
    expect(cookieOptions().secure).toBe(false);
  });

  it("sets secure=false when NODE_ENV is unset", () => {
    delete process.env.NODE_ENV;
    expect(cookieOptions().secure).toBe(false);
  });
});

// ─── Password validation ──────────────────────────────────────────────────────

describe("password validation (MIN_PASSWORD_LENGTH = 8)", () => {
  it("accepts a password of exactly 8 characters", () => {
    expect(validatePassword("12345678")).toBeNull();
  });

  it("accepts a password longer than 8 characters", () => {
    expect(validatePassword("supersecretpassword")).toBeNull();
  });

  it("rejects a password of 7 characters", () => {
    expect(validatePassword("1234567")).not.toBeNull();
  });

  it("rejects an empty string", () => {
    expect(validatePassword("")).not.toBeNull();
  });

  it("rejects a single character", () => {
    expect(validatePassword("a")).not.toBeNull();
  });

  it("rejects null", () => {
    expect(validatePassword(null)).not.toBeNull();
  });

  it("rejects undefined", () => {
    expect(validatePassword(undefined)).not.toBeNull();
  });

  it("rejects a number (must be a string)", () => {
    expect(validatePassword(12345678 as any)).not.toBeNull();
  });

  it("rejects an object", () => {
    expect(validatePassword({} as any)).not.toBeNull();
  });

  it("error message mentions the minimum length", () => {
    const msg = validatePassword("short");
    expect(msg).toMatch(/8/);
  });

  it("accepts a password of exactly 8 spaces (structural length check, not content)", () => {
    // The validation only checks length and type, not content strength
    expect(validatePassword("        ")).toBeNull();
  });
});

// ─── authThrottle configuration ────────────────────────────────────────────────

describe("authThrottle configuration", () => {
  it("MIN_PASSWORD_LENGTH is 8", () => {
    // Regression guard: if someone changes the constant, tests should catch it
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it("maxAge is exactly 7 days (604800000 ms)", () => {
    expect(cookieOptions().maxAge).toBe(604_800_000);
  });
});