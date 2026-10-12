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
//     when the model is highly confident AND an independent (non-LLM) check
//     agrees the address looks deliverable; the model is never both guesser
//     and grader
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

export interface IndependentEmailCheck {
  ok: boolean;
  detail: string | null;
}

/**
 * Independent (non-LLM) validation of an inferred address: DNS/MX-based
 * scoring of the domain from server/lib/emailVerification. A domain that
 * accepts mail is "clean"; anything else (risky, invalid, or uncheckable)
 * keeps the address as a candidate only. Imported lazily: emailVerification
 * imports isValidEmailSyntax from this module, so a static import would be
 * circular.
 */
export async function independentlyValidateEmail(email: string): Promise<IndependentEmailCheck> {
  try {
    const domain = String(email || "").trim().split("@")[1]?.toLowerCase();
    if (!domain) return { ok: false, detail: "no domain" };
    const { checkDomainCached, scoreEmail } = await import("../lib/emailVerification");
    const scored = scoreEmail(email, await checkDomainCached(domain));
    return scored.status === "valid"
      ? { ok: true, detail: null }
      : { ok: false, detail: scored.reasons?.[0] || scored.status };
  } catch (e: any) {
    // A DNS hiccup must neither promote the address nor crash the batch.
    return { ok: false, detail: "validation check failed" };
  }
}

/**
 * Decide whether an inferred email is trustworthy enough to populate the
 * primary providers.email field. Conservative by design:
 *   - the model's self-grade can only veto, never approve: anything it rates
 *     below "high" confidence, or flags "invalid"/"risky", stays a candidate;
 *   - promotion additionally requires a clean independent (DNS/MX) check, so
 *     the model is never both guesser and grader.
 *
 * `validate` is injectable so tests don't need live DNS.
 */
export async function shouldPromoteToPrimary(
  candidate: {
    email?: string | null;
    confidence?: string | null;
    validation_status?: string | null;
  },
  validate: (email: string) => Promise<IndependentEmailCheck> = independentlyValidateEmail,
): Promise<boolean> {
  if (!candidate?.email || !isValidEmailSyntax(candidate.email)) return false;
  if (candidate.confidence !== "high") return false;
  if (candidate.validation_status === "invalid" || candidate.validation_status === "risky") return false;
  return (await validate(candidate.email)).ok;
}
