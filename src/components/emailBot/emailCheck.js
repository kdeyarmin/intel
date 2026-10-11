// A provider's email counts as checked once a DNS check of the current address
// has run (email_analyzed_at). The AI email search writes its own guess at the
// status without one, so those addresses are still unchecked. Same marker as
// bulkVerifyEmails' modes (server/functions/verification.ts).

/** The DNS check's verdict on the provider's current email, or null if it hasn't been checked. */
export function checkedEmailStatus(provider) {
  if (!provider?.email || !provider.email_analyzed_at) return null;
  return provider.email_validation_status || null;
}

/** Counts for the verification panel; checked + unchecked = withEmail. */
export function emailCheckStats(providers) {
  const withEmail = providers.filter(p => p.email);
  const checked = withEmail.filter(p => p.email_analyzed_at);
  const count = (status) => checked.filter(p => p.email_validation_status === status).length;
  return {
    withEmail: withEmail.length,
    analyzed: checked.length,
    unanalyzed: withEmail.length - checked.length,
    valid: count('valid'),
    risky: count('risky'),
    invalid: count('invalid'),
  };
}
