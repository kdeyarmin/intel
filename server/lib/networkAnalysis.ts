// Turns referral edges plus provider details into the analysis the Referral
// Network page shows: influencers, whole-network metrics, specialty gaps and
// recommendations. Pure: the handler in server/functions/networkAnalysis.ts
// does the database and AI work.
import { buildGraph, influenceScores, networkMetrics, nodeStats, type Edge, type NodeStats } from "./networkGraph";

export interface ReferralRow {
  npi: string | null;
  referred_to_npi: string | null;
  total_referrals: number | string | null;
}

export interface ProviderInfo {
  npi: string;
  name: string;
  specialty: string | null;
}

export interface AnalysisScope {
  type: "lead_list" | "state" | "sample";
  label: string;
  seed_count: number;
  /** True when the seed set or the edge set hit a size cap. */
  truncated: boolean;
  state?: string;
  lead_list_id?: number;
}

/** One edge per provider pair; when a pair appears in several data years, keep its largest yearly volume. */
export function edgesFromReferrals(rows: ReferralRow[]): Edge[] {
  const best = new Map<string, Edge>();
  for (const r of rows) {
    if (!r.npi || !r.referred_to_npi || r.npi === r.referred_to_npi) continue;
    const weight = Math.max(1, Number(r.total_referrals) || 0);
    const key = `${r.npi}>${r.referred_to_npi}`;
    const cur = best.get(key);
    if (!cur || weight > cur.weight) best.set(key, { source: r.npi, target: r.referred_to_npi, weight });
  }
  return [...best.values()];
}

export interface Influencer {
  npi: string;
  name: string;
  specialty: string | null;
  influence_score: number;
  outbound_referrals: number;
  inbound_referrals: number;
  network_size: number;
}

export interface NetworkGap {
  specialty: string;
  total_providers: number;
  active_referrers: number;
  utilization_percent: number;
  underutilized: Array<{ npi: string; name: string }>;
}

/**
 * Specialties where most in-scope providers exchange no referrals inside the
 * analysed network: outreach targets. Only meaningful when the seed set is a
 * real population (a state or a lead list), not a sample of referrers.
 */
export function findNetworkGaps(
  seeds: string[],
  info: Map<string, ProviderInfo>,
  stats: Map<string, NodeStats>,
  { minProviders = 5, maxUtilization = 0.5, limit = 10 } = {},
): NetworkGap[] {
  const bySpecialty = new Map<string, { active: string[]; idle: string[] }>();
  for (const npi of new Set(seeds)) {
    const specialty = info.get(npi)?.specialty;
    if (!specialty) continue;
    const group = bySpecialty.get(specialty) || { active: [], idle: [] };
    ((stats.get(npi)?.partners || 0) > 0 ? group.active : group.idle).push(npi);
    bySpecialty.set(specialty, group);
  }
  const gaps: NetworkGap[] = [];
  for (const [specialty, { active, idle }] of bySpecialty) {
    const total = active.length + idle.length;
    if (total < minProviders || active.length / total >= maxUtilization) continue;
    gaps.push({
      specialty,
      total_providers: total,
      active_referrers: active.length,
      utilization_percent: Math.round((100 * active.length) / total),
      underutilized: idle.slice(0, 5).map((npi) => ({ npi, name: info.get(npi)?.name || npi })),
    });
  }
  return gaps
    .sort((a, b) => (b.total_providers - b.active_referrers) - (a.total_providers - a.active_referrers) || a.specialty.localeCompare(b.specialty))
    .slice(0, limit);
}

export interface NetworkAnalysis {
  scope: AnalysisScope;
  network_metrics: {
    total_providers: number;
    total_relationships: number;
    reciprocal_relationships: number;
    density: number;
    avg_degree: number;
    total_volume: number;
    concentration: number;
    components: number;
    largest_component_share: number;
  };
  influencers: Influencer[];
  network_gaps: NetworkGap[];
  gaps_note: string | null;
}

export function buildNetworkAnalysis(input: {
  edges: Edge[];
  seeds: string[];
  info: Map<string, ProviderInfo>;
  scope: AnalysisScope;
}): NetworkAnalysis {
  const graph = buildGraph(input.edges);
  const stats = nodeStats(graph);
  const metrics = networkMetrics(graph, stats);

  // Rank the in-scope providers: we have their full outbound picture, unlike
  // partners outside the scope whose other relationships weren't loaded.
  const seedSet = new Set(input.seeds);
  const seedStats = [...stats.values()].filter((s) => seedSet.has(s.npi));
  const scores = influenceScores(seedStats);
  const influencers: Influencer[] = seedStats
    .map((s) => ({
      npi: s.npi,
      name: input.info.get(s.npi)?.name || s.npi,
      specialty: input.info.get(s.npi)?.specialty || null,
      influence_score: scores.get(s.npi) || 0,
      outbound_referrals: s.outVolume,
      inbound_referrals: s.inVolume,
      network_size: s.partners,
    }))
    .sort((a, b) => b.influence_score - a.influence_score || b.network_size - a.network_size || a.npi.localeCompare(b.npi))
    .slice(0, 20);

  const gapsAvailable = input.scope.type !== "sample";
  return {
    scope: input.scope,
    network_metrics: {
      total_providers: metrics.node_count,
      total_relationships: metrics.edge_count,
      reciprocal_relationships: metrics.reciprocal_pairs,
      density: metrics.density,
      avg_degree: metrics.avg_degree,
      total_volume: metrics.total_volume,
      concentration: metrics.concentration,
      components: metrics.components,
      largest_component_share: metrics.largest_component_share,
    },
    influencers,
    network_gaps: gapsAvailable ? findNetworkGaps(input.seeds, input.info, stats) : [],
    gaps_note: gapsAvailable ? null : "Choose a state (or analyse a lead list) to find specialty gaps; a nationwide sample can't show who is missing.",
  };
}

export interface NetworkRecommendations {
  expansion_opportunities: Array<{ opportunity: string; rationale: string; expected_impact: string }>;
  partnership_recommendations: Array<{ focus_area: string; action: string; priority: "High" | "Medium" | "Low" }>;
  gap_filling_strategies: Array<{ specialty: string; strategy: string; timeline: string }>;
  influence_strategy: string;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** Recommendations derived directly from the numbers (used when AI is unavailable, and as the AI's fallback). */
export function ruleRecommendations(a: NetworkAnalysis): NetworkRecommendations {
  const gaps = a.network_gaps.slice(0, 3);
  const top = a.influencers.slice(0, 3);
  const m = a.network_metrics;

  const expansion = gaps.map((g) => ({
    opportunity: `Build referral relationships with ${g.specialty} providers`,
    rationale: `Only ${g.active_referrers} of ${g.total_providers} ${g.specialty} providers in scope (${g.utilization_percent}%) exchange referrals in this network.`,
    expected_impact: `Up to ${fmt(g.total_providers - g.active_referrers)} new referral partners`,
  }));
  if (expansion.length === 0 && m.concentration >= 0.5 && m.total_relationships > 0) {
    expansion.push({
      opportunity: "Spread referrals beyond the few providers who receive most of them",
      rationale: `The top 10% of receiving providers get ${Math.round(m.concentration * 100)}% of referral volume.`,
      expected_impact: "Less dependence on a handful of partners",
    });
  }

  const partnership = top.map((p, i) => ({
    focus_area: p.specialty ? `${p.name} (${p.specialty})` : p.name,
    action: `Prioritize a relationship with ${p.name}: ${fmt(p.network_size)} referral partners, ${fmt(p.outbound_referrals)} referrals sent and ${fmt(p.inbound_referrals)} received.`,
    priority: (i === 0 ? "High" : "Medium") as "High" | "Medium",
  }));

  const gapStrategies = gaps.map((g) => ({
    specialty: g.specialty,
    strategy: g.underutilized.length
      ? `Reach out to ${g.specialty} providers who aren't referring yet, starting with ${g.underutilized.slice(0, 3).map((u) => u.name).join(", ")}.`
      : `Reach out to ${g.specialty} providers who aren't referring yet.`,
    timeline: "Next 30–60 days",
  }));

  const influence = m.total_relationships === 0
    ? "No referral relationships were found in this scope yet. Import the CMS shared-patient (referral) data to analyse the network."
    : `${fmt(m.total_providers)} providers and ${fmt(m.total_relationships)} referral relationships in scope; ${fmt(m.reciprocal_relationships)} ${m.reciprocal_relationships === 1 ? "pair refers" : "pairs refer"} to each other. `
      + (top[0] ? `${top[0].name} is the most influential provider here; relationships with the top influencers reach the most partners.` : "");

  return { expansion_opportunities: expansion, partnership_recommendations: partnership, gap_filling_strategies: gapStrategies, influence_strategy: influence };
}

/** Keep only well-formed AI output; anything malformed falls back to the rule-based version. */
export function sanitizeRecommendations(raw: any, fallback: NetworkRecommendations): NetworkRecommendations {
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 600) : "");
  const list = <T>(v: unknown, map: (x: any) => T | null): T[] =>
    (Array.isArray(v) ? v : []).map(map).filter((x): x is T => x !== null).slice(0, 6);
  if (!raw || typeof raw !== "object") return fallback;
  const out: NetworkRecommendations = {
    expansion_opportunities: list(raw.expansion_opportunities, (x) => (str(x?.opportunity) ? {
      opportunity: str(x.opportunity), rationale: str(x.rationale), expected_impact: str(x.expected_impact),
    } : null)),
    partnership_recommendations: list(raw.partnership_recommendations, (x) => (str(x?.focus_area) && str(x?.action) ? {
      focus_area: str(x.focus_area), action: str(x.action),
      priority: (["High", "Medium", "Low"].includes(x.priority) ? x.priority : "Medium") as "High" | "Medium" | "Low",
    } : null)),
    gap_filling_strategies: list(raw.gap_filling_strategies, (x) => (str(x?.specialty) && str(x?.strategy) ? {
      specialty: str(x.specialty), strategy: str(x.strategy), timeline: str(x.timeline),
    } : null)),
    influence_strategy: str(raw.influence_strategy),
  };
  const empty = !out.expansion_opportunities.length && !out.partnership_recommendations.length && !out.gap_filling_strategies.length && !out.influence_strategy;
  return empty ? fallback : out;
}
