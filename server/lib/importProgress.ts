// What every importer writes to its batch as it goes, and what it tells the
// rest of the system when it stops. Shared by the CMS importer
// (server/functions/triggerImport.ts) and the NPPES file importer.
import { sql } from "drizzle-orm";
import { importBatches } from "../db/schema";
import { markImportFinished } from "./datasetRegistry";
import { settleBatchCompletion } from "./importCompletion";

/**
 * retry_params is shared with other writers: the auto-retry and auto-resume
 * workers keep their attempt counters in it. Progress writes therefore merge
 * into it (a JSONB `||`) instead of replacing it, or every progress write would
 * wipe MAX_AUTO_RETRY_ATTEMPTS' count and the retry cap would never apply.
 * Keys whose value is undefined are dropped by JSON.stringify and so left as is.
 */
export function mergeRetryParams(patch: Record<string, unknown>) {
  return sql`COALESCE(${importBatches.retry_params}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`;
}

/**
 * An import that stops before it finishes (the source kept failing, or it was
 * cancelled) tells the dataset registry and the schedule that started it, so
 * neither waits for a sweep: a dataset left "importing" would hide newer
 * releases, and a schedule left "running" would sit out its whole lease. A
 * paused batch is neither: it is resumed, and keeps its place.
 */
export async function endedWithoutFinishing(importType: string, batchId: number, status: string, note?: string): Promise<void> {
  if (status === "paused") return;
  await markImportFinished(importType, { batchId, ok: false, note: (note || (status === "cancelled" ? "cancelled" : "stopped")).slice(0, 200) }).catch(() => {});
  await settleBatchCompletion(batchId);
}
