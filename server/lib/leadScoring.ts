// The CareMetric referral propensity score (0–100), computed on the server
// for every individual provider located in the configured states by the job
// in server/lib/leadScoringJob.ts. Pure: no DB access, so the rules can be
// unit-tested and the Scoring Rules page can explain each number.
//
// The seven rule types match the scoring_rules rows the page edits; only
// their weights and Conditions are configurable. Each signal's cutoffs are
// fixed here so a weight means the same thing on every run.
//
// src/lib/scoringRules.js mirrors DEFAULT_SCORING_RULES (a test keeps the
// two identical).

export interface ScoringRuleRow {
  id?: number;
  rule_type?: string | null;
  weight?: number | null;
  enabled?: boolean | null;
  conditions?: Record<string, unknown> | null;
  description?: string | null;
}

export interface ScoringRule {
  rule_type: string;
  weight: number;
  conditions: Record<string, unknown>;
}

export const DEFAULT_SCORING_RULES = [
  { name: "Specialty Match", rule_type: "specialty_match", weight: 20, description: "Primary-care and geriatric specialties that refer to post-acute care (the groups are in Conditions)", conditions: { groups: ["family_medicine", "internal_medicine", "geriatrics", "nurse_practitioner", "physician_assistant", "psychiatry"] } },
  { name: "Medicare Participation", rule_type: "medicare_participation", weight: 15, description: "On the CMS Order & Referring list, or billing Medicare Part B" },
  { name: "Patient Volume", rule_type: "patient_volume", weight: 20, description: "Medicare beneficiaries served (Physician & Other Practitioners by Provider)" },
  { name: "Service Intensity", rule_type: "service_intensity", weight: 15, description: "Medicare services per beneficiary" },
  { name: "Geographic Priority", rule_type: "geographic_priority", weight: 10, description: "Practice location in the target states and counties (Conditions); scoring covers the listed states", conditions: { states: ["PA"], counties: [] } },
  { name: "Practice Type", rule_type: "practice_type", weight: 10, description: "Solo or small group practice preference" },
  { name: "Behavioral Health Potential", rule_type: "behavioral_health", weight: 10, description: "Mental health referral likelihood" },
] as const;

export const RULE_TYPES = DEFAULT_SCORING_RULES.map((r) => r.rule_type);

/**
 * Descriptions the Scoring Rules page used to seed before rule_type was
 * saved; rows carrying one are repaired to that rule type.
 */
export const LEGACY_RULE_DESCRIPTIONS: Record<string, string> = {
  "Family Medicine, Internal Med, NP, Geriatrics, Psychiatry": "specialty_match",
  "Active Medicare ordering eligibility": "medicare_participation",
  "Estimated Medicare beneficiary count": "patient_volume",
  "Service-per-patient intensity indicators": "service_intensity",
  "Pennsylvania county location": "geographic_priority",
  "Solo or small group practice preference": "practice_type",
  "Mental health referral likelihood": "behavioral_health",
};

const defaultsFor = (ruleType: string): Record<string, unknown> =>
  ({ ...((DEFAULT_SCORING_RULES.find((r) => r.rule_type === ruleType) as any)?.conditions ?? {}) });

const listOf = (value: unknown): string[] =>
  (Array.isArray(value) ? value : typeof value === "string" ? value.split(/[\s,;]+/) : [])
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);

/**
 * The enabled rules with a usable weight, one per rule type, conditions
 * merged over the defaults (a rule saved without conditions keeps the
 * default territory and specialty groups).
 */
export function normalizeRules(rows: ScoringRuleRow[]): ScoringRule[] {
  const out = new Map<string, ScoringRule>();
  for (const row of rows) {
    const type = String(row.rule_type ?? "");
    if (!RULE_TYPES.includes(type as any) || row.enabled === false || out.has(type)) continue;
    const weight = Number(row.weight);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const given = row.conditions && typeof row.conditions === "object" && !Array.isArray(row.conditions) ? row.conditions : {};
    out.set(type, { rule_type: type, weight, conditions: { ...defaultsFor(type), ...given } });
  }
  return [...out.values()];
}

export interface Territory {
  states: string[];
  counties: string[];
}

function territoryOf(c: Record<string, unknown>): Territory {
  const states = [...new Set(listOf(c.states).map((s) => s.toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s)))];
  const counties = [...new Set(listOf(c.counties).map((s) => s.replace(/\D/g, "")).filter((s) => /^\d{5}$/.test(s)))];
  return { states, counties };
}

/**
 * The states scored and the priority counties, from the active
 * geographic_priority rule's conditions. With no active rule there is no
 * territory: it never falls back to a default state.
 */
export function resolveTerritory(rules: ScoringRule[]): Territory {
  const geo = rules.find((r) => r.rule_type === "geographic_priority");
  return geo ? territoryOf(geo.conditions) : { states: [], counties: [] };
}

/**
 * The territory a scoring run covers, from the scoring_rules rows. The
 * territory decides which providers are scored at all, so it is read from the
 * Geographic Priority row whether or not that rule is enabled or weighted:
 * turning the rule off stops it adding points, it doesn't change the scope
 * (and doesn't silently put the scope back to Pennsylvania). A row saved
 * without conditions keeps the default states; with no such row there is no
 * territory and the run fails and says so.
 */
export function territoryFromRows(rows: ScoringRuleRow[]): Territory {
  const geo = rows.filter((r) => String(r.rule_type ?? "") === "geographic_priority");
  const row = geo.find((r) => r.enabled !== false && Number(r.weight) > 0) ?? geo[0];
  if (!row) return { states: [], counties: [] };
  const given = row.conditions && typeof row.conditions === "object" && !Array.isArray(row.conditions) ? row.conditions : {};
  return territoryOf({ ...defaultsFor("geographic_priority"), ...given });
}

/** The specialty group keys the specialty_match rule targets. */
export function targetGroups(rules: ScoringRule[]): Set<string> {
  const rule = rules.find((r) => r.rule_type === "specialty_match");
  const c = rule?.conditions ?? defaultsFor("specialty_match");
  return new Set(listOf(c.groups).map((g) => g.toLowerCase()));
}

export function totalWeight(rules: ScoringRule[]): number {
  return rules.reduce((sum, r) => sum + r.weight, 0);
}

export interface ScoringLocation {
  state: string | null;
  county_fips: string | null;
  city: string | null;
}

export interface ScoringInput {
  npi: string;
  /** From specialtyGroupFor() on the primary taxonomy; "other" when unknown. */
  specialtyGroup: string | null;
  specialtyLabel: string | null;
  /** Latest Physician & Other Practitioners by Provider row. */
  beneficiaries: number | null;
  services: number | null;
  utilizationYear: string | null;
  /** CMS Order & Referring flags; null when the NPI isn't on the list. */
  orderReferring: { partb: boolean; dme: boolean; hha: boolean; pmd: boolean; hospice: boolean } | null;
  /** Practice locations in the scored states. */
  locations: ScoringLocation[];
  /** Doctors & Clinicians facility affiliations (hospitals, SNFs, …). */
  affiliations: number;
  hasEmail: boolean;
  hasPhone: boolean;
}

export interface ScoreResult {
  npi: string;
  score: number;
  /** 0–100: how likely the provider is to generate post-acute referrals (participation, volume, intensity). */
  referral_likelihood: number;
  /** 0–100: how reachable the provider is (contact data and a known location). */
  outreach_potential: number;
  /** 0–100: share of the inputs that had data. */
  data_completeness: number;
  breakdown: Record<string, { value: number; weight: number; contribution: number }>;
  reasons: string[];
}

const BEHAVIORAL_GROUPS = new Set(["behavioral_health", "psychiatry"]);

/** Scores one provider against the rules. Weights are applied as given; 100% total keeps scores on a 0–100 scale. */
export function scoreProvider(input: ScoringInput, rules: ScoringRule[]): ScoreResult {
  const territory = resolveTerritory(rules);
  const groups = targetGroups(rules);
  const values: Record<string, number> = {};
  const reasons: string[] = [];

  // 1. Specialty match (by NUCC group, never by free text).
  const group = (input.specialtyGroup || "other").toLowerCase();
  const specialtyMatch = groups.has(group);
  values.specialty_match = specialtyMatch ? 100 : 40;
  if (specialtyMatch) reasons.push(`Specialty: ${input.specialtyLabel || group}`);

  // 2. Medicare participation: Order & Referring, else Part B utilization.
  const or = input.orderReferring;
  const participates = !!(or && (or.partb || or.hha || or.hospice || or.dme || or.pmd)) || (input.beneficiaries ?? 0) > 0;
  values.medicare_participation = participates ? 100 : 0;
  if (or) {
    const can = [or.hha && "home health", or.hospice && "hospice", or.dme && "DME"].filter(Boolean) as string[];
    reasons.push(can.length ? `Eligible to order ${can.join(", ")}` : "On the Medicare Order & Referring list");
  } else if (participates) {
    reasons.push("Bills Medicare Part B");
  }

  // 3. Patient volume (Medicare beneficiaries in the latest year).
  const volume = Math.max(0, input.beneficiaries ?? 0);
  values.patient_volume = volume >= 500 ? 100 : volume >= 200 ? 75 : volume >= 50 ? 50 : volume > 0 ? 25 : 0;
  if (volume > 0) reasons.push(`${volume.toLocaleString("en-US")} Medicare beneficiaries${input.utilizationYear ? ` (${input.utilizationYear})` : ""}`);

  // 4. Service intensity (services per beneficiary).
  const intensity = volume > 0 ? Math.max(0, input.services ?? 0) / volume : 0;
  values.service_intensity = intensity >= 12 ? 100 : intensity >= 8 ? 70 : intensity >= 4 ? 40 : 0;
  if (intensity >= 8) reasons.push(`High service intensity (${intensity.toFixed(1)} services per beneficiary)`);

  // 5. Geographic priority: a priority county, else a scored state.
  const inCounty = territory.counties.length > 0 && input.locations.some((l) => l.county_fips && territory.counties.includes(l.county_fips));
  const inState = input.locations.some((l) => l.state && territory.states.includes(l.state.toUpperCase()));
  values.geographic_priority = inCounty ? 100 : inState ? (territory.counties.length ? 70 : 100) : 20;
  if (inCounty || inState) {
    const loc = input.locations.find((l) => inCounty ? l.county_fips && territory.counties.includes(l.county_fips) : l.state && territory.states.includes(l.state.toUpperCase()));
    reasons.push(`${inCounty ? "Priority county" : "Target state"}: ${[loc?.city, loc?.state].filter(Boolean).join(", ")}`);
  }

  // 6. Practice type (locations in the scored states).
  const locCount = input.locations.length;
  values.practice_type = locCount <= 1 ? 100 : locCount <= 3 ? 80 : locCount <= 5 ? 60 : 30;
  // The signal is how many practice locations the provider has in the scored states, not the size of a group:
  // NPPES has no practice-size field, and one location can be a solo office or a clinic of fifty. Say what is measured.
  if (locCount >= 1 && locCount <= 3) reasons.push(`${locCount} practice location${locCount === 1 ? "" : "s"} in the scored territory`);
  if (input.affiliations > 0) reasons.push(`Affiliated with ${input.affiliations} facilit${input.affiliations === 1 ? "y" : "ies"}`);

  // 7. Behavioral health potential.
  const behavioral = BEHAVIORAL_GROUPS.has(group);
  values.behavioral_health = behavioral ? 100 : 50;
  if (behavioral) reasons.push("Behavioral health specialty");

  const breakdown: ScoreResult["breakdown"] = {};
  let score = 0;
  for (const rule of rules) {
    const value = values[rule.rule_type];
    if (value == null) continue;
    const contribution = (value * rule.weight) / 100;
    score += contribution;
    breakdown[rule.rule_type] = { value, weight: rule.weight, contribution: Math.round(contribution) };
  }

  const referralParts = [values.medicare_participation, values.patient_volume, values.service_intensity];
  const referral_likelihood = Math.round(referralParts.reduce((a, b) => a + b, 0) / referralParts.length);
  const outreach_potential = Math.round((input.hasEmail ? 50 : 0) + (input.hasPhone ? 25 : 0) + (locCount > 0 ? 25 : 0));
  const present = [input.specialtyGroup && group !== "other", input.beneficiaries != null, input.orderReferring != null, locCount > 0, input.hasEmail, input.hasPhone];
  const data_completeness = Math.round((present.filter(Boolean).length / present.length) * 100);

  return {
    npi: input.npi,
    score: Math.max(0, Math.min(100, Math.round(score))),
    referral_likelihood,
    outreach_potential,
    data_completeness,
    breakdown,
    reasons,
  };
}
