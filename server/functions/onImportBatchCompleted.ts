// Ported from Base44: base44/functions/onImportBatchCompleted/entry.ts
//
// Dependency manager for scheduled imports. Base44 fired the original on
// ImportBatch:update events; here it is a fire-and-forget hook called from
// the settle flow (see server/lib/importCompletion.ts -> settleBatchCompletion)
// once per successful batch settlement. It resolves "on_completion"
// dependent schedules and fans out to the dependent importer.
//
// Never throws: every failure path is logged and skipped so a bad dependent
// schedule can never break the batch that completed.
import { db } from "../db";
import { importScheduleConfigs } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { handleNppesCrawler } from "./nppesCrawler";
import { handleTriggerImport } from "./triggerImport";

const LOG = "[DependencyManager]";

// Base44 import_type aliases, kept verbatim from the original.
const IMPORT_TYPE_ALIASES: Record<string, string> = {
  cms_utilization: "provider_service_utilization",
};

export type CompletedBatch = {
  id: number;
  status?: string | null;
  imported_rows?: number | null;
  completed_at?: Date | string | null;
  import_type?: string | null;
  [k: string]: any;
};

/**
 * Fires "on_completion" dependents after an import batch completes.
 *
 * Caller contract (the fan-out conditions from the Base44 version):
 *  - call only for a batch whose status is 'completed' (the original ignored
 *    every other update event and skipped batches that were already
 *    'completed' before the update);
 *  - call exactly once per completion (the settle flow's shouldApply guard
 *    guarantees this; on re-entry the per-schedule completed_at anchor below
 *    also skips dependents that already ran since the parent completed).
 */
export async function onImportBatchCompleted(batch: CompletedBatch): Promise<void> {
  try {
    if (!batch || typeof batch.id !== "number") {
      console.warn(`${LOG} called without a valid batch; skipping`);
      return;
    }

    // The Base44 hook only acted on updates that transitioned TO completed.
    // The settle flow only invokes this hook on a successful settlement, but
    // keep the guard so a mis-wired caller can't fan out from a live batch.
    if (batch.status !== "completed") {
      console.warn(`${LOG} batch #${batch.id} status is '${batch.status ?? "unknown"}', not completed; skipping`);
      return;
    }

    const completedImportType = batch.import_type;
    if (!completedImportType) {
      console.warn(`${LOG} batch #${batch.id} has no import_type; skipping`);
      return;
    }

    console.log(`${LOG} Batch completed: ${completedImportType} (${batch.id}). Checking for dependent schedules...`);

    const dependentSchedules = await db
      .select()
      .from(importScheduleConfigs)
      .where(
        and(
          eq(importScheduleConfigs.is_active, true),
          eq(importScheduleConfigs.schedule_frequency, "on_completion"),
          eq(importScheduleConfigs.depends_on_import_type, completedImportType),
        ),
      );

    if (!dependentSchedules || dependentSchedules.length === 0) {
      console.log(`${LOG} No dependent schedules found for ${completedImportType}`);
      return;
    }

    console.log(`${LOG} Found ${dependentSchedules.length} dependent schedules.`);

    const now = new Date();

    // Anchor for idempotency: when did the parent batch complete? An update
    // event on an already-completed batch (e.g. a later metadata edit, or a
    // re-delivery where the old status is unavailable) must not re-fire
    // dependents that already ran for this completion. Anchor on
    // completed_at ONLY — updated_date is bumped by any later edit, which
    // would wrongly skip a legitimately-new completion.
    const parentCompletedAtMs = batch.completed_at
      ? new Date(batch.completed_at).getTime()
      : null;

    for (const schedule of dependentSchedules) {
      // Skip if this child already ran successfully since the parent completed.
      if (parentCompletedAtMs && schedule.last_successful_run_at) {
        const childRanMs = new Date(schedule.last_successful_run_at).getTime();
        if (!isNaN(childRanMs) && childRanMs >= parentCompletedAtMs) {
          console.log(`${LOG} Skipping ${schedule.import_type}: already ran since parent completion`);
          continue;
        }
      }

      console.log(`${LOG} Triggering dependent schedule: ${schedule.label} (${schedule.import_type})`);

      let runStatus = "success";
      let runSummary = "";

      try {
        if (schedule.import_type === "nppes_registry") {
          const config = (schedule.nppes_config as Record<string, any>) || {};
          const crawlerPayload: Record<string, any> = {
            action: "batch_start",
            dry_run: false,
            skip_completed: false,
            taxonomy_description: config.taxonomy_description || "",
            entity_type: config.entity_type || "",
          };

          if (!config.crawl_all_states) {
            if (!config.state) {
              throw new Error("Dependent NPPES crawler runs require a state when crawl_all_states is disabled");
            }
            crawlerPayload.states = [config.state];
          }
          if (config.city) crawlerPayload.city = config.city;
          if (config.postal_code) crawlerPayload.postal_code = config.postal_code;

          // Direct in-process call (replaces functions.invoke('nppesCrawler')).
          const data = (await handleNppesCrawler(crawlerPayload, null)) || {};
          runSummary = data.message || `Queued ${data.states_queued || 0} state(s) for crawling (Dependency)`;
          runStatus = data.error ? "failed" : "success";
        } else {
          const resolvedType = IMPORT_TYPE_ALIASES[schedule.import_type || ""] || schedule.import_type;

          // Direct in-process call (replaces functions.invoke('triggerImport')).
          const res = (await handleTriggerImport(
            {
              import_type: resolvedType,
              file_url: schedule.api_url || undefined,
              year: schedule.data_year || now.getFullYear(),
              dry_run: false,
            },
            null,
          )) as any;

          const data = res?.result || res || {};
          if (data.partial) {
            runSummary = `Partial: imported ${data.imported_rows || 0} rows, paused at offset ${data.next_offset}. (Dependency)`;
            runStatus = "partial";
          } else {
            runSummary = `Imported ${data.imported_rows || 0} rows, updated ${data.updated_rows || 0} (Dependency)`;
            runStatus = "success";
          }
        }
      } catch (err: any) {
        console.error(`${LOG} Failed import ${schedule.import_type}:`, err?.message || err);
        runStatus = "failed";
        runSummary = `Error: ${err?.message || err}`;
      }

      // Mirror the field bookkeeping runScheduledImports does so the
      // dependency-blocked check stays consistent regardless of which
      // path triggered the run (cron loop vs. on-completion event):
      //   - last_successful_run_at is the dependency check's anchor
      //     for "child has caught up to parent's last good run"
      //   - consecutive_failures resets on success so exponential
      //     backoff in the cron loop doesn't carry over stale counts
      const update: Record<string, unknown> = {
        last_run_at: now,
        last_run_status: runStatus,
        last_run_summary: runSummary,
      };
      if (runStatus === "success") {
        update.last_successful_run_at = now;
        update.consecutive_failures = 0;
      } else if (runStatus === "failed") {
        update.consecutive_failures = (schedule.consecutive_failures || 0) + 1;
      }
      await db
        .update(importScheduleConfigs)
        .set(update)
        .where(eq(importScheduleConfigs.id, schedule.id));
    }
  } catch (error: any) {
    // Never throw: a broken dependency lookup must not fail the batch that
    // completed (nor the caller).
    console.warn(`${LOG} dependency evaluation failed:`, error?.message || error);
  }
}
