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
