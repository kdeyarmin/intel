import { db, pool } from "../db";
import { providers, providerLocations, providerTaxonomies, enrichmentRecords, backgroundTasks, assistantUsage } from "../db/schema";
import { eq, and, isNull, sql, asc, inArray, lt } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODELS } from "../lib/aiModels";
import { AI_EMAIL_SOURCE, isValidEmailSyntax, shouldPromoteToPrimary } from "./emailValidation";
import { unverifiedEmailUpdate } from "../lib/entityFields";

const BATCH_DELAY_MS = 300;
const PARALLEL_CONCURRENCY = 5;
const activeTaskIds = new Set<number>();

function envInt(name: string, fallback: number): number {
  const n = Math.floor(Number(process.env[name]));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Token units (input + output) the bot may spend per UTC day across all its
// jobs. When the day's budget is hit the running job stops cleanly and
// resumes with the next day's budget; see the daily-spend check in
// runIntelLoop.
const INTEL_DAILY_TOKEN_BUDGET = envInt("INTEL_DAILY_TOKEN_BUDGET", 2_000_000);

// Cross-instance mutual exclusion for the enrichment job. The lock is
// session-level, so it lives on a dedicated pooled connection held for the
// whole job; the in-memory activeTaskIds set remains as a same-process
// fast path and to tell live tasks from orphans at startup.
const INTEL_JOB_LOCK_KEY = "provider_intelligence_job";
const intelLockClients = new Map<number, any>();

/** Acquires the job lock; null when another instance already holds it. Throws on DB errors. */
async function acquireIntelLock(): Promise<any | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [INTEL_JOB_LOCK_KEY]);
    if (rows[0]?.locked) return client;
  } catch (e) {
    client.release();
    throw e;
  }
  client.release();
  return null;
}

async function releaseIntelLock(taskId: number) {
  const client = intelLockClients.get(taskId);
  intelLockClients.delete(taskId);
  if (!client) return;
  try {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [INTEL_JOB_LOCK_KEY]);
  } catch (_) {}
  client.release();
}

export async function cleanupOrphanedIntelTasks() {
  // Only one instance may reap: if another instance holds the job lock, its
  // "processing" task is live, not orphaned.
  const probe = await pool.connect();
  try {
    const { rows } = await probe.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [INTEL_JOB_LOCK_KEY]);
    if (!rows[0]?.locked) return;
    try {
      const orphaned = await db.select().from(backgroundTasks)
        .where(and(
          eq(backgroundTasks.task_type, "provider_intelligence"),
          eq(backgroundTasks.status, "processing")
        ));
      for (const task of orphaned) {
        if (!activeTaskIds.has(task.id)) {
          console.log(`[IntelBot] Cleaning up orphaned task ${task.id}`);
          await db.update(backgroundTasks)
            .set({ status: "failed", error: "Orphaned task - server restarted", completed_at: new Date(), updated_date: new Date() })
            .where(eq(backgroundTasks.id, task.id));
        }
      }
    } finally {
      try {
        await probe.query("SELECT pg_advisory_unlock(hashtext($1))", [INTEL_JOB_LOCK_KEY]);
      } catch (_) {}
    }
  } catch (err: any) {
    console.error("[IntelBot] Orphan cleanup error:", err.message);
  } finally {
    probe.release();
  }
}

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey });
}

async function enrichAndSearchProvider(
  anthropic: Anthropic,
  provider: any,
  location: any,
  taxonomy: any
): Promise<{
  npi: string;
  name: string;
  enrichment: any | null;
  best_email: string | null;
  email_confidence: string | null;
  email_validation_status: string | null;
  email_validation_reason: string | null;
  emails_found: number;
  all_emails: any[];
  usage: { input_tokens: number; output_tokens: number } | null;
  error?: string;
}> {
  const name = provider.entity_type === "Individual"
    ? `${provider.first_name || ""} ${provider.last_name || ""}`.trim()
    : provider.organization_name || "";

  try {
    const prompt = `You are a healthcare provider data intelligence specialist. Given this provider's information, return TWO things in a single JSON response:

1. ENRICHMENT DATA - research and return additional information about this provider
2. EMAIL ADDRESSES - find likely professional email addresses

PROVIDER:
- Name: ${name}
- NPI: ${provider.npi}
- Credential: ${provider.credential || "N/A"}
- Entity Type: ${provider.entity_type}
- Organization: ${provider.organization_name || "N/A"}
- Specialty: ${taxonomy?.taxonomy_description || "N/A"}
- Location: ${location ? `${location.city || ""}, ${location.state || ""}` : "N/A"}
- Address: ${location ? `${location.address_1 || ""}, ${location.city || ""}, ${location.state || ""} ${location.zip || ""}` : "N/A"}
- Phone: ${location?.phone || provider.phone || "N/A"}
- Website: ${provider.website || "N/A"}

Return a JSON object with this exact structure:
{
  "enrichment": {
    "hospital_affiliations": ["Hospital Name 1", "Hospital Name 2"],
    "medical_school": "School name and graduation year if known",
    "board_certifications": ["Certification 1"],
    "group_practice": "Group/practice name if applicable",
    "accepting_new_patients": true/false/null,
    "languages": ["English"],
    "gender": "M" or "F" if determinable from name,
    "years_experience": number or null,
    "subspecialties": ["Subspecialty 1"],
    "notable_info": "Any other relevant public information"
  },
  "emails": [
    {
      "email": "provider@example.com",
      "confidence": "high|medium|low",
      "source": "how you determined this email",
      "validation_status": "valid|risky|invalid",
      "validation_reason": "why this validation status"
    }
  ]
}

ENRICHMENT RULES:
- Only include enrichment fields where you have reasonable confidence
- Omit fields you cannot determine

EMAIL RULES:
- Return up to 3 possible emails sorted by likelihood
- If the provider has a website listed, use that domain for email pattern inference
- For organizations, try patterns like info@, admin@, contact@ with the organization's domain
- For individuals, try first.last@domain, flast@domain patterns
- Practice/office emails are acceptable if personal emails cannot be found
- Confidence: "high" if based on known domain/website, "medium" if inferred from org name, "low" if guessed
- Validation: "valid" = likely deliverable, "risky" = might work but uncertain, "invalid" = likely undeliverable
- Be strict: most AI-inferred emails without verified domains should be "risky" at best

Only return the JSON object, nothing else.`;

    const response = await anthropic.messages.create({
      model: CLAUDE_MODELS.HAIKU,
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const usage = response.usage
      ? { input_tokens: response.usage.input_tokens || 0, output_tokens: response.usage.output_tokens || 0 }
      : null;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { npi: provider.npi, name, enrichment: null, best_email: null, email_confidence: null, email_validation_status: null, email_validation_reason: null, emails_found: 0, all_emails: [], usage };
    }

    const result = JSON.parse(jsonMatch[0]);
    const enrichment = result.enrichment || null;
    const emails = (result.emails || []).filter((e: any) => e.email && e.email.includes("@") && e.email.includes("."));

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
      enrichment,
      best_email: best?.email || null,
      email_confidence: best?.confidence || null,
      email_validation_status: best?.validation_status || null,
      email_validation_reason: best?.validation_reason || null,
      emails_found: sorted.length,
      all_emails: sorted,
      usage,
    };
  } catch (err: any) {
    return {
      npi: provider.npi,
      name,
      enrichment: null,
      best_email: null,
      email_confidence: null,
      email_validation_status: null,
      email_validation_reason: null,
      emails_found: 0,
      all_emails: [],
      usage: null,
      error: err.message,
    };
  }
}

async function saveEnrichment(npi: string, enrichment: any) {
  if (!enrichment) return 0;

  // Idempotency: a re-run (or a provider picked up again for email work) must
  // not stack duplicate enrichment_details rows for the same provider.
  const existing = await safeDbQuery(
    () => db.select({ id: enrichmentRecords.id }).from(enrichmentRecords)
      .where(and(eq(enrichmentRecords.npi, npi), eq(enrichmentRecords.field_name, "enrichment_details")))
      .limit(1),
    null as any[] | null, `check enrichment ${npi}`
  );
  if (existing && existing.length > 0) return 0;

  const fieldsToSave: { field: string; value: any; confidence: number }[] = [];

  if (enrichment.hospital_affiliations?.length) {
    fieldsToSave.push({ field: "hospital_affiliations", value: JSON.stringify(enrichment.hospital_affiliations), confidence: 0.7 });
  }
  if (enrichment.medical_school) {
    fieldsToSave.push({ field: "medical_school", value: enrichment.medical_school, confidence: 0.6 });
  }
  if (enrichment.board_certifications?.length) {
    fieldsToSave.push({ field: "board_certifications", value: JSON.stringify(enrichment.board_certifications), confidence: 0.7 });
  }
  if (enrichment.group_practice) {
    fieldsToSave.push({ field: "group_practice", value: enrichment.group_practice, confidence: 0.6 });
  }
  if (enrichment.languages?.length) {
    fieldsToSave.push({ field: "languages", value: JSON.stringify(enrichment.languages), confidence: 0.8 });
  }
  if (enrichment.gender) {
    fieldsToSave.push({ field: "gender", value: enrichment.gender, confidence: 0.9 });
  }
  if (enrichment.subspecialties?.length) {
    fieldsToSave.push({ field: "subspecialties", value: JSON.stringify(enrichment.subspecialties), confidence: 0.65 });
  }
  if (enrichment.years_experience) {
    fieldsToSave.push({ field: "years_experience", value: String(enrichment.years_experience), confidence: 0.5 });
  }

  if (fieldsToSave.length === 0) return 0;

  const avgConfidence = fieldsToSave.reduce((sum, f) => sum + f.confidence, 0) / fieldsToSave.length;

  // These fields are AI *inferences* (hospital affiliations, medical school,
  // board certifications, etc.), not verified facts. Store them as reviewable
  // "suggested" records — never "applied" — and do not silently overwrite
  // authoritative provider columns with them.
  const inserted = await safeDbQuery(
    () => db.insert(enrichmentRecords).values({
      npi,
      source: "claude_ai",
      field_name: "enrichment_details",
      old_value: null,
      new_value: JSON.stringify(enrichment),
      confidence: avgConfidence,
      status: "suggested",
      enrichment_details: enrichment,
    }),
    null, `save enrichment ${npi}`
  );
  if (!inserted) return 0;

  for (const f of fieldsToSave) {
    await safeDbQuery(
      () => db.insert(enrichmentRecords).values({
        npi,
        source: "claude_ai",
        field_name: f.field,
        old_value: null,
        new_value: f.value,
        confidence: f.confidence,
        status: "suggested",
        enrichment_details: { field: f.field, source: "AI inference (unverified)" },
      }),
      null, `save field ${f.field}`
    );
  }

  return fieldsToSave.length;
}

/** A failed provider gets a per-provider error row, not just a task counter. */
async function saveEnrichmentError(npi: string, error: string) {
  const detail = (error || "unknown error").substring(0, 1000);
  await safeDbQuery(
    () => db.insert(enrichmentRecords).values({
      npi,
      source: "claude_ai",
      field_name: "enrichment_error",
      old_value: null,
      new_value: detail,
      confidence: null,
      status: "error",
      enrichment_details: { error: detail },
    }),
    null, `save enrichment error ${npi}`
  );
}

export async function saveEmail(provider: any, result: any) {
  const candidates = (result.all_emails || [])
    .filter((e: any) => isValidEmailSyntax(e.email))
    .map((e: any) => ({
      email: e.email,
      confidence: e.confidence,
      source: AI_EMAIL_SOURCE,
      validation_status: e.validation_status,
    }));

  const promote = await shouldPromoteToPrimary({
    email: result.best_email,
    confidence: result.email_confidence,
    validation_status: result.email_validation_status,
  });

  if (!promote) {
    await safeDbQuery(
      () => db.update(providers).set({
        email_searched_at: new Date(),
        additional_emails: candidates.length > 0 ? candidates : null,
        updated_date: new Date(),
      }).where(eq(providers.id, provider.id)),
      null, `mark email searched ${provider.npi}`
    );
    return;
  }

  // A new address drops the old address's DNS check; see unverifiedEmailUpdate.
  await safeDbQuery(
    () => db.update(providers).set(unverifiedEmailUpdate(providers, {
      email: result.best_email,
      email_confidence: result.email_confidence,
      email_source: AI_EMAIL_SOURCE,
      email_validation_status: result.email_validation_status,
      email_validation_reason: result.email_validation_reason,
      additional_emails: candidates.length > 1 ? candidates.slice(1) : null,
      email_searched_at: new Date(),
      updated_date: new Date(),
    })).where(eq(providers.id, provider.id)),
    null, `save email ${provider.npi}`
  );
}

function taskToJobState(task: any) {
  if (!task) {
    return {
      status: "idle" as const,
      enriched: 0, emailsFound: 0, noData: 0, errors: 0, total: 0,
      batchSize: 10,
      startedAt: null, lastBatchAt: null, message: "",
    };
  }
  const meta: any = task.metadata || {};
  const statusMap: Record<string, string> = {
    processing: "running",
    completed: "completed",
    cancelled: "idle",
    failed: "error",
  };
  return {
    status: statusMap[task.status] || "idle",
    enriched: meta.enriched || 0,
    emailsFound: meta.emails_found || 0,
    noData: meta.no_data || 0,
    errors: meta.errors || 0,
    total: meta.total || 0,
    batchSize: meta.batch_size || 10,
    startedAt: task.started_at ? new Date(task.started_at).toISOString() : null,
    lastBatchAt: meta.last_batch_at || null,
    message: meta.message || "",
    errorDetail: task.error || undefined,
    taskId: task.id,
  };
}

async function getActiveIntelTask() {
  const [task] = await db.select().from(backgroundTasks)
    .where(and(
      eq(backgroundTasks.task_type, "provider_intelligence"),
      eq(backgroundTasks.status, "processing")
    ))
    .limit(1);
  return task || null;
}

async function getProvidersNeedingWork(batchSize: number) {
  const rawRows = await db.execute(sql`
    SELECT p.id, p.npi, p.first_name, p.last_name, p.organization_name,
           p.entity_type, p.credential, p.gender, p.phone, p.website, p.email_searched_at,
           EXISTS (
             SELECT 1 FROM enrichment_records er
             WHERE er.npi = p.npi AND er.field_name = 'enrichment_details'
           ) AS has_enrichment
    FROM providers p
    WHERE (
      NOT EXISTS (
        SELECT 1 FROM enrichment_records er
        WHERE er.npi = p.npi AND er.field_name = 'enrichment_details'
      )
      OR p.email_searched_at IS NULL
    )
    ORDER BY p.npi
    LIMIT ${batchSize}
  `);
  return Array.isArray(rawRows) ? rawRows : (rawRows as any)?.rows || [];
}

/**
 * Records the bot's model spend in assistant_usage, the same table the chat
 * assistant logs to, keyed by the user who started the job (with their org).
 * Best-effort: logging must never fail a batch.
 */
async function logBotUsage(meta: any, units: number, requests: number) {
  const userId = meta.started_by_user_id;
  if (!userId || units <= 0) return;
  const orgId = meta.started_by_org_id ?? null;
  const day = new Date().toISOString().slice(0, 10); // UTC day, like the chat logger
  const rounded = Math.max(1, Math.round(units));
  await safeDbQuery(
    () => db.insert(assistantUsage).values({
      user_id: userId,
      org_id: orgId,
      day,
      units: rounded,
      requests,
    }).onConflictDoUpdate({
      target: [assistantUsage.user_id, assistantUsage.day],
      set: {
        units: sql`${assistantUsage.units} + ${rounded}`,
        requests: sql`${assistantUsage.requests} + ${requests}`,
        org_id: sql`COALESCE(${assistantUsage.org_id}, ${orgId})`,
      },
    }),
    null, "log bot usage"
  );
}

async function safeDbQuery<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      if (attempt === 3) {
        console.warn(`[IntelBot] ${label} failed after 3 attempts: ${e.message}`);
        return fallback;
      }
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  return fallback;
}

let intelLoopRetries = 0;
const MAX_LOOP_RETRIES = 10;

async function runIntelLoop(taskId: number) {
  if (!activeTaskIds.has(taskId)) return;

  let task: any = null;
  try {
    const rows = await safeDbQuery(
      () => db.select().from(backgroundTasks).where(eq(backgroundTasks.id, taskId)),
      [] as any[], "check task"
    );
    task = rows[0];
  } catch (_) {}

  if (!task || task.status !== "processing") {
    if (!task && intelLoopRetries < MAX_LOOP_RETRIES) {
      intelLoopRetries++;
      console.log(`[IntelBot] Could not read task ${taskId}, retrying in 10s (attempt ${intelLoopRetries}/${MAX_LOOP_RETRIES})`);
      setTimeout(() => runIntelLoop(taskId), 10000);
      return;
    }
    activeTaskIds.delete(taskId);
    await releaseIntelLock(taskId);
    return;
  }
  intelLoopRetries = 0;

  const meta: any = task.metadata || {};

  // Daily token budget: stops the job cleanly when the day's spend is hit.
  // The counter lives in the task metadata so it survives restarts.
  const today = new Date().toISOString().slice(0, 10);
  const spentToday = meta.daily_spend_day === today ? (meta.daily_spend_units || 0) : 0;
  if (spentToday >= INTEL_DAILY_TOKEN_BUDGET) {
    activeTaskIds.delete(taskId);
    await releaseIntelLock(taskId);
    await safeDbQuery(() => db.update(backgroundTasks).set({
      status: "completed",
      metadata: {
        ...meta,
        message: `Stopped: daily token budget reached (${Math.round(spentToday).toLocaleString("en-US")} units). The job resumes with tomorrow's budget.`,
      },
      completed_at: new Date(),
      updated_date: new Date(),
    }).where(eq(backgroundTasks.id, taskId)), undefined, "budget stop");
    return;
  }

  try {
    const limit = Math.min(meta.batch_size || 10, 50);
    const rows = await getProvidersNeedingWork(limit);

    if (rows.length === 0) {
      activeTaskIds.delete(taskId);
      await releaseIntelLock(taskId);
      await safeDbQuery(() => db.update(backgroundTasks).set({
        status: "completed",
        metadata: { ...meta, message: `Completed. ${meta.enriched || 0} enriched, ${meta.emails_found || 0} emails found.` },
        completed_at: new Date(),
        updated_date: new Date(),
      }).where(eq(backgroundTasks.id, taskId)), undefined, "complete task");
      return;
    }

    const npis = rows.map((r: any) => r.npi).filter(Boolean);
    const locationMap = new Map<string, any>();
    const taxonomyMap = new Map<string, any>();

    if (npis.length > 0) {
      const [locs, taxs] = await Promise.all([
        safeDbQuery(
          () => db.select().from(providerLocations).where(inArray(providerLocations.npi, npis)),
          [] as any[], "fetch locations"
        ),
        safeDbQuery(
          () => db.select().from(providerTaxonomies).where(inArray(providerTaxonomies.npi, npis)),
          [] as any[], "fetch taxonomies"
        ),
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
    }

    const anthropic = getAnthropicClient();
    let batchEnriched = 0;
    let batchEmails = 0;
    let batchNoData = 0;
    let batchErrors = 0;
    let batchUnits = 0;
    let batchRequests = 0;

    let idx = 0;
    let workersCancelled = false;
    const provResults: { prov: any; result: any }[] = [];

    async function worker() {
      while (idx < rows.length && !workersCancelled) {
        const myIdx = idx++;
        if (myIdx >= rows.length) break;

        if (myIdx % 10 === 0 && myIdx > 0) {
          const checkRows = await safeDbQuery(
            () => db.select().from(backgroundTasks).where(eq(backgroundTasks.id, taskId)),
            null as any, "cancel check"
          );
          if (checkRows?.[0]?.status === "cancelled") {
            workersCancelled = true;
            break;
          }
        }

        const prov = rows[myIdx];
        const loc = locationMap.get(prov.npi || "");
        const tax = taxonomyMap.get(prov.npi || "");

        try {
          const result = await enrichAndSearchProvider(anthropic, prov, loc, tax);
          if (result.usage) {
            batchUnits += result.usage.input_tokens + result.usage.output_tokens;
            batchRequests += 1;
          }
          provResults.push({ prov, result });
        } catch (e: any) {
          console.error(`[IntelBot] Error for NPI ${prov.npi}:`, e.message);
          provResults.push({ prov, result: { enrichment: null, best_email: null, usage: null, error: e.message } });
        }
        if (myIdx < rows.length - 1) {
          await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
      }
    }

    const workers = Array.from(
      { length: Math.min(PARALLEL_CONCURRENCY, rows.length) },
      () => worker()
    );
    await Promise.all(workers);

    if (workersCancelled) {
      activeTaskIds.delete(taskId);
      await releaseIntelLock(taskId);
      return;
    }

    for (const { prov, result } of provResults) {
      if (result.error && !result.enrichment) {
        batchErrors++;
        await saveEnrichmentError(prov.npi, result.error);
        continue;
      }
      if (result.enrichment) {
        if (prov.has_enrichment) {
          // Picked up again for email work: don't stack duplicate rows.
        } else {
          const fieldCount = await saveEnrichment(prov.npi, result.enrichment);
          if (fieldCount > 0) batchEnriched++;
          else batchNoData++;
        }
      } else {
        batchNoData++;
      }
      if (!prov.email_searched_at) {
        await saveEmail(prov, result);
        if (result.best_email) batchEmails++;
      }
    }

    // Cost accounting for the batch: same assistant_usage table the chat
    // assistant logs to, plus a per-day counter in the task metadata for the
    // daily budget check above.
    await logBotUsage(meta, batchUnits, batchRequests);

    const newMeta = {
      ...meta,
      enriched: (meta.enriched || 0) + batchEnriched,
      emails_found: (meta.emails_found || 0) + batchEmails,
      no_data: (meta.no_data || 0) + batchNoData,
      errors: (meta.errors || 0) + batchErrors,
      total: (meta.total || 0) + rows.length,
      spend_units: (meta.spend_units || 0) + batchUnits,
      spend_requests: (meta.spend_requests || 0) + batchRequests,
      daily_spend_day: today,
      daily_spend_units: (meta.daily_spend_day === today ? meta.daily_spend_units || 0 : 0) + batchUnits,
      last_batch_at: new Date().toISOString(),
      message: `Running... ${(meta.enriched || 0) + batchEnriched} enriched, ${(meta.emails_found || 0) + batchEmails} emails found, ${(meta.total || 0) + rows.length} processed`,
    };

    await safeDbQuery(() => db.update(backgroundTasks).set({
      progress: newMeta.total,
      metadata: newMeta,
      updated_date: new Date(),
    }).where(eq(backgroundTasks.id, taskId)), undefined, "update progress");

    setTimeout(() => runIntelLoop(taskId), 500);
  } catch (e: any) {
    console.error("[IntelBot] Loop error:", e.message);
    if (!activeTaskIds.has(taskId)) return;

    try {
      await db.update(backgroundTasks).set({
        metadata: { ...meta, errors: (meta.errors || 0) + 1, message: `Error: ${e.message?.substring(0, 100)}` },
        updated_date: new Date(),
      }).where(eq(backgroundTasks.id, taskId));
    } catch (_) {}

    setTimeout(() => runIntelLoop(taskId), 10000);
  }
}

export async function handleIntelJobStart(payload: any, startedBy?: { id: number; orgId?: number | null }) {
  // The advisory lock is the cross-instance duplicate guard: a second caller
  // (same process or another instance) can't acquire it while the job runs.
  const lockClient = await acquireIntelLock();
  if (!lockClient) {
    const existing = await getActiveIntelTask();
    return { success: false, message: "Provider Intelligence job is already running", job: taskToJobState(existing) };
  }

  try {
    const existing = await getActiveIntelTask();
    if (existing && !activeTaskIds.has(existing.id)) {
      // We hold the lock, so no live job owns this row: a previous process
      // died mid-run.
      console.log(`[IntelBot] Cleaning orphaned task ${existing.id}`);
      await db.update(backgroundTasks).set({
        status: "failed", error: "Orphaned - server restarted",
        completed_at: new Date(), updated_date: new Date(),
      }).where(eq(backgroundTasks.id, existing.id));
    }

    const batchSize = Math.max(1, Math.min(payload.batch_size || 10, 50));
    const [task] = await db.insert(backgroundTasks).values({
      task_type: "provider_intelligence",
      status: "processing",
      progress: 0,
      metadata: {
        batch_size: batchSize,
        enriched: 0, emails_found: 0, no_data: 0, errors: 0, total: 0,
        spend_units: 0, spend_requests: 0,
        daily_spend_day: null, daily_spend_units: 0,
        started_by_user_id: startedBy?.id ?? null,
        started_by_org_id: startedBy?.orgId ?? null,
        message: "Starting...",
        last_batch_at: null,
      },
      started_at: new Date(),
    }).returning();

    intelLockClients.set(task.id, lockClient);
    activeTaskIds.add(task.id);
    setTimeout(() => runIntelLoop(task.id), 0);
    return { success: true, message: "Provider Intelligence job started", job: taskToJobState(task) };
  } catch (e) {
    try {
      await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [INTEL_JOB_LOCK_KEY]);
    } catch (_) {}
    lockClient.release();
    throw e;
  }
}

export async function handleIntelJobStop() {
  const existing = await getActiveIntelTask();
  if (!existing) {
    return { success: false, message: "No Provider Intelligence job is running", job: taskToJobState(null) };
  }
  activeTaskIds.delete(existing.id);
  await releaseIntelLock(existing.id);
  await db.update(backgroundTasks).set({
    status: "cancelled",
    completed_at: new Date(),
    updated_date: new Date(),
  }).where(eq(backgroundTasks.id, existing.id));
  const meta: any = existing.metadata || {};
  return {
    success: true, message: "Provider Intelligence stopped",
    job: { ...taskToJobState(existing), status: "idle", message: `Stopped. ${meta.enriched || 0} enriched, ${meta.emails_found || 0} emails found.` },
  };
}

export async function handleIntelJobStatus() {
  const existing = await getActiveIntelTask();
  if (existing && !activeTaskIds.has(existing.id)) {
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
    if (existing.updated_date && existing.updated_date < staleThreshold) {
      await db.update(backgroundTasks).set({
        status: "failed", error: "Stale - no updates for 10+ minutes",
        completed_at: new Date(), updated_date: new Date(),
      }).where(eq(backgroundTasks.id, existing.id));
      return { success: true, job: taskToJobState(null) };
    }
  }
  if (!existing) {
    return { success: true, job: taskToJobState(null) };
  }
  return { success: true, job: taskToJobState(existing) };
}

export async function handleGetIntelCandidateCount() {
  const totalRows = await db.execute(sql`SELECT reltuples::bigint AS count FROM pg_class WHERE relname = 'providers'`);
  // reltuples is -1 for a table that was never ANALYZEd (PG14+): clamp it, so the page never shows -1 providers.
  const totalProviders = Math.max(0, Number((totalRows as any)?.[0]?.count || (totalRows as any)?.rows?.[0]?.count || 0));

  const enrichedRows = await db.execute(sql`
    SELECT COUNT(DISTINCT npi)::int AS count FROM enrichment_records WHERE field_name = 'enrichment_details'
  `);
  const enrichedCount = Number((enrichedRows as any)?.[0]?.count || (enrichedRows as any)?.rows?.[0]?.count || 0);

  const emailRows = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM providers WHERE email_searched_at IS NOT NULL
  `);
  const emailSearchedCount = Number((emailRows as any)?.[0]?.count || (emailRows as any)?.rows?.[0]?.count || 0);

  const emailFoundRows = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM providers WHERE email IS NOT NULL AND email != ''
  `);
  const emailFoundCount = Number((emailFoundRows as any)?.[0]?.count || (emailFoundRows as any)?.rows?.[0]?.count || 0);

  const needsWorkRows = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM providers p
    WHERE NOT EXISTS (
      SELECT 1 FROM enrichment_records er WHERE er.npi = p.npi AND er.field_name = 'enrichment_details'
    )
    OR p.email_searched_at IS NULL
  `);
  const needsWorkCount = Number((needsWorkRows as any)?.[0]?.count || (needsWorkRows as any)?.rows?.[0]?.count || 0);

  return {
    success: true,
    totalProviders,
    enrichedCount,
    unenrichedCount: Math.max(0, totalProviders - enrichedCount),
    emailSearchedCount,
    emailFoundCount,
    needsWorkCount,
  };
}
