import { describe, it, expect } from "vitest";
import { buildGraph, influenceScores, networkMetrics, nodeStats, pageRank } from "../server/lib/networkGraph";

const edges = [
  { source: "A", target: "HUB", weight: 50 },
  { source: "B", target: "HUB", weight: 30 },
  { source: "C", target: "HUB", weight: 20 },
  { source: "HUB", target: "A", weight: 5 },
  { source: "D", target: "E", weight: 1 },
  { source: "A", target: "A", weight: 99 }, // self-loops are ignored
];

describe("network graph", () => {
  const g = buildGraph(edges);

  it("builds a directed, weighted graph without self-loops", () => {
    expect(g.nodes).toEqual(["A", "B", "C", "D", "E", "HUB"]);
    expect(g.out.get("A")?.get("HUB")).toBe(50);
    expect(g.out.get("A")?.has("A")).toBe(false);
    expect(g.in.get("HUB")?.size).toBe(3);
  });

  it("ranks the provider everyone refers to highest, and ranks sum to 1", () => {
    const ranks = pageRank(g);
    const sorted = [...ranks].sort((a, b) => b[1] - a[1]);
    expect(sorted[0][0]).toBe("HUB");
    expect([...ranks.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it("scores influence 0–100 with the hub at 100", () => {
    const scores = influenceScores(nodeStats(g));
    expect(scores.get("HUB")).toBe(100);
    for (const s of scores.values()) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
    expect(scores.get("B")!).toBeLessThan(scores.get("HUB")!);
  });

  it("computes whole-network metrics", () => {
    const m = networkMetrics(g);
    expect(m).toMatchObject({ node_count: 6, edge_count: 5, total_volume: 106, components: 2 });
    expect(m.reciprocity).toBeCloseTo(0.4, 3); // A↔HUB counted from both sides
    expect(m.largest_component_share).toBeCloseTo(4 / 6, 3);
    expect(m.density).toBeCloseTo(5 / 30, 4);
    expect(m.concentration).toBeCloseTo(100 / 106, 3);
  });

  it("handles an empty graph", () => {
    const empty = buildGraph([]);
    expect(pageRank(empty).size).toBe(0);
    expect(networkMetrics(empty)).toMatchObject({ node_count: 0, density: 0, components: 0 });
  });
});
