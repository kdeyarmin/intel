// Email validation + provenance helpers shared by the email-search and
// provider-intelligence bots.
//
// These bots ask an LLM to *infer* likely email addresses from name/domain
// patterns and to self-rate them. That output is a hypothesis, not a verified
// address. Historically the top guess (including ones the model rated
// confidence:"low") was written straight onto providers.email and surfaced in
// the UI indistinguishable from a real, sourced address. These helpers enforce a
// clear policy:
//   - reject anything that isn't even syntactically a valid address
//   - only *promote* an inferred address to the primary providers.email field
//     when it is plausibly deliverable (not low-confidence, not AI-flagged invalid)
//   - everything else is retained as a candidate suggestion only
//   - all AI-derived emails are tagged with provenance so the UI can mark them
//     as unverified.

export const AI_EMAIL_SOURCE = "ai_inferred";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmailSyntax(email: unknown): boolean {
  if (typeof email !== "string") return false;
  const e = email.trim();
  if (e.length < 5 || e.length > 254) return false;
  if (!EMAIL_RE.test(e)) return false;
  // Reject obvious placeholder/example domains the model likes to invent.
  const domain = e.split("@")[1]?.toLowerCase() || "";
  const bogus = ["example.com", "example.org", "domain.com", "email.com", "test.com", "none.com"];
  if (bogus.includes(domain)) return false;
  return true;
}

/**
 * Decide whether an inferred email is trustworthy enough to populate the primary
 * providers.email field. Conservative by design: a low-confidence guess or an
 * AI-flagged "invalid" address is kept only as a candidate, never promoted.
 */
export function shouldPromoteToPrimary(candidate: {
  email?: string | null;
  confidence?: string | null;
  validation_status?: string | null;
}): boolean {
  if (!candidate?.email || !isValidEmailSyntax(candidate.email)) return false;
  if (candidate.validation_status === "invalid") return false;
  if (candidate.confidence === "low") return false;
  return true;
}
