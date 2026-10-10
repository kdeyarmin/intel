// Pure graph maths for referral-network analysis. Edges are directed
// (source refers to / shares patients with target) and weighted by volume.

export interface Edge {
  source: string;
  target: string;
  weight: number;
}

export interface Graph {
  nodes: string[];
  out: Map<string, Map<string, number>>;
  in: Map<string, Map<string, number>>;
}

export function buildGraph(edges: Edge[]): Graph {
  const out = new Map<string, Map<string, number>>();
  const inn = new Map<string, Map<string, number>>();
  const nodes = new Set<string>();
  const add = (m: Map<string, Map<string, number>>, a: string, b: string, w: number) => {
    if (!m.has(a)) m.set(a, new Map());
    const row = m.get(a)!;
    row.set(b, (row.get(b) || 0) + w);
  };
  for (const e of edges) {
    if (!e.source || !e.target || e.source === e.target) continue;
    const w = Number.isFinite(e.weight) && e.weight > 0 ? e.weight : 1;
    nodes.add(e.source);
    nodes.add(e.target);
    add(out, e.source, e.target, w);
    add(inn, e.target, e.source, w);
  }
  return { nodes: [...nodes].sort(), out, in: inn };
}

/** Weighted PageRank; scores sum to 1. Dangling nodes spread their rank evenly. */
export function pageRank(g: Graph, { damping = 0.85, iterations = 40, tolerance = 1e-9 } = {}): Map<string, number> {
  const n = g.nodes.length;
  const rank = new Map<string, number>();
  if (n === 0) return rank;
  for (const v of g.nodes) rank.set(v, 1 / n);
  const outWeight = new Map<string, number>();
  for (const v of g.nodes) {
    let total = 0;
    for (const w of g.out.get(v)?.values() || []) total += w;
    outWeight.set(v, total);
  }
  for (let iter = 0; iter < iterations; iter += 1) {
    let dangling = 0;
    for (const v of g.nodes) if (!outWeight.get(v)) dangling += rank.get(v)!;
    const next = new Map<string, number>();
    const base = (1 - damping) / n + (damping * dangling) / n;
    for (const v of g.nodes) {
      let sum = 0;
      for (const [u, w] of g.in.get(v) || []) sum += (rank.get(u)! * w) / outWeight.get(u)!;
      next.set(v, base + damping * sum);
    }
    let delta = 0;
    for (const v of g.nodes) delta += Math.abs(next.get(v)! - rank.get(v)!);
    for (const [v, r] of next) rank.set(v, r);
    if (delta < tolerance) break;
  }
  return rank;
}

export interface NodeStats {
  npi: string;
  inDegree: number;
  outDegree: number;
  inVolume: number;
  outVolume: number;
  pageRank: number;
}

export function nodeStats(g: Graph, ranks = pageRank(g)): Map<string, NodeStats> {
  const stats = new Map<string, NodeStats>();
  for (const v of g.nodes) {
    const ins = g.in.get(v) || new Map();
    const outs = g.out.get(v) || new Map();
    let inVolume = 0;
    let outVolume = 0;
    for (const w of ins.values()) inVolume += w;
    for (const w of outs.values()) outVolume += w;
    stats.set(v, { npi: v, inDegree: ins.size, outDegree: outs.size, inVolume, outVolume, pageRank: ranks.get(v) || 0 });
  }
  return stats;
}

/**
 * 0–100 influence: PageRank (where referrals flow) blended with how many
 * distinct partners a provider has, each scaled against the network's max.
 */
export function influenceScores(stats: Map<string, NodeStats>): Map<string, number> {
  let maxRank = 0;
  let maxPartners = 0;
  for (const s of stats.values()) {
    maxRank = Math.max(maxRank, s.pageRank);
    maxPartners = Math.max(maxPartners, s.inDegree + s.outDegree);
  }
  const out = new Map<string, number>();
  for (const s of stats.values()) {
    const r = maxRank > 0 ? s.pageRank / maxRank : 0;
    const p = maxPartners > 0 ? Math.log1p(s.inDegree + s.outDegree) / Math.log1p(maxPartners) : 0;
    out.set(s.npi, Math.round(100 * (0.6 * r + 0.4 * p)));
  }
  return out;
}

export interface NetworkMetrics {
  node_count: number;
  edge_count: number;
  total_volume: number;
  density: number;
  avg_degree: number;
  reciprocity: number;
  /** Share of referral volume going to the top 10% of receivers. */
  concentration: number;
  components: number;
  largest_component_share: number;
}

export function networkMetrics(g: Graph, stats = nodeStats(g)): NetworkMetrics {
  const n = g.nodes.length;
  let edges = 0;
  let volume = 0;
  let mutual = 0;
  for (const [a, row] of g.out) {
    for (const [b, w] of row) {
      edges += 1;
      volume += w;
      if (g.out.get(b)?.has(a)) mutual += 1;
    }
  }
  const receivers = [...stats.values()].map((s) => s.inVolume).sort((a, b) => b - a);
  const top = receivers.slice(0, Math.max(1, Math.ceil(receivers.length * 0.1)));
  const topVolume = top.reduce((a, b) => a + b, 0);

  // Weakly connected components (union-find).
  const parent = new Map<string, string>(g.nodes.map((v) => [v, v]));
  const find = (v: string): string => {
    let r = v;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = v;
    while (parent.get(c) !== r) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  for (const [a, row] of g.out) for (const b of row.keys()) parent.set(find(a), find(b));
  const sizes = new Map<string, number>();
  for (const v of g.nodes) sizes.set(find(v), (sizes.get(find(v)) || 0) + 1);
  const largest = Math.max(0, ...sizes.values());

  const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
  return {
    node_count: n,
    edge_count: edges,
    total_volume: volume,
    density: n > 1 ? round(edges / (n * (n - 1)), 4) : 0,
    avg_degree: n > 0 ? round((2 * edges) / n, 2) : 0,
    reciprocity: edges > 0 ? round(mutual / edges) : 0,
    concentration: volume > 0 ? round(topVolume / volume) : 0,
    components: sizes.size,
    largest_component_share: n > 0 ? round(largest / n) : 0,
  };
}
