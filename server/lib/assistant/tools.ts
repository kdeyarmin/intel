// The assistant's tools. Each input is validated with zod before it runs (the
// API streams tool input without validating it), each result is projected to
// the fields the model needs and capped in size, and the only write is a
// proposal the user confirms in the app (propose_lead_list).
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { SPECIALTY_GROUPS } from "../specialtyGroups";
import { ASSISTANT_CONFIG } from "./config";

type Tool = Anthropic.Beta.BetaTool;

/** Data access the tools need; the real implementation is in data.ts. */
export interface ToolDeps {
  searchProviders(payload: { q?: string; state?: string; entity_type?: string; specialty_group?: string; limit: number }): Promise<{ providers: any[]; truncated?: boolean }>;
  describeProviders(npis: string[]): Promise<Map<string, ProviderBrief>>;
  getProviderReport(npi: string): Promise<any>;
  getCountyIntelligence(payload: { state: string; county_fips?: string; county?: string }): Promise<any>;
  /** The county's market rollups (server/functions/market.ts); null when the rollups aren't computed. */
  getCountyMarket(payload: { state: string; county_fips: string }): Promise<any>;
  getReferralSources(payload: { state: string; county_fips?: string; setting?: string; limit: number }): Promise<any>;
  /** CMS files on one provider: ordering eligibility and the referral-source rollup row. */
  getProviderCMSData(npi: string): Promise<any>;
  getTerritoryData(payload: { state: string; specialty_group?: string }): Promise<any>;
  getReferralNetwork(payload: Record<string, unknown>, user: { id: number }): Promise<any>;
  getDashboardStats(): Promise<any>;
  listLeadLists(opts: { nameContains?: string; limit: number }): Promise<any[]>;
  getLeadList(id: number, limit: number): Promise<{ list: any; members: Array<{ npi: string; status: string | null }> } | null>;
  existingNpis(npis: string[]): Promise<string[]>;
  /** Writes nothing once `signal` is aborted (the turn was stopped or timed out). */
  createProposal(input: ProposalInput, signal?: AbortSignal): Promise<ProposedAction>;
}

export interface ProviderBrief {
  npi: string;
  name: string;
  entityType: string;
  specialty: string | null;
  city: string | null;
  state: string | null;
  score: number | null;
}

export interface ProposalInput {
  userId: number;
  conversationId: number;
  turnId: number;
  toolUseId: string;
  name: string;
  description: string | null;
  npis: string[];
  reason: string | null;
}

export interface ProposedAction {
  id: string;
  kind: "create_lead_list";
  status: string;
  payload: { name: string; description: string | null; npis: string[]; reason: string | null; preview: ProviderBrief[] };
  expiresAt: string;
}

export interface ToolContext {
  userId: number;
  conversationId: number;
  turnId: number;
  toolUseId: string;
  deps: ToolDeps;
  /** Aborted when the turn is stopped or times out: no side effects after that. */
  signal?: AbortSignal;
}

export interface ToolOutcome {
  content: string;
  isError?: boolean;
  action?: ProposedAction;
}

/** A tool failure whose message is safe and useful to show the model. */
export class ToolError extends Error {}

/** Returned by a tool that sets its own result text (and maybe an action). */
class Outcome {
  constructor(public value: ToolOutcome) {}
}

const STATE = z.string().regex(/^[A-Za-z]{2}$/).describe("Two-letter state code, e.g. PA");
const NPI = z.string().regex(/^\d{10}$/).describe("10-digit NPI");
const GROUP_KEYS = SPECIALTY_GROUPS.map((g) => g.key) as [string, ...string[]];
const GROUP = z.enum(GROUP_KEYS).describe("Specialty group, matched by NUCC taxonomy code");

interface ToolSpec<S extends z.ZodType> {
  name: string;
  description: string;
  input: S;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

function spec<S extends z.ZodType>(s: ToolSpec<S>): ToolSpec<S> {
  return s;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

function nameOf(p: any): string {
  const person = [p?.first_name, p?.last_name].filter(Boolean).join(" ");
  return (p?.organization_name && !person ? p.organization_name : person) || p?.organization_name || p?.npi || "Unknown";
}

async function briefs(deps: ToolDeps, npis: string[]): Promise<ProviderBrief[]> {
  const map = await deps.describeProviders(npis);
  return npis.map((npi) => map.get(npi) || { npi, name: npi, entityType: "Unknown", specialty: null, city: null, state: null, score: null });
}

const TOOL_SPECS = [
  spec({
    name: "search_providers",
    description:
      "Find providers by person name, organization name or NPI, optionally within a state or entity type; or, with specialty_group and no query, list providers in that specialty (optionally in a state). Use it whenever the user names a provider or organization, or asks who practices a specialty somewhere. Returns up to 25 providers with NPI, name, specialty, city, state and lead score (null = unscored).",
    input: z.object({
      query: z.string().max(200).optional().describe("Last name (\"Smith\", \"John Smith\"), organization name or part of it, or an NPI"),
      state: STATE.optional(),
      entity_type: z.enum(["Individual", "Organization"]).optional(),
      specialty_group: GROUP.optional(),
      limit: z.number().int().min(1).max(25).optional().describe("Default 10"),
    }),
    async run(input, ctx) {
      const q = input.query?.trim() || "";
      if (q.length < 2 && !input.specialty_group) throw new ToolError("Give a name, organization or NPI (2+ characters), or a specialty_group.");
      const limit = input.limit ?? 10;
      const found = await ctx.deps.searchProviders({
        q, limit, state: input.state?.toUpperCase(), entity_type: input.entity_type, specialty_group: q.length < 2 ? input.specialty_group : undefined,
      });
      const npis = (found.providers || []).map((p: any) => String(p.npi)).filter(Boolean).slice(0, limit);
      return {
        providers: await briefs(ctx.deps, npis),
        more_available: Boolean(found.truncated),
      };
    },
  }),
  spec({
    name: "get_provider_profile",
    description:
      "Everything the app holds on one provider by NPI: identity, specialties, practice locations, Medicare utilization totals and top services, the providers they share the most Medicare patients with (and who shares patients with them), Medicare ordering eligibility and referral potential, lead score, linked facilities and affiliations. Use it before describing or recommending a specific provider.",
    input: z.object({ npi: NPI }),
    async run({ npi }, ctx) {
      const r = await ctx.deps.getProviderReport(npi);
      if (!r?.provider) return { found: false, npi, note: "No provider with this NPI is in the app's data." };
      const cms = await ctx.deps.getProviderCMSData(npi).catch(() => null);
      const potential = cms?.referral_potential ?? null;
      const topServices = [...(r.utilization || [])]
        .sort((a: any, b: any) => (num(b.totalServices) || 0) - (num(a.totalServices) || 0))
        .slice(0, 10)
        .map((u: any) => ({ service: u.serviceType, services: num(u.totalServices), beneficiaries: num(u.totalBeneficiaries), payment: num(u.totalPayment), year: u.dataYear }));
      return {
        found: true,
        provider: {
          npi: r.provider.npi, name: r.provider.displayName, entity_type: r.provider.entityType,
          credential: r.provider.credential || null, status: r.provider.status || null,
          email: r.provider.email || null, phone: r.provider.phone || null,
        },
        specialties: (r.taxonomies || []).slice(0, 5).map((t: any) => ({ code: t.taxonomy_code, description: t.taxonomy_description, primary: Boolean(t.is_primary) })),
        locations: (r.locations || []).slice(0, 5).map((l: any) => ({ type: l.location_type, address: l.address_1, city: l.city, state: l.state, zip: l.zip, phone: l.phone || null })),
        medicare: {
          latest_year_totals: { payments: r.summary?.totalPayments ?? null, services: r.summary?.totalServices ?? null, beneficiaries: r.summary?.totalBeneficiaries ?? null },
          years: r.summary?.utilizationYears || [],
          top_services: topServices,
        },
        shares_patients_with: (r.referralsFrom || []).slice(0, 10).map((x: any) => ({ npi: x.toNpi, name: x.toName || null, shared_patients: num(x.totalReferrals), year: x.dataYear })),
        receives_patients_from: (r.referralsTo || []).slice(0, 10).map((x: any) => ({ npi: x.fromNpi, name: x.fromName || null, shared_patients: num(x.totalReferrals), year: x.dataYear })),
        medicare_ordering: cms?.order_referring
          ? { part_b: Boolean(cms.order_referring.partb), home_health: Boolean(cms.order_referring.hha), hospice: Boolean(cms.order_referring.hospice), dme: Boolean(cms.order_referring.dme), as_of: cms.order_referring.as_of ?? null }
          : null,
        referral_potential: potential
          ? {
            index: num(potential.referral_index), rank_in_county: num(potential.rank_in_county), county: potential.county_name ?? potential.county_fips ?? null,
            medicare_beneficiaries: num(potential.benes), avg_risk_score: num(potential.avg_risk_score), hospital_affiliations: Array.isArray(potential.hospital_ccns) ? potential.hospital_ccns.length : 0,
            year: potential.data_year ?? null,
            note: "Index: 50 points for Medicare beneficiaries served (full at 500), 25 for patient risk (full at 2.5), 25 for home health and hospice ordering eligibility. Not confirmed referrals.",
          }
          : null,
        lead_score: r.leadScore ? { score: num(r.leadScore.score), outreach_potential: num(r.leadScore.outreach_potential), referral_likelihood: num(r.leadScore.referral_likelihood) } : null,
        facilities: (r.facilities || []).slice(0, 5).map((f: any) => ({ name: f.name, type: f.facilityType, city: f.city, state: f.state, rating: f.qualityRating ?? null, year: f.dataYear })),
        affiliations: (r.affiliations || []).slice(0, 5).map((a: any) => ({ organization: a.organization_name, organization_npi: a.organization_npi, type: a.affiliation_type })),
      };
    },
  }),
  spec({
    name: "get_area_summary",
    description:
      "Summarize a place. With a county (name or 5-digit FIPS): provider counts, top specialties, the highest-scored providers, Medicare facilities, top shared-patient pairs, top Medicare services, and the county's market (Medicare beneficiaries and Medicare Advantage share, the hospitals discharging its residents, post-acute market shares by setting, and the clinicians most likely to refer). Without a county: a state view with provider density by county and the highest-scored providers (optionally for one specialty_group). Use it for questions about a market, territory, county or state.",
    input: z.object({
      state: STATE,
      county: z.string().max(100).optional().describe("County name (\"Allegheny\") or 5-digit FIPS (\"42003\")"),
      specialty_group: GROUP.optional().describe("State view only: limit to this specialty group"),
    }),
    async run(input, ctx) {
      const state = input.state.toUpperCase();
      if (input.county) {
        const county = input.county.trim();
        const r = await ctx.deps.getCountyIntelligence(/^\d{5}$/.test(county) ? { state, county_fips: county } : { state, county });
        if (r?.notLoaded) throw new ToolError(r.message || "County geography isn't loaded.");
        if (r?.needsCounty) {
          return { error: `No county called "${county}" in ${state}.`, counties_in_state: (r.counties || []).map((c: any) => `${c.name} (${c.fips})`) };
        }
        return {
          county: r.county, state: r.state,
          providers: {
            total: r.summary?.totalProviders ?? null,
            total_is_exact: Boolean(r.summary?.providersExact),
            described_sample: r.summary?.sampledProviders ?? null,
            individuals_in_sample: r.summary?.individualProviders ?? null,
            organizations_in_sample: r.summary?.orgProviders ?? null,
          },
          sample_note: r.sample?.sampled ? `Figures below describe a sample of ${r.summary?.sampledProviders ?? "the"} providers; referrals and services cover the first ${r.sample?.detail_limit ?? ""}.` : null,
          top_specialties: (r.topSpecialties || []).slice(0, 10),
          top_providers: (r.providers || []).filter((p: any) => p.score != null).slice(0, 15).map((p: any) => ({ npi: p.npi, name: p.name, specialty: p.specialty, score: p.score })),
          facilities_by_type: (r.facilitySummary || []).slice(0, 10),
          facilities: (r.facilities || []).slice(0, 10).map((f: any) => ({ name: f.name, type: f.group || f.type, city: f.city })),
          top_shared_patient_pairs: (r.referrals || []).slice(0, 10).map((x: any) => ({ from: `${x.fromName} (${x.fromNpi})`, to: `${x.toName} (${x.toNpi})`, shared_patients: x.totalReferrals })),
          top_services: (r.topServices || []).slice(0, 10),
          market: await marketBlock(ctx, state, r.county?.fips),
        };
      }
      const t = await ctx.deps.getTerritoryData({ state, specialty_group: input.specialty_group });
      const providers = t?.providers || [];
      const groups = new Map<string, number>();
      for (const p of providers) groups.set(p.specialtyGroup || "other", (groups.get(p.specialtyGroup || "other") || 0) + 1);
      return {
        state,
        scope: t?.scope?.label || null,
        approx_practice_locations_in_state: t?.scope?.approx_locations_in_state ?? null,
        counties_by_practice_locations: (t?.counties || []).filter((c: any) => c.practice_locations > 0).slice(0, 15),
        specialty_groups_in_sample: [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([group, count]) => ({ group, count })),
        top_scored_providers: providers.filter((p: any) => p.score != null).sort((a: any, b: any) => b.score - a.score).slice(0, 15)
          .map((p: any) => ({ npi: p.npi, name: p.name, specialty: p.specialty, city: p.city, county: p.county, score: p.score })),
        unscored_in_sample: providers.filter((p: any) => p.score == null).length,
      };
    },
  }),
  spec({
    name: "get_referral_network",
    description:
      "Medicare shared-patient network for one provider (npi), a state, or a lead list (lead_list_id): the busiest providers with how many patients they send and receive and their number of partners, plus the strongest connections. Use it for questions about referral sources, who a provider works with, or network hubs. Give exactly one of npi, state or lead_list_id.",
    input: z.object({
      npi: NPI.optional(),
      state: STATE.optional(),
      lead_list_id: z.number().int().positive().optional(),
    }),
    async run(input, ctx) {
      const scopes = [input.npi, input.state, input.lead_list_id].filter((v) => v != null);
      if (scopes.length !== 1) throw new ToolError("Give exactly one of npi, state or lead_list_id.");
      const payload = input.npi ? { npi: input.npi } : input.state ? { state: input.state.toUpperCase() } : { lead_list_id: input.lead_list_id };
      const r = await ctx.deps.getReferralNetwork({ ...payload, limit_nodes: 40, limit_edges: 60 }, { id: ctx.userId });
      if (r?.notConfigured) return { available: false, note: r.message };
      const nodes = [...(r?.nodes || [])];
      const names = new Map(nodes.map((n: any) => [n.npi, n.name]));
      return {
        scope: r?.scope || null,
        summary: r?.summary || null,
        busiest_providers: nodes.sort((a: any, b: any) => (b.totalVolume || 0) - (a.totalVolume || 0)).slice(0, 20).map((n: any) => ({
          npi: n.npi, name: n.name, specialty: n.specialty || null, city: n.city || null, state: n.state || null,
          patients_sent: n.outbound, patients_received: n.inbound, partners: n.partners, hub: Boolean(n.isHub),
        })),
        strongest_connections: (r?.edges || []).slice(0, 20).map((e: any) => ({
          from: `${names.get(e.source) || e.source} (${e.source})`, to: `${names.get(e.target) || e.target} (${e.target})`, shared_patients: e.volume,
        })),
      };
    },
  }),
  spec({
    name: "get_dashboard_stats",
    description:
      "App-wide headline numbers: approximate record counts (providers, locations, referrals, utilization rows, facilities), email coverage estimates, top states, import status, open data-quality alerts and the latest data refresh. Use it for questions about the data as a whole.",
    input: z.object({}),
    async run(_input, ctx) {
      const s = await ctx.deps.getDashboardStats();
      return {
        note: "Totals are table-size estimates; email and phone figures are extrapolated from samples. top_states counts come from a sample of 10,000 provider locations: use them to rank states, not as state totals.",
        totals: {
          providers: s.totalProviders, locations: s.totalLocations, referral_pairs: s.totalReferrals,
          utilization_rows: s.totalUtilization, facilities: s.totalFacilities,
        },
        email: s.emailStats,
        top_states: s.topStates,
        imports: s.imports,
        open_data_quality_alerts: s.openAlerts,
        data_quality_score: s.dataQuality?.score ?? null,
        last_data_refresh: s.lastRefresh,
        insights: s.proactiveInsights,
      };
    },
  }),
  spec({
    name: "list_lead_lists",
    description: "The team's lead lists, most recently updated first, with id, name, description, member count and creator. Use it when the user mentions their lists or before reading one.",
    input: z.object({
      name_contains: z.string().max(100).optional(),
      limit: z.number().int().min(1).max(50).optional().describe("Default 20"),
    }),
    async run(input, ctx) {
      const lists = await ctx.deps.listLeadLists({ nameContains: input.name_contains?.trim() || undefined, limit: input.limit ?? 20 });
      return {
        lead_lists: lists.map((l: any) => ({
          id: l.id, name: l.name, description: l.description || null, members: l.member_count ?? 0, created_by: l.created_by || null, updated: l.updated_date,
        })),
      };
    },
  }),
  spec({
    name: "get_lead_list",
    description: "One lead list by id with its members (NPI, name, specialty, city, state, lead score, status). Use it to review, summarize or compare a list.",
    input: z.object({
      list_id: z.number().int().positive(),
      limit: z.number().int().min(1).max(100).optional().describe("Members to return, default 50"),
    }),
    async run(input, ctx) {
      const limit = input.limit ?? 50;
      const found = await ctx.deps.getLeadList(input.list_id, limit);
      if (!found) return { found: false, list_id: input.list_id };
      const npis = found.members.map((m) => m.npi);
      const status = new Map(found.members.map((m) => [m.npi, m.status]));
      return {
        found: true,
        list: { id: found.list.id, name: found.list.name, description: found.list.description || null, members: found.list.member_count ?? npis.length },
        members: (await briefs(ctx.deps, npis)).map((b) => ({ ...b, status: status.get(b.npi) || null })),
        members_shown: npis.length,
      };
    },
  }),
  spec({
    name: "propose_lead_list",
    description:
      "Propose a new lead list. This does not create it: the user sees a card with the list and creates it by pressing Confirm (or cancels). Use it only when the user asks for a list to be made, with NPIs that came back from other tools in this conversation.",
    input: z.object({
      // Trimmed before the length check, so a blank name is rejected here.
      name: z.string().trim().min(1).max(120),
      description: z.string().max(500).optional(),
      npis: z.array(NPI).min(1).max(ASSISTANT_CONFIG.maxProposalNpis),
      reason: z.string().max(300).optional().describe("One sentence on why these providers, shown on the card"),
    }),
    async run(input, ctx) {
      const unique = [...new Set(input.npis)];
      const known = new Set(await ctx.deps.existingNpis(unique));
      // A stopped or timed-out turn must not leave a proposal behind.
      if (ctx.signal?.aborted) throw new ToolError("The answer was stopped before the list was proposed.");
      const npis = unique.filter((n) => known.has(n));
      if (npis.length === 0) throw new ToolError("None of those NPIs are in the app's provider data, so there is nothing to propose.");
      const action = await ctx.deps.createProposal({
        userId: ctx.userId, conversationId: ctx.conversationId, turnId: ctx.turnId, toolUseId: ctx.toolUseId,
        name: input.name.trim(), description: input.description?.trim() || null, npis, reason: input.reason?.trim() || null,
      }, ctx.signal);
      return new Outcome({
        content: JSON.stringify({
          proposal_id: action.id,
          status: "awaiting_user_confirmation",
          providers: npis.length,
          dropped_unknown_npis: unique.length - npis.length,
          note: "The user now sees this list as a card with Confirm and Cancel. It has not been created.",
        }),
        action,
      });
    },
  }),
];

const SPECS = new Map<string, ToolSpec<any>>(TOOL_SPECS.map((s) => [s.name, s]));

function inputSchema(schema: z.ZodType): Tool["input_schema"] {
  const { $schema: _ignored, ...json } = z.toJSONSchema(schema) as Record<string, unknown>;
  return json as Tool["input_schema"];
}

/**
 * Tool definitions for the API, in a fixed order (they are part of the cached
 * prompt prefix). Inputs stream as they are generated; run validates them.
 */
export const ASSISTANT_TOOLS: Tool[] = TOOL_SPECS.map((s) => ({
  name: s.name,
  description: s.description,
  input_schema: inputSchema(s.input),
  eager_input_streaming: true,
}));

/** Cuts a JSON result to `max` characters by trimming its longest arrays. */
export function capJson(value: unknown, max: number = ASSISTANT_CONFIG.toolResultMaxChars): string {
  let text = JSON.stringify(value);
  if (text.length <= max || value == null || typeof value !== "object") {
    return text.length <= max ? text : `${text.slice(0, max)}… [cut: result exceeded ${max} characters]`;
  }
  const copy: any = structuredClone(value);
  const notes: string[] = [];
  const arrays = (obj: any, path: string[] = []): Array<{ path: string[]; arr: any[] }> => {
    const out: Array<{ path: string[]; arr: any[] }> = [];
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v)) out.push({ path: [...path, k], arr: v });
      else if (v && typeof v === "object" && path.length < 2) out.push(...arrays(v, [...path, k]));
    }
    return out;
  };
  const original = new Map(arrays(copy).map((a) => [a.path.join("."), a.arr.length]));
  for (let i = 0; i < 40 && text.length > max; i++) {
    const longest = arrays(copy).filter((a) => a.arr.length > 1).sort((a, b) => JSON.stringify(b.arr).length - JSON.stringify(a.arr).length)[0];
    if (!longest) break;
    longest.arr.splice(Math.ceil(longest.arr.length / 2));
    text = JSON.stringify(copy);
  }
  for (const a of arrays(copy)) {
    const before = original.get(a.path.join("."));
    if (before != null && before > a.arr.length) notes.push(`${a.path.join(".")}: first ${a.arr.length} of ${before}`);
  }
  if (notes.length) {
    copy._truncated = `Result shortened to fit: ${notes.join("; ")}.`;
    text = JSON.stringify(copy);
  }
  return text.length <= max + 300 ? text : `${text.slice(0, max)}… [cut: result exceeded ${max} characters]`;
}

/** Validates the input, runs the tool and turns any failure into an error result. */
export async function runTool(name: string, input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const s = SPECS.get(name);
  if (!s) return { content: `Unknown tool: ${name}`, isError: true };
  const parsed = s.input.safeParse(input ?? {});
  if (!parsed.success) {
    // The input arrived unvalidated (eager input streaming); hand it back so the model can retry.
    return {
      content: JSON.stringify({ INVALID_INPUT: JSON.stringify(input ?? null).slice(0, 2000), problems: parsed.error.issues.slice(0, 5).map((i: z.core.$ZodIssue) => `${i.path.join(".") || "input"}: ${i.message}`) }),
      isError: true,
    };
  }
  try {
    const result = await s.run(parsed.data, ctx);
    if (result instanceof Outcome) return result.value;
    return { content: capJson(result) };
  } catch (e: any) {
    if (e instanceof ToolError) return { content: e.message, isError: true };
    const status = Number(e?.status);
    if (status && status < 500 && typeof e?.message === "string") return { content: e.message, isError: true };
    if (status === 503 && typeof e?.message === "string") return { content: e.message, isError: true };
    console.error(`[assistant] tool ${name} failed:`, e?.message || e);
    return { content: "That lookup failed on the server. Try a narrower request or another tool.", isError: true };
  }
}

/** Short labels for the UI's tool chips, from the tool name and input. */
/**
 * The county's market in a few numbers (from the market rollups): demand,
 * hospital sources, post-acute shares and likely referral sources. Null when
 * the rollups aren't computed yet, so the rest of the summary still answers.
 */
async function marketBlock(ctx: ToolContext, state: string, countyFips: string | undefined) {
  if (!countyFips) return null;
  const [m, s] = await Promise.all([
    ctx.deps.getCountyMarket({ state, county_fips: countyFips }).catch(() => null),
    ctx.deps.getReferralSources({ state, county_fips: countyFips, limit: 10 }).catch(() => null),
  ]);
  if (!m && !s) return null;
  const p = m?.profile?.available ? m.profile : null;
  const pct = (v: unknown) => (v == null ? null : Math.round(Number(v) * 1000) / 10);
  const settings = m?.competitors ? Object.entries(m.competitors as Record<string, any>).filter(([, v]) => v?.rows?.length) : [];
  return {
    note: "Public CMS data (Medicare FFS). Hospital sources = where residents are hospitalized; discharge mix = post-discharge Medicare spend by setting, a proxy for destinations; market share = share of beneficiaries served by providers located in the county.",
    vintages: m?.vintages ?? null,
    profile: p ? {
      medicare_beneficiaries: num(p.benes), medicare_advantage_share_pct: pct(p.ma_penetration), aged_85_plus: num(p.benes_85_plus), dual_eligible: num(p.dual),
      home_health: { users: num(p.hha_users), users_pct_of_ffs: num(p.hha_users_pct), providers: num(p.hha_providers), spend_per_beneficiary: num(p.std_per_capita_hha) },
      hospice: { users: num(p.hospice_users), users_pct_of_ffs: num(p.hospice_users_pct), providers: num(p.hospice_providers), spend_per_beneficiary: num(p.std_per_capita_hospice) },
      skilled_nursing: { users: num(p.snf_users), users_pct_of_ffs: num(p.snf_users_pct), providers: num(p.snf_providers), spend_per_beneficiary: num(p.std_per_capita_snf) },
      readmission_rate_pct: pct(p.readmission_rate), hospitals_serving_residents: num(p.hospitals_serving),
    } : null,
    hospital_sources: (m?.hospital_sources?.rows || []).slice(0, 5).map((h: any) => ({
      ccn: h.ccn, name: h.name, share_of_county_cases_pct: pct(h.share), cases: num(h.cases),
      post_discharge_mix_pct: h.discharge_mix ? { snf: num(h.discharge_mix.pct_snf), home_health: num(h.discharge_mix.pct_hha), hospice: num(h.discharge_mix.pct_hospice) } : null,
    })),
    post_acute_market_share: Object.fromEntries(settings.map(([setting, v]: [string, any]) => [setting, {
      year: v.data_year, providers_in_county: num(v.rows[0]?.providers_in_market),
      top: v.rows.slice(0, 5).map((r: any) => ({ ccn: r.ccn, name: r.name, beneficiaries: num(r.benes), share_pct: pct(r.share), rank: num(r.rank) })),
    }])),
    likely_referral_sources: (s?.rows || []).slice(0, 10).map((r: any) => ({
      npi: r.npi, name: r.name, specialty: r.specialty, referral_index: num(r.referral_index), medicare_beneficiaries: num(r.benes),
      can_order: [r.eligible?.hha && "home health", r.eligible?.hospice && "hospice", r.eligible?.dme && "DME"].filter(Boolean), lead_score: num(r.lead_score),
    })),
  };
}

export function toolLabel(name: string, input: any): string {
  const i = input && typeof input === "object" ? input : {};
  switch (name) {
    case "search_providers":
      return i.query ? `Searched providers for “${String(i.query).slice(0, 60)}”${i.state ? ` in ${i.state}` : ""}`
        : `Listed ${SPECIALTY_GROUPS.find((g) => g.key === i.specialty_group)?.label || "specialty"} providers${i.state ? ` in ${i.state}` : ""}`;
    case "get_provider_profile": return `Opened provider ${i.npi || ""}`.trim();
    case "get_area_summary": return i.county ? `Summarized ${i.county}, ${i.state || ""}`.trim() : `Summarized ${i.state || "a state"}`;
    case "get_referral_network": return i.npi ? `Loaded the referral network of ${i.npi}` : i.state ? `Loaded the ${i.state} referral network` : `Loaded the referral network of lead list ${i.lead_list_id ?? ""}`.trim();
    case "get_dashboard_stats": return "Read the dashboard numbers";
    case "list_lead_lists": return "Listed lead lists";
    case "get_lead_list": return `Opened lead list ${i.list_id ?? ""}`.trim();
    case "propose_lead_list": return `Prepared the list “${String(i.name || "").slice(0, 60)}” for your approval`;
    default: return name;
  }
}
