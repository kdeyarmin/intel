// analyzeProviderNetwork: referral-network influencers, metrics, specialty
// gaps and recommendations for a lead list, a state, or (with neither) a
// labelled sample. Built from cms_referrals with index-backed IN queries —
// never a scan or GROUP BY over the whole table.
import { pool } from "../db";
import { CLAUDE_MODELS } from "../lib/aiModels";
import {
  buildNetworkAnalysis,
  edgesFromReferrals,
  ruleRecommendations,
  sanitizeRecommendations,
  type AnalysisScope,
  type NetworkAnalysis,
  type NetworkRecommendations,
  type ProviderInfo,
} from "../lib/networkAnalysis";

const MAX_SEEDS = 5000;
const SAMPLE_SEEDS = 2000;
const MAX_OUTBOUND_EDGES = 50_000;
const MAX_INBOUND_EDGES = 25_000;
const ANALYSIS_TTL_MS = 10 * 60 * 1000;
const AI_TTL_MS = 60 * 60 * 1000;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function withClient<T>(timeout: string, fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = '${timeout}'`);
    return await fn(client);
  } finally {
    await client.query("RESET statement_timeout").catch(() => {});
    client.release();
  }
}

const isTimeout = (e: any) => e?.code === "57014";
const dedupe = (rows: any[]) => [...new Set(rows.map((r) => r.npi).filter(Boolean))] as string[];

async function loadSeeds(client: any, payload: any): Promise<{ seeds: string[]; scope: AnalysisScope }> {
  const listId = Number(payload?.lead_list_id);
  if (Number.isInteger(listId) && listId > 0) {
    const { rows: [list] } = await client.query("SELECT id, name FROM lead_lists WHERE id = $1", [listId]);
    if (!list) throw new HttpError(404, "Lead list not found.");
    const { rows } = await client.query(
      "SELECT npi FROM lead_list_members WHERE list_id = $1 AND npi IS NOT NULL LIMIT $2", [listId, MAX_SEEDS + 1]);
    const seeds = dedupe(rows).slice(0, MAX_SEEDS);
    return { seeds, scope: { type: "lead_list", lead_list_id: listId, label: `Lead list "${list.name}"`, seed_count: seeds.length, truncated: rows.length > MAX_SEEDS } };
  }

  const state = String(payload?.state || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(state)) {
    // provider_locations_state_idx; a provider has at most a couple of practice rows.
    const { rows } = await client.query(
      "SELECT npi FROM provider_locations WHERE state = $1 AND location_type = 'Practice' LIMIT $2", [state, MAX_SEEDS * 2]);
    const all = dedupe(rows);
    const seeds = all.slice(0, MAX_SEEDS);
    return {
      seeds,
      scope: { type: "state", state, label: `Providers practicing in ${state}`, seed_count: seeds.length, truncated: all.length > MAX_SEEDS || rows.length >= MAX_SEEDS * 2 },
    };
  }

  const { rows } = await client.query(
    "SELECT npi FROM cms_referrals WHERE referred_to_npi IS NOT NULL LIMIT $1", [SAMPLE_SEEDS * 10]);
  const seeds = dedupe(rows).slice(0, SAMPLE_SEEDS);
  return {
    seeds,
    scope: { type: "sample", label: `A sample of ${seeds.length.toLocaleString("en-US")} referring providers — choose a state for a complete local picture`, seed_count: seeds.length, truncated: true },
  };
}

async function loadEdges(client: any, seeds: string[], scope: AnalysisScope) {
  const out = await client.query(
    `SELECT npi, referred_to_npi, total_referrals FROM cms_referrals
      WHERE npi = ANY($1) AND referred_to_npi IS NOT NULL LIMIT $2`,
    [seeds, MAX_OUTBOUND_EDGES],
  );
  let inbound: any[] = [];
  try {
    // Uses idx_cms_referrals_referred_to (built at boot); bounded by the timeout either way.
    const res = await client.query(
      `SELECT npi, referred_to_npi, total_referrals FROM cms_referrals
        WHERE referred_to_npi = ANY($1) LIMIT $2`,
      [seeds, MAX_INBOUND_EDGES],
    );
    inbound = res.rows;
  } catch (e) {
    if (!isTimeout(e)) throw e;
    console.warn("[analyzeProviderNetwork] inbound referrals timed out; using outbound only");
    scope.truncated = true;
  }
  if (out.rows.length >= MAX_OUTBOUND_EDGES || inbound.length >= MAX_INBOUND_EDGES) scope.truncated = true;
  return edgesFromReferrals([...out.rows, ...inbound]);
}

async function loadProviderInfo(client: any, npis: string[]): Promise<Map<string, ProviderInfo>> {
  const info = new Map<string, ProviderInfo>();
  if (npis.length === 0) return info;
  const [p, t] = await Promise.all([
    client.query("SELECT npi, first_name, last_name, organization_name, credential FROM providers WHERE npi = ANY($1)", [npis]),
    client.query("SELECT npi, taxonomy_description FROM provider_taxonomies WHERE npi = ANY($1) AND is_primary = true", [npis]),
  ]);
  const specialty = new Map<string, string>(t.rows.map((r: any) => [r.npi, r.taxonomy_description]));
  for (const r of p.rows) {
    const person = [r.first_name, r.last_name].filter(Boolean).join(" ");
    const name = r.organization_name || (person ? `${person}${r.credential ? `, ${r.credential}` : ""}` : r.npi);
    info.set(r.npi, { npi: r.npi, name, specialty: specialty.get(r.npi) || null });
  }
  for (const npi of npis) if (!info.has(npi)) info.set(npi, { npi, name: npi, specialty: specialty.get(npi) || null });
  return info;
}

const analysisCache = new Map<string, { at: number; analysis: NetworkAnalysis }>();
// Each AI entry remembers which analysis it was written from, so a rebuilt
// analysis never comes back with recommendations from the old metrics.
const aiCache = new Map<string, { at: number; analysisAt: number; recommendations: NetworkRecommendations }>();

function cacheKey(payload: any) {
  const listId = Number(payload?.lead_list_id);
  if (Number.isInteger(listId) && listId > 0) return `list:${listId}`;
  const state = String(payload?.state || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? `state:${state}` : "sample";
}

async function aiRecommendations(a: NetworkAnalysis, fallback: NetworkRecommendations): Promise<{ recommendations: NetworkRecommendations; source: "ai" | "rules" }> {
  if (!process.env.ANTHROPIC_API_KEY || a.network_metrics.total_relationships === 0) return { recommendations: fallback, source: "rules" };
  const facts = {
    scope: a.scope.label,
    metrics: a.network_metrics,
    top_influencers: a.influencers.slice(0, 10).map(({ name, specialty, influence_score, outbound_referrals, inbound_referrals, network_size }) =>
      ({ name, specialty, influence_score, outbound_referrals, inbound_referrals, network_size })),
    specialty_gaps: a.network_gaps.slice(0, 8).map(({ specialty, total_providers, active_referrers, utilization_percent }) =>
      ({ specialty, total_providers, active_referrers, utilization_percent })),
  };
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await anthropic.messages.create({
      model: CLAUDE_MODELS.SONNET,
      max_tokens: 1500,
      messages: [{
        role: "user",
        content: `You advise a healthcare business-development team. Using ONLY the computed referral-network facts below (do not invent providers, numbers or specialties), reply with JSON only, no prose, in exactly this shape:
{"expansion_opportunities":[{"opportunity":"","rationale":"","expected_impact":""}],"partnership_recommendations":[{"focus_area":"","action":"","priority":"High|Medium|Low"}],"gap_filling_strategies":[{"specialty":"","strategy":"","timeline":""}],"influence_strategy":""}
Give 2-4 items per list. Cite the numbers you rely on.

Facts:
${JSON.stringify(facts)}`,
      }],
    });
    const text = (res.content.find((b: any) => b.type === "text") as any)?.text || "";
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const recommendations = sanitizeRecommendations(JSON.parse(json), fallback);
    return { recommendations, source: recommendations === fallback ? "rules" : "ai" };
  } catch (e: any) {
    console.warn("[analyzeProviderNetwork] AI recommendations failed:", e?.message);
    return { recommendations: fallback, source: "rules" };
  }
}

export async function handleAnalyzeProviderNetwork(payload: any) {
  const key = cacheKey(payload);
  const fresh = payload?.force_refresh !== true;
  let analysis = fresh ? analysisCache.get(key) : undefined;
  if (!analysis || Date.now() - analysis.at > ANALYSIS_TTL_MS) {
    const built = await withClient("15s", async (client) => {
      const { seeds, scope } = await loadSeeds(client, payload);
      if (seeds.length === 0) return null;
      const edges = await loadEdges(client, seeds, scope);
      const info = await loadProviderInfo(client, seeds);
      return buildNetworkAnalysis({ edges, seeds, info, scope });
    }).catch((e) => {
      if (isTimeout(e)) throw new HttpError(503, "The referral data took too long to load. Try a smaller scope (a state or a lead list).");
      throw e;
    });
    if (!built) {
      return { success: false, error: "No providers found for that scope. Pick another state or lead list." };
    }
    if (built.network_metrics.total_relationships === 0 && built.scope.type === "sample") {
      return { success: false, notConfigured: true, error: "No referral data has been imported yet. Import the CMS shared-patient (referral) dataset first." };
    }
    analysis = { at: Date.now(), analysis: built };
    if (analysisCache.size > 50) analysisCache.delete(analysisCache.keys().next().value as string);
    analysisCache.set(key, analysis);
  }

  const result: any = { ...analysis.analysis, generated_at: new Date(analysis.at).toISOString() };
  const rules = ruleRecommendations(analysis.analysis);
  if (payload?.analysis_type === "full") {
    const cached = fresh ? aiCache.get(key) : undefined;
    if (cached && cached.analysisAt === analysis.at && Date.now() - cached.at < AI_TTL_MS) {
      result.recommendations = cached.recommendations;
      result.recommendations_source = "ai";
    } else {
      const { recommendations, source } = await aiRecommendations(analysis.analysis, rules);
      if (source === "ai") {
        if (aiCache.size > 50) aiCache.delete(aiCache.keys().next().value as string);
        aiCache.set(key, { at: Date.now(), analysisAt: analysis.at, recommendations });
      }
      result.recommendations = recommendations;
      result.recommendations_source = source;
    }
  } else {
    result.recommendations = rules;
    result.recommendations_source = "rules";
  }
  return { success: true, analysis: result };
}
