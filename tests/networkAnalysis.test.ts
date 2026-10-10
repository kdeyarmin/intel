import { describe, it, expect } from "vitest";
import {
  buildNetworkAnalysis,
  edgesFromReferrals,
  findNetworkGaps,
  ruleRecommendations,
  sanitizeRecommendations,
  type ProviderInfo,
} from "../server/lib/networkAnalysis";
import { buildGraph, nodeStats } from "../server/lib/networkGraph";

const info = new Map<string, ProviderInfo>([
  ["P1", { npi: "P1", name: "Dr. One", specialty: "Cardiology" }],
  ["P2", { npi: "P2", name: "Dr. Two", specialty: "Cardiology" }],
  ...["C1", "C2", "C3", "C4", "C5", "C6"].map((n) => [n, { npi: n, name: `Card ${n}`, specialty: "Cardiology" }] as [string, ProviderInfo]),
  ...["O1", "O2", "O3", "O4", "O5"].map((n) => [n, { npi: n, name: `Onc ${n}`, specialty: "Oncology" }] as [string, ProviderInfo]),
]);
const seeds = [...info.keys()];

describe("edgesFromReferrals", () => {
  it("keeps one edge per pair (largest yearly volume) and drops incomplete rows", () => {
    const edges = edgesFromReferrals([
      { npi: "A", referred_to_npi: "B", total_referrals: 10 },
      { npi: "A", referred_to_npi: "B", total_referrals: "25" },
      { npi: "A", referred_to_npi: null, total_referrals: 5 },
      { npi: "A", referred_to_npi: "A", total_referrals: 5 },
      { npi: "B", referred_to_npi: "A", total_referrals: null },
    ]);
    expect(edges).toEqual([{ source: "A", target: "B", weight: 25 }, { source: "B", target: "A", weight: 1 }]);
  });
});

describe("network analysis", () => {
  const edges = [
    { source: "P1", target: "HOSP", weight: 40 },
    { source: "P2", target: "HOSP", weight: 20 },
    { source: "C1", target: "P1", weight: 5 },
    { source: "O1", target: "HOSP", weight: 8 },
    { source: "HOSP", target: "P1", weight: 3 },
  ];

  it("ranks in-scope influencers with the fields the page reads", () => {
    const a = buildNetworkAnalysis({ edges, seeds, info, scope: { type: "state", label: "PA", seed_count: seeds.length, truncated: false } });
    expect(a.influencers[0]).toMatchObject({ npi: "P1", name: "Dr. One", influence_score: 100, outbound_referrals: 40, network_size: 2 });
    expect(a.influencers.map((i) => i.npi)).not.toContain("HOSP"); // out of scope
    for (const i of a.influencers) expect(typeof i.influence_score).toBe("number");
    expect(a.network_metrics).toMatchObject({ total_providers: 5, total_relationships: 5, reciprocal_relationships: 1 });
    expect(a.network_metrics.density).toBeGreaterThan(0);
  });

  it("finds specialties where most providers don't refer", () => {
    const stats = nodeStats(buildGraph(edges));
    const gaps = findNetworkGaps(seeds, info, stats);
    // Cardiology: P1, P2, C1 active of 8 → 38%; Oncology: O1 active of 5 → 20%.
    expect(gaps.map((g) => g.specialty)).toEqual(["Cardiology", "Oncology"]);
    expect(gaps[0]).toMatchObject({ total_providers: 8, active_referrers: 3, utilization_percent: 38 });
    expect(gaps[0].underutilized.map((u) => u.npi)).toEqual(["C2", "C3", "C4", "C5", "C6"]);
    expect(gaps[1]).toMatchObject({ total_providers: 5, active_referrers: 1, utilization_percent: 20 });
  });

  it("doesn't report gaps for a sample of referrers", () => {
    const a = buildNetworkAnalysis({ edges, seeds, info, scope: { type: "sample", label: "sample", seed_count: 3, truncated: true } });
    expect(a.network_gaps).toEqual([]);
    expect(a.gaps_note).toMatch(/Choose a state/);
  });

  it("derives recommendations from the numbers, and validates AI output", () => {
    const a = buildNetworkAnalysis({ edges, seeds, info, scope: { type: "state", label: "PA", seed_count: seeds.length, truncated: false } });
    const rules = ruleRecommendations(a);
    expect(rules.expansion_opportunities[0].opportunity).toMatch(/Cardiology/);
    expect(rules.partnership_recommendations[0]).toMatchObject({ priority: "High", focus_area: "Dr. One (Cardiology)" });
    expect(rules.gap_filling_strategies[0].strategy).toMatch(/Card C2/);
    expect(rules.influence_strategy).toMatch(/Dr. One is the most influential/);

    expect(sanitizeRecommendations(null, rules)).toBe(rules);
    expect(sanitizeRecommendations({ expansion_opportunities: "nope" }, rules)).toBe(rules);
    const ai = sanitizeRecommendations({
      expansion_opportunities: [{ opportunity: "Grow oncology", rationale: "r", expected_impact: "i" }, { bad: true }],
      partnership_recommendations: [{ focus_area: "Dr. One", action: "Meet", priority: "Urgent" }],
      gap_filling_strategies: [],
      influence_strategy: "Focus on hubs",
    }, rules);
    expect(ai.expansion_opportunities).toHaveLength(1);
    expect(ai.partnership_recommendations[0].priority).toBe("Medium");
    expect(ai.influence_strategy).toBe("Focus on hubs");
  });

  it("explains an empty network", () => {
    const a = buildNetworkAnalysis({ edges: [], seeds, info, scope: { type: "state", label: "PA", seed_count: seeds.length, truncated: false } });
    expect(a.influencers).toEqual([]);
    expect(ruleRecommendations(a).influence_strategy).toMatch(/No referral relationships/);
  });
});
