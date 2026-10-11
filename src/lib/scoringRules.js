// Mirror of the rule definitions in server/lib/leadScoring.ts
// (tests/leadScoring.test.ts keeps the two identical). The score itself is
// computed on the server by the lead scoring job; this file only describes
// the rules so the Scoring Rules page can seed, label and edit them.

export const DEFAULT_SCORING_RULES = [
  { name: 'Specialty Match', rule_type: 'specialty_match', weight: 20, description: 'Primary-care and geriatric specialties that refer to post-acute care (the groups are in Conditions)', conditions: { groups: ['family_medicine', 'internal_medicine', 'geriatrics', 'nurse_practitioner', 'physician_assistant', 'psychiatry'] } },
  { name: 'Medicare Participation', rule_type: 'medicare_participation', weight: 15, description: 'On the CMS Order & Referring list, or billing Medicare Part B' },
  { name: 'Patient Volume', rule_type: 'patient_volume', weight: 20, description: 'Medicare beneficiaries served (Physician & Other Practitioners by Provider)' },
  { name: 'Service Intensity', rule_type: 'service_intensity', weight: 15, description: 'Medicare services per beneficiary' },
  { name: 'Geographic Priority', rule_type: 'geographic_priority', weight: 10, description: 'Practice location in the target states and counties (Conditions); scoring covers the listed states', conditions: { states: ['PA'], counties: [] } },
  { name: 'Practice Type', rule_type: 'practice_type', weight: 10, description: 'Solo or small group practice preference' },
  { name: 'Behavioral Health Potential', rule_type: 'behavioral_health', weight: 10, description: 'Mental health referral likelihood' },
];

/** The rules whose Conditions the page lets you edit, and which list each one holds. */
export const CONDITION_FIELDS = {
  specialty_match: [{ key: 'groups', label: 'Specialty groups', hint: 'Group keys from the specialty list, comma-separated' }],
  geographic_priority: [
    { key: 'states', label: 'States', hint: 'Two-letter state codes, comma-separated; providers in these states are scored' },
    { key: 'counties', label: 'Priority counties', hint: 'Five-digit county FIPS codes, comma-separated (optional)' },
  ],
};

/** "pa, OH ,42003" → ["PA", "OH", "42003"]. */
export function parseList(text) {
  return String(text ?? '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean).map((s) => s.toUpperCase());
}
