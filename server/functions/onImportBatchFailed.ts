// Port of base44/functions/onImportBatchFailed/entry.ts (Base44 entity hook ->
// Railway Express). In Base44 this fired on ImportBatch create/update events and
// decided whether the batch had just failed (or stalled into a paused bottleneck).
// Its only action was the failure notification path -- and email notifications
// were explicitly disabled there, so every trigger path returned early with
// `notified: 0`. This port preserves that behavior exactly: the hook detects the
// failure/bottleneck conditions and logs them, but performs no side effects.
// Re-enable notifications (email, alert, audit row) here when wanted.
//
// This is a HOOK, not an HTTP endpoint: call it from the importer's failure path
// or from settleSchedule in server/lib/importCompletion.ts. It never throws.
import type { BatchState } from "../lib/importCompletion";

export type FailedBatch = {
  id: number;
  status?: string | null;
  cancel_reason?: string | null;
  error_samples?: unknown;
  [k: string]: any;
};

/** Port of the original's failure-detection logic. In Base44 this compared
 *  current vs previous status across create/update events (plus the
 *  payload_too_large fallback). In Express the caller invokes this hook at the
 *  moment of failure, so "is it a failure right now" is the whole check:
 *  status === 'failed', or the stall/timeout bottleneck heuristic the original
 *  applied to 'paused' batches. */
export function isBatchFailure(batch: FailedBatch | BatchState | null | undefined): boolean {
  if (!batch) return false;
  if (batch.status === "failed") return true;
  const reason = String((batch as FailedBatch).cancel_reason ?? "").toLowerCase();
  return batch.status === "paused" && (reason.includes("stall") || reason.includes("timeout"));
}

/**
 * Failure hook for import batches. Mirrors the original: detects the failure
 * (or paused-stall/timeout bottleneck) and then no-ops, because failure
 * notifications were explicitly disabled upstream. Never throws -- logs
 * warnings instead, like settleBatchCompletion in server/lib/importCompletion.ts.
 */
export async function onImportBatchFailed(batch: FailedBatch): Promise<void> {
  try {
    if (!isBatchFailure(batch)) {
      console.info(`[onImportBatchFailed] batch ${batch?.id} is not a new failure; skipping.`);
      return;
    }
    // Email notifications for import failures are explicitly disabled (as in the
    // original Base44 function). Log and return so the hook stays a documented
    // extension point; add the notification/alert write here when re-enabled.
    const kind =
      batch.status === "failed"
        ? "failed"
        : `paused (stall/timeout bottleneck: ${batch.cancel_reason})`;
    console.warn(
      `[onImportBatchFailed] import batch ${batch.id} ${kind}; ` +
        `failure notifications are disabled -- no action taken.`
    );
  } catch (e: any) {
    console.warn(`[onImportBatchFailed] hook error for batch ${batch?.id}:`, e?.message || e);
  }
}
