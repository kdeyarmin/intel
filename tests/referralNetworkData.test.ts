import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildNodeDetails, clampLimit, selectNetwork, withDetails } from "../server/lib/referralNetwork";

const e = (source: string, target: string, weight: number) => ({ source, target, weight });

describe("selectNetwork", () => {
  // a is the busiest; e only touches d.
  const edges = [e("a", "b", 100), e("b", "a", 40), e("a", "c", 60), e("c", "d", 20), e("d", "e", 5)];

  it("keeps the busiest providers and only the real edges between them", () => {
    const r = selectNetwork({ edges, seeds: ["a", "b"], maxNodes: 3, maxEdges: 10 });
    expect(r.nodes.map((n) => n.npi)).toEqual(["a", "b", "c"]);
    expect(r.edges).toEqual([
      { source: "a", target: "b", volume: 100 },
      { source: "a", target: "c", volume: 60 },
      { source: "b", target: "a", volume: 40 },
    ]);
    const a = r.nodes.find((n) => n.npi === "a")!;
    expect(a).toMatchObject({ outbound: 160, inbound: 40, totalVolume: 200, partners: 2, inScope: true });
    expect(r.nodes.find((n) => n.npi === "c")!.inScope).toBe(false);
    expect(r.summary).toEqual({ network_nodes: 5, network_edges: 5, total_volume: 225, shown_nodes: 3, shown_edges: 3, display_capped: true });
  });

  it("caps edges by weight and always keeps a focused provider", () => {
    const r = selectNetwork({ edges, seeds: ["e"], maxNodes: 2, maxEdges: 1, focusNpi: "e" });
    expect(r.nodes.map((n) => n.npi)).toEqual(["a", "e"]);
    expect(r.edges).toEqual([]);
    const capped = selectNetwork({ edges, seeds: [], maxNodes: 5, maxEdges: 2 });
    expect(capped.edges.map((x) => x.volume)).toEqual([100, 60]);
    expect(capped.summary.display_capped).toBe(true);
  });

  it("marks the top hub scores as hubs, with scores from 0 to 100", () => {
    const r = selectNetwork({ edges, seeds: [], maxNodes: 5, maxEdges: 10 });
    const hubs = r.nodes.filter((n) => n.isHub);
    expect(hubs.length).toBe(3);
    for (const n of r.nodes) {
      expect(n.hubScore).toBeGreaterThanOrEqual(0);
      expect(n.hubScore).toBeLessThanOrEqual(100);
    }
    const minHub = Math.min(...hubs.map((n) => n.hubScore));
    expect(r.nodes.filter((n) => !n.isHub).every((n) => n.hubScore <= minHub)).toBe(true);
  });

  it("handles an empty network", () => {
    expect(selectNetwork({ edges: [], seeds: [], maxNodes: 5, maxEdges: 5 })).toEqual({
      nodes: [],
      edges: [],
      summary: { network_nodes: 0, network_edges: 0, total_volume: 0, shown_nodes: 0, shown_edges: 0, display_capped: false },
    });
  });
});

describe("node details", () => {
  it("prefers the practice address, normalizes entity types and builds names", () => {
    const details = buildNodeDetails(["1111111111", "2222222222", "3333333333"], {
      providers: [
        { npi: "1111111111", entity_type: "1", first_name: "Ann", last_name: "Chen", credential: "MD" },
        { npi: "2222222222", entity_type: null, organization_name: "Mercy Hospital" },
      ],
      taxonomies: [{ npi: "1111111111", taxonomy_code: "207RC0000X", taxonomy_description: "Internal Medicine, Cardiovascular Disease" }],
      locations: [
        { npi: "1111111111", location_type: "Mailing", city: "Nowhere", state: "oh" },
        { npi: "1111111111", location_type: "Practice", city: "Pittsburgh", state: "pa" },
      ],
    });
    expect(details.get("1111111111")).toEqual({
      npi: "1111111111", name: "Ann Chen, MD", entityType: "Individual", state: "PA", city: "Pittsburgh",
      specialty: "Internal Medicine, Cardiovascular Disease", taxonomyCode: "207RC0000X",
    });
    expect(details.get("2222222222")).toMatchObject({ name: "Mercy Hospital", entityType: "Organization", state: "" });
    expect(details.get("3333333333")).toMatchObject({ name: "3333333333", entityType: "Unknown" });

    const [node] = withDetails([{ npi: "1111111111", outbound: 1, inbound: 0, totalVolume: 1, partners: 1, connections: 1, pagerank: 0, hubScore: 0, isHub: false, inScope: true }], details);
    expect(node).toMatchObject({ label: "Ann Chen, MD", specialtyGroup: "cardiology", specialtyGroupLabel: "Cardiology" });
  });

  it("clamps limits", () => {
    expect(clampLimit(undefined, 150, 300)).toBe(150);
    expect(clampLimit("5000", 150, 300)).toBe(300);
    expect(clampLimit(-3, 150, 300)).toBe(150);
    expect(clampLimit(42.9, 150, 300)).toBe(42);
  });
});

// ─── Handler, against a scripted fake database ───────────────────────────────

const queries: Array<{ sql: string; params: any[] }> = [];
let referralRows: any[] = [];
let hasData = true;
// Every location row per provider; the fake applies the handler's documented
// preference (a practice in the scoped state, then any practice) to them.
let locationRows: Array<{ npi: string; location_type: string; city: string; state: string }> = [];
function pickLocation(npi: string, state: string | null | undefined) {
  const mine = locationRows.filter((l) => l.npi === npi);
  return mine.find((l) => l.location_type === "Practice" && state && l.state === state)
    || mine.find((l) => l.location_type === "Practice")
    || mine[0];
}

vi.mock("../server/db", () => {
  const client = {
    async query(sql: string, params: any[] = []) {
      queries.push({ sql, params });
      if (/^SET |^RESET /.test(sql)) return { rows: [] };
      if (sql.includes("referred_to_npi IS NOT NULL LIMIT 1")) return { rows: hasData ? [{ "?column?": 1 }] : [] };
      if (sql.includes("FROM provider_locations WHERE state = $1")) return { rows: [{ npi: "1000000001" }, { npi: "1000000002" }] };
      if (sql.includes("FROM cms_referrals") && sql.includes("WHERE npi = ANY($1) AND referred_to_npi IS NOT NULL")) {
        return { rows: referralRows.filter((r) => params[0].includes(r.npi) && r.referred_to_npi) };
      }
      if (sql.includes("FROM cms_referrals") && sql.includes("WHERE referred_to_npi = ANY($1)")) {
        return { rows: referralRows.filter((r) => params[0].includes(r.referred_to_npi)) };
      }
      if (sql.includes("FROM providers WHERE npi = ANY")) return { rows: [{ npi: "1000000001", entity_type: "Individual", first_name: "Ann", last_name: "Chen" }] };
      if (sql.includes("FROM provider_locations") && sql.includes("CROSS JOIN LATERAL")) {
        return { rows: params[0].map((npi: string) => pickLocation(npi, params[1])).filter(Boolean) };
      }
      return { rows: [] };
    },
    release() {},
  };
  return { pool: { connect: async () => client, query: client.query }, db: {} };
});

describe("handleGetReferralNetworkData", () => {
  beforeEach(async () => {
    queries.length = 0;
    hasData = true;
    locationRows = [];
    referralRows = [
      { npi: "1000000001", referred_to_npi: "1000000002", total_referrals: "120" },
      { npi: "1000000001", referred_to_npi: "1000000003", total_referrals: 30 },
      { npi: "1000000004", referred_to_npi: "1000000001", total_referrals: 15 },
      { npi: "1000000002", referred_to_npi: null, total_referrals: 999 },
    ];
    const { clearReferralNetworkCache } = await import("../server/functions/referralNetwork");
    clearReferralNetworkCache();
  });

  it("returns real edges for a state, never the rows without a partner", async () => {
    const { handleGetReferralNetworkData } = await import("../server/functions/referralNetwork");
    const r = await handleGetReferralNetworkData({ state: "pa" }, { id: 1 });
    expect(r.scope).toMatchObject({ type: "state", state: "PA" });
    expect(r.edges).toEqual([
      { source: "1000000001", target: "1000000002", volume: 120 },
      { source: "1000000001", target: "1000000003", volume: 30 },
      { source: "1000000004", target: "1000000001", volume: 15 },
    ]);
    expect(r.nodes.find((n: any) => n.npi === "1000000001")).toMatchObject({ label: "Ann Chen", outbound: 150, inbound: 15, partners: 3 });
    // Statement timeout is set and reset on the pooled connection.
    expect(queries[0].sql).toMatch(/SET statement_timeout/);
    expect(queries.at(-1)!.sql).toMatch(/RESET statement_timeout/);
  });

  it("places a provider practicing in several states in the scoped state", async () => {
    locationRows = [
      { npi: "1000000001", location_type: "Practice", city: "Columbus", state: "OH" },
      { npi: "1000000001", location_type: "Practice", city: "Pittsburgh", state: "PA" },
      { npi: "1000000003", location_type: "Practice", city: "Columbus", state: "OH" },
    ];
    const { handleGetReferralNetworkData } = await import("../server/functions/referralNetwork");
    const r = await handleGetReferralNetworkData({ state: "pa" }, { id: 1 });
    expect(r.nodes.find((n: any) => n.npi === "1000000001")).toMatchObject({ city: "Pittsburgh", state: "PA" });
    // A partner with no practice in the state keeps its own practice address.
    expect(r.nodes.find((n: any) => n.npi === "1000000003")).toMatchObject({ city: "Columbus", state: "OH" });
    const loc = queries.find((q) => q.sql.includes("FROM provider_locations") && q.sql.includes("CROSS JOIN LATERAL"))!;
    expect(loc.params[1]).toBe("PA");
    // The in-state practice row sorts ahead of any other practice row.
    expect(loc.sql).toMatch(/ORDER BY coalesce\(location_type = 'Practice' AND state = \$2::varchar, false\) DESC,\s+\(location_type = 'Practice'\) DESC/);
  });

  it("doesn't prefer a state outside a state scope", async () => {
    const { handleGetReferralNetworkData } = await import("../server/functions/referralNetwork");
    await handleGetReferralNetworkData({ npi: "1000000001" }, { id: 1 });
    const loc = queries.find((q) => q.sql.includes("FROM provider_locations") && q.sql.includes("CROSS JOIN LATERAL"))!;
    expect(loc.params[1]).toBeNull();
  });

  it("caches per scope", async () => {
    const { handleGetReferralNetworkData } = await import("../server/functions/referralNetwork");
    await handleGetReferralNetworkData({ state: "PA" }, { id: 1 });
    const n = queries.length;
    const again = await handleGetReferralNetworkData({ state: "PA" }, { id: 1 });
    expect(again.cached).toBe(true);
    expect(queries.length).toBe(n);
  });

  it("says when no referral data has been imported", async () => {
    hasData = false;
    const { handleGetReferralNetworkData } = await import("../server/functions/referralNetwork");
    const r = await handleGetReferralNetworkData({}, { id: 1 });
    expect(r).toMatchObject({ notConfigured: true, nodes: [], edges: [] });
    expect(r.message).toMatch(/Physician Shared Patient Patterns/);
  });

  it("builds one provider's partner network", async () => {
    const { handleGetReferralNetworkData } = await import("../server/functions/referralNetwork");
    const r = await handleGetReferralNetworkData({ npi: "1000000001" }, { id: 1 });
    expect(r.scope).toMatchObject({ type: "provider", npi: "1000000001" });
    expect(r.nodes.map((n: any) => n.npi).sort()).toEqual(["1000000001", "1000000002", "1000000003", "1000000004"]);
    expect(queries.some((q) => q.sql.includes("WHERE npi = ANY($1) AND referred_to_npi = ANY($1)"))).toBe(true);
  });

  it("limits how often one person builds networks", async () => {
    const { handleGetReferralNetworkData } = await import("../server/functions/referralNetwork");
    const states = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD"];
    for (const s of states) await handleGetReferralNetworkData({ state: s }, { id: 77 });
    await expect(handleGetReferralNetworkData({ state: "MA" }, { id: 77 })).rejects.toMatchObject({ status: 429 });
  });
});
