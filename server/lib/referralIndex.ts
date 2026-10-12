// What the referral and hospice indexes count, in words. The weights live in the referral_sources rollup
// (server/lib/rollups/market.ts); tests/referralIndexNote.test.ts and tests/hospiceIndexNote.test.ts keep
// this text and that SQL in step.

/** The note shown beside a ranked list of referral sources and on a clinician's card. */
export function referralIndexNote(certificationsLoaded: boolean): string {
  return certificationsLoaded
    ? "Referral index (0–100): up to 50 points for patients certified for home health (15 for being listed, the rest in proportion, full at 40 patients), 20 for Medicare beneficiaries served (full at 500), 15 for average patient risk score (full at 2.5), 15 for eligibility to order home health and hospice."
    : "Referral index (0–100): 50 points for Medicare beneficiaries served (full at 500), 25 for average patient risk score (full at 2.5), 25 for eligibility to order home health and hospice.";
}

/**
 * The note shown when the referral list is filtered to clinicians who can order hospice.
 * Hospice care-plan oversight (G0182) is only a bonus: CMS lists a few hundred clinicians for it.
 */
export function hospiceIndexNote(certificationsLoaded: boolean): string {
  return certificationsLoaded
    ? "Hospice index (0–100): specialty fit up to 35 (none for radiology, pathology and similar; full for hospice, palliative and geriatric), 25 for the share of patients with Alzheimer’s, heart failure or COPD (full at 25%), 15 for average patient risk score (full at 2.5), 15 for Medicare volume among referring specialties (full at 400 patients), and up to 10 for hospice care-plan oversight (4 for being listed, the rest in proportion, full at 20). CMS lists only a few hundred clinicians for that oversight code, so it is a bonus, not the rank."
    : "Hospice index (0–100): specialty fit up to 40 (none for radiology, pathology and similar), 25 for the share of patients with Alzheimer’s, heart failure or COPD (full at 25%), 20 for average patient risk score (full at 2.5), 15 for Medicare volume among referring specialties (full at 400 patients). Hospice care-plan oversight is not in the index yet. The rank does not rest on that count, raw volume, or ordering eligibility.";
}
