// The tools' data access, backed by the same handlers the app's pages use, so
// the assistant sees exactly what a user of the app would.
import { handleSearchProviders } from "../../functions/search";
import { handleGetComprehensiveReport } from "../../functions/comprehensiveReport";
import { handleGetCountyIntelligence } from "../../functions/countyIntelligence";
import { handleGetTerritoryData } from "../../functions/territory";
import { handleGetReferralNetworkData } from "../../functions/referralNetwork";
import { getDashboardStats } from "../dashboardStats";
import { withTimeoutClient } from "../pgClient";
import { escapeLike } from "../providerSearch";
import { normalizeEntityType } from "../specialtyGroups";
import { pickScore, providerName } from "../territory";
import { ASSISTANT_CONFIG } from "./config";
import type { AssistantStore } from "./store";
import type { ProposedAction, ProviderBrief, ToolDeps } from "./tools";

const PREVIEW_SIZE = 10;

export async function describeProviders(pool: any, npis: string[]): Promise<Map<string, ProviderBrief>> {
  const out = new Map<string, ProviderBrief>();
  if (npis.length === 0) return out;
  await withTimeoutClient(pool, "8s", async (client: any) => {
    const [provs, taxes, locs, scores] = await Promise.all([
      client.query("SELECT npi, entity_type, first_name, last_name, organization_name, credential, ai_outreach_score FROM providers WHERE npi = ANY($1)", [npis]),
      client.query("SELECT npi, taxonomy_description FROM provider_taxonomies WHERE npi = ANY($1) AND is_primary = true", [npis]),
      client.query("SELECT npi, location_type, city, state FROM provider_locations WHERE npi = ANY($1) LIMIT $2", [npis, npis.length * 4]),
      client.query("SELECT npi, score FROM lead_scores WHERE npi = ANY($1)", [npis]),
    ]);
    const tax = new Map(taxes.rows.map((t: any) => [t.npi, t.taxonomy_description]));
    const loc = new Map<string, any>();
    for (const l of locs.rows) {
      const cur = loc.get(l.npi);
      if (!cur || (cur.location_type !== "Practice" && l.location_type === "Practice")) loc.set(l.npi, l);
    }
    const score = new Map(scores.rows.map((s: any) => [s.npi, s.score]));
    for (const p of provs.rows) {
      const l = loc.get(p.npi);
      out.set(p.npi, {
        npi: p.npi,
        name: providerName(p, p.npi),
        entityType: normalizeEntityType(p.entity_type),
        specialty: (tax.get(p.npi) as string) || null,
        city: l?.city || null,
        state: l?.state || null,
        score: pickScore(score.get(p.npi), p.ai_outreach_score).score,
      });
    }
  });
  return out;
}

export function createToolDeps(pool: any, store: AssistantStore): ToolDeps {
  return {
    searchProviders: (payload) => handleSearchProviders(payload),
    describeProviders: (npis) => describeProviders(pool, npis),
    getProviderReport: (npi) => handleGetComprehensiveReport({ npi }),
    getCountyIntelligence: (payload) => handleGetCountyIntelligence(payload),
    getTerritoryData: (payload) => handleGetTerritoryData(payload),
    getReferralNetwork: (payload, user) => handleGetReferralNetworkData(payload, user),
    getDashboardStats: () => getDashboardStats(),

    async listLeadLists({ nameContains, limit }) {
      const { rows } = nameContains
        ? await pool.query(
          "SELECT id, name, description, member_count, created_by, updated_date FROM lead_lists WHERE name ILIKE $1 ORDER BY updated_date DESC NULLS LAST, id DESC LIMIT $2",
          [`%${escapeLike(nameContains)}%`, limit],
        )
        : await pool.query("SELECT id, name, description, member_count, created_by, updated_date FROM lead_lists ORDER BY updated_date DESC NULLS LAST, id DESC LIMIT $1", [limit]);
      return rows;
    },

    async getLeadList(id, limit) {
      const { rows } = await pool.query("SELECT id, name, description, member_count FROM lead_lists WHERE id = $1", [id]);
      if (!rows[0]) return null;
      const members = await pool.query(
        "SELECT npi, status FROM lead_list_members WHERE list_id = $1 AND npi IS NOT NULL ORDER BY id LIMIT $2",
        [id, limit],
      );
      return { list: rows[0], members: members.rows };
    },

    async existingNpis(npis) {
      if (npis.length === 0) return [];
      const { rows } = await pool.query("SELECT npi FROM providers WHERE npi = ANY($1)", [npis]);
      return rows.map((r: any) => r.npi);
    },

    async createProposal(input): Promise<ProposedAction> {
      const previewMap = await describeProviders(pool, input.npis.slice(0, PREVIEW_SIZE));
      const preview = input.npis.slice(0, PREVIEW_SIZE).map((npi) => previewMap.get(npi)).filter((b): b is ProviderBrief => Boolean(b));
      const payload = { name: input.name, description: input.description, npis: input.npis, reason: input.reason, preview };
      const row = await store.createAction({
        conversationId: input.conversationId,
        turnId: input.turnId,
        userId: input.userId,
        toolUseId: input.toolUseId,
        kind: "create_lead_list",
        payload,
        expiresAt: new Date(Date.now() + ASSISTANT_CONFIG.proposalTtlMs),
      });
      return { id: row.id, kind: "create_lead_list", status: row.status, payload, expiresAt: new Date(row.expires_at).toISOString() };
    },
  };
}
