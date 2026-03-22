import { db } from "../db";
import { providers, providerLocations, providerTaxonomies, backgroundTasks } from "../db/schema";
import { eq, and, isNull, isNotNull, sql, asc, desc, inArray, lt } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

const BATCH_DELAY_MS = 1500;

const activeTaskIds = new Set<number>();

export async function cleanupOrphanedEmailTasks() {
  try {
    const orphaned = await db.select().from(backgroundTasks)
      .where(and(
        eq(backgroundTasks.task_type, "email_search"),
        eq(backgroundTasks.status, "processing")
      ));
    for (const task of orphaned) {
      if (!activeTaskIds.has(task.id)) {
        console.log(`[EmailBot] Cleaning up orphaned task ${task.id}`);
        await db.update(backgroundTasks)
          .set({ status: "failed", error: "Orphaned task - server restarted", completed_at: new Date(), updated_date: new Date() })
          .where(eq(backgroundTasks.id, task.id));
      }
    }
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
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
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
    const searchPrompt = `Find likely professional email addresses for this healthcare provider. Use your knowledge to infer the most likely email patterns.

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

Instructions:
1. Based on the provider's name, organization, and specialty, determine the most likely organization or practice they belong to.
2. Infer email patterns based on common healthcare organization email formats (e.g., first.last@hospital.org, flast@clinic.com).
3. If the provider has a website listed, use that domain for email pattern inference.
4. For organizations, suggest common patterns like info@, admin@, contact@ using the organization's likely domain.
5. For each email, rate confidence: "high" if based on known domain/website, "medium" if inferred from organization name, "low" if purely guessed.
6. Return up to 3 possible emails.
7. If the provider type is "Organization", try patterns like info@, admin@, contact@ with the organization's domain.
8. PRACTICE EMAILS ARE ACCEPTABLE: If you cannot find a personal/direct email, return practice or office emails. Always prefer a direct provider email, but never return zero results if a practice email could exist.

IMPORTANT: Be honest about confidence levels. If you're uncertain, mark as "low".`;

    const emailSchema = {
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
            },
          },
        },
        organization_domain: { type: "string" },
        notes: { type: "string" },
      },
    };

    const searchResult = await callClaude(anthropic, searchPrompt, emailSchema);
    const emails = (searchResult.emails || []).filter(
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

    const validationPrompt = `You are an email deliverability expert. Validate these emails for healthcare provider "${name}" (NPI: ${provider.npi}).

EMAILS:
${emails.map((e: any, i: number) => `${i + 1}. ${e.email} (confidence: ${e.confidence}, source: ${e.source})`).join("\n")}

CONTEXT: Type=${provider.entity_type}, Org=${provider.organization_name || "N/A"}, Credential=${provider.credential || "N/A"}

For each email assign:
- "valid" = high likelihood of being deliverable and correct (matches known domain patterns, proper format)
- "risky" = might work but has concerns (role-based, catch-all, pattern mismatch, unknown domain)
- "invalid" = likely undeliverable (bad format, implausible domain, wrong person)

Be strict: most AI-inferred emails without verified domains should be "risky" at best.`;

    const validationSchema = {
      type: "object",
      properties: {
        validations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              email: { type: "string" },
              status: { type: "string", enum: ["valid", "risky", "invalid"] },
              reason: { type: "string" },
            },
          },
        },
      },
    };

    const validationResult = await callClaude(anthropic, validationPrompt, validationSchema);
    const validations = validationResult.validations || [];

    const enrichedEmails = emails.map((e: any) => {
      const v = validations.find((val: any) => val.email === e.email);
      return {
        ...e,
        validation_status: v?.status || "unknown",
        validation_reason: v?.reason || "",
      };
    });

    const validationRank: Record<string, number> = { valid: 3, risky: 2, unknown: 1, invalid: 0 };
    const confidenceRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const sorted = [...enrichedEmails].sort((a, b) => {
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
      emails_found: enrichedEmails.length,
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
  if (!result.best_email) {
    await db
      .update(providers)
      .set({
        email_searched_at: new Date(),
        updated_date: new Date(),
      })
      .where(eq(providers.id, provider.id));
    return;
  }

  await db
    .update(providers)
    .set({
      email: result.best_email,
      email_confidence: result.confidence,
      email_source: result.all_emails[0]?.source || "ai_search",
      email_validation_status: result.validation_status,
      email_validation_reason: result.validation_reason,
      additional_emails: result.all_emails.length > 1
        ? result.all_emails.slice(1).map((e: any) => ({
            email: e.email,
            confidence: e.confidence,
            source: e.source,
            validation_status: e.validation_status,
          }))
        : null,
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

export async function handleEmailSearchBot(payload: any) {
  const { mode, npi, batch_size: rawBatchSize = 5, skip_already_searched = true, total_items, task_id } = payload;
  const batch_size = Math.max(1, Math.min(50, Number(rawBatchSize) || 5));

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
    const staleThreshold = new Date(Date.now() - 2 * 60 * 1000);
    const staleTasks = await db.select().from(backgroundTasks)
      .where(and(
        eq(backgroundTasks.task_type, "email_search"),
        eq(backgroundTasks.status, "processing"),
        lt(backgroundTasks.updated_date, staleThreshold)
      ));
    for (const stale of staleTasks) {
      activeTaskIds.delete(stale.id);
      console.log(`[EmailBot] Resetting stale task ${stale.id} (last updated ${stale.updated_date})`);
      await db.update(backgroundTasks)
        .set({ status: "failed", error: "Task became stale (no updates for 2+ minutes)", completed_at: new Date(), updated_date: new Date() })
        .where(eq(backgroundTasks.id, stale.id));
    }
    const orphanedInMemory = await db.select().from(backgroundTasks)
      .where(and(
        eq(backgroundTasks.task_type, "email_search"),
        eq(backgroundTasks.status, "processing")
      ));
    for (const task of orphanedInMemory) {
      if (!activeTaskIds.has(task.id)) {
        console.log(`[EmailBot] Cleaning orphaned in-memory task ${task.id}`);
        await db.update(backgroundTasks)
          .set({ status: "failed", error: "Orphaned task - process no longer running", completed_at: new Date(), updated_date: new Date() })
          .where(eq(backgroundTasks.id, task.id));
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

  const results: any[] = [];
  let found = 0;

  for (const prov of providersToSearch) {
    const loc = locationMap.get(prov.npi || "");
    const tax = taxonomyMap.get(prov.npi || "");

    const result = await searchEmailForProvider(anthropic, prov, loc, tax);
    results.push(result);

    await saveEmailToProvider(prov, result);

    if (result.best_email) found++;

    if (providersToSearch.indexOf(prov) < providersToSearch.length - 1) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return {
    success: true,
    searched: results.length,
    found,
    results,
  };
}

async function runBackgroundSearch(taskId: number, batchSize: number, skipSearched: boolean) {
  const anthropic = getAnthropicClient();
  let totalProcessed = 0;
  let totalFound = 0;
  let batchNumber = 0;
  const MAX_TOTAL = 10000;

  while (totalProcessed < MAX_TOTAL) {
    const [task] = await db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, taskId));
    if (!task || task.status === "cancelled") break;

    const batch = await getProvidersForSearch(batchSize, skipSearched);
    if (batch.length === 0) break;

    batchNumber++;
    const npis = batch.map((p) => p.npi).filter(Boolean);
    const locationMap = new Map<string, any>();
    const taxonomyMap = new Map<string, any>();

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

    for (const prov of batch) {
      const [freshTask] = await db
        .select()
        .from(backgroundTasks)
        .where(eq(backgroundTasks.id, taskId));
      if (!freshTask || freshTask.status === "cancelled") break;

      const loc = locationMap.get(prov.npi || "");
      const tax = taxonomyMap.get(prov.npi || "");

      const result = await searchEmailForProvider(anthropic, prov, loc, tax);
      await saveEmailToProvider(prov, result);

      totalProcessed++;
      if (result.best_email) totalFound++;

      const taskMeta = (await db.select().from(backgroundTasks).where(eq(backgroundTasks.id, taskId)))[0];
      const prevMeta: any = taskMeta?.metadata || {};
      await db
        .update(backgroundTasks)
        .set({
          progress: totalProcessed,
          metadata: {
            batch_size: batchSize,
            skip_already_searched: skipSearched,
            total_items: prevMeta.total_items || 0,
            processed_items: totalProcessed,
            success_count: totalFound,
            current_batch_number: batchNumber,
          },
          updated_date: new Date(),
        })
        .where(eq(backgroundTasks.id, taskId));

      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  const [finalTask] = await db
    .select()
    .from(backgroundTasks)
    .where(eq(backgroundTasks.id, taskId));

  if (finalTask && finalTask.status !== "cancelled") {
    const prevMeta: any = finalTask.metadata || {};
    await db
      .update(backgroundTasks)
      .set({
        status: "completed",
        progress: totalProcessed,
        result: { total_processed: totalProcessed, total_found: totalFound, batches: batchNumber },
        metadata: {
          batch_size: prevMeta.batch_size || prevMeta.batch_size,
          skip_already_searched: prevMeta.skip_already_searched,
          total_items: prevMeta.total_items || 0,
          processed_items: totalProcessed,
          success_count: totalFound,
          current_batch_number: batchNumber,
        },
        completed_at: new Date(),
        updated_date: new Date(),
      })
      .where(eq(backgroundTasks.id, taskId));
  }

  activeTaskIds.delete(taskId);
  console.log(`[EmailBot] Background search ${finalTask?.status === "cancelled" ? "cancelled" : "completed"}: ${totalProcessed} searched, ${totalFound} found`);
}
