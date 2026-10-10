// Shapes referral edges into what the Referral Network page draws: the
// busiest providers in scope, the real edges between them, and per-provider
// volumes, partner counts and hub scores. Pure; the handler in
// server/functions/referralNetwork.ts does the database work.
import { buildGraph, influenceScores, nodeStats, type Edge } from "./networkGraph";
import { normalizeEntityType, specialtyGroupFor } from "./specialtyGroups";

export const DEFAULT_NODES = 150;
export const MAX_NODES = 300;
export const DEFAULT_EDGES = 600;
export const MAX_EDGES = 1000;
// The top share of shown providers (by hub score) marked as hubs.
const HUB_SHARE = 0.15;

export interface NodeDetails {
  npi: string;
  name: string;
  entityType: string;
  state: string;
  city: string;
  specialty: string;
  taxonomyCode: string | null;
}

export interface NetworkNode extends NodeDetails {
  label: string;
  specialtyGroup: string;
  specialtyGroupLabel: string;
  outbound: number;
  inbound: number;
  totalVolume: number;
  /** Distinct providers this one shares patients with, across the whole scope. */
  partners: number;
  connections: number;
  pagerank: number;
  hubScore: number;
  isHub: boolean;
  /** One of the providers the scope was built from (vs. a partner outside it). */
  inScope: boolean;
}

export interface NetworkSummary {
  network_nodes: number;
  network_edges: number;
  total_volume: number;
  shown_nodes: number;
  shown_edges: number;
  /** The view shows only the busiest part of a larger network. */
  display_capped: boolean;
}

export function clampLimit(value: unknown, fallback: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

/**
 * Picks the `maxNodes` providers with the most volume (always keeping
 * `focusNpi`), the heaviest `maxEdges` edges among them, and scores hubs.
 * Details are filled in later by the caller for just the chosen providers.
 */
export function selectNetwork(input: { edges: Edge[]; seeds: Iterable<string>; maxNodes: number; maxEdges: number; focusNpi?: string | null }) {
  const graph = buildGraph(input.edges);
  const stats = nodeStats(graph);
  const influence = influenceScores(stats.values());
  const seeds = new Set(input.seeds);

  const volume = (npi: string) => {
    const s = stats.get(npi)!;
    return s.inVolume + s.outVolume;
  };
  const ranked = [...stats.keys()].sort((a, b) => volume(b) - volume(a) || a.localeCompare(b));
  let chosen = ranked.slice(0, input.maxNodes);
  const focus = input.focusNpi && stats.has(input.focusNpi) ? input.focusNpi : null;
  if (focus && !chosen.includes(focus)) chosen = [...chosen.slice(0, Math.max(0, input.maxNodes - 1)), focus];
  const chosenSet = new Set(chosen);

  let networkEdges = 0;
  let totalVolume = 0;
  const candidates: Array<{ source: string; target: string; volume: number }> = [];
  for (const [source, targets] of graph.out) {
    for (const [target, weight] of targets) {
      networkEdges += 1;
      totalVolume += weight;
      if (chosenSet.has(source) && chosenSet.has(target)) candidates.push({ source, target, volume: weight });
    }
  }
  const edges = candidates
    .sort((a, b) => b.volume - a.volume || a.source.localeCompare(b.source) || a.target.localeCompare(b.target))
    .slice(0, input.maxEdges);

  const hubCount = Math.max(Math.min(3, chosen.length), Math.round(chosen.length * HUB_SHARE));
  const hubs = new Set(
    [...chosen].filter((n) => (influence.get(n) || 0) > 0)
      .sort((a, b) => (influence.get(b) || 0) - (influence.get(a) || 0) || a.localeCompare(b))
      .slice(0, hubCount),
  );

  const nodes = chosen.map((npi) => {
    const s = stats.get(npi)!;
    return {
      npi,
      outbound: s.outVolume,
      inbound: s.inVolume,
      totalVolume: s.inVolume + s.outVolume,
      partners: s.partners,
      connections: s.partners,
      pagerank: s.pageRank,
      hubScore: influence.get(npi) || 0,
      isHub: hubs.has(npi),
      inScope: seeds.has(npi),
    };
  });

  const summary: NetworkSummary = {
    network_nodes: graph.nodes.length,
    network_edges: networkEdges,
    total_volume: totalVolume,
    shown_nodes: nodes.length,
    shown_edges: edges.length,
    display_capped: graph.nodes.length > nodes.length || candidates.length > edges.length,
  };
  return { nodes, edges, summary };
}

/** Adds names, places and specialties to the chosen providers. */
export function withDetails(nodes: ReturnType<typeof selectNetwork>["nodes"], details: Map<string, NodeDetails>): NetworkNode[] {
  return nodes.map((n) => {
    const d = details.get(n.npi) || { npi: n.npi, name: n.npi, entityType: "Unknown", state: "", city: "", specialty: "", taxonomyCode: null };
    const group = specialtyGroupFor(d.taxonomyCode, d.specialty);
    return { ...n, ...d, label: d.name, specialtyGroup: group.key, specialtyGroupLabel: group.key === "other" ? "Other" : group.label };
  });
}

/** Provider rows (providers, primary taxonomy, locations) → details per NPI. */
export function buildNodeDetails(
  npis: string[],
  rows: {
    providers: Array<{ npi: string; entity_type?: string | null; first_name?: string | null; last_name?: string | null; organization_name?: string | null; credential?: string | null }>;
    taxonomies: Array<{ npi: string; taxonomy_code?: string | null; taxonomy_description?: string | null }>;
    locations: Array<{ npi: string; location_type?: string | null; city?: string | null; state?: string | null }>;
  },
): Map<string, NodeDetails> {
  const tax = new Map(rows.taxonomies.map((t) => [t.npi, t]));
  const loc = new Map<string, { city?: string | null; state?: string | null; location_type?: string | null }>();
  for (const l of rows.locations) {
    const cur = loc.get(l.npi);
    // Prefer the practice address over mailing.
    if (!cur || (cur.location_type !== "Practice" && l.location_type === "Practice")) loc.set(l.npi, l);
  }
  const prov = new Map(rows.providers.map((p) => [p.npi, p]));
  const out = new Map<string, NodeDetails>();
  for (const npi of npis) {
    const p = prov.get(npi);
    const t = tax.get(npi);
    const l = loc.get(npi);
    const person = [p?.first_name, p?.last_name].filter(Boolean).join(" ");
    let entityType = normalizeEntityType(p?.entity_type);
    if (entityType === "Unknown" && p) entityType = p.organization_name && !person ? "Organization" : person ? "Individual" : "Unknown";
    const name = (entityType === "Organization" ? p?.organization_name : null)
      || (person ? `${person}${p?.credential ? `, ${p.credential}` : ""}` : null)
      || p?.organization_name
      || npi;
    out.set(npi, {
      npi,
      name,
      entityType,
      state: (l?.state || "").toUpperCase(),
      city: l?.city || "",
      specialty: t?.taxonomy_description || "",
      taxonomyCode: t?.taxonomy_code || null,
    });
  }
  return out;
}
