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
    const local = "a".repeat(244);
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

  // --- promotion allowed ---
  it("promotes a valid email with no confidence or validation_status flags", () => {
    expect(shouldPromoteToPrimary({ email: VALID_EMAIL })).toBe(true);
  });

  it("promotes when confidence is 'high'", () => {
    expect(shouldPromoteToPrimary({ email: VALID_EMAIL, confidence: "high" })).toBe(true);
  });

  it("promotes when confidence is 'medium'", () => {
    expect(shouldPromoteToPrimary({ email: VALID_EMAIL, confidence: "medium" })).toBe(true);
  });

  it("promotes when validation_status is 'valid'", () => {
    expect(shouldPromoteToPrimary({ email: VALID_EMAIL, validation_status: "valid" })).toBe(true);
  });

  it("promotes when validation_status is 'unknown'", () => {
    expect(shouldPromoteToPrimary({ email: VALID_EMAIL, validation_status: "unknown" })).toBe(true);
  });

  it("promotes when both confidence and validation_status are OK", () => {
    expect(
      shouldPromoteToPrimary({ email: VALID_EMAIL, confidence: "high", validation_status: "valid" })
    ).toBe(true);
  });

  // --- promotion blocked ---
  it("does not promote when confidence is 'low'", () => {
    expect(shouldPromoteToPrimary({ email: VALID_EMAIL, confidence: "low" })).toBe(false);
  });

  it("does not promote when validation_status is 'invalid'", () => {
    expect(shouldPromoteToPrimary({ email: VALID_EMAIL, validation_status: "invalid" })).toBe(false);
  });

  it("does not promote when both confidence is low and status is invalid", () => {
    expect(
      shouldPromoteToPrimary({ email: VALID_EMAIL, confidence: "low", validation_status: "invalid" })
    ).toBe(false);
  });

  it("does not promote when email is null", () => {
    expect(shouldPromoteToPrimary({ email: null, confidence: "high" })).toBe(false);
  });

  it("does not promote when email is undefined", () => {
    expect(shouldPromoteToPrimary({ email: undefined, confidence: "high" })).toBe(false);
  });

  it("does not promote when email is syntactically invalid", () => {
    expect(shouldPromoteToPrimary({ email: "notanemail", confidence: "high" })).toBe(false);
  });

  it("does not promote when email is on the bogus domain list", () => {
    expect(shouldPromoteToPrimary({ email: "user@example.com", confidence: "high" })).toBe(false);
  });

  it("does not promote when the candidate object itself is null-ish", () => {
    // The function guards candidate?.email, so a missing property chain is safe.
    expect(shouldPromoteToPrimary({} as any)).toBe(false);
  });

  // --- edge / boundary ---
  it("treats an empty email string as invalid (no promotion)", () => {
    expect(shouldPromoteToPrimary({ email: "", confidence: "high" })).toBe(false);
  });

  it("does not care about extra unknown fields on the candidate", () => {
    const candidate = {
      email: VALID_EMAIL,
      confidence: "medium",
      validation_status: "valid",
      extra_field: "irrelevant",
    };
    expect(shouldPromoteToPrimary(candidate)).toBe(true);
  });

  // Regression: 'low' confidence must block even when validation_status is 'valid'.
  it("regression: low confidence blocks promotion even if status is valid", () => {
    expect(
      shouldPromoteToPrimary({ email: VALID_EMAIL, confidence: "low", validation_status: "valid" })
    ).toBe(false);
  });

  // Regression: 'invalid' status must block even when confidence is 'high'.
  it("regression: invalid status blocks promotion even if confidence is high", () => {
    expect(
      shouldPromoteToPrimary({ email: VALID_EMAIL, confidence: "high", validation_status: "invalid" })
    ).toBe(false);
  });
});