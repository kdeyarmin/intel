// getReferralNetworkData: the providers and real referral edges the Referral
// Network page draws, for a state, a lead list, one provider's partners, or
// (with none of those) a labelled nationwide sample. Index-backed IN queries
// only; never a scan or GROUP BY over cms_referrals.
import { pool } from "../db";
import { HttpError, loadEdges, loadSeeds } from "./networkAnalysis";
import { isStatementTimeout, withTimeoutClient } from "../lib/pgClient";
import { edgesFromReferrals, type AnalysisScope } from "../lib/networkAnalysis";
import {
  buildNodeDetails,
  clampLimit,
  DEFAULT_EDGES,
  DEFAULT_NODES,
  MAX_EDGES,
  MAX_NODES,
  selectNetwork,
  withDetails,
} from "../lib/referralNetwork";
import { consumeToken } from "../middleware/rateLimit";

const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 100;
const MAX_PARTNER_EDGES = 5000;
const cache = new Map<string, { at: number; body: any }>();

const isNpi = (v: unknown): v is string => typeof v === "string" && /^\d{10}$/.test(v);

function scopeKey(payload: any, orgId?: number | null) {
  if (isNpi(payload?.npi)) return `npi:${payload.npi}`;
  const listId = Number(payload?.lead_list_id);
  // Per organization: another organization's request for the same list id must reach the ownership check, not a cached answer.
  if (Number.isInteger(listId) && listId > 0) return `list:${orgId ?? "none"}:${listId}`;
  const state = String(payload?.state || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? `state:${state}` : "sample";
}

/** One provider and everyone it shares patients with, plus the edges among those partners. */
async function providerScope(client: any, npi: string) {
  const { rows: [p] } = await client.query("SELECT npi, first_name, last_name, organization_name FROM providers WHERE npi = $1", [npi]);
  const name = p ? p.organization_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || npi : npi;
  const scope: AnalysisScope = { type: "provider", npi, label: `Referral partners of ${name} (${npi})`, seed_count: 1, truncated: false };
  const direct = await loadEdges(client, [npi], scope);
  const partners = [...new Set(direct.flatMap((e) => [e.source, e.target]))].filter((n) => n !== npi);
  let among: ReturnType<typeof edgesFromReferrals> = [];
  if (partners.length) {
    const { rows } = await client.query(
      `SELECT npi, referred_to_npi, total_referrals FROM cms_referrals
        WHERE npi = ANY($1) AND referred_to_npi = ANY($1) LIMIT $2`,
      [partners, MAX_PARTNER_EDGES],
    );
    if (rows.length >= MAX_PARTNER_EDGES) scope.truncated = true;
    among = edgesFromReferrals(rows);
  }
  return { seeds: [npi], scope, edges: [...direct, ...among] };
}

async function hasReferralData(client: any): Promise<boolean> {
  // Served by the partial index on referred_to_npi.
  const { rows } = await client.query("SELECT 1 FROM cms_referrals WHERE referred_to_npi IS NOT NULL LIMIT 1");
  return rows.length > 0;
}

async function loadDetails(client: any, npis: string[], state: string | null) {
  if (npis.length === 0) return new Map();
  const [providers, taxonomies, locations] = await Promise.all([
    client.query("SELECT npi, entity_type, first_name, last_name, organization_name, credential FROM providers WHERE npi = ANY($1)", [npis]),
    client.query("SELECT npi, taxonomy_code, taxonomy_description FROM provider_taxonomies WHERE npi = ANY($1) AND is_primary = true", [npis]),
    // One location per provider: a practice in the scoped state, else any
    // practice, else whatever there is (a provider can have hundreds of rows
    // across several states; each lookup is one index probe).
    client.query(
      `SELECT l.npi, l.location_type, l.city, l.state
         FROM unnest($1::varchar[]) AS n(npi)
         CROSS JOIN LATERAL (
           SELECT npi, location_type, city, state FROM provider_locations
            WHERE npi = n.npi
            ORDER BY coalesce(location_type = 'Practice' AND state = $2::varchar, false) DESC,
                     (location_type = 'Practice') DESC NULLS LAST
            LIMIT 1
         ) l`,
      [npis, state],
    ),
  ]);
  return buildNodeDetails(npis, { providers: providers.rows, taxonomies: taxonomies.rows, locations: locations.rows });
}

export async function handleGetReferralNetworkData(payload: any, user?: { id: number; orgId?: number | null } | null) {
  const maxNodes = clampLimit(payload?.limit_nodes, DEFAULT_NODES, MAX_NODES);
  const maxEdges = clampLimit(payload?.limit_edges, DEFAULT_EDGES, MAX_EDGES);
  const orgId = user?.orgId ?? null;
  const key = `${scopeKey(payload, orgId)}|${maxNodes}|${maxEdges}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return { ...hit.body, cached: true };

  // Building a network is a few heavy queries; limit how often one person can start one.
  if (user && !consumeToken(`referral_network:${user.id}`, 20, 60_000)) {
    throw new HttpError(429, "You're loading networks too quickly. Wait a minute and try again.");
  }

  try {
    const body = await withTimeoutClient(pool, "20s", async (client) => {
      if (!(await hasReferralData(client))) {
        return {
          notConfigured: true,
          message: "No referral data has been imported yet. An admin can import the CMS Physician Shared Patient Patterns dataset from the Data Center.",
          nodes: [],
          edges: [],
          scope: null,
          summary: null,
        };
      }
      const loaded = isNpi(payload?.npi)
        ? await providerScope(client, payload.npi)
        : await (async () => {
            const { seeds, scope } = await loadSeeds(client, payload, orgId);
            return { seeds, scope, edges: seeds.length ? await loadEdges(client, seeds, scope) : [] };
          })();

      const picked = selectNetwork({ edges: loaded.edges, seeds: loaded.seeds, maxNodes, maxEdges, focusNpi: isNpi(payload?.npi) ? payload.npi : null });
      const details = await loadDetails(client, picked.nodes.map((n) => n.npi), loaded.scope.type === "state" ? loaded.scope.state ?? null : null);
      return {
        nodes: withDetails(picked.nodes, details),
        edges: picked.edges,
        scope: loaded.scope,
        summary: picked.summary,
        generated_at: new Date().toISOString(),
      };
    });
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), body });
    return body;
  } catch (e: any) {
    if (isStatementTimeout(e)) {
      throw new HttpError(503, "The referral data took too long to load. Try a smaller scope: a state, a lead list or one provider.");
    }
    throw e;
  }
}

/** Tests. */
export function clearReferralNetworkCache() {
  cache.clear();
}
