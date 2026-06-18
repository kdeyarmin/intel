import { db, pool } from "../db";
import { enrichmentRecords, backgroundTasks } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_MODELS } from "../lib/aiModels";
import { isValidEmailSyntax } from "./emailValidation";
import {
  DME_FACILITY_TYPE,
  DME_EMAIL_SOURCE,
  extractDMEContact,
  rankEmailCandidates,
  collectDMEEmails,
  confidenceToScore,
  computeJobProgress,
  normalizeState,
} from "./dmeReportHelpers";

const TASK_TYPE = "dme_email_search";
const EXPORT_CAP = 60000;
const EXPORT_CHUNK = 5000;
const FINDER_BATCH = 12;
const FINDER_CONCURRENCY = 5;
const FINDER_DELAY_MS = 300;
const CANCEL_CHECK_INTERVAL = 6;

const activeTaskIds = new Set<number>();

let dmeStatesCache: { data: any[]; timestamp: number } | null = null;
const STATES_CACHE_TTL = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// Read side: report query
// ---------------------------------------------------------------------------

async function withClient<T>(timeoutMs: number, fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(`SET statement_timeout = '${Math.max(1000, Math.min(timeoutMs, 120000))}'`);
    return await fn(client);
  } finally {
    await client.query("RESET statement_timeout").catch(() => {});
    client.release();
  }
}

/** Fetch already-found emails for a set of supplier provider_ids (chunked). */
async function fetchEnrichedEmails(client: any, providerIds: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  if (providerIds.length === 0) return map;
  const CHUNK = 10000;
  for (let i = 0; i < providerIds.length; i += CHUNK) {
    const slice = providerIds.slice(i, i + CHUNK);
    const rows = (await client.query(
      `SELECT DISTINCT ON (npi) npi, new_value, confidence, status, enrichment_details
         FROM enrichment_records
        WHERE source = $1 AND field_name = 'email' AND npi = ANY($2)
        ORDER BY npi, id DESC`,
      [DME_EMAIL_SOURCE, slice],
    )).rows;
    for (const r of rows) map.set(r.npi, r);
  }
  return map;
}

function buildRow(facility: any, enriched: any) {
  const contact = extractDMEContact(facility.raw_data);
  const details = enriched?.enrichment_details || {};
  // Every distinct email found for this supplier, primary first. A supplier can
  // have multiple mailboxes, so the report exposes all of them.
  const emails = collectDMEEmails(enriched, contact.email);
  const searched = !!enriched;
  return {
    provider_id: facility.provider_id,
    npi: contact.npi || (facility.provider_id?.length === 10 ? facility.provider_id : ""),
    name: facility.facility_name || "",
    address: facility.address || "",
    city: facility.city || "",
    state: facility.state || "",
    zip: facility.zip || "",
    phone: contact.phone || "",
    website: contact.website || "",
    email: emails[0] || "",
    additional_emails: emails.slice(1).join("; "),
    all_emails: emails.join("; "),
    emails_found: emails.length,
    email_status: emails.length === 0
      ? (searched ? "not_found" : "")
      : (searched ? "found" : "directory"),
    email_confidence: details.validation_status || (enriched?.confidence != null ? String(enriched.confidence) : ""),
    email_source: searched ? DME_EMAIL_SOURCE : (contact.email ? "directory" : ""),
  };
}

export async function handleGetDMEProviders(params: any) {
  const state = normalizeState(params?.state);
  const search = typeof params?.search === "string" && params.search.trim() ? params.search.trim() : null;
  const forExport = params?.for_export === true;
  const limit = Math.max(1, Math.min(Number(params?.limit) || 50, 200));
  const page = Math.max(1, Number(params?.page) || 1);

  const where: string[] = ["facility_type = $1"];
  const values: any[] = [DME_FACILITY_TYPE];
  let p = 2;
  if (state) { where.push(`state = $${p}`); values.push(state); p++; }
  if (search) { where.push(`facility_name ILIKE $${p}`); values.push(`%${search.replace(/[%_]/g, (m) => `\\${m}`)}%`); p++; }
  const whereSQL = where.join(" AND ");

  return withClient(forExport ? 60000 : 25000, async (client) => {
    // Available states (cached) for the filter dropdown.
    let availableStates: any[] = [];
    if (dmeStatesCache && Date.now() - dmeStatesCache.timestamp < STATES_CACHE_TTL) {
      availableStates = dmeStatesCache.data;
    } else {
      try {
        const rows = (await client.query(
          `SELECT state, count(DISTINCT provider_id)::int AS count
             FROM medicare_facilities WHERE facility_type = $1 AND state IS NOT NULL AND state <> ''
            GROUP BY state ORDER BY count DESC LIMIT 60`,
          [DME_FACILITY_TYPE],
        )).rows;
        availableStates = rows.map((r: any) => ({ state: r.state, count: Number(r.count) }));
        dmeStatesCache = { data: availableStates, timestamp: Date.now() };
      } catch { /* best-effort */ }
    }

    // Total distinct suppliers in scope (best-effort).
    let total = 0;
    try {
      const countRows = (await client.query(
        `SELECT count(DISTINCT provider_id)::int AS count FROM medicare_facilities WHERE ${whereSQL}`,
        values,
      )).rows;
      total = Number(countRows[0]?.count || 0);
    } catch { /* leave 0 */ }

    if (forExport) {
      const out: any[] = [];
      let offset = 0;
      while (out.length < EXPORT_CAP) {
        const facilities = (await client.query(
          `SELECT DISTINCT ON (provider_id) provider_id, facility_name, address, city, state, zip, raw_data
             FROM medicare_facilities WHERE ${whereSQL}
            ORDER BY provider_id, data_year DESC
            LIMIT $${p} OFFSET $${p + 1}`,
          [...values, EXPORT_CHUNK, offset],
        )).rows;
        if (facilities.length === 0) break;
        const ids = facilities.map((f: any) => f.provider_id).filter(Boolean);
        const enriched = await fetchEnrichedEmails(client, ids);
        for (const f of facilities) out.push(buildRow(f, enriched.get(f.provider_id)));
        if (facilities.length < EXPORT_CHUNK) break;
        offset += EXPORT_CHUNK;
      }
      out.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      return { providers: out, total: total || out.length, for_export: true, available_states: availableStates };
    }

    const offset = (page - 1) * limit;
    const facilities = (await client.query(
      `SELECT DISTINCT ON (provider_id) provider_id, facility_name, address, city, state, zip, raw_data
         FROM medicare_facilities WHERE ${whereSQL}
        ORDER BY provider_id, data_year DESC
        LIMIT $${p} OFFSET $${p + 1}`,
      [...values, limit, offset],
    )).rows;
    const ids = facilities.map((f: any) => f.provider_id).filter(Boolean);
    const enriched = await fetchEnrichedEmails(client, ids);
    const rows = facilities.map((f: any) => buildRow(f, enriched.get(f.provider_id)));
    rows.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));

    // Email coverage across the in-scope suppliers (best-effort, may time out on
    // very large scopes — the page still renders without it).
    let emailStats = { total, searched: 0, with_email: 0 };
    try {
      // count(DISTINCT …) keeps the coverage accurate even after a re-scan,
      // which inserts an additional enrichment_records row per supplier.
      const statRows = (await client.query(
        `SELECT count(DISTINCT f.provider_id)::int AS total,
                count(DISTINCT e.npi)::int AS searched,
                count(DISTINCT e.npi) FILTER (WHERE e.new_value IS NOT NULL AND e.new_value <> '')::int AS with_email
           FROM (SELECT DISTINCT provider_id FROM medicare_facilities WHERE ${whereSQL}) f
           LEFT JOIN enrichment_records e
             ON e.npi = f.provider_id AND e.source = '${DME_EMAIL_SOURCE}' AND e.field_name = 'email'`,
        values,
      )).rows;
      if (statRows[0]) emailStats = {
        total: Number(statRows[0].total || total),
        searched: Number(statRows[0].searched || 0),
        with_email: Number(statRows[0].with_email || 0),
      };
    } catch { /* best-effort */ }

    return {
      providers: rows,
      total,
      page,
      limit,
      available_states: availableStates,
      email_stats: emailStats,
    };
  });
}

// ---------------------------------------------------------------------------
// Write side: AI email finder (background job)
// ---------------------------------------------------------------------------

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey });
}

async function callClaudeJSON(anthropic: Anthropic, prompt: string, schema: any): Promise<any> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODELS.HAIKU,
    max_tokens: 1024,
    system: `You must respond with valid JSON matching this schema: ${JSON.stringify(schema)}. Do not include any text before or after the JSON.`,
    messages: [{ role: "user", content: prompt }],
  });
  const textContent = message.content.find((c: any) => c.type === "text") as any;
  const text = textContent?.text || "{}";
  try { return JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { return {}; } }
    return {};
  }
}

const EMAIL_SCHEMA = {
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

async function findCompanyEmail(anthropic: Anthropic, company: {
  name: string; address: string; city: string; state: string; zip: string;
  phone: string | null; website: string | null; npi: string | null;
}): Promise<{ best: any | null; all: any[] }> {
  const prompt = `Find and validate professional/business email addresses for this Durable Medical Equipment (DME/DMEPOS) supplier company.

COMPANY:
- Business Name: ${company.name || "N/A"}
- NPI: ${company.npi || "N/A"}
- Address: ${[company.address, company.city, company.state, company.zip].filter(Boolean).join(", ") || "N/A"}
- Phone: ${company.phone || "N/A"}
- Website: ${company.website || "N/A"}

STEP 1 - FIND EMAILS:
1. Determine the most likely company domain(s) from the business name, website, and location.
2. If a website is listed, use that domain directly.
3. Apply common business email patterns across every plausible department mailbox: info@, sales@, contact@, admin@, billing@, orders@, support@, customerservice@ at the company domain.
4. Return ALL plausible email addresses you can find — up to 6 distinct addresses ranked by likelihood. Include multiple department mailboxes and any plausible alternate domains. General/department mailboxes are acceptable and expected for a supplier company.

STEP 2 - VALIDATE EACH EMAIL:
For each email, assign:
- validation_status: "valid" (matches a known real domain / website), "risky" (plausible but unverified or catch-all), or "invalid" (implausible domain or bad format)
- validation_reason: brief explanation
- confidence: "high" (based on a verified website/domain), "medium" (inferred from business name), "low" (guessed)

Be strict: emails inferred without a verified domain should be "risky" at best. Never invent example.com / test.com style domains.`;

  const result = await callClaudeJSON(anthropic, prompt, EMAIL_SCHEMA);
  const emails = (result.emails || []).filter(
    (e: any) => e && typeof e.email === "string" && isValidEmailSyntax(e.email),
  );
  if (emails.length === 0) return { best: null, all: [] };
  const ranked = rankEmailCandidates(emails);
  return { best: ranked[0], all: ranked };
}

async function saveDMEEmailResult(providerId: string, name: string, found: { best: any | null; all: any[] }, context: any) {
  const best = found.best;
  await db.insert(enrichmentRecords).values({
    npi: providerId,
    source: DME_EMAIL_SOURCE,
    field_name: "email",
    new_value: best?.email || null,
    confidence: confidenceToScore(best?.confidence),
    status: best?.email ? "found" : "not_found",
    enrichment_details: {
      name,
      validation_status: best?.validation_status || null,
      validation_reason: best?.validation_reason || null,
      all_emails: found.all,
      ...context,
    },
    applied_at: new Date(),
  });
}

/**
 * Fetch the next batch of suppliers to search.
 *
 * Normal mode skips suppliers that already have an enrichment record (NOT
 * EXISTS), so the loop makes progress as records are written and resumes
 * cleanly across restarts. Re-scan mode ignores existing records (so previously
 * searched suppliers are processed again) and instead advances by a keyset
 * cursor on provider_id — otherwise the unchanged NOT EXISTS-free selection
 * would return the same rows forever.
 */
async function fetchSupplierBatch(
  state: string | null,
  batchSize: number,
  rescan: boolean,
  cursor: string,
): Promise<any[]> {
  const where: string[] = ["f.facility_type = $1"];
  const values: any[] = [DME_FACILITY_TYPE];
  let p = 2;
  if (state) { where.push(`f.state = $${p}`); values.push(state); p++; }
  if (rescan) {
    where.push(`f.provider_id > $${p}`); values.push(cursor || ""); p++;
  } else {
    where.push(`NOT EXISTS (SELECT 1 FROM enrichment_records e WHERE e.npi = f.provider_id AND e.source = '${DME_EMAIL_SOURCE}' AND e.field_name = 'email')`);
  }
  return withClient(30000, async (client) => {
    return (await client.query(
      `SELECT DISTINCT ON (f.provider_id) f.provider_id, f.facility_name, f.address, f.city, f.state, f.zip, f.raw_data
         FROM medicare_facilities f
        WHERE ${where.join(" AND ")}
        ORDER BY f.provider_id ASC, f.data_year DESC
        LIMIT $${p}`,
      [...values, batchSize],
    )).rows;
  });
}

/** Count suppliers the job will process: all in scope (re-scan) or only the unsearched ones. */
async function countToProcess(state: string | null, rescan: boolean): Promise<number> {
  const where: string[] = ["facility_type = $1"];
  const values: any[] = [DME_FACILITY_TYPE];
  let p = 2;
  if (state) { where.push(`state = $${p}`); values.push(state); p++; }
  const notSearched = rescan
    ? ""
    : ` AND NOT EXISTS (SELECT 1 FROM enrichment_records e WHERE e.npi = f.provider_id AND e.source = '${DME_EMAIL_SOURCE}' AND e.field_name = 'email')`;
  return withClient(30000, async (client) => {
    try {
      const rows = (await client.query(
        `SELECT count(*)::int AS count FROM (
           SELECT DISTINCT provider_id FROM medicare_facilities f
            WHERE ${where.join(" AND ")}${notSearched}
         ) s`,
        values,
      )).rows;
      return Number(rows[0]?.count || 0);
    } catch { return 0; }
  });
}

async function runDMEEmailSearch(taskId: number, state: string | null, rescan: boolean) {
  const anthropic = getAnthropicClient();
  let processed = 0;
  let found = 0;
  let errors = 0;

  const [existing] = await db.select().from(backgroundTasks).where(eq(backgroundTasks.id, taskId));
  const meta0: any = existing?.metadata || {};
  processed = Number(meta0.processed_items || 0);
  found = Number(meta0.success_count || 0);
  errors = Number(meta0.error_count || 0);
  const totalItems = Number(meta0.total_items || 0);
  let cursor: string = String(meta0.cursor || "");

  console.log(`[DMEEmail] Task ${taskId} started (state=${state || "ALL"}, rescan=${rescan}, total=${totalItems})`);

  while (true) {
    const [task] = await db.select().from(backgroundTasks).where(eq(backgroundTasks.id, taskId));
    if (!task || task.status === "cancelled") {
      console.log(`[DMEEmail] Task ${taskId} cancelled`);
      break;
    }

    let batch: any[] = [];
    try {
      batch = await fetchSupplierBatch(state, FINDER_BATCH, rescan, cursor);
    } catch (e: any) {
      console.error(`[DMEEmail] Task ${taskId}: batch fetch failed: ${e.message}`);
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    if (batch.length === 0) {
      console.log(`[DMEEmail] Task ${taskId}: no more suppliers to search`);
      break;
    }

    let idx = 0;
    let cancelled = false;
    const worker = async () => {
      while (idx < batch.length && !cancelled) {
        const myIdx = idx++;
        if (myIdx >= batch.length) break;
        if (myIdx % CANCEL_CHECK_INTERVAL === 0 && myIdx > 0) {
          const [t] = await db.select().from(backgroundTasks).where(eq(backgroundTasks.id, taskId));
          if (!t || t.status === "cancelled") { cancelled = true; break; }
        }
        const f = batch[myIdx];
        const contact = extractDMEContact(f.raw_data);
        const company = {
          name: f.facility_name || "",
          address: f.address || "",
          city: f.city || "",
          state: f.state || "",
          zip: f.zip || "",
          phone: contact.phone,
          website: contact.website,
          npi: contact.npi || (f.provider_id?.length === 10 ? f.provider_id : null),
        };
        try {
          // A directory email is rare but authoritative — record it without spending a token.
          const result = contact.email
            ? { best: { email: contact.email, confidence: "high", validation_status: "valid", validation_reason: "Listed in CMS DMEPOS directory" }, all: [{ email: contact.email, confidence: "high", validation_status: "valid", source: "directory" }] }
            : await findCompanyEmail(anthropic, company);
          await saveDMEEmailResult(f.provider_id, company.name, result, {
            phone: contact.phone, website: contact.website, npi: company.npi, state: f.state,
          });
          processed++;
          if (result.best?.email) found++;
        } catch (err: any) {
          errors++;
          // Mark as searched anyway so a single failure doesn't wedge the batch
          // loop (which selects rows lacking any enrichment record).
          try {
            await saveDMEEmailResult(f.provider_id, company.name, { best: null, all: [] }, { error: String(err?.message || err).slice(0, 200) });
            processed++;
          } catch { /* give up on this row this pass */ }
        }
        if (myIdx < batch.length - 1) await new Promise((r) => setTimeout(r, FINDER_DELAY_MS));
      }
    };

    await Promise.all(Array.from({ length: Math.min(FINDER_CONCURRENCY, batch.length) }, () => worker()));

    // Re-scan advances by keyset cursor (every supplier in the batch was
    // processed, regardless of worker order, so the max provider_id is safe).
    if (rescan && batch.length > 0) cursor = String(batch[batch.length - 1].provider_id || cursor);

    await db.update(backgroundTasks).set({
      progress: processed,
      metadata: { state, rescan, cursor, total_items: totalItems, processed_items: processed, success_count: found, error_count: errors },
      updated_date: new Date(),
    }).where(eq(backgroundTasks.id, taskId));

    if (cancelled) break;
  }

  const [finalTask] = await db.select().from(backgroundTasks).where(eq(backgroundTasks.id, taskId));
  if (finalTask && finalTask.status !== "cancelled") {
    await db.update(backgroundTasks).set({
      status: "completed",
      progress: processed,
      result: { total_processed: processed, total_found: found, total_errors: errors },
      metadata: { state, rescan, cursor, total_items: totalItems, processed_items: processed, success_count: found, error_count: errors },
      completed_at: new Date(),
      updated_date: new Date(),
    }).where(eq(backgroundTasks.id, taskId));
  }
  activeTaskIds.delete(taskId);
  console.log(`[DMEEmail] Task ${taskId} finished — processed=${processed}, found=${found}, errors=${errors}`);
}

export async function handleStartDMEEmailSearch(payload: any) {
  const state = normalizeState(payload?.state);
  const rescan = payload?.rescan === true;

  const existingActive = await db.select().from(backgroundTasks)
    .where(and(eq(backgroundTasks.task_type, TASK_TYPE), eq(backgroundTasks.status, "processing")));
  const reallyActive = existingActive.filter((t) => activeTaskIds.has(t.id));
  if (reallyActive.length > 0) {
    return { success: true, message: "DME email search is already running", task_id: reallyActive[0].id };
  }
  // Clear stale "processing" rows left by a restart so a fresh task can claim the lane.
  for (const stale of existingActive) {
    if (!activeTaskIds.has(stale.id)) {
      await db.update(backgroundTasks)
        .set({ status: "failed", error: "Replaced by new DME email search", completed_at: new Date(), updated_date: new Date() })
        .where(eq(backgroundTasks.id, stale.id));
    }
  }

  const totalItems = await countToProcess(state, rescan);
  if (totalItems === 0) {
    return {
      success: true,
      message: rescan
        ? `No DME suppliers${state ? ` in ${state}` : ""} to re-search.`
        : `No unsearched DME suppliers${state ? ` in ${state}` : ""}.`,
      task_id: null,
      total_items: 0,
    };
  }

  const [task] = await db.insert(backgroundTasks).values({
    task_type: TASK_TYPE,
    status: "processing",
    progress: 0,
    metadata: { state, rescan, cursor: "", total_items: totalItems, processed_items: 0, success_count: 0, error_count: 0 },
    started_at: new Date(),
  }).returning();

  activeTaskIds.add(task.id);
  runDMEEmailSearch(task.id, state, rescan).catch((err) => {
    console.error("[DMEEmail] Background search error:", err.message);
    activeTaskIds.delete(task.id);
    db.update(backgroundTasks)
      .set({ status: "failed", error: err.message, completed_at: new Date(), updated_date: new Date() })
      .where(eq(backgroundTasks.id, task.id)).catch(() => {});
  });

  return {
    success: true,
    message: `Started AI email ${rescan ? "re-search" : "search"} for ${totalItems.toLocaleString()} DME supplier${totalItems === 1 ? "" : "s"}${state ? ` in ${state}` : ""}.`,
    task_id: task.id,
    total_items: totalItems,
  };
}

export async function handleStopDMEEmailSearch() {
  const active = await db.select().from(backgroundTasks)
    .where(and(eq(backgroundTasks.task_type, TASK_TYPE), eq(backgroundTasks.status, "processing")));
  for (const t of active) {
    activeTaskIds.delete(t.id);
    await db.update(backgroundTasks)
      .set({ status: "cancelled", completed_at: new Date(), updated_date: new Date() })
      .where(eq(backgroundTasks.id, t.id));
  }
  return { success: true, message: "DME email search stopped", stopped: active.length };
}

export async function handleDMEEmailSearchStatus() {
  const [task] = await db.select().from(backgroundTasks)
    .where(eq(backgroundTasks.task_type, TASK_TYPE))
    .orderBy(desc(backgroundTasks.id))
    .limit(1);

  if (!task) return { running: false, status: "idle", progress: null };

  const progress = computeJobProgress(task.metadata);
  return {
    running: task.status === "processing",
    status: task.status,
    task_id: task.id,
    state: (task.metadata as any)?.state || null,
    rescan: (task.metadata as any)?.rescan === true,
    progress,
    started_at: task.started_at,
    completed_at: task.completed_at,
  };
}
