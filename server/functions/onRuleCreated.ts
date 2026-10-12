// Port of base44/functions/onRuleCreated/entry.ts
//
// Entity hook: Base44 fired this on `ColumnMappingRule:create` and
// `DataCleaningRule:create` events. In Express it is called in-process from
// the entity create route (server/routes/entities.ts) after a rule row is
// inserted.
//
// What it does: finds the 10 most recent failed import batches whose
// error_samples mention the `missing_category` rule, and auto-retries each
// via handleTriggerImport (the canonical in-process triggerImport) — capped
// at 3 rule-triggered retries per batch. The retry counter is stamped onto
// retry_params BEFORE invoking so repeated rule-creation events can't
// re-trigger the same batch without bound, even if the invoke fails.
//
// Porting notes:
// - Deno.serve + Base44 SDK replaced with direct in-process imports:
//   db (drizzle) and handleTriggerImport from ./triggerImport.
// - handleTriggerImport throws 403 unless the user is an admin, so the hook
//   passes a synthetic service-admin user ({ role: "admin",
//   isPlatformAdmin: true }) — the equivalent of Base44's asServiceRole.
// - The original stamped a human-readable `notes` field on the batch; the
//   Express `import_batches` table has no `notes` column, so that note is
//   dropped. The load-bearing `retry_params.rule_retry_count` is preserved.
// - The original passed `file_url` from the Base44 batch record; the Express
//   `import_batches` table has no `file_url` column, so
//   `(batch as any).file_url` is passed through (undefined in practice),
//   exactly mirroring the original payload shape.
// - The hook never throws: the outer catch and the per-batch catch both log
//   warnings instead.
import { db } from "../db";
import { importBatches } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { handleTriggerImport } from "./triggerImport";

// Cap how many times a single failed batch can be auto-retried by
// rule-creation events. Without this, creating N rules re-triggers the
// same failed batches N times (burning import + LLM credits) because
// nothing tracked prior attempts.
const MAX_RULE_RETRY_ATTEMPTS = 3;

// Synthetic service user for the in-process triggerImport call.
// Equivalent of Base44's asServiceRole: internal, server-initiated work.
const SERVICE_USER = { role: "admin", isPlatformAdmin: true } as any;

export async function onRuleCreated(
  rule: { id: number; [k: string]: any },
  ruleType: "columnMapping" | "dataCleaning"
): Promise<void> {
  try {
    // Find recent failed imports (limit to 10 most recent), mirroring the
    // original's `filter({ status: "failed" }, "-created_date", 10)`.
    const failedBatches = await db
      .select()
      .from(importBatches)
      .where(eq(importBatches.status, "failed"))
      .orderBy(desc(importBatches.created_date))
      .limit(10);

    const retried: number[] = [];
    for (const batch of failedBatches) {
      try {
        const errorSamples: any[] = Array.isArray(batch.error_samples)
          ? batch.error_samples
          : [];

        // Check if failure involved a 'missing_category' error
        const hasMissingCategory = errorSamples.some(
          (e) =>
            e?.rule === "missing_category" ||
            (typeof e?.detail === "string" &&
              e.detail.includes("missing_category"))
        );
        if (!hasMissingCategory) continue;

        const params: Record<string, any> =
          (batch.retry_params as Record<string, any>) || {};
        const ruleRetryCount =
          typeof params.rule_retry_count === "number" &&
          params.rule_retry_count >= 0
            ? params.rule_retry_count
            : 0;
        if (ruleRetryCount >= MAX_RULE_RETRY_ATTEMPTS) continue;

        // Stamp the attempt counter BEFORE invoking so repeated
        // rule-creation events can't re-trigger the same batch without
        // bound, even if the invoke below fails.
        await db
          .update(importBatches)
          .set({
            retry_params: { ...params, rule_retry_count: ruleRetryCount + 1 },
          })
          .where(eq(importBatches.id, batch.id));

        await handleTriggerImport(
          {
            import_type: batch.import_type,
            file_url: (batch as any).file_url,
            retry_of: batch.id,
          },
          SERVICE_USER
        );
        retried.push(batch.id);
      } catch (batchErr) {
        // Isolate per-batch failures so one bad batch doesn't abort the
        // rest of the loop.
        console.error(
          `onRuleCreated: failed to auto-retry batch ${batch?.id} (${ruleType} rule ${rule?.id}):`,
          batchErr
        );
      }
    }

    if (retried.length > 0) {
      console.log(
        `onRuleCreated: auto-retried ${retried.length} failed batch(es) after ${ruleType} rule ${rule?.id} creation`
      );
    }
  } catch (error) {
    console.warn("onRuleCreated: error during rule-created sweep:", error);
  }
}
