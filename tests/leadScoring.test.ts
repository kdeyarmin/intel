import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCORING_RULES,
  LEGACY_RULE_DESCRIPTIONS,
  RULE_TYPES,
  normalizeRules,
  resolveTerritory,
  territoryFromRows,
  scoreProvider,
  targetGroups,
  totalWeight,
  type ScoringInput,
} from "../server/lib/leadScoring";
// @ts-expect-error -- plain JS module
import { DEFAULT_SCORING_RULES as CLIENT_RULES, CONDITION_FIELDS, parseList } from "../src/lib/scoringRules.js";

const RULES = normalizeRules(DEFAULT_SCORING_RULES as any);

const base = (over: Partial<ScoringInput> = {}): ScoringInput => ({
  npi: "1234567893",
  specialtyGroup: "other",
  specialtyLabel: null,
  beneficiaries: null,
  services: null,
  utilizationYear: null,
  orderReferring: null,
  locations: [],
  affiliations: 0,
  hasEmail: false,
  hasPhone: false,
  ...over,
});

describe("rule definitions", () => {
  it("has the seven rule types the page edits, weighted to 100%", () => {
    expect(RULE_TYPES).toEqual(["specialty_match", "medicare_participation", "patient_volume", "service_intensity", "geographic_priority", "practice_type", "behavioral_health"]);
    expect(totalWeight(RULES)).toBe(100);
    expect(Object.values(LEGACY_RULE_DESCRIPTIONS).sort()).toEqual([...RULE_TYPES].sort());
  });

  it("matches the client mirror", () => {
    expect(JSON.parse(JSON.stringify(CLIENT_RULES))).toEqual(JSON.parse(JSON.stringify(DEFAULT_SCORING_RULES)));
    for (const type of Object.keys(CONDITION_FIELDS)) {
      const def = DEFAULT_SCORING_RULES.find((r) => r.rule_type === type) as any;
      for (const f of CONDITION_FIELDS[type]) expect(Object.keys(def.conditions), `${type}.${f.key}`).toContain(f.key);
    }
    expect(parseList(" pa, oh ;42003 ")).toEqual(["PA", "OH", "42003"]);
  });
});

describe("normalizeRules", () => {
  it("keeps enabled rules with a weight, one per type, with default conditions filled in", () => {
    const rules = normalizeRules([
      { rule_type: "patient_volume", weight: 30, enabled: true },
      { rule_type: "patient_volume", weight: 10, enabled: true },
      { rule_type: "specialty_match", weight: 0, enabled: true },
      { rule_type: "service_intensity", weight: 20, enabled: false },
      { rule_type: "geographic_priority", weight: 15, enabled: true, conditions: { states: "oh, pa", counties: ["42003"] } },
      { rule_type: "bogus", weight: 50 },
      { rule_type: "behavioral_health", weight: "7" as any },
    ]);
    expect(rules.map((r) => [r.rule_type, r.weight])).toEqual([["patient_volume", 30], ["geographic_priority", 15], ["behavioral_health", 7]]);
    expect(resolveTerritory(rules)).toEqual({ states: ["OH", "PA"], counties: ["42003"] });
    // No specialty rule at all: the default groups still decide the signal.
    expect([...targetGroups(rules)]).toContain("family_medicine");
  });

  it("falls back to the default territory, and rejects malformed codes", () => {
    expect(resolveTerritory(RULES)).toEqual({ states: ["PA"], counties: [] });
    const rules = normalizeRules([{ rule_type: "geographic_priority", weight: 10, conditions: { states: ["Pennsylvania", "pa", "p"], counties: ["42003", "4200", "42-003"] } }]);
    expect(resolveTerritory(rules)).toEqual({ states: ["PA"], counties: ["42003"] });
  });
});

describe("territoryFromRows", () => {
  it("keeps the configured states when the Geographic Priority rule is disabled or weighted 0", () => {
    const conditions = { states: ["OH"], counties: [] };
    expect(territoryFromRows([{ rule_type: "geographic_priority", weight: 10, enabled: false, conditions }])).toEqual({ states: ["OH"], counties: [] });
    expect(territoryFromRows([{ rule_type: "geographic_priority", weight: 0, enabled: true, conditions }])).toEqual({ states: ["OH"], counties: [] });
    // The scoring rule itself is off, so it adds no points and names no territory...
    expect(resolveTerritory(normalizeRules([{ rule_type: "geographic_priority", weight: 10, enabled: false, conditions }]))).toEqual({ states: [], counties: [] });
  });

  it("never falls back to a default state when there is no such row", () => {
    expect(territoryFromRows([])).toEqual({ states: [], counties: [] });
    expect(territoryFromRows([{ rule_type: "patient_volume", weight: 20, enabled: true }])).toEqual({ states: [], counties: [] });
  });

  it("prefers the active row over a disabled duplicate, and keeps the default states for a row saved without conditions", () => {
    expect(territoryFromRows([
      { rule_type: "geographic_priority", weight: 10, enabled: false, conditions: { states: ["OH"] } },
      { rule_type: "geographic_priority", weight: 10, enabled: true, conditions: { states: ["NY"], counties: ["36061"] } },
    ])).toEqual({ states: ["NY"], counties: ["36061"] });
    expect(territoryFromRows([{ rule_type: "geographic_priority", weight: 10, enabled: false }])).toEqual({ states: ["PA"], counties: [] });
  });
});

describe("scoreProvider", () => {
  it("scores a strong lead: target specialty, ordering, volume, intensity, priority county, solo, with every reason", () => {
    const r = scoreProvider(base({
      specialtyGroup: "family_medicine", specialtyLabel: "Family Medicine",
      beneficiaries: 620, services: 8000, utilizationYear: "2024",
      orderReferring: { partb: true, dme: true, hha: true, pmd: false, hospice: true },
      locations: [{ state: "PA", county_fips: "42003", city: "Pittsburgh" }],
      affiliations: 2, hasEmail: true, hasPhone: true,
    }), normalizeRules([...DEFAULT_SCORING_RULES.map((d) => ({ ...d })), { rule_type: "geographic_priority", weight: 10, conditions: { states: ["PA"], counties: ["42003"] } }].filter((d, i, a) => a.findIndex((x) => x.rule_type === d.rule_type) === i || d.rule_type !== "geographic_priority") as any));
    expect(r.breakdown.specialty_match.value).toBe(100);
    expect(r.breakdown.medicare_participation.value).toBe(100);
    expect(r.breakdown.patient_volume.value).toBe(100);
    expect(r.breakdown.service_intensity.value).toBe(100);
    expect(r.breakdown.practice_type.value).toBe(100);
    expect(r.breakdown.behavioral_health.value).toBe(50);
    expect(r.reasons).toEqual(expect.arrayContaining([
      "Specialty: Family Medicine",
      "Eligible to order home health, hospice, DME",
      "620 Medicare beneficiaries (2024)",
      expect.stringMatching(/^High service intensity \(12\.9/),
      "1 practice location in the scored territory",
      "Affiliated with 2 facilities",
    ]));
    expect(r.referral_likelihood).toBe(100);
    expect(r.outreach_potential).toBe(100);
    expect(r.data_completeness).toBe(100);
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it("uses the priority county, else the state, else little", () => {
    const rules = normalizeRules([{ rule_type: "geographic_priority", weight: 100, conditions: { states: ["PA"], counties: ["42003"] } }]);
    const at = (loc: any) => scoreProvider(base({ locations: loc ? [loc] : [] }), rules);
    expect(at({ state: "PA", county_fips: "42003", city: "Pittsburgh" }).score).toBe(100);
    expect(at({ state: "PA", county_fips: "42019", city: "Butler" }).score).toBe(70);
    expect(at({ state: "OH", county_fips: null, city: "Toledo" }).score).toBe(20);
    expect(at(null).score).toBe(20);
    // Without priority counties every in-state location is top priority.
    expect(scoreProvider(base({ locations: [{ state: "pa", county_fips: null, city: null }] }), normalizeRules([{ rule_type: "geographic_priority", weight: 100, conditions: { states: ["PA"] } }])).score).toBe(100);
  });

  it("steps patient volume and intensity on fixed cutoffs", () => {
    const vol = normalizeRules([{ rule_type: "patient_volume", weight: 100 }]);
    expect([0, 10, 50, 200, 500].map((b) => scoreProvider(base({ beneficiaries: b }), vol).score)).toEqual([0, 25, 50, 75, 100]);
    const int = normalizeRules([{ rule_type: "service_intensity", weight: 100 }]);
    expect([0, 3, 4, 8, 12].map((per) => scoreProvider(base({ beneficiaries: 100, services: per * 100 }), int).score)).toEqual([0, 0, 40, 70, 100]);
  });

  it("counts Part B billing as participation when the NPI isn't on the Order & Referring list", () => {
    const rules = normalizeRules([{ rule_type: "medicare_participation", weight: 100 }]);
    expect(scoreProvider(base({ beneficiaries: 12 }), rules)).toMatchObject({ score: 100, reasons: ["Bills Medicare Part B", "12 Medicare beneficiaries"] });
    expect(scoreProvider(base({ orderReferring: { partb: true, dme: false, hha: false, pmd: false, hospice: false } }), rules)).toMatchObject({ score: 100, reasons: ["On the Medicare Order & Referring list"] });
    expect(scoreProvider(base(), rules).score).toBe(0);
  });

  it("treats specialty by group, with the groups configurable", () => {
    const rules = normalizeRules([{ rule_type: "specialty_match", weight: 100, conditions: { groups: ["cardiology"] } }, { rule_type: "behavioral_health", weight: 0 }]);
    expect(scoreProvider(base({ specialtyGroup: "cardiology", specialtyLabel: "Cardiology" }), rules).score).toBe(100);
    expect(scoreProvider(base({ specialtyGroup: "family_medicine" }), rules).score).toBe(40);
    const bh = normalizeRules([{ rule_type: "behavioral_health", weight: 100 }]);
    expect(scoreProvider(base({ specialtyGroup: "psychiatry" }), bh).score).toBe(100);
    expect(scoreProvider(base({ specialtyGroup: "behavioral_health" }), bh).score).toBe(100);
    expect(scoreProvider(base({ specialtyGroup: "cardiology" }), bh).score).toBe(50);
  });

  it("prefers solo and small practices", () => {
    const rules = normalizeRules([{ rule_type: "practice_type", weight: 100 }]);
    const n = (k: number) => scoreProvider(base({ locations: Array.from({ length: k }, () => ({ state: "PA", county_fips: null, city: null })) }), rules);
    expect([1, 3, 5, 6].map((k) => n(k).score)).toEqual([100, 80, 60, 30]);
    expect(n(2).reasons).toContain("2 practice locations in the scored territory");
  });

  it("reports completeness and reachability separately from the score", () => {
    const r = scoreProvider(base({ hasPhone: true, locations: [{ state: "PA", county_fips: null, city: null }] }), RULES);
    expect(r.outreach_potential).toBe(50);
    expect(r.data_completeness).toBe(33);
    expect(r.referral_likelihood).toBe(0);
  });

  it("scales with the weights and stays within 0–100", () => {
    const half = normalizeRules(DEFAULT_SCORING_RULES.map((d) => ({ ...d, weight: d.weight / 2 })) as any);
    const full = scoreProvider(base({ specialtyGroup: "psychiatry" }), RULES);
    const halved = scoreProvider(base({ specialtyGroup: "psychiatry" }), half);
    expect(halved.score).toBe(Math.round(full.score / 2));
    expect(Object.keys(full.breakdown)).toEqual(RULE_TYPES);
  });
});
