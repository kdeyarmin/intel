// On-demand AI quality analysis of an import: the Imports panel's "Generate
// Analysis" button. It samples rows the import stored, asks the model for a
// structured assessment and keeps the answer on the batch
// (`import_batches.ai_analysis`), which is what the panel renders.
//
// Ported from the Base44 function of the same name. What differs, on purpose:
// - Rows are sampled by key order under a statement timeout, never by
//   created_date: providers and medicare_facilities hold millions of rows, and
//   sorting them on an unindexed column to find "the newest 20" would read them all.
// - It covers every kind of import the importer writes (the typed datasets, the
//   facility-style ones kept in medicare_facilities, NPPES, order & referring,
//   utilization, shared patients), not the eight the original knew.
// - Only a platform admin may run it (the dispatcher already requires that),
//   it needs ANTHROPIC_API_KEY like the other AI functions here, and it is
//   rate-limited because every call spends tokens. There is no separate "AI
//   paused" switch: this is a button press, not a background job.
// - The model's answer is validated (scores clamped to 0-100, lists bounded)
//   before it is stored, because the panel renders it as is.
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  importBatches,
  providers,
  medicareFacilities,
  medicareHHAStats,
  medicareSNFStats,
  cmsOrderReferring,
  cmsReferrals,
  providerServiceUtilization,
} from "../db/schema";
import { CLAUDE_MODELS } from "../lib/aiModels";
import { recordAudit } from "../lib/audit";
import { isPlatformAdmin } from "../lib/roles";
import { consumeToken } from "../middleware/rateLimit";
import { TYPED_ROUTES } from "./cmsTypedTables";
import { notConfigured } from "./stubs";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Caller = { id?: number; email?: string | null; role?: string; isPlatformAdmin?: boolean } | null | undefined;

export const SAMPLE_SIZE = 20;
const SAMPLE_TIMEOUT = "15s";
const MAX_FIELD_CHARS = 200;
const MAX_NESTED_CHARS = 300;
const MAX_PROMPT_SAMPLE_CHARS = 24_000;
const SYSTEM_COLUMNS = new Set(["id", "created_date", "updated_date"]);

// ─── Where an import's rows live ─────────────────────────────────────────────

export type SampleSource =
  | { kind: "table"; table: any }
  | { kind: "facility"; facilityType: string };

/**
 * The table that holds what an import wrote, mirroring how the importer routes
 * rows (server/functions/triggerImport.ts): typed datasets have their own
 * table, a few types have a dedicated one, NPPES goes to providers, and every
 * other type is a facility-style dataset kept in medicare_facilities under its
 * own `facility_type`. Null when the type isn't one the importer writes.
 */
export function resolveSampleSource(importType: string | null | undefined): SampleSource | null {
  const raw = String(importType ?? "").trim();
  if (!raw) return null;
  const type = raw === "cms_utilization" ? "provider_service_utilization" : raw;
  if (/^nppes_/.test(type)) return { kind: "table", table: providers };
  if (TYPED_ROUTES[type]) return { kind: "table", table: TYPED_ROUTES[type].table };
  const dedicated: Record<string, any> = {
    cms_order_referring: cmsOrderReferring,
    provider_service_utilization: providerServiceUtilization,
    physician_shared_patient_patterns: cmsReferrals,
    medicare_hha_stats: medicareHHAStats,
    medicare_snf_stats: medicareSNFStats,
  };
  if (dedicated[type]) return { kind: "table", table: dedicated[type] };
  if (/^[a-z][a-z0-9_]{1,99}$/.test(type)) return { kind: "facility", facilityType: type };
  return null;
}

/** Up to SAMPLE_SIZE stored rows, found by key so a large table is never scanned or sorted. */
async function sampleRows(source: SampleSource): Promise<Record<string, unknown>[]> {
  return await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL statement_timeout = '${SAMPLE_TIMEOUT}'`));
    if (source.kind === "facility") {
      return await tx.select().from(medicareFacilities)
        .where(eq(medicareFacilities.facility_type, source.facilityType))
        .limit(SAMPLE_SIZE);
    }
    const query = tx.select().from(source.table);
    const ordered = source.table.id ? query.orderBy(desc(source.table.id)) : query;
    return await ordered.limit(SAMPLE_SIZE);
  }) as Record<string, unknown>[];
}

// ─── The sample the model sees ───────────────────────────────────────────────

function shorten(value: unknown): unknown {
  if (typeof value === "string") return value.length > MAX_FIELD_CHARS ? `${value.slice(0, MAX_FIELD_CHARS)}…` : value;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const json = JSON.stringify(value);
    return json.length > MAX_NESTED_CHARS ? `${json.slice(0, MAX_NESTED_CHARS)}…` : value;
  }
  return value;
}

/** Drops bookkeeping columns and bounds every value so a wide or text-heavy row can't blow up the prompt. */
export function cleanSample(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => !SYSTEM_COLUMNS.has(key))
        .map(([key, value]) => [key, shorten(value)]),
    ),
  );
}

/** Share of fields in the sample that hold a value, as a whole percent. */
export function completenessPercent(rows: Record<string, unknown>[]): number {
  let total = 0;
  let filled = 0;
  for (const row of rows) {
    for (const value of Object.values(row)) {
      total++;
      if (value !== null && value !== undefined && value !== "") filled++;
    }
  }
  return total > 0 ? Math.round((filled / total) * 100) : 0;
}

/** The sample as JSON, with trailing rows dropped until it fits the prompt budget. */
function promptSample(rows: Record<string, unknown>[]): { json: string; rows: number } {
  let kept = rows.length;
  let json = JSON.stringify(rows.slice(0, kept));
  while (json.length > MAX_PROMPT_SAMPLE_CHARS && kept > 1) {
    kept--;
    json = JSON.stringify(rows.slice(0, kept));
  }
  return { json, rows: kept };
}

// ─── The model's answer ──────────────────────────────────────────────────────

export interface DatasetAnalysis {
  completeness_score: number;
  quality_score: number;
  completeness_report: string;
  quality_issues: string[];
  trends_anomalies: string[];
  key_metrics_summary: string;
  overall_assessment: string;
  generated_at: string;
  model: string;
  sample_size: number;
}

const clampScore = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
};
const boundedText = (value: unknown, max: number): string => (typeof value === "string" ? value.trim().slice(0, max) : "");
const boundedList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, 10).map((item) => item.trim().slice(0, 300))
    : [];

/** The analysis from the model's reply (a bare or fenced JSON object), validated; null when it isn't usable. */
export function parseAnalysis(reply: string | null | undefined, meta: { model: string; sampleSize: number; now?: Date }): DatasetAnalysis | null {
  const text = String(reply ?? "").trim();
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
  const completeness = clampScore(parsed?.completeness_score);
  const quality = clampScore(parsed?.quality_score);
  if (completeness === null || quality === null) return null;
  return {
    completeness_score: completeness,
    quality_score: quality,
    completeness_report: boundedText(parsed.completeness_report, 1500),
    quality_issues: boundedList(parsed.quality_issues),
    trends_anomalies: boundedList(parsed.trends_anomalies),
    key_metrics_summary: boundedText(parsed.key_metrics_summary, 1500),
    overall_assessment: boundedText(parsed.overall_assessment, 1500),
    generated_at: (meta.now ?? new Date()).toISOString(),
    model: meta.model,
    sample_size: meta.sampleSize,
  };
}

const ANSWER_SHAPE = `{
  "completeness_score": <number 0-100>,
  "quality_score": <number 0-100>,
  "completeness_report": "<string>",
  "quality_issues": ["<string>", ...],
  "trends_anomalies": ["<string>", ...],
  "key_metrics_summary": "<string>",
  "overall_assessment": "<string>"
}`;

export function buildPrompt(importType: string, rawCompleteness: number, sampleJson: string, sampleRowCount: number): string {
  return `You are a top-tier healthcare data analyst.
Analyze this sample from a recent CMS data import (Import Type: ${importType}). The sample is ${sampleRowCount} of the rows stored for this import type; it is not necessarily from the latest batch.

The raw completeness ratio of the sample (filled fields vs total fields) is ${rawCompleteness}%.

Tasks:
1. Generate a summary report on import quality and completeness.
2. Assign a 'completeness_score' (0-100) and a 'quality_score' (0-100) based on your expert analysis of the data's utility and accuracy.
3. Suggest potential data quality issues (e.g., missing critical values, formatting inconsistencies).
4. Identify trends or anomalies in the data.
5. Provide a high-level summary of key metrics for this dataset.

Base every statement on the sample and the figures above; do not invent facts, and say so when the sample is too small to tell.

Sample data:
${sampleJson}

Respond with ONLY a JSON object (no markdown, no commentary) of this shape:
${ANSWER_SHAPE}`;
}

async function askModel(prompt: string): Promise<string | null> {
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await anthropic.messages.create({
      model: CLAUDE_MODELS.HAIKU,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    const block = res.content.find((b: any) => b.type === "text") as any;
    return block?.text?.trim() || null;
  } catch (e: any) {
    console.warn("[analyzeImportedDataset] AI call failed:", e?.message || e);
    return null;
  }
}

// ─── The function ────────────────────────────────────────────────────────────

export async function handleAnalyzeImportedDataset(payload: any, user?: Caller) {
  if (!isPlatformAdmin(user)) throw new HttpError(403, "Forbidden");
  if (!process.env.ANTHROPIC_API_KEY) {
    return notConfigured("AI dataset analysis needs an Anthropic API key (ANTHROPIC_API_KEY) on the server.", { batch_id: payload?.batch_id });
  }

  const batchId = Number(payload?.batch_id);
  if (!Number.isInteger(batchId) || batchId <= 0) throw new HttpError(400, "batch_id is required");
  if (!consumeToken(`analyzeImportedDataset:${user?.id ?? "anon"}`, 10, 60_000)) {
    throw new HttpError(429, "Too many analyses. Try again in a minute.");
  }

  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
  if (!batch) throw new HttpError(404, "Batch not found");

  const source = resolveSampleSource(batch.import_type);
  if (!source) return { success: false, error: `AI analysis isn't available for ${batch.import_type ?? "this"} imports yet.` };

  let rows: Record<string, unknown>[];
  try {
    rows = cleanSample(await sampleRows(source));
  } catch (e: any) {
    console.warn(`[analyzeImportedDataset] sampling failed for batch ${batchId}:`, e?.message || e);
    return { success: false, error: "Sampling the imported rows timed out. Try again later." };
  }
  if (rows.length === 0) {
    return { success: false, error: "No stored rows were found for this import type, so there is nothing to analyze." };
  }

  const sample = promptSample(rows);
  const prompt = buildPrompt(String(batch.import_type), completenessPercent(rows), sample.json, sample.rows);
  const analysis = parseAnalysis(await askModel(prompt), { model: CLAUDE_MODELS.HAIKU, sampleSize: sample.rows });
  if (!analysis) return { success: false, error: "The AI service didn't return a usable analysis. Try again in a moment." };

  // Stored on the batch because that is what the Imports panel reads. The batch's updated_date is left
  // alone: an annotation is not progress, and the stall checks read that column.
  await db.update(importBatches).set({ ai_analysis: analysis }).where(eq(importBatches.id, batchId));
  await recordAudit({
    event_type: "ai_analysis",
    user_email: user?.email ?? null,
    action: "Analyze imported dataset",
    entity_type: "import_batch",
    entity_id: batchId,
    details: { import_type: batch.import_type, sample_size: sample.rows, model: CLAUDE_MODELS.HAIKU },
  });

  return { success: true, analysis };
}
