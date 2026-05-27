import { describe, it, expect } from "vitest";
import { isValidEmailSyntax, shouldPromoteToPrimary, AI_EMAIL_SOURCE } from "../server/functions/emailValidation";

describe("isValidEmailSyntax", () => {
  it("accepts well-formed addresses", () => {
    expect(isValidEmailSyntax("jane.doe@hospital.org")).toBe(true);
    expect(isValidEmailSyntax("info@clinic.co")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmailSyntax("not-an-email")).toBe(false);
    expect(isValidEmailSyntax("missing@domain")).toBe(false);
    expect(isValidEmailSyntax("@nodomain.com")).toBe(false);
    expect(isValidEmailSyntax("spaces in@email.com")).toBe(false);
    expect(isValidEmailSyntax("")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isValidEmailSyntax(null)).toBe(false);
    expect(isValidEmailSyntax(undefined)).toBe(false);
    expect(isValidEmailSyntax(123 as any)).toBe(false);
  });

  it("rejects placeholder/example domains the model tends to invent", () => {
    expect(isValidEmailSyntax("dr.smith@example.com")).toBe(false);
    expect(isValidEmailSyntax("contact@domain.com")).toBe(false);
    expect(isValidEmailSyntax("a@test.com")).toBe(false);
  });
});

describe("shouldPromoteToPrimary", () => {
  it("promotes plausible, non-low-confidence addresses", () => {
    expect(shouldPromoteToPrimary({ email: "jane@hospital.org", confidence: "high", validation_status: "valid" })).toBe(true);
    expect(shouldPromoteToPrimary({ email: "jane@hospital.org", confidence: "medium", validation_status: "risky" })).toBe(true);
  });

  it("never promotes low-confidence guesses", () => {
    expect(shouldPromoteToPrimary({ email: "jane@hospital.org", confidence: "low", validation_status: "valid" })).toBe(false);
  });

  it("never promotes AI-flagged invalid addresses", () => {
    expect(shouldPromoteToPrimary({ email: "jane@hospital.org", confidence: "high", validation_status: "invalid" })).toBe(false);
  });

  it("never promotes syntactically invalid addresses", () => {
    expect(shouldPromoteToPrimary({ email: "garbage", confidence: "high", validation_status: "valid" })).toBe(false);
    expect(shouldPromoteToPrimary({ email: null, confidence: "high", validation_status: "valid" })).toBe(false);
  });
});

describe("AI_EMAIL_SOURCE", () => {
  it("is the provenance tag used for inferred emails", () => {
    expect(AI_EMAIL_SOURCE).toBe("ai_inferred");
  });
});

describe("isValidEmailSyntax – boundary and edge cases", () => {
  it("accepts short but syntactically valid addresses (6 chars)", () => {
    // "a@x.yz" is 6 characters — smallest that passes the TLD >=2 constraint
    expect(isValidEmailSyntax("a@x.yz")).toBe(true);
  });

  it("rejects addresses below the 5-character minimum", () => {
    // "a@bc" is 4 characters (and also lacks TLD) — below the hard length floor
    expect(isValidEmailSyntax("a@bc")).toBe(false);
    // Length-check guard: a string of 4 chars is always rejected
    expect(isValidEmailSyntax("xxxx")).toBe(false);
  });

  it("rejects addresses longer than 254 characters", () => {
    // "@h.org" suffix is 6 chars → local must be 249 chars to hit 255 total
    const local255 = "a".repeat(249);
    const addr255 = `${local255}@h.org`; // 249 + 6 = 255 chars
    expect(isValidEmailSyntax(addr255)).toBe(false);
  });

  it("accepts addresses exactly at 254 characters", () => {
    // "@h.org" suffix is 6 chars → local of 248 chars → total 254
    const local254 = "a".repeat(248);
    const addr254 = `${local254}@h.org`; // 248 + 6 = 254 chars
    expect(isValidEmailSyntax(addr254)).toBe(true);
  });

  it("trims leading/trailing whitespace before validating", () => {
    expect(isValidEmailSyntax("  jane@hospital.org  ")).toBe(true);
    expect(isValidEmailSyntax("\tjane@hospital.org\n")).toBe(true);
  });

  it("rejects bogus domains case-insensitively", () => {
    expect(isValidEmailSyntax("dr.smith@EXAMPLE.COM")).toBe(false);
    expect(isValidEmailSyntax("dr.smith@Example.Org")).toBe(false);
    expect(isValidEmailSyntax("user@TEST.COM")).toBe(false);
    expect(isValidEmailSyntax("user@NONE.COM")).toBe(false);
  });

  it("rejects addresses with no TLD (domain lacks dot)", () => {
    expect(isValidEmailSyntax("user@nodot")).toBe(false);
  });

  it("rejects addresses with single-char TLD", () => {
    expect(isValidEmailSyntax("user@host.c")).toBe(false);
  });

  it("accepts addresses with subdomains", () => {
    expect(isValidEmailSyntax("user@mail.hospital.org")).toBe(true);
  });

  it("rejects objects and arrays", () => {
    expect(isValidEmailSyntax({} as any)).toBe(false);
    expect(isValidEmailSyntax([] as any)).toBe(false);
    expect(isValidEmailSyntax(true as any)).toBe(false);
  });
});

describe("shouldPromoteToPrimary – edge cases", () => {
  it("returns false when candidate object is empty", () => {
    expect(shouldPromoteToPrimary({})).toBe(false);
  });

  it("promotes when confidence is undefined (undefined ≠ 'low') and everything else passes", () => {
    // undefined confidence is NOT "low", so it should be promoted if everything else passes
    expect(shouldPromoteToPrimary({ email: "jane@hospital.org", confidence: undefined, validation_status: "valid" })).toBe(true);
  });

  it("returns false when validation_status is 'invalid' regardless of confidence", () => {
    expect(shouldPromoteToPrimary({ email: "jane@hospital.org", confidence: "high", validation_status: "invalid" })).toBe(false);
    expect(shouldPromoteToPrimary({ email: "jane@hospital.org", confidence: "medium", validation_status: "invalid" })).toBe(false);
  });

  it("returns true when validation_status is null (unknown — not flagged invalid)", () => {
    expect(shouldPromoteToPrimary({ email: "jane@hospital.org", confidence: "high", validation_status: null })).toBe(true);
  });

  it("returns false for a placeholder-domain email even with high confidence", () => {
    expect(shouldPromoteToPrimary({ email: "dr@example.com", confidence: "high", validation_status: "valid" })).toBe(false);
  });

  it("handles risky validation_status (not invalid — should still promote)", () => {
    expect(shouldPromoteToPrimary({ email: "dr@hospital.org", confidence: "medium", validation_status: "risky" })).toBe(true);
  });
});
