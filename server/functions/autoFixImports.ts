// Port of base44/functions/autoFixImports/entry.ts —
// the import-repair bot. Runs on an interval (15m/1h). It scans
// import_batches for failed / paused / cancelled / stalled imports, classifies
// each failure (keyword heuristics, then an LLM diagnosis for the ambiguous
// ones), and restarts the ones that look recoverable: `nppes_registry`
// batches go back through the NPPES crawler's own retry path
// (`retry_errors`), everything else is re-fed to triggerImport with an
// incremented retry count and a resume offset.
//
// Storage notes (Base44 → Postgres):
// - The Base44 ImportBatch entity was schemaless and carried top-level
//   `retry_count`, `file_url`, `data_year` fields. The Postgres schema
//   (server/db/schema.ts → import_batches) has no such columns, so all three
//   are read from the existing `retry_params` jsonb column, which triggerImport
//   already writes (`retry_params: { file_url, year, retry_count, resume_offset,
//   retry_tags, ... }`). The retry cap uses the shared
//   MAX_AUTO_RETRY_ATTEMPTS (3) from server/lib/scheduling.ts — identical to
//   the original's `retry_count >= 3` guard.
// - The Base44 AuditEvent `timestamp` field does not exist on
//   `audit_events`; the row's `created_date` (defaultNow) records the time.
//   The bot's identity (`import_bot` / `import-bot@caremetricintel.com`) and the
//   details payload are written on the audit row, with `entity_type`/`entity_id` filled in so the
//   event joins back to the batch.
// - Fan-out calls Base44's `functions.invoke('nppesCrawler' | 'triggerImport')`
//   are replaced with direct in-process calls to
//   `handleNppesCrawler` / `handleTriggerImport` using their exact signatures,
//   with the maintenance module's SYSTEM_ADMIN_USER ({ role: "admin" }) so
//   triggerImport's admin-role assertion passes — the same convention as
//   server/lib/maintenance.ts.
// - Routing change vs the original: the original would push
//   `nppes_flat_file` / `nppes_registry_file` batches through triggerImport.
//   The Express triggerImport restarts flat-file imports from `byte_offset: 0`
//   (it does not honor `resume_offset`), so this port skips those types with
//   `self_resuming_import_type` — matching the explicit convention in
//   server/lib/maintenance.ts and server/lib/scheduling.ts
//   (SELF_RESUMING_IMPORT_TYPES): the crawler resumes itself (batch_resume /
//   watchdog) and flat-file imports are recovered on startup instead.
// - LLM: Base44's `integrations.Core.InvokeLLM` is replaced with the in-repo
//   Anthropic pattern (server/functions/outreach.ts `aiStrategy`): HAIKU,
//   500 max tokens, JSON asked for in the prompt and parsed from the text
//   block. The diagnosis prompt is the original's, verbatim. LLM use is gated
//   on `process.env.AI_FEATURES_ENABLED === "true"` (opt-in, unified
//   with the other AI modules; unset = LLM off). A failed / empty /
//   unparseable LLM answer falls through to `ignored` — it never fails
//   the run.

import { db } from "../db";
import { importBatches, auditEvents } from "../db/schema";
import { desc, eq } from "drizzle-orm";
import { CLAUDE_MODELS } from "../lib/aiModels";
import { MAX_AUTO_RETRY_ATTEMPTS, SELF_RESUMING_IMPORT_TYPES } from "../lib/scheduling";

// Synthetic admin used when this worker calls handleTriggerImport /
// handleNppesCrawler in-process. Real admin credentials are still enforced at
// the HTTP boundaries (routes/functions.ts, routes/maintenance.ts); this is
// just so the downstream admin-role assertion inside handleTriggerImport
// doesn't reject the internal call. Same convention as server/lib/maintenance.ts.
const SYSTEM_ADMIN_USER = { id: -1, email: "system@maintenance", role: "admin" } as const;

// The original fetched the newest 100 batches per status and processed all of
// them (no further per-run cap beyond that).
const MAX_BATCHES_PER_STATUS = 100;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

// AI diagnosis is opt-in, unified with the other AI modules: it runs only
// when AI_FEATURES_ENABLED is exactly "true".
const AI_ENABLED = process.env.AI_FEATURES_ENABLED === "true";

type RetryParams = Record<string, unknown>;

function retryParamsOf(batch: typeof importBatches.$inferSelect): RetryParams {
  return (batch.retry_params as RetryParams | null) ?? {};
}

function retryCountOf(batch: typeof importBatches.$inferSelect): number {
  const n = retryParamsOf(batch).retry_count;
  return typeof n === "number" && n >= 0 ? n : 0;
}

// ─── LLM failure diagnosis ───────────────────────────────────────────────────
// Mirrors the original's InvokeLLM call: same prompt, same three-way verdict,
// parsed from the model's JSON answer.

interface Diagnosis {
  action: "retry" | "auto_correct_and_retry" | "ignore";
  reason: string;
}

function extractJsonObject(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

async function diagnoseWithLLM(importType: string | null, errorSamples: unknown[]): Promise<Diagnosis | null> {
  if (!AI_ENABLED) return null;
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[autoFixImports] LLM diagnosis skipped: ANTHROPIC_API_KEY not set");
    return null;
  }
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // Prompt kept verbatim from the Base44 original.
    const prompt = `You are an AI data engineer. Analyze this import batch error and decide if it's a transient/system issue (like a temporary API failure, timeout, rate limit, connection drop) that should be retried, a data issue that can be auto-corrected (like missing columns, bad data types where defaults can be set) that should be retried, or a truly fatal issue that must be ignored.

Import Type: ${importType}
Errors: ${JSON.stringify(errorSamples.slice(0, 3))}

Respond with JSON: { "action": "retry" | "auto_correct_and_retry" | "ignore", "reason": "short explanation" }`;
    const res = await anthropic.messages.create({
      model: CLAUDE_MODELS.HAIKU,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (res.content.find((b: any) => b.type === "text") as any)?.text?.trim() || null;
    if (!text) return null;
    const parsed = JSON.parse(extractJsonObject(text));
    if (parsed && (parsed.action === "retry" || parsed.action === "auto_correct_and_retry" || parsed.action === "ignore")) {
      return { action: parsed.action, reason: String(parsed.reason || "") };
    }
    return null;
  } catch (e: any) {
    // A diagnosis failure must never fail the whole run — the batch is left
    // alone (falls through to "ignored" in the caller).
    console.warn("[autoFixImports] LLM classification failed:", e?.message || e);
    return null;
  }
}

// ─── Worker ──────────────────────────────────────────────────────────────────

export interface AutoFixImportsResult {
  fixed: number;
  skipped: number;
  details: any[];
}

export async function runAutoFixImports(): Promise<AutoFixImportsResult> {
  const results: any[] = [];
  try {
    const now = Date.now();
    const oneHourAgo = new Date(now - ONE_HOUR_MS);
    const sevenDaysAgo = new Date(now - SEVEN_DAYS_MS);

    const withinWindow = (b: typeof importBatches.$inferSelect): boolean => {
      const updated = b.updated_date ? new Date(b.updated_date).getTime() : 0;
      const created = b.created_date ? new Date(b.created_date).getTime() : 0;
      const cutoff = sevenDaysAgo.getTime();
      return updated >= cutoff || created >= cutoff;
    };

    // 1. Failed / paused / cancelled imports (newest 100 per status).
    const failed = await db.select().from(importBatches)
      .where(eq(importBatches.status, "failed"))
      .orderBy(desc(importBatches.created_date)).limit(MAX_BATCHES_PER_STATUS);
    const paused = await db.select().from(importBatches)
      .where(eq(importBatches.status, "paused"))
      .orderBy(desc(importBatches.created_date)).limit(MAX_BATCHES_PER_STATUS);
    const cancelled = await db.select().from(importBatches)
      .where(eq(importBatches.status, "cancelled"))
      .orderBy(desc(importBatches.created_date)).limit(MAX_BATCHES_PER_STATUS);

    const failedBatches = [...failed, ...paused, ...cancelled].filter(withinWindow);

    // 2. Stalled processing/validating imports: no progress for over an hour.
    const processing = await db.select().from(importBatches)
      .where(eq(importBatches.status, "processing"))
      .orderBy(desc(importBatches.created_date)).limit(MAX_BATCHES_PER_STATUS);
    const validating = await db.select().from(importBatches)
      .where(eq(importBatches.status, "validating"))
      .orderBy(desc(importBatches.created_date)).limit(MAX_BATCHES_PER_STATUS);

    const stalledBatches = [...processing, ...validating].filter((b) => {
      const updated = b.updated_date ? new Date(b.updated_date).getTime() : 0;
      return updated <= oneHourAgo.getTime() && withinWindow(b);
    });

    const allBatches = [...failedBatches, ...stalledBatches];

    // Lazy imports so this module can be loaded without dragging the full
    // triggerImport / nppesCrawler surface area (same convention as
    // server/lib/maintenance.ts).
    const { handleTriggerImport } = await import("./triggerImport");
    const { handleNppesCrawler } = await import("./nppesCrawler");

    for (const batch of allBatches) {
      try {
        const params = retryParamsOf(batch);
        const retryCount = retryCountOf(batch);

        // Prevent infinite loops on a single import chain.
        if (retryCount >= MAX_AUTO_RETRY_ATTEMPTS) {
          results.push({ batch_id: batch.id, action: "skipped", reason: "Max auto-retries reached for this batch" });
          continue;
        }

        // Flat-file NPPES types self-resume (byte offsets) and the Express
        // triggerImport restarts them from byte 0 — never drive them from here.
        // `nppes_registry` goes to the crawler's own retry path below.
        if (batch.import_type !== "nppes_registry" && SELF_RESUMING_IMPORT_TYPES.has(String(batch.import_type ?? ""))) {
          results.push({ batch_id: batch.id, action: "skipped", reason: "self_resuming_import_type (recovered by crawler watchdog/startup, not triggerImport)" });
          continue;
        }

        let action: "none" | "retry" | "auto_correct_and_retry" | "ignore" = "none";
        let reason = "";

        const errorSamples = (batch.error_samples as unknown[] | null) || [];
        const errorStr = (JSON.stringify(errorSamples) + (batch.cancel_reason || "")).toLowerCase();

        // Common transient errors.
        const isTransient =
          errorStr.includes("rate limit") ||
          errorStr.includes("429") ||
          errorStr.includes("timeout") ||
          errorStr.includes("network") ||
          errorStr.includes("socket") ||
          errorStr.includes("download") ||
          errorStr.includes("stalled") ||
          batch.status === "paused" ||
          batch.status === "cancelled" ||
          batch.status === "processing" ||
          batch.status === "validating";

        if (isTransient) {
          action = "retry";
          reason = "Transient error, rate limit, or stalled process detected";
        } else if (errorStr.includes("missing") || errorStr.includes("out of range")) {
          // Known data errors where we can attempt a fix/retry (the backend
          // may have been patched, or a default correction may apply).
          action = "auto_correct_and_retry";
          reason = "Detected missing field or out-of-range error; applying default corrections and retrying.";
        } else if (errorSamples.length > 0) {
          // Use the LLM to classify whether it's retryable.
          const diagnosis = await diagnoseWithLLM(batch.import_type, errorSamples);
          if (diagnosis) {
            action = diagnosis.action;
            reason = diagnosis.reason;
          } else {
            reason = "LLM classification unavailable; leaving for manual review";
          }
        }

        if (action === "retry" || action === "auto_correct_and_retry") {
          try {
            // Mark as processing so the next tick doesn't pick it up again.
            await db.update(importBatches).set({
              status: "processing",
              paused_at: null,
              cancel_reason: "",
              updated_date: new Date(),
            }).where(eq(importBatches.id, batch.id));

            // Trigger the import again.
            if (batch.import_type === "nppes_registry") {
              await handleNppesCrawler({ action: "retry_errors" }, SYSTEM_ADMIN_USER);
            } else {
              const resumeOffset =
                (params.resume_offset as number | undefined) ??
                (params.row_offset as number | undefined) ??
                batch.imported_rows ??
                0;
              const tags = (batch.tags as unknown[] | null) || [];
              await handleTriggerImport({
                import_type: batch.import_type,
                file_url: params.file_url as string | undefined,
                year: params.year,
                batch_id: batch.id,
                retry_count: retryCount + 1,
                resume_offset: resumeOffset,
                retry_tags: [...new Set([...tags, "auto-bot-retry"])],
              }, SYSTEM_ADMIN_USER);
            }

            results.push({ batch_id: batch.id, import_type: batch.import_type, action: "restarted", reason });

            await db.insert(auditEvents).values({
              event_type: "import_bot",
              user_email: "import-bot@caremetricintel.com",
              entity_type: "import_batch",
              entity_id: String(batch.id),
              action: "Auto Restart Import",
              details: {
                action: "Auto Restart Import",
                batch_id: batch.id,
                import_type: batch.import_type,
                reason,
              },
            });
          } catch (err: any) {
            // Revert the optimistic "processing" status so the batch doesn't
            // get stuck pretending to run. Drop it back into "failed" with a
            // note — the next pass will see the higher retry_count guard and
            // skip it.
            try {
              await db.update(importBatches).set({
                status: "failed",
                cancel_reason: `Auto-fix invoke failed: ${err?.message || err}`,
                updated_date: new Date(),
              }).where(eq(importBatches.id, batch.id));
            } catch (revertErr: any) {
              console.warn(`[autoFixImports] Failed to revert status for ${batch.id}:`, revertErr?.message || revertErr);
            }
            results.push({ batch_id: batch.id, action: "restart_failed", error: err?.message || String(err), details: err?.stack ? String(err.stack).slice(0, 500) : undefined });
          }
        } else {
          results.push({ batch_id: batch.id, action: "ignored", reason: reason || "Not a transient error, requires manual fix" });
        }
      } catch (batchErr: any) {
        // Per-batch catch: one bad batch never aborts the whole run.
        console.warn(`[autoFixImports] Error processing batch ${batch.id}:`, batchErr?.message || batchErr);
        results.push({ batch_id: batch.id, action: "error", error: batchErr?.message || String(batchErr) });
      }
    }
  } catch (runErr: any) {
    // The worker never throws — aggregate the run-level failure into the
    // results so callers (cron, admin UI) still get a typed response.
    console.error("[autoFixImports] run failed:", runErr);
    results.push({ batch_id: null, action: "run_failed", error: runErr?.message || String(runErr) });
  }

  const restarted = results.filter((r) => r.action === "restarted");
  const skipped = results.filter((r) => r.action === "skipped");
  const result = {
    fixed: restarted.length,
    skipped: skipped.length,
    details: results,
    // Kept for parity with the original's response shape.
    processed: results.length,
    summary: {
      restarted: restarted.length,
      skipped: skipped.length,
      ignored: results.filter((r) => r.action === "ignored").length,
      restart_failed: results.filter((r) => r.action === "restart_failed").length,
    },
    restart_failed_details: results.filter((r) => r.action === "restart_failed"),
  };
  return result;
}

// ─── Function-dispatcher wrapper ─────────────────────────────────────────────
// Thin manual-trigger wrapper for POST /api/functions/autoFixImports.
// Auth is enforced at the route boundary (isFunctionAllowedFor in
// routes/functions.ts, admin-only by default).

export async function handleAutoFixImports(payload: any, user?: any): Promise<any> {
  return await runAutoFixImports();
}
