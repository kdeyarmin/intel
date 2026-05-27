import { db } from "../db";
import { providers, providerLocations, providerTaxonomies, backgroundTasks } from "../db/schema";
import { eq, and, isNull, isNotNull, sql, asc, desc, inArray, lt } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODELS } from "../lib/aiModels";
import { AI_EMAIL_SOURCE, isValidEmailSyntax, shouldPromoteToPrimary } from "./emailValidation";

const BATCH_DELAY_MS = 300;
const CONSECUTIVE_ERROR_LIMIT = 20;
const PARALLEL_CONCURRENCY = 5;
const PROGRESS_UPDATE_INTERVAL = 5;
const CANCEL_CHECK_INTERVAL = 10;

const activeTaskIds = new Set<number>();

export async function cleanupOrphanedEmailTasks() {
  try {
    const orphaned = await db.select().from(backgroundTasks)
      .where(and(
        eq(backgroundTasks.task_type, "email_search"),
        eq(backgroundTasks.status, "processing")
      ));

    let resumed = false;
    for (const task of orphaned) {
      if (activeTaskIds.has(task.id)) continue;
      if (!resumed) {
        console.log(`[EmailBot] Auto-resuming orphaned task ${task.id}`);
        activeTaskIds.add(task.id);
        const meta: any = task.metadata || {};
        const bs = Math.max(1, Math.min(50, meta.batch_size || 10));
        runBackgroundSearch(
          task.id,
          bs,
          meta.skip_already_searched !== false
        ).catch((err) => {
          console.error(`[EmailBot] Resume of task ${task.id} failed:`, err.message);
          activeTaskIds.delete(task.id);
          db.update(backgroundTasks)
            .set({ status: "failed", error: `Resume failed: ${err.message}`, completed_at: new Date(), updated_date: new Date() })
            .where(eq(backgroundTasks.id, task.id))
            .catch(() => {});
        });
        resumed = true;
      } else {
        console.log(`[EmailBot] Marking extra orphaned task ${task.id} as failed`);
        await db.update(backgroundTasks)
          .set({ status: "failed", error: "Superseded by another task on restart", completed_at: new Date(), updated_date: new Date() })
          .where(eq(backgroundTasks.id, task.id));
      }
    }
    if (resumed) return;

    if (activeTaskIds.size > 0) return;

    const lastTask = await db.select().from(backgroundTasks)
      .where(eq(backgroundTasks.task_type, "email_search"))
      .orderBy(desc(backgroundTasks.id))
      .limit(1);

    if (lastTask.length > 0 && lastTask[0].status === "cancelled") {
      console.log(`[EmailBot] Last email search task was cancelled — not auto-starting`);
      return;
    }

    if (lastTask.length === 0) return;

    const [unsearched] = await db.select({ count: sql<number>`count(*)` })
      .from(providers)
      .where(isNull(providers.email_searched_at));

    const remaining = Number(unsearched?.count || 0);
    if (remaining === 0) return;

    const meta: any = lastTask[0].metadata || {};
    const batchSize = Math.max(1, Math.min(50, meta.batch_size || 10));

    console.log(`[EmailBot] Auto-starting new email search — ${remaining} providers unsearched`);
    const [newTask] = await db.insert(backgroundTasks).values({
      task_type: "email_search",
      status: "processing",
      progress: 0,
      metadata: {
        batch_size: batchSize,
        skip_already_searched: true,
        total_items: remaining,
        processed_items: 0,
        success_count: 0,
        current_batch_number: 0,
        auto_resumed: true,
      },
      started_at: new Date(),
    }).returning();

    activeTaskIds.add(newTask.id);
    runBackgroundSearch(newTask.id, batchSize, true).catch((err) => {
      console.error(`[EmailBot] Auto-started task ${newTask.id} failed:`, err.message);
      activeTaskIds.delete(newTask.id);
      db.update(backgroundTasks)
        .set({ status: "failed", error: `Auto-start failed: ${err.message}`, completed_at: new Date(), updated_date: new Date() })
        .where(eq(backgroundTasks.id, newTask.id))
        .catch(() => {});
    });
  } catch (err: any) {
    console.error("[EmailBot] Orphan cleanup error:", err.message);
  }
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey });
}

async function callClaude(anthropic: Anthropic, prompt: string, schema: any): Promise<any> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODELS.HAIKU,
    max_tokens: 1024,
    system: `You must respond with valid JSON matching this schema: ${JSON.stringify(schema)}. Do not include any text before or after the JSON.`,
    messages: [{ role: "user", content: prompt }],
  });
  const textContent = message.content.find((c: any) => c.type === "text");
  const text = textContent?.text || "{}";
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return {};
  }
}

async function searchEmailForProvider(
  anthropic: Anthropic,
  provider: any,
  location: any,
  taxonomy: any
): Promise<{
  npi: string;
  name: string;
  best_email: string | null;
  confidence: string | null;
  validation_status: string | null;
  validation_reason: string | null;
  emails_found: number;
  all_emails: any[];
  error?: string;
}> {
  const name = provider.entity_type === "Individual"
    ? `${provider.first_name || ""} ${provider.last_name || ""}`.trim()
    : provider.organization_name || "";

  try {
    const combinedPrompt = `Find and validate professional email addresses for this healthcare provider.

PROVIDER:
- Name: ${name}
- NPI: ${provider.npi}
- Credential: ${provider.credential || "N/A"}
- Entity Type: ${provider.entity_type}
- Organization: ${provider.organization_name || "N/A"}
- Specialty: ${taxonomy?.taxonomy_description || "N/A"}
- Location: ${location ? `${location.address_1 || ""}, ${location.city || ""}, ${location.state || ""} ${location.zip || ""}` : "N/A"}
- Phone: ${location?.phone || provider.phone || "N/A"}
- Website: ${provider.website || "N/A"}

STEP 1 - FIND EMAILS:
1. Determine the most likely organization or practice domain from name, organization, website, and location.
2. If a website is listed, use that domain directly.
3. Apply common healthcare email patterns: first.last@domain, flast@domain, firstl@domain, first@domain.
4. For organizations, also try info@, admin@, contact@ with the organization domain.
5. Return up to 3 possible emails ranked by likelihood.
6. Practice/office emails are acceptable if no direct provider email can be found.

STEP 2 - VALIDATE EACH EMAIL:
For each email you found, assign:
- validation_status: "valid" (matches known real domain patterns, high deliverability), "risky" (plausible but unverified domain, role-based, or catch-all), or "invalid" (implausible domain, bad format)
- validation_reason: brief explanation
- confidence: "high" (based on known/verified domain or website), "medium" (inferred from org name), "low" (guessed)

Be strict: AI-inferred emails without verified domains should be "risky" at best.`;

    const combinedSchema = {
      type: "object",
      properties: {
        emails: {
          type: "array",
          items: {
            type: "object",
            properties: {
              email: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              source: { type: "string" },
              validation_status: { type: "string", enum: ["valid", "risky", "invalid"] },
              validation_reason: { type: "string" },
            },
          },
        },
        organization_domain: { type: "string" },
      },
    };

    const result = await callClaude(anthropic, combinedPrompt, combinedSchema);
    const emails = (result.emails || []).filter(
      (e: any) => e.email && e.email.includes("@") && e.email.includes(".")
    );

    if (emails.length === 0) {
      return {
        npi: provider.npi,
        name,
        best_email: null,
        confidence: null,
        validation_status: null,
        validation_reason: null,
        emails_found: 0,
        all_emails: [],
      };
    }

    const validationRank: Record<string, number> = { valid: 3, risky: 2, unknown: 1, invalid: 0 };
    const confidenceRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const sorted = [...emails].sort((a: any, b: any) => {
      const vDiff = (validationRank[b.validation_status] || 0) - (validationRank[a.validation_status] || 0);
      if (vDiff !== 0) return vDiff;
      return (confidenceRank[b.confidence] || 0) - (confidenceRank[a.confidence] || 0);
    });
    const best = sorted[0];
    return {
      npi: provider.npi,
      name,
      best_email: best.email,
      confidence: best.confidence,
      validation_status: best.validation_status,
      validation_reason: best.validation_reason,
      emails_found: sorted.length,
      all_emails: sorted,
    };
  } catch (err: any) {
    return {
      npi: provider.npi,
      name,
      best_email: null,
      confidence: null,
      validation_status: null,
      validation_reason: null,
      emails_found: 0,
      all_emails: [],
      error: err.message,
    };
  }
}

async function saveEmailToProvider(provider: any, result: any) {
  // All candidates the model returned, normalized + tagged as AI-inferred so the
  // UI can flag them as unverified. Drop anything not even syntactically valid.
  const candidates = (result.all_emails || [])
    .filter((e: any) => isValidEmailSyntax(e.email))
    .map((e: any) => ({
      email: e.email,
      confidence: e.confidence,
      source: AI_EMAIL_SOURCE,
      validation_status: e.validation_status,
    }));

  const promote = shouldPromoteToPrimary({ email: result.best_email }) ? result : null;

  if (!promote) {
    // Nothing trustworthy enough to be the provider's primary email. Mark as
    // searched (so we don't re-spend tokens on it) and keep any candidates for
    // human review, but do not overwrite a real address with a guess.
    await db
      .update(providers)
      .set({
        email_searched_at: new Date(),
        additional_emails: candidates.length > 0 ? candidates : null,
        updated_date: new Date(),
      })
      .where(eq(providers.id, provider.id));
    return;
  }

  await db
    .update(providers)
    .set({
      email: promote.best_email,
      email_confidence: promote.confidence,
      email_source: AI_EMAIL_SOURCE,
      email_validation_status: promote.validation_status,
      email_validation_reason: promote.validation_reason,
      additional_emails: candidates.length > 1 ? candidates.slice(1) : null,
      email_searched_at: new Date(),
      updated_date: new Date(),
    })
    .where(eq(providers.id, provider.id));
}

async function getProvidersForSearch(batchSize: number, skipSearched: boolean, singleNpi?: string) {
  if (singleNpi) {
    return db
      .select()
      .from(providers)
      .where(eq(providers.npi, singleNpi))
      .limit(1);
  }

  const conditions = skipSearched
    ? [isNull(providers.email_searched_at)]
    : [];

  return db
    .select()
    .from(providers)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(providers.id))
    .limit(batchSize);
}

async function processProvidersConcurrently(
  anthropic: Anthropic,
  batch: any[],
  locationMap: Map<string, any>,
  taxonomyMap: Map<string, any>,
  concurrency: number,
  cancelCheck?: () => Promise<boolean>
): Promise<{ results: any[]; found: number; errors: number; cancelled: boolean }> {
  const results: any[] = [];
  let found = 0;
  let errors = 0;
  let idx = 0;
  let cancelled = false;

  async function worker() {
    while (idx < batch.length && !cancelled) {
      const myIdx = idx++;
      if (myIdx >= batch.length) break;

      if (cancelCheck && myIdx % CANCEL_CHECK_INTERVAL === 0 && myIdx > 0) {
        if (await cancelCheck()) {
          cancelled = true;
          break;
        }
      }

      const prov = batch[myIdx];
      const loc = locationMap.get(prov.npi || "");
      const tax = taxonomyMap.get(prov.npi || "");

      try {
        const result = await searchEmailForProvider(anthropic, prov, loc, tax);
        results[myIdx] = { prov, result };
        if (result.best_email) found++;
        if (result.error) errors++;
      } catch (err: any) {
        results[myIdx] = {
          prov,
          result: {
            npi: prov.npi,
            name: prov.first_name || prov.organization_name || "",
            best_email: null, confidence: null, validation_status: null,
            validation_reason: null, emails_found: 0, all_emails: [],
            error: err.message,
          }
        };
        errors++;
      }
      if (myIdx < batch.length - 1) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, batch.length) }, () => worker());
  await Promise.all(workers);

  return { results: results.filter(Boolean), found, errors, cancelled };
}

export async function handleEmailSearchBot(payload: any) {
  const { mode, npi, batch_size: rawBatchSize = 10, skip_already_searched = true, total_items, task_id } = payload;
  const batch_size = Math.max(1, Math.min(50, Number(rawBatchSize) || 10));

  if (!mode || !["single", "batch", "start_background", "stop_background"].includes(mode)) {
    return { success: false, message: `Invalid mode: ${mode}. Use single, batch, start_background, or stop_background.` };
  }

  if (mode === "single" && !npi) {
    return { success: false, message: "NPI is required for single mode." };
  }

  if (mode === "stop_background") {
    if (task_id) {
      activeTaskIds.delete(task_id);
      await db
        .update(backgroundTasks)
        .set({
          status: "cancelled",
          completed_at: new Date(),
          updated_date: new Date(),
        })
        .where(eq(backgroundTasks.id, task_id));
    }
    return { success: true, message: "Background search stopped" };
  }

  if (mode === "start_background") {
    const existingActive = await db.select().from(backgroundTasks)
      .where(and(
        eq(backgroundTasks.task_type, "email_search"),
        eq(backgroundTasks.status, "processing")
      ));
    const reallyActive = existingActive.filter(t => activeTaskIds.has(t.id));
    if (reallyActive.length > 0) {
      return { success: true, message: "Email search is already running", task_id: reallyActive[0].id };
    }

    for (const stale of existingActive) {
      if (!activeTaskIds.has(stale.id)) {
        console.log(`[EmailBot] Cleaning stale task ${stale.id} before new start`);
        await db.update(backgroundTasks)
          .set({ status: "failed", error: "Replaced by new search task", completed_at: new Date(), updated_date: new Date() })
          .where(eq(backgroundTasks.id, stale.id));
      }
    }

    const bgSkipSearched = true;
    const [task] = await db
      .insert(backgroundTasks)
      .values({
        task_type: "email_search",
        status: "processing",
        progress: 0,
        metadata: {
          batch_size,
          skip_already_searched: bgSkipSearched,
          total_items: total_items || 0,
          processed_items: 0,
          success_count: 0,
          current_batch_number: 0,
        },
        started_at: new Date(),
      })
      .returning();

    activeTaskIds.add(task.id);
    runBackgroundSearch(task.id, batch_size, bgSkipSearched).catch((err) => {
      console.error("[EmailBot] Background search error:", err.message);
      activeTaskIds.delete(task.id);
      db.update(backgroundTasks)
        .set({
          status: "failed",
          error: err.message,
          completed_at: new Date(),
          updated_date: new Date(),
        })
        .where(eq(backgroundTasks.id, task.id))
        .catch(() => {});
    });

    return { success: true, message: "Background search started", task_id: task.id };
  }

  const anthropic = getAnthropicClient();
  const providersToSearch = await getProvidersForSearch(
    mode === "single" ? 1 : batch_size,
    skip_already_searched,
    mode === "single" ? npi : undefined
  );

  if (providersToSearch.length === 0) {
    return {
      success: true,
      searched: 0,
      found: 0,
      results: [],
      message: "No providers to search",
    };
  }

  const locationMap = new Map<string, any>();
  const taxonomyMap = new Map<string, any>();

  const npis = providersToSearch.map((p) => p.npi).filter(Boolean);
  if (npis.length > 0) {
    const locs = await db
      .select()
      .from(providerLocations)
      .where(inArray(providerLocations.npi, npis as string[]));
    for (const loc of locs) {
      if (loc.npi && (!locationMap.has(loc.npi) || loc.location_type === "Practice")) {
        locationMap.set(loc.npi, loc);
      }
    }

    const taxs = await db
      .select()
      .from(providerTaxonomies)
      .where(inArray(providerTaxonomies.npi, npis as string[]));
    for (const tax of taxs) {
      if (tax.npi && (!taxonomyMap.has(tax.npi) || tax.is_primary)) {
        taxonomyMap.set(tax.npi, tax);
      }
    }
  }

  if (mode === "single") {
    const prov = providersToSearch[0];
    const loc = locationMap.get(prov.npi || "");
    const tax = taxonomyMap.get(prov.npi || "");
    const result = await searchEmailForProvider(anthropic, prov, loc, tax);
    await saveEmailToProvider(prov, result);
    return {
      success: true,
      searched: 1,
      found: result.best_email ? 1 : 0,
      results: [result],
    };
  }

  const { results: batchResults, found } = await processProvidersConcurrently(
    anthropic, providersToSearch, locationMap, taxonomyMap, PARALLEL_CONCURRENCY
  );

  for (const { prov, result } of batchResults) {
    await saveEmailToProvider(prov, result);
  }

  return {
    success: true,
    searched: batchResults.length,
    found,
    results: batchResults.map(r => r.result),
  };
}

async function runBackgroundSearch(taskId: number, batchSize: number, skipSearched: boolean) {
  const anthropic = getAnthropicClient();
  let totalProcessed = 0;
  let totalFound = 0;
  let totalErrors = 0;
  let consecutiveErrors = 0;
  let batchNumber = 0;
  let providersSinceLastUpdate = 0;
  let providersSinceCancelCheck = 0;

  const [existingTask] = await db.select().from(backgroundTasks).where(eq(backgroundTasks.id, taskId));
  if (existingTask?.metadata) {
    const meta: any = existingTask.metadata;
    totalProcessed = meta.processed_items || 0;
    totalFound = meta.success_count || 0;
    batchNumber = meta.current_batch_number || 0;
    totalErrors = meta.error_count || 0;
  }

  console.log(`[EmailBot] Background search started/resumed task ${taskId} (processed=${totalProcessed}, found=${totalFound})`);

  while (true) {
    const [task] = await db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, taskId));
    if (!task || task.status === "cancelled") {
      console.log(`[EmailBot] Task ${taskId} cancelled`);
      break;
    }

    const batch = await getProvidersForSearch(batchSize, skipSearched);
    if (batch.length === 0) {
      console.log(`[EmailBot] Task ${taskId}: No more providers to search — all done`);
      break;
    }

    batchNumber++;
    const npis = batch.map((p) => p.npi).filter(Boolean);
    const locationMap = new Map<string, any>();
    const taxonomyMap = new Map<string, any>();

    if (npis.length > 0) {
      try {
        const [locs, taxs] = await Promise.all([
          db.select().from(providerLocations).where(inArray(providerLocations.npi, npis as string[])),
          db.select().from(providerTaxonomies).where(inArray(providerTaxonomies.npi, npis as string[])),
        ]);
        for (const loc of locs) {
          if (loc.npi && (!locationMap.has(loc.npi) || loc.location_type === "Practice")) {
            locationMap.set(loc.npi, loc);
          }
        }
        for (const tax of taxs) {
          if (tax.npi && (!taxonomyMap.has(tax.npi) || tax.is_primary)) {
            taxonomyMap.set(tax.npi, tax);
          }
        }
      } catch (dbErr: any) {
        console.error(`[EmailBot] Task ${taskId}: DB error fetching context: ${dbErr.message}`);
      }
    }

    const cancelChecker = async () => {
      const [t] = await db.select().from(backgroundTasks).where(eq(backgroundTasks.id, taskId));
      return !t || t.status === "cancelled";
    };

    const { results: batchResults, found: batchFound, errors: batchErrors, cancelled } =
      await processProvidersConcurrently(anthropic, batch, locationMap, taxonomyMap, PARALLEL_CONCURRENCY, cancelChecker);

    if (cancelled) {
      console.log(`[EmailBot] Task ${taskId} cancelled mid-batch`);
      for (const { prov, result } of batchResults) {
        try { await saveEmailToProvider(prov, result); } catch {}
      }
      break;
    }

    if (batchErrors > 0) {
      consecutiveErrors += batchErrors;
      if (consecutiveErrors >= CONSECUTIVE_ERROR_LIMIT) {
        console.error(`[EmailBot] Task ${taskId}: ${consecutiveErrors} errors — pausing 30s`);
        await new Promise(r => setTimeout(r, 30000));
        consecutiveErrors = 0;
      }
    } else {
      consecutiveErrors = 0;
    }

    for (const { prov, result } of batchResults) {
      try {
        await saveEmailToProvider(prov, result);
      } catch (saveErr: any) {
        console.error(`[EmailBot] Task ${taskId}: Save error for ${prov.npi}: ${saveErr.message}`);
        totalErrors++;
      }
    }

    totalProcessed += batchResults.length;
    totalFound += batchFound;
    totalErrors += batchErrors;

    await db
      .update(backgroundTasks)
      .set({
        progress: totalProcessed,
        metadata: {
          batch_size: batchSize,
          skip_already_searched: skipSearched,
          total_items: 0,
          processed_items: totalProcessed,
          success_count: totalFound,
          error_count: totalErrors,
          current_batch_number: batchNumber,
        },
        updated_date: new Date(),
      })
      .where(eq(backgroundTasks.id, taskId));

    if (batchNumber % 5 === 0) {
      const remaining = await db.select({ count: sql<number>`count(*)` })
        .from(providers)
        .where(isNull(providers.email_searched_at));
      const rate = totalProcessed > 0 ? (totalFound / totalProcessed * 100).toFixed(1) : "0";
      console.log(`[EmailBot] Task ${taskId}: Batch ${batchNumber} — processed=${totalProcessed}, found=${totalFound} (${rate}%), errors=${totalErrors}, remaining=${remaining[0]?.count || '?'}`);
    }
  }

  const [finalTask] = await db
    .select()
    .from(backgroundTasks)
    .where(eq(backgroundTasks.id, taskId));

  if (finalTask && finalTask.status !== "cancelled") {
    await db
      .update(backgroundTasks)
      .set({
        status: "completed",
        progress: totalProcessed,
        result: { total_processed: totalProcessed, total_found: totalFound, total_errors: totalErrors, batches: batchNumber },
        metadata: {
          batch_size: batchSize,
          skip_already_searched: skipSearched,
          total_items: 0,
          processed_items: totalProcessed,
          success_count: totalFound,
          error_count: totalErrors,
          current_batch_number: batchNumber,
        },
        completed_at: new Date(),
        updated_date: new Date(),
      })
      .where(eq(backgroundTasks.id, taskId));
  }

  activeTaskIds.delete(taskId);
  console.log(`[EmailBot] Task ${taskId} finished — processed=${totalProcessed}, found=${totalFound}, errors=${totalErrors}`);
}
