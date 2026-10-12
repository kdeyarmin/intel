import { describe, it, expect } from "vitest";
import {
  AI_EMAIL_SOURCE,
  isValidEmailSyntax,
  shouldPromoteToPrimary,
} from "../server/functions/emailValidation";

describe("AI_EMAIL_SOURCE", () => {
  it("is the expected constant string", () => {
    expect(AI_EMAIL_SOURCE).toBe("ai_inferred");
  });
});

describe("isValidEmailSyntax", () => {
  // --- valid addresses ---
  it("accepts a normal email address", () => {
    expect(isValidEmailSyntax("user@example.org")).toBe(false); // example.org is in bogus list
    expect(isValidEmailSyntax("john.doe@hospital.com")).toBe(true);
    expect(isValidEmailSyntax("dr.smith@university.edu")).toBe(true);
    expect(isValidEmailSyntax("info@clinic-west.org")).toBe(true);
  });

  it("accepts addresses with subdomains", () => {
    expect(isValidEmailSyntax("admin@mail.hospital.org")).toBe(true);
  });

  it("accepts addresses with plus-sign local parts", () => {
    expect(isValidEmailSyntax("user+tag@provider.net")).toBe(true);
  });

  it("trims surrounding whitespace before validating", () => {
    expect(isValidEmailSyntax("  user@provider.net  ")).toBe(true);
  });

  // --- type guards ---
  it("returns false for non-string inputs", () => {
    expect(isValidEmailSyntax(null)).toBe(false);
    expect(isValidEmailSyntax(undefined)).toBe(false);
    expect(isValidEmailSyntax(42)).toBe(false);
    expect(isValidEmailSyntax({})).toBe(false);
    expect(isValidEmailSyntax([])).toBe(false);
  });

  // --- length bounds ---
  it("rejects addresses shorter than 5 characters", () => {
    // Shortest meaningful address is a@b.c = 5 chars; anything under 5 is invalid
    expect(isValidEmailSyntax("a@b.")).toBe(false); // 4 chars
    expect(isValidEmailSyntax("a@bc")).toBe(false);
  });

  it("rejects addresses longer than 254 characters", () => {
    const local = "a".repeat(246);
    const addr = `${local}@long.com`; // > 254 chars
    expect(isValidEmailSyntax(addr)).toBe(false);
  });

  it("accepts an address of exactly 5 characters (boundary)", () => {
    // a@b.c is exactly 5 chars and structurally valid (domain tld >= 2 chars enforced by regex)
    // but "b.c" has a 1-char tld so regex \.[^\s@]{2,} rejects it
    // 6-char valid: a@b.co
    expect(isValidEmailSyntax("a@b.co")).toBe(true);
  });

  // --- format checks ---
  it("rejects strings without an @ symbol", () => {
    expect(isValidEmailSyntax("notanemail")).toBe(false);
    expect(isValidEmailSyntax("nodomain.com")).toBe(false);
  });

  it("rejects strings with spaces", () => {
    expect(isValidEmailSyntax("user name@domain.com")).toBe(false);
    expect(isValidEmailSyntax("user@do main.com")).toBe(false);
  });

  it("rejects strings with multiple @ signs", () => {
    expect(isValidEmailSyntax("a@b@c.com")).toBe(false);
  });

  it("rejects addresses without a TLD of at least 2 chars", () => {
    expect(isValidEmailSyntax("user@domain.c")).toBe(false);
  });

  // --- bogus domain blocklist ---
  it("rejects example.com", () => {
    expect(isValidEmailSyntax("user@example.com")).toBe(false);
  });

  it("rejects example.org", () => {
    expect(isValidEmailSyntax("user@example.org")).toBe(false);
  });

  it("rejects domain.com", () => {
    expect(isValidEmailSyntax("user@domain.com")).toBe(false);
  });

  it("rejects email.com", () => {
    expect(isValidEmailSyntax("user@email.com")).toBe(false);
  });

  it("rejects test.com", () => {
    expect(isValidEmailSyntax("user@test.com")).toBe(false);
  });

  it("rejects none.com", () => {
    expect(isValidEmailSyntax("noreply@none.com")).toBe(false);
  });

  it("is case-insensitive for bogus domain check", () => {
    expect(isValidEmailSyntax("user@EXAMPLE.COM")).toBe(false);
    expect(isValidEmailSyntax("user@Test.Com")).toBe(false);
  });

  it("does not reject legitimate domains that merely contain a bogus substring", () => {
    // "testcompany.com" is not "test.com"
    expect(isValidEmailSyntax("hr@testcompany.com")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isValidEmailSyntax("")).toBe(false);
  });

  it("rejects a whitespace-only string", () => {
    expect(isValidEmailSyntax("   ")).toBe(false);
  });
});

describe("shouldPromoteToPrimary", () => {
  const VALID_EMAIL = "dr.jones@hospital.edu";
  // Stub for the independent (DNS) check so these tests don't need the network.
  const cleanCheck = async () => ({ ok: true, detail: null });
  const dirtyCheck = async () => ({ ok: false, detail: "no mail servers" });

  // --- promotion allowed: high confidence + a self-grade that doesn't veto + a clean independent check ---
  it("promotes when confidence is high, status is valid and the independent check is clean", async () => {
    expect(
      await shouldPromoteToPrimary(
        { email: VALID_EMAIL, confidence: "high", validation_status: "valid" },
        cleanCheck,
      )
    ).toBe(true);
  });

  it("promotes when confidence is high and the model gave no validation_status", async () => {
    expect(
      await shouldPromoteToPrimary({ email: VALID_EMAIL, confidence: "high" }, cleanCheck)
    ).toBe(true);
  });

  it("promotes when confidence is high and validation_status is 'unknown'", async () => {
    expect(
      await shouldPromoteToPrimary(
        { email: VALID_EMAIL, confidence: "high", validation_status: "unknown" },
        cleanCheck,
      )
    ).toBe(true);
  });

  // --- the model is never both guesser and grader ---
  it("does not promote when confidence is 'medium', even with a clean independent check", async () => {
    expect(
      await shouldPromoteToPrimary(
        { email: VALID_EMAIL, confidence: "medium", validation_status: "valid" },
        cleanCheck,
      )
    ).toBe(false);
  });

  it("does not promote when confidence is missing", async () => {
    expect(await shouldPromoteToPrimary({ email: VALID_EMAIL }, cleanCheck)).toBe(false);
  });

  it("does not promote when confidence is 'low'", async () => {
    expect(
      await shouldPromoteToPrimary({ email: VALID_EMAIL, confidence: "low" }, cleanCheck)
    ).toBe(false);
  });

  it("does not promote when validation_status is 'risky'", async () => {
    expect(
      await shouldPromoteToPrimary(
        { email: VALID_EMAIL, confidence: "high", validation_status: "risky" },
        cleanCheck,
      )
    ).toBe(false);
  });

  it("does not promote when validation_status is 'invalid'", async () => {
    expect(
      await shouldPromoteToPrimary(
        { email: VALID_EMAIL, confidence: "high", validation_status: "invalid" },
        cleanCheck,
      )
    ).toBe(false);
  });

  it("does not promote when the independent check fails, even with high confidence", async () => {
    expect(
      await shouldPromoteToPrimary(
        { email: VALID_EMAIL, confidence: "high", validation_status: "valid" },
        dirtyCheck,
      )
    ).toBe(false);
  });

  // --- syntax guards still apply ---
  it("does not promote when email is null", async () => {
    expect(await shouldPromoteToPrimary({ email: null, confidence: "high" }, cleanCheck)).toBe(false);
  });

  it("does not promote when email is undefined", async () => {
    expect(await shouldPromoteToPrimary({ email: undefined, confidence: "high" }, cleanCheck)).toBe(false);
  });

  it("does not promote when email is syntactically invalid", async () => {
    expect(
      await shouldPromoteToPrimary({ email: "notanemail", confidence: "high" }, cleanCheck)
    ).toBe(false);
  });

  it("does not promote when email is on the bogus domain list", async () => {
    expect(
      await shouldPromoteToPrimary({ email: "user@example.com", confidence: "high" }, cleanCheck)
    ).toBe(false);
  });

  it("does not promote when the candidate object itself is null-ish", async () => {
    // The function guards candidate?.email, so a missing property chain is safe.
    expect(await shouldPromoteToPrimary({} as any, cleanCheck)).toBe(false);
  });

  // --- edge / boundary ---
  it("treats an empty email string as invalid (no promotion)", async () => {
    expect(await shouldPromoteToPrimary({ email: "", confidence: "high" }, cleanCheck)).toBe(false);
  });

  it("does not care about extra unknown fields on the candidate", async () => {
    const candidate = {
      email: VALID_EMAIL,
      confidence: "high",
      validation_status: "valid",
      extra_field: "irrelevant",
    };
    expect(await shouldPromoteToPrimary(candidate, cleanCheck)).toBe(true);
  });

  // Regression: 'low' confidence must block even when validation_status is 'valid'.
  it("regression: low confidence blocks promotion even if status is valid", async () => {
    expect(
      await shouldPromoteToPrimary(
        { email: VALID_EMAIL, confidence: "low", validation_status: "valid" },
        cleanCheck,
      )
    ).toBe(false);
  });

  // Regression: 'invalid' status must block even when confidence is high.
  it("regression: invalid status blocks promotion even if confidence is high", async () => {
    expect(
      await shouldPromoteToPrimary(
        { email: VALID_EMAIL, confidence: "high", validation_status: "invalid" },
        cleanCheck,
      )
    ).toBe(false);
  });
});
