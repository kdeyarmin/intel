// What the referral index counts, in words. The weights live in the referral_sources rollup
// (server/lib/rollups/market.ts); tests/referralIndexNote.test.ts keeps this text and that SQL in step.

/** The note shown beside a ranked list of referral sources and on a clinician's card. */
export function referralIndexNote(certificationsLoaded: boolean): string {
  return certificationsLoaded
    ? "Referral index (0–100): up to 50 points for patients certified for home health (15 for being listed, the rest in proportion, full at 40 patients), 20 for Medicare beneficiaries served (full at 500), 15 for average patient risk score (full at 2.5), 15 for eligibility to order home health and hospice."
    : "Referral index (0–100): 50 points for Medicare beneficiaries served (full at 500), 25 for average patient risk score (full at 2.5), 25 for eligibility to order home health and hospice.";
}
