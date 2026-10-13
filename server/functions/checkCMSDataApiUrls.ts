// Port of base44/functions/checkCMSDataApiUrls/entry.ts —
// periodic health check for CMS data-api / DKAN URLs.
//
// This function probes the URL an import would actually use. Resolution
// mirrors triggerImport's scheduled-import path exactly: a schedule's own
// api_url first, then the dataset_versions registry's current endpoint
// (resolveImportVersion), then the canonical IMPORT_TYPE_URLS map, with the
// small HARDCODED_URLS map below kept only as a last resort for checker-only
// types (opt_out_physicians) that have no importer URL. Each probe is a small
// size=1 / limit=1 query; the outcome is recorded on the matching
// import_schedule_configs row so the admin UI can flag broken endpoints
// before the next scheduled run silently fails.
//
// Types that resolve to no URL but are known catalog datasets are imported
// from files (NPPES files, uploads) or retired by CMS — they are reported as
// skipped, not broken. Only a type unknown to the catalog with no URL at all
// is flagged "No URL configured".
//
// Storage note: the Base44 ImportScheduleConfig entity was schemaless and
// carried a free-form `url_health` object. The Postgres schema
// (server/db/schema.ts → import_schedule_configs) has no url_health column, so
// the health payload is persisted inside the existing `config` jsonb column
// under the `url_health` key (merged with the row's existing config).
// If a dedicated column is wanted later, add a migration for
// import_schedule_configs.url_health (jsonb) and write it directly.

import { db } from "../db";
import { importScheduleConfigs } from "../db/schema";
import { eq } from "drizzle-orm";
import { resolveImportVersion } from "../lib/datasetRegistry";
// The alias map and the canonical URL map come from triggerImport so a
// schedule using `cms_utilization` (without an api_url override) still
// resolves to the canonical default URL, exactly as an import would.
import { IMPORT_TYPE_ALIASES, IMPORT_TYPE_URLS, getCMSDatasetCatalog } from "./triggerImport";

// Last-resort URLs for types this health check owns that have no entry in
// IMPORT_TYPE_URLS (currently only opt_out_physicians). Everything else
// resolves through the importer's own chain (see resolveProbeUrl).
const HARDCODED_URLS: Record<string, string> = {
  provider_service_utilization: "https://data.cms.gov/data-api/v1/dataset/92396110-2aed-4d63-a6a2-5d6207d46a29/data",
  cms_order_referring: "https://data.cms.gov/data-api/v1/dataset/c99b5865-1119-4436-bb80-c5af2773ea1f/data",
  opt_out_physicians: "https://data.cms.gov/data-api/v1/dataset/9887a515-7552-4693-bf58-735c77af46d7/data",
  home_health_enrollments: "https://data.cms.gov/data-api/v1/dataset/15f64ab4-3172-4a27-b589-ebd67a6d28aa/data",
  hospice_enrollments: "https://data.cms.gov/data-api/v1/dataset/25704213-e833-4b8b-9dbc-58dd17149209/data",
  medical_equipment_suppliers: "https://data.cms.gov/provider-data/api/1/datastore/query/ct36-nrcq/0",
  hospice_provider_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/gxki-hrr8/0",
  hospice_state_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/eda0-92f0/0",
  hospice_national_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/7cv8-v37d/0",
  snf_provider_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/fykj-qjee/0",
  nursing_home_providers: "https://data.cms.gov/provider-data/api/1/datastore/query/4pq5-n9py/0",
  nursing_home_deficiencies: "https://data.cms.gov/provider-data/api/1/datastore/query/tbry-pc2d/0",
  home_health_national_measures: "https://data.cms.gov/provider-data/api/1/datastore/query/97z8-de96/0",
};

/**
 * The URL a scheduled import of this type would use, in the same precedence
 * triggerImport applies: the schedule's api_url (passed as file_url) beats
 * the dataset registry's current endpoint, which beats the pinned
 * IMPORT_TYPE_URLS entry. HARDCODED_URLS is the final fallback for
 * checker-only types. Pure — exported for tests.
 */
export function resolveProbeUrl(args: {
  apiUrl?: string | null;
  registryUrl?: string | null;
  importType: string;
  resolvedType: string;
}): string | null {
  return (
    args.apiUrl ||
    args.registryUrl ||
    IMPORT_TYPE_URLS[args.resolvedType] ||
    HARDCODED_URLS[args.resolvedType] ||
    HARDCODED_URLS[args.importType] ||
    null
  );
}

const CATALOG_TYPE_IDS: ReadonlySet<string> = new Set(
  getCMSDatasetCatalog().datasets.map((d) => d.id),
);

/**
 * A type with no resolvable URL is not necessarily broken: catalog datasets
 * with no CMS endpoint are imported from files (NPPES files, CSV uploads) or
 * were retired by CMS. Those are skipped, not flagged. Pure — exported for
 * tests.
 */
export function isKnownCatalogType(importType: string, resolvedType: string): boolean {
  return CATALOG_TYPE_IDS.has(importType) || CATALOG_TYPE_IDS.has(resolvedType);
}

const FETCH_TIMEOUT_MS = 10_000;

function probeQueryParam(url: string): string {
  if (url.includes("data-api/v1/dataset")) return "size=1";
  if (url.includes("provider-data/api")) return "limit=1";
  return "$limit=1";
}

interface ProbeResult {
  healthy: boolean;
  status?: number;
  error?: string;
  looks_like_html?: boolean;
  sample_count?: number;
  latency_ms?: number;
}

async function probeUrl(url: string): Promise<ProbeResult> {
  const target = url + (url.includes("?") ? "&" : "?") + probeQueryParam(url);
  const started = Date.now();
  try {
    const resp = await fetch(target, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    const latency_ms = Date.now() - started;
    if (!resp.ok) {
      return { healthy: false, status: resp.status, latency_ms, error: `HTTP ${resp.status} ${resp.statusText}` };
    }
    const text = await resp.text();
    const trimmed = text.trim().toLowerCase();
    // CMS likes to serve a holding page from the same origin when a dataset moves.
    if (trimmed.startsWith("<!doctype") || trimmed.startsWith("<html") || trimmed.startsWith("<head")) {
      return { healthy: false, status: resp.status, latency_ms, looks_like_html: true, error: "Endpoint returned HTML, not data — URL likely deprecated" };
    }
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { healthy: false, status: resp.status, latency_ms, error: "Response was not valid JSON" };
    }
    const arr = Array.isArray(parsed) ? parsed : (parsed?.results ?? parsed?.data ?? null);
    const count = Array.isArray(arr) ? arr.length : 0;
    if (count === 0) {
      // Empty arrays can mean the dataset still exists but has no rows — flag as a soft warning.
      return { healthy: false, status: resp.status, latency_ms, sample_count: 0, error: "Endpoint returned 0 sample rows" };
    }
    return { healthy: true, status: resp.status, latency_ms, sample_count: count };
  } catch (e: any) {
    const msg = e?.name === "AbortError" || e?.name === "TimeoutError"
      ? `Timed out after ${FETCH_TIMEOUT_MS}ms`
      : (e?.message || "Unknown fetch error");
    return { healthy: false, latency_ms: Date.now() - started, error: msg };
  }
}

export async function handleCheckCmsDataApiUrls(payload: any, user?: any): Promise<any> {
  // Pull existing schedules so we can probe per-schedule api_url overrides too.
  const configs = await db.select().from(importScheduleConfigs);
  const configByType = new Map<string, any>();
  for (const c of configs) {
    if (c.import_type && !configByType.has(c.import_type)) configByType.set(c.import_type, c);
  }

  const importTypes = new Set<string>([
    ...Object.keys(HARDCODED_URLS),
    ...Object.keys(IMPORT_TYPE_URLS),
    ...configs
      .map((c) => c.import_type)
      .filter((t): t is string => !!t && t !== "nppes_registry"),
  ]);

  const results: any[] = [];
  const skipped: string[] = [];
  const checkedAt = new Date().toISOString();

  for (const importType of importTypes) {
    const config = configByType.get(importType);
    // Resolve aliases (e.g. cms_utilization → provider_service_utilization) so
    // a schedule using a legacy import_type still probes the canonical URL.
    const resolvedType = IMPORT_TYPE_ALIASES[importType] || importType;
    // Mirror triggerImport: the registry is only consulted when the schedule
    // carries no api_url of its own (there it arrives as file_url).
    const registryUrl = config?.api_url
      ? null
      : await resolveImportVersion(resolvedType)
          .then((v) => v?.dataUrl ?? null)
          .catch(() => null);
    const url = resolveProbeUrl({
      apiUrl: config?.api_url,
      registryUrl,
      importType,
      resolvedType,
    });
    if (!url) {
      if (isKnownCatalogType(importType, resolvedType)) {
        skipped.push(importType);
        continue;
      }
      results.push({ import_type: importType, healthy: false, error: "No URL configured" });
      continue;
    }

    const probe = await probeUrl(url);
    results.push({ import_type: importType, url, ...probe });

    // Persist the result onto the matching schedule config (if any) so the
    // admin UI can render it without re-running the probe. Written into the
    // config jsonb column under `url_health` (schema has no dedicated column).
    if (config) {
      try {
        const existing = (config.config ?? {}) as Record<string, any>;
        const url_health = {
          checked_at: checkedAt,
          checked_by: user?.email ?? "system",
          healthy: probe.healthy,
          status: probe.status ?? null,
          latency_ms: probe.latency_ms ?? null,
          error: probe.error ?? null,
          sample_count: probe.sample_count ?? null,
          probed_url: url,
        };
        await db
          .update(importScheduleConfigs)
          .set({ config: { ...existing, url_health }, updated_date: new Date() })
          .where(eq(importScheduleConfigs.id, config.id));
      } catch (e: any) {
        console.warn(`[checkCMSDataApiUrls] Failed to persist health for ${importType}: ${e.message}`);
      }
    }
  }

  const broken = results.filter((r) => !r.healthy);
  return {
    success: true,
    checked_at: checkedAt,
    total_checked: results.length,
    healthy: results.length - broken.length,
    broken: broken.length,
    skipped: skipped.length,
    skipped_types: skipped,
    results,
  };
}
