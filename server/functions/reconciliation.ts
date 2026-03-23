import { db } from "../db";
import { providers, providerReconciliations, reconciliationJobs, apiInteractionLogs } from "../db/schema";
import { sql, eq, and, isNotNull, desc } from "drizzle-orm";

const NPPES_API_BASE = "https://npiregistry.cms.hhs.gov/api/?version=2.1";

const FIELDS_TO_COMPARE = [
  { field: "first_name", nppes: "basic.first_name", severity: "high" },
  { field: "last_name", nppes: "basic.last_name", severity: "high" },
  { field: "organization_name", nppes: "basic.organization_name", severity: "high" },
  { field: "credential", nppes: "basic.credential", severity: "low" },
  { field: "gender", nppes: "basic.gender", severity: "medium" },
  { field: "status", nppes: "basic.status", severity: "high" },
  { field: "entity_type", nppes: "enumeration_type", severity: "medium" },
];

function getNestedValue(obj: any, path: string): string | null {
  const parts = path.split(".");
  let val = obj;
  for (const p of parts) {
    if (val == null) return null;
    val = val[p];
  }
  return val != null ? String(val) : null;
}

const VALUE_MAPPINGS: Record<string, Record<string, string>> = {
  status: { "a": "active", "d": "deactivated" },
  entity_type: { "npi-1": "individual", "npi-2": "organization" },
};

function normalize(val: string | null, field?: string): string {
  if (!val) return "";
  let v = val.trim().toLowerCase().replace(/\s+/g, " ");
  if (field && VALUE_MAPPINGS[field]) {
    v = VALUE_MAPPINGS[field][v] || v;
  }
  return v;
}

async function queryNPPES(npi: string): Promise<{ data: any | null; statusCode: number; durationMs: number; error?: string }> {
  const url = `${NPPES_API_BASE}&number=${npi}`;
  const start = Date.now();
  try {
    const resp = await fetch(url);
    const durationMs = Date.now() - start;
    const body = await resp.json();
    if (resp.ok && body.result_count > 0) {
      return { data: body.results[0], statusCode: resp.status, durationMs };
    }
    return { data: null, statusCode: resp.status, durationMs, error: body.Errors?.[0]?.description || "No results" };
  } catch (e: any) {
    return { data: null, statusCode: 0, durationMs: Date.now() - start, error: e.message };
  }
}

async function logApiInteraction(params: {
  npi: string;
  source: string;
  endpoint: string;
  statusCode: number;
  isSuccess: boolean;
  responseTimeMs: number;
  errorMessage?: string;
}) {
  try {
    await db.insert(apiInteractionLogs).values({
      endpoint: params.endpoint,
      method: "GET",
      status_code: params.statusCode,
      source: params.source,
      npi: params.npi,
      is_success: params.isSuccess,
      response_time_ms: params.responseTimeMs,
      error_message: params.errorMessage || null,
    });
  } catch {}
}

export async function handleReconcileProviderData(payload: any) {
  console.log("[Reconciliation] Received payload:", JSON.stringify(payload));
  const { action, sources = ["nppes"], job_type = "manual", reconciliation_id, resolution } = payload || {};

  if (action === "resolve") {
    if (!reconciliation_id || !resolution || !["accept", "reject"].includes(resolution)) {
      throw { status: 400, message: "Resolve action requires reconciliation_id and resolution (accept/reject)" };
    }
    return handleResolveDiscrepancy(reconciliation_id, resolution);
  }

  const supportedSources = ["nppes"];
  const unsupported = sources.filter((s: string) => !supportedSources.includes(s));
  if (unsupported.length > 0 && sources.every((s: string) => !supportedSources.includes(s))) {
    throw { status: 400, message: `Sources not yet supported: ${unsupported.join(", ")}. Currently supported: ${supportedSources.join(", ")}` };
  }

  const startedAt = new Date();
  let job: any;
  try {
    const jobResult = await db.execute(sql`
      INSERT INTO reconciliation_jobs (status, sources, job_type, started_at, total_providers, matched, discrepancies_found, ai_suggestions_generated, created_date)
      VALUES ('running', ${JSON.stringify(sources)}::jsonb, ${job_type}, ${startedAt.toISOString()}::timestamp, 0, 0, 0, 0, NOW())
      RETURNING *
    `);
    const jobRows = Array.isArray(jobResult) ? jobResult : (jobResult as any)?.rows || [];
    job = jobRows[0];
    console.log("[Reconciliation] Created job:", job?.id);
  } catch (e: any) {
    console.error("[Reconciliation] Failed to create job:", e.message, e.stack);
    throw { status: 500, message: `Failed to initialize reconciliation job: ${e.message}` };
  }

  try {
    const maxIdResult = await db.execute(sql`SELECT MAX(id) as max_id FROM providers`);
    const maxIdRow = Array.isArray(maxIdResult) ? maxIdResult[0] : (maxIdResult as any)?.rows?.[0];
    const maxId = parseInt(maxIdRow?.max_id) || 100000;
    const randomStart = Math.max(1, Math.floor(Math.random() * (maxId - 1000)));

    const sampleProviders = await db.select({
      id: providers.id,
      npi: providers.npi,
      first_name: providers.first_name,
      last_name: providers.last_name,
      organization_name: providers.organization_name,
      credential: providers.credential,
      gender: providers.gender,
      status: providers.status,
      entity_type: providers.entity_type,
    }).from(providers)
      .where(and(
        isNotNull(providers.npi),
        sql`${providers.npi} != ''`,
        sql`${providers.id} >= ${randomStart}`
      ))
      .limit(50);

    const rows = sampleProviders;

    let matched = 0;
    let discrepanciesFound = 0;
    let totalChecked = 0;

    for (const provider of rows) {
      const npi = provider.npi;
      if (!npi) continue;
      totalChecked++;

      const nppesResult = await queryNPPES(npi);

      await logApiInteraction({
        npi,
        source: "nppes",
        endpoint: `${NPPES_API_BASE}&number=${npi}`,
        statusCode: nppesResult.statusCode,
        isSuccess: !!nppesResult.data,
        responseTimeMs: nppesResult.durationMs,
        errorMessage: nppesResult.error,
      });

      if (!nppesResult.data) continue;

      const discrepancies: any[] = [];
      const nppesData = nppesResult.data;

      for (const fc of FIELDS_TO_COMPARE) {
        const internalVal = normalize(provider[fc.field], fc.field);
        const externalVal = normalize(getNestedValue(nppesData, fc.nppes), fc.field);

        if (!internalVal && !externalVal) continue;

        if (internalVal !== externalVal) {
          discrepancies.push({
            field: fc.field,
            internal_value: provider[fc.field] || "(empty)",
            external_value: getNestedValue(nppesData, fc.nppes) || "(empty)",
            severity: fc.severity,
          });
        }
      }

      if (discrepancies.length === 0) {
        matched++;
      } else {
        discrepanciesFound++;
        await db.insert(providerReconciliations).values({
          npi,
          source_a: "internal",
          source_b: "nppes",
          status: "discrepancy",
          resolution_status: "pending",
          discrepancies: discrepancies,
          ai_suggestions: null,
          job_id: job.id,
        });
      }

      await new Promise(r => setTimeout(r, 200));
    }

    await db.update(reconciliationJobs).set({
      status: "completed",
      total_providers: totalChecked,
      matched,
      discrepancies_found: discrepanciesFound,
      ai_suggestions_generated: 0,
      completed_at: new Date(),
    }).where(eq(reconciliationJobs.id, job.id));

    return {
      success: true,
      message: `Reconciliation complete: ${totalChecked} providers checked, ${matched} matched, ${discrepanciesFound} discrepancies found.`,
      job_id: job.id,
      total_providers: totalChecked,
      matched,
      discrepancies_found: discrepanciesFound,
    };
  } catch (e: any) {
    console.error("[Reconciliation] Main error:", e.message, e.stack);
    try {
      await db.execute(sql`UPDATE reconciliation_jobs SET status = 'failed', completed_at = NOW() WHERE id = ${job?.id}`);
    } catch {}
    throw { status: 500, message: `Reconciliation failed: ${e.message}` };
  }
}

async function handleResolveDiscrepancy(reconciliationId: number, resolution: string) {
  const [recon] = await db.select().from(providerReconciliations).where(eq(providerReconciliations.id, reconciliationId));
  if (!recon) throw { status: 404, message: "Reconciliation record not found" };

  if (resolution === "accept") {
    const discrepancies = (recon.discrepancies as any[]) || [];
    for (const disc of discrepancies) {
      const field = disc.field;
      const newVal = disc.external_value === "(empty)" ? null : disc.external_value;
      try {
        await db.execute(sql`UPDATE providers SET ${sql.identifier(field)} = ${newVal} WHERE npi = ${recon.npi}`);
      } catch {}
    }
  }

  await db.update(providerReconciliations).set({
    resolution_status: resolution === "accept" ? "accepted" : "rejected",
    resolution: resolution,
    status: "resolved",
    updated_date: new Date(),
  }).where(eq(providerReconciliations.id, reconciliationId));

  return { success: true, message: `Discrepancy ${resolution === "accept" ? "accepted and merged" : "rejected"}` };
}
