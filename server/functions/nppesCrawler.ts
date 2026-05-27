import { db } from "../db";
import {
  importBatches,
  nppesQueueItems,
  nppesCrawlerConfigs,
  providers,
  providerLocations,
  providerTaxonomies,
  dataQualityAlerts,
} from "../db/schema";
import { eq, and, inArray, desc, asc, sql, lt } from "drizzle-orm";
import { sleep, withRetry, stripSystemFields, isIdentical } from "./helpers";

const NPPES_API_BASE =
  "https://npiregistry.cms.hhs.gov/api/?version=2.1";
const MAX_EXEC_MS = 120000;

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
  "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
  "VT","VA","WA","WV","WI","WY",
];

const STATE_ZIP_PREFIXES: Record<string, string[]> = {
  AL: ["35","36"],AK: ["99"],AZ: ["85","86"],AR: ["71","72"],
  CA: ["90","91","92","93","94","95","96"],CO: ["80","81"],
  CT: ["06"],DC: ["20"],DE: ["19"],FL: ["32","33","34"],
  GA: ["30","31","39"],HI: ["96"],ID: ["83"],IL: ["60","61","62"],
  IN: ["46","47"],IA: ["50","51","52"],KS: ["66","67"],
  KY: ["40","41","42"],LA: ["70","71"],ME: ["03","04"],
  MD: ["20","21"],MA: ["01","02"],MI: ["48","49"],
  MN: ["55","56"],MS: ["38","39"],MO: ["63","64","65"],
  MT: ["59"],NE: ["68","69"],NV: ["89"],NH: ["03"],
  NJ: ["07","08"],NM: ["87","88"],NY: ["10","11","12","13","14"],
  NC: ["27","28"],ND: ["58"],OH: ["43","44","45"],OK: ["73","74"],
  OR: ["97"],PA: ["15","16","17","18","19"],RI: ["02"],
  SC: ["29"],SD: ["57"],TN: ["37","38"],TX: ["73","75","76","77","78","79","88"],
  UT: ["84"],VT: ["05"],VA: ["20","22","23","24"],WA: ["98","99"],
  WV: ["24","25","26"],WI: ["53","54"],WY: ["82","83"],
};

const REGION_STATES: Record<string, string[]> = {
  northeast: ["CT","ME","MA","NH","RI","VT","NJ","NY","PA","DE","MD","DC"],
  southeast: ["FL","GA","NC","SC","VA","WV","AL","KY","MS","TN","AR","LA"],
  midwest: ["IL","IN","MI","OH","WI","IA","KS","MN","MO","NE","ND","SD"],
  west: ["AK","CA","HI","OR","WA","AZ","CO","ID","MT","NV","NM","UT","WY"],
  south_central: ["TX","OK"],
};

const apiCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 2;
const MAX_CACHE_SIZE = 5000;
let globalRateLimitDelay = 0;
let lastRateLimitHit = 0;
// Per-process state. Queue items are claimed atomically in the DB
// (UPDATE ... WHERE status='pending' RETURNING), so running multiple instances
// will NOT double-process work. These counters/caches (worker cap, API cache,
// rate-limit backoff) are per-instance only — with N instances the effective
// NPPES request rate is up to N×. For a single-instance deployment this is fine;
// if scaled horizontally, move the rate-limit backoff to a shared store (e.g.
// Redis) to stay polite to the NPPES API.
let activeWorkerCount = 0;
const MAX_CONCURRENT_WORKERS = 5;

function normalizePostalCode(value: any) {
  return String(value || "").replace(/[^0-9]/g, "").slice(0, 5);
}

function pruneExpiredCache() {
  if (apiCache.size < 100) return;
  const now = Date.now();
  for (const [key, val] of apiCache) {
    if (now - val.timestamp > CACHE_TTL_MS) apiCache.delete(key);
  }
}

async function fetchNPPESPage(params: URLSearchParams, stats: any, requestTimeoutMs = 15000) {
  const apiUrl = `${NPPES_API_BASE}&${params.toString()}`;
  if (apiCache.has(apiUrl)) {
    const cached = apiCache.get(apiUrl)!;
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;
    apiCache.delete(apiUrl);
  }
  if (apiCache.size > MAX_CACHE_SIZE / 2) pruneExpiredCache();
  if (globalRateLimitDelay > 0) {
    if (Date.now() - lastRateLimitHit > 60000) {
      globalRateLimitDelay = 0;
    } else {
      await sleep(globalRateLimitDelay);
    }
  }
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), requestTimeoutMs + attempt * 2000);
      let response: Response;
      try {
        response = await fetch(apiUrl, { signal: controller.signal });
      } finally {
        clearTimeout(fetchTimeout);
      }
      if (response.status === 429 && stats) {
        stats.rate_limit_hits = (stats.rate_limit_hits || 0) + 1;
        stats.shouldSlowDown = true;
        globalRateLimitDelay = Math.min((globalRateLimitDelay || 1000) * 1.3, 5000);
        lastRateLimitHit = Date.now();
      }
      if (response.status === 429 || response.status >= 500) {
        await sleep(Math.min(attempt * 3000 + Math.random() * 1000, 15000));
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const resultData = {
        results: data.results || [],
        count: data.result_count || 0,
        error: data.Errors?.length > 0 ? data.Errors.map((e: any) => e.description).join("; ") : null,
      };
      if (!resultData.error) {
        if (apiCache.size >= MAX_CACHE_SIZE) {
          const firstKey = apiCache.keys().next().value;
          if (firstKey) apiCache.delete(firstKey);
        }
        apiCache.set(apiUrl, { timestamp: Date.now(), data: resultData });
      }
      return resultData;
    } catch (e: any) {
      if (attempt === 5) throw e;
      await sleep(attempt * 1500);
    }
  }
  throw new Error("All NPPES API retry attempts exhausted");
}

function normalizeCredential(cred: string): string {
  return cred.replace(/\./g, "").trim().toUpperCase();
}

function buildExcludedCredentialSet(excludedList: string[] | null | undefined): Set<string> {
  const set = new Set<string>();
  if (!excludedList || !Array.isArray(excludedList)) return set;
  for (const c of excludedList) {
    if (c && typeof c === "string") set.add(normalizeCredential(c));
  }
  return set;
}

function isCredentialExcluded(credential: string, excludedSet: Set<string>): boolean {
  if (excludedSet.size === 0 || !credential) return false;
  const normalized = normalizeCredential(credential);
  return excludedSet.has(normalized);
}

function transformResults(allResults: any[], excludedCredentials?: Set<string>) {
  let validRows = 0, invalidRows = 0, duplicateRows = 0, excludedRows = 0;
  const seenNPIs = new Set<string>();
  const providerList: any[] = [], locationList: any[] = [], taxonomyList: any[] = [];
  const errors: any[] = [];
  const excludedSet = excludedCredentials || new Set<string>();
  for (const result of allResults) {
    const npi = String(result.number || "");
    if (!npi || npi.length !== 10) { invalidRows++; continue; }
    if (seenNPIs.has(npi)) { duplicateRows++; continue; }
    seenNPIs.add(npi);
    const basic = result.basic || {};
    const isIndividual = result.enumeration_type === "NPI-1";
    const status = basic.status === "A" ? "Active" : "Deactivated";
    if (status === "Active" && !basic.enumeration_date && !basic.last_updated) { invalidRows++; continue; }
    if (isIndividual && excludedSet.size > 0) {
      const credential = (basic.credential || "").trim();
      if (credential && isCredentialExcluded(credential, excludedSet)) {
        excludedRows++;
        continue;
      }
    }
    validRows++;
    const provider: any = { npi, entity_type: isIndividual ? "Individual" : "Organization", status };
    if (isIndividual) {
      provider.first_name = (basic.first_name || "").trim();
      provider.last_name = (basic.last_name || "").trim();
      provider.credential = (basic.credential || "").trim();
      provider.gender = basic.gender === "M" ? "M" : basic.gender === "F" ? "F" : "";
    } else {
      provider.organization_name = (basic.organization_name || "").trim();
    }
    if (basic.enumeration_date) provider.enumeration_date = basic.enumeration_date;
    if (basic.last_updated) provider.last_updated_date = basic.last_updated;
    providerList.push(provider);
    for (const addr of result.addresses || []) {
      const zip = (addr.postal_code || "").substring(0, 10);
      let phone = (addr.telephone_number || "").trim();
      const rawPhone = phone.replace(/[^0-9]/g, "");
      if (phone && rawPhone.length < 10) phone = "";
      locationList.push({
        npi,
        location_type: addr.address_purpose === "MAILING" ? "Mailing" : "Practice",
        address_1: (addr.address_1 || "").trim(),
        address_2: (addr.address_2 || "").trim(),
        city: (addr.city || "").trim(),
        state: (addr.state || "").trim(),
        zip, phone, fax: (addr.fax_number || "").trim(),
      });
    }
    for (const tax of result.taxonomies || []) {
      taxonomyList.push({
        npi,
        taxonomy_code: (tax.code || "").trim(),
        taxonomy_description: (tax.desc || "").trim(),
        is_primary: tax.primary === true,
        license_number: (tax.license || "").trim(),
        license_state: (tax.state || "").trim(),
      });
    }
  }
  return { providers: providerList, locations: locationList, taxonomies: taxonomyList, validRows, invalidRows, duplicateRows, excludedRows, errors };
}

async function upsertProviders(records: any[]) {
  let imported = 0, updated = 0, skipped = 0;
  const BULK_SIZE = 250;
  for (let i = 0; i < records.length; i += BULK_SIZE) {
    const chunk = records.slice(i, i + BULK_SIZE);
    try {
      const result = await db.insert(providers).values(chunk)
        .onConflictDoUpdate({
          target: providers.npi,
          set: {
            first_name: sql`COALESCE(NULLIF(excluded.first_name, ''), ${providers.first_name})`,
            last_name: sql`COALESCE(NULLIF(excluded.last_name, ''), ${providers.last_name})`,
            credential: sql`COALESCE(NULLIF(excluded.credential, ''), ${providers.credential})`,
            gender: sql`COALESCE(NULLIF(excluded.gender, ''), ${providers.gender})`,
            organization_name: sql`COALESCE(NULLIF(excluded.organization_name, ''), ${providers.organization_name})`,
            status: sql`excluded.status`,
            entity_type: sql`excluded.entity_type`,
            last_updated_date: sql`COALESCE(excluded.last_updated_date, ${providers.last_updated_date})`,
            updated_date: sql`NOW()`,
          },
        });
      imported += chunk.length;
    } catch (e: any) {
      for (const p of chunk) {
        try {
          await db.insert(providers).values(p)
            .onConflictDoUpdate({
              target: providers.npi,
              set: {
                first_name: sql`COALESCE(NULLIF(excluded.first_name, ''), ${providers.first_name})`,
                last_name: sql`COALESCE(NULLIF(excluded.last_name, ''), ${providers.last_name})`,
                status: sql`excluded.status`,
                entity_type: sql`excluded.entity_type`,
                updated_date: sql`NOW()`,
              },
            });
          imported++;
        } catch (ie: any) { console.warn(`[upsertProviders] Failed NPI ${p.npi}: ${ie.message}`); }
      }
    }
  }
  return { imported, updated, skipped };
}

const locationKey = (l: any) =>
  `${l.npi}|${l.location_type}|${(l.address_1 || "").trim().toLowerCase()}|${(l.zip || "").substring(0, 5)}`;

async function upsertLocations(records: any[]) {
  let imported = 0, updated = 0, skipped = 0;
  const BULK_SIZE = 300;
  for (let i = 0; i < records.length; i += BULK_SIZE) {
    const chunk = records.slice(i, i + BULK_SIZE);
    // De-duplicate against already-stored locations for these NPIs *before*
    // inserting. provider_locations has no unique constraint, so a bulk insert
    // never errors on a duplicate — without this, re-crawling a state would
    // insert a fresh copy of every address each time.
    const npis = [...new Set(chunk.map((l: any) => l.npi).filter(Boolean))];
    let existingKeys = new Set<string>();
    if (npis.length > 0) {
      const existing = await safeCrawlerQuery(
        () => db.select().from(providerLocations).where(inArray(providerLocations.npi, npis as string[])),
        [] as any[], "lookup existing locations",
      );
      existingKeys = new Set(existing.map(locationKey));
    }
    const seen = new Set<string>();
    const toCreate: any[] = [];
    for (const loc of chunk) {
      const key = locationKey(loc);
      if (existingKeys.has(key) || seen.has(key)) { skipped++; continue; }
      seen.add(key);
      toCreate.push(loc);
    }
    if (toCreate.length > 0) {
<<<<<<< HEAD
      try { await db.insert(providerLocations).values(toCreate); imported += toCreate.length; }
      catch (bulkErr: any) {
        for (const loc of toCreate) {
          try { await db.insert(providerLocations).values(loc); imported++; }
          catch (err: any) { skipped++; }
=======
      try {
        const inserted = await db.insert(providerLocations).values(toCreate).onConflictDoNothing().returning({ id: providerLocations.id });
        imported += inserted.length;
        skipped  += toCreate.length - inserted.length;
      } catch (bulkErr: any) {
        for (const loc of toCreate) {
          try {
            const ins = await db.insert(providerLocations).values(loc).onConflictDoNothing().returning({ id: providerLocations.id });
            if (ins.length > 0) imported++; else skipped++;
          } catch (err: any) { skipped++; }
>>>>>>> refs/remotes/origin/main
        }
      }
    }
  }
  return { imported, updated, skipped };
}

const taxonomyKey = (t: any) => `${t.npi}|${(t.taxonomy_code || "").trim()}`;

async function upsertTaxonomies(records: any[]) {
  let imported = 0, updated = 0, skipped = 0;
  const BULK_SIZE = 300;
  for (let i = 0; i < records.length; i += BULK_SIZE) {
    const chunk = records.slice(i, i + BULK_SIZE);
    const npis = [...new Set(chunk.map((t: any) => t.npi).filter(Boolean))];
    let existingKeys = new Set<string>();
    if (npis.length > 0) {
      const existing = await safeCrawlerQuery(
        () => db.select().from(providerTaxonomies).where(inArray(providerTaxonomies.npi, npis as string[])),
        [] as any[], "lookup existing taxonomies",
      );
      existingKeys = new Set(existing.map(taxonomyKey));
    }
    const seen = new Set<string>();
    const toCreate: any[] = [];
    for (const tax of chunk) {
      const key = taxonomyKey(tax);
      if (existingKeys.has(key) || seen.has(key)) { skipped++; continue; }
      seen.add(key);
      toCreate.push(tax);
    }
    if (toCreate.length > 0) {
<<<<<<< HEAD
      try { await db.insert(providerTaxonomies).values(toCreate); imported += toCreate.length; }
      catch (bulkErr: any) {
        for (const tax of toCreate) {
          try { await db.insert(providerTaxonomies).values(tax); imported++; }
          catch (err: any) { skipped++; }
=======
      try {
        const inserted = await db.insert(providerTaxonomies).values(toCreate).onConflictDoNothing().returning({ id: providerTaxonomies.id });
        imported += inserted.length;
        skipped  += toCreate.length - inserted.length;
      } catch (bulkErr: any) {
        for (const tax of toCreate) {
          try {
            const ins = await db.insert(providerTaxonomies).values(tax).onConflictDoNothing().returning({ id: providerTaxonomies.id });
            if (ins.length > 0) imported++; else skipped++;
          } catch (err: any) { skipped++; }
>>>>>>> refs/remotes/origin/main
        }
      }
    }
  }
  return { imported, updated, skipped };
}

async function updateBatchStats(batchId: number, stats: any) {
  try {
    const validInc = stats.valid || 0;
    const invalidInc = stats.invalid || 0;
    const importedInc = stats.prov?.imported || 0;
    const updatedInc = stats.prov?.updated || 0;
    const skippedInc = stats.prov?.skipped || 0;
    const excludedInc = stats.excluded || 0;
    const apiInc = stats.api_calls || 0;
    const rlInc = stats.rate_limit_hits || 0;
    const timeMs = stats.time_ms || 0;

    await db.execute(sql`
      UPDATE import_batches SET
        valid_rows = COALESCE(valid_rows, 0) + ${validInc},
        invalid_rows = COALESCE(invalid_rows, 0) + ${invalidInc},
        excluded_rows = COALESCE(excluded_rows, 0) + ${excludedInc},
        imported_rows = COALESCE(imported_rows, 0) + ${importedInc},
        updated_rows = COALESCE(updated_rows, 0) + ${updatedInc},
        skipped_rows = COALESCE(skipped_rows, 0) + ${skippedInc},
        total_rows = COALESCE(imported_rows, 0) + ${importedInc} + COALESCE(updated_rows, 0) + ${updatedInc} + COALESCE(skipped_rows, 0) + ${skippedInc} + COALESCE(invalid_rows, 0) + ${invalidInc} + COALESCE(excluded_rows, 0) + ${excludedInc},
        api_requests_count = COALESCE(api_requests_count, 0) + ${apiInc},
        rate_limit_count = COALESCE(rate_limit_count, 0) + ${rlInc},
        retry_params = jsonb_set(
          jsonb_set(
            COALESCE(retry_params::jsonb, '{}'::jsonb),
            '{total_time_ms}',
            to_jsonb(COALESCE((retry_params::jsonb->>'total_time_ms')::int, 0) + ${timeMs})
          ),
          '{completed_items}',
          to_jsonb(COALESCE((retry_params::jsonb->>'completed_items')::int, 0) + 1)
        ),
        updated_date = NOW()
      WHERE id = ${batchId}
    `);
  } catch (e: any) {
    console.error(`[Crawler] FAILED to update batch stats for ${batchId}: ${e.message}`);
  }
}

async function incrementBatchQueueSize(batchId: number, additionalItems: number) {
  if (!additionalItems || additionalItems <= 0) return;
  try {
    await db.execute(sql`
      UPDATE import_batches SET
        retry_params = jsonb_set(
          COALESCE(retry_params::jsonb, '{}'::jsonb),
          '{total_queue_items}',
          to_jsonb(COALESCE((retry_params::jsonb->>'total_queue_items')::int, 0) + ${additionalItems})
        ),
        updated_date = NOW()
      WHERE id = ${batchId}
    `);
  } catch (e: any) {
    console.warn(`[Crawler] Failed to increment queue size for ${batchId}: ${e.message}`);
  }
}

async function safeCrawlerQuery<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      if (attempt === 3) {
        console.warn(`[Crawler] ${label} failed after 3 attempts: ${e.message}`);
        return fallback;
      }
      await sleep(attempt * 2000);
    }
  }
  return fallback;
}

async function processQueueWorker(dryRun: boolean) {
  if (activeWorkerCount >= MAX_CONCURRENT_WORKERS) {
    console.log(`[Crawler Worker] Already ${activeWorkerCount} workers active, skipping new spawn`);
    return { success: true, message: "Worker limit reached", processed: 0 };
  }
  activeWorkerCount++;
  const execStartTime = Date.now();
  try {
    const configs = await safeCrawlerQuery(
      () => db.select().from(nppesCrawlerConfigs).where(eq(nppesCrawlerConfigs.config_key, "default")),
      [] as any[], "load config"
    );
    const config = configs[0] || {} as any;
    if (config.crawler_stopped) {
      console.log("[Crawler Worker] Stop flag detected, exiting.");
      return { success: true, message: "Worker stopped by stop flag", processed: 0 };
    }
    const apiBatchSize = config.api_batch_size || 200;
    const maxRetries = config.max_retries || 3;
    const apiDelayMs = config.api_delay_ms !== undefined && config.api_delay_ms !== null ? config.api_delay_ms : 200;
    const requestTimeoutMs = config.request_timeout_ms || 15000;
    const configMaxSkip = config.max_skip || 1000;
    const excludedCredentialSet = buildExcludedCredentialSet(config.excluded_credentials as string[] | null);

    await db.execute(sql`
      UPDATE nppes_queue_items SET status = 'pending', retry_count = retry_count + 1, updated_date = NOW()
      WHERE status = 'processing' AND updated_date < NOW() - INTERVAL '10 minutes'
    `).catch(() => {});

    let tasksProcessed = 0;
    let consecutiveErrors = 0;
    let stopFlagCheckCounter = 0;
    let prefetchedTasks: any[] = [];
    const batchCache = new Map<number, { batch: any; fetchedAt: number }>();

    while (Date.now() - execStartTime < MAX_EXEC_MS) {
      stopFlagCheckCounter++;
      if (stopFlagCheckCounter % 5 === 0) {
        const cfgCheck = await safeCrawlerQuery(
          () => db.select().from(nppesCrawlerConfigs).where(eq(nppesCrawlerConfigs.config_key, "default")),
          [] as any[], "stop flag check"
        );
        if (cfgCheck[0]?.crawler_stopped) {
          return { success: true, processed: tasksProcessed, message: "Worker stopped by stop flag (mid-loop)" };
        }
      }

      if (prefetchedTasks.length === 0) {
        prefetchedTasks = await safeCrawlerQuery(
          () => db.select().from(nppesQueueItems)
            .where(eq(nppesQueueItems.status, "pending"))
            .orderBy(asc(nppesQueueItems.created_date)).limit(10),
          [] as any[], "prefetch tasks"
        );
      }

      if (prefetchedTasks.length === 0) {
        const processingBatchList = await db.select().from(importBatches)
          .where(and(eq(importBatches.import_type, "nppes_registry"), eq(importBatches.status, "processing")));
        let batchesClosed = 0;
        let wokePausedBatch = false;
        for (const b of processingBatchList) {
          const items = await db.select().from(nppesQueueItems).where(eq(nppesQueueItems.batch_id, b.id)).limit(10000);
          if (items.length === 0) {
            await db.update(importBatches).set({ status: "completed", completed_at: new Date(), updated_date: new Date() }).where(eq(importBatches.id, b.id));
            batchesClosed++;
            continue;
          }
          const runnableItems = items.filter((i) => i.status === "pending" || i.status === "processing");
          const pausedItems = items.filter((i) => i.status === "paused");
          if (runnableItems.length === 0 && pausedItems.length > 0) {
            await db.update(importBatches).set({ status: "paused", updated_date: new Date() }).where(eq(importBatches.id, b.id));
            continue;
          }
          const remaining = [...runnableItems, ...pausedItems];
          if (remaining.length === 0) {
            const failedItems = items.filter((i) => i.status === "failed");
            const updates: any = {
              status: failedItems.length > 0 ? "failed" : "completed",
              completed_at: new Date(),
              updated_date: new Date(),
            };
            if (failedItems.length > 0) {
              updates.error_samples = failedItems.slice(0, 5).map((i) => ({
                phase: "crawler", detail: i.error_message || "Unknown error",
                item_id: i.id, zip_prefix: i.zip_prefix,
              }));
            }
            await db.update(importBatches).set(updates).where(eq(importBatches.id, b.id));
            batchesClosed++;
            try {
              const currentlyProcessing = await db.select().from(importBatches)
                .where(and(eq(importBatches.import_type, "nppes_registry"), eq(importBatches.status, "processing")));
              const activeCrawlerBatches = currentlyProcessing.filter((pb) => pb.file_name?.startsWith("crawler_"));
              const maxConcurrentBatches = config.concurrency || 4;
              if (activeCrawlerBatches.length < maxConcurrentBatches) {
                const pausedBatches = await db.select().from(importBatches)
                  .where(and(eq(importBatches.import_type, "nppes_registry"), eq(importBatches.status, "paused")))
                  .orderBy(asc(importBatches.created_date)).limit(5);
                const nextPaused = pausedBatches.find((pb) => pb.file_name?.startsWith("crawler_"));
                if (nextPaused) {
                  await db.update(importBatches).set({ status: "processing", updated_date: new Date() }).where(eq(importBatches.id, nextPaused.id));
                  await db.update(nppesQueueItems)
                    .set({ status: "pending", updated_date: new Date() })
                    .where(and(eq(nppesQueueItems.batch_id, nextPaused.id), eq(nppesQueueItems.status, "paused")));
                  wokePausedBatch = true;
                }
              }
            } catch (e: any) { console.error("Failed to wake next batch:", e.message); }
          }
        }
        if (wokePausedBatch) continue;
        if (batchesClosed > 0) return { success: true, message: `Queue empty. Closed ${batchesClosed} batches.`, processed: tasksProcessed };
        return { success: true, message: "Queue empty", processed: tasksProcessed };
      }

      const task = prefetchedTasks.shift()!;
      if ((task.retry_count || 0) >= maxRetries) {
        await db.update(nppesQueueItems).set({ status: "failed", error_message: "Max retries exceeded", updated_date: new Date() }).where(eq(nppesQueueItems.id, task.id));
        continue;
      }

      const [claimed] = await db.update(nppesQueueItems)
        .set({ status: "processing", updated_date: new Date() })
        .where(and(eq(nppesQueueItems.id, task.id), eq(nppesQueueItems.status, "pending")))
        .returning();
      if (!claimed) {
        console.log(`[Crawler Worker] Task ${task.id} already claimed by another worker, skipping`);
        continue;
      }

      let taskBatch: any;
      const cached = batchCache.get(task.batch_id!);
      if (cached && Date.now() - cached.fetchedAt < 30000) {
        taskBatch = cached.batch;
      } else {
        try {
          const [b] = await db.select().from(importBatches).where(eq(importBatches.id, task.batch_id!)).limit(1);
          taskBatch = b;
          if (b) batchCache.set(task.batch_id!, { batch: b, fetchedAt: Date.now() });
        } catch (e: any) {
          await db.update(nppesQueueItems).set({ status: "failed", error_message: "Batch was deleted", updated_date: new Date() }).where(eq(nppesQueueItems.id, task.id));
          continue;
        }
      }
      if (!taskBatch || taskBatch.status === "cancelled" || taskBatch.status === "failed") {
        await db.update(nppesQueueItems).set({ status: "failed", error_message: `Batch ${taskBatch?.status || "deleted"}`, updated_date: new Date() }).where(eq(nppesQueueItems.id, task.id));
        continue;
      }
      const effectiveDryRun = dryRun || taskBatch.dry_run;
      const taskStartTime = Date.now();
      try {
        const params = new URLSearchParams();
        params.set("limit", String(apiBatchSize));
        params.set("state", task.state!);
        const batchRetryParams: any = taskBatch.retry_params || {};
        if (batchRetryParams.city) params.set("city", batchRetryParams.city);
        if (batchRetryParams.entity_type) params.set("enumeration_type", batchRetryParams.entity_type);
        if (batchRetryParams.taxonomy_description) params.set("taxonomy_description", batchRetryParams.taxonomy_description);
        if (batchRetryParams.postal_code) {
          params.set("postal_code", task.zip_prefix!.length >= 5 ? task.zip_prefix! : `${task.zip_prefix}*`);
        } else {
          params.set("postal_code", `${task.zip_prefix}*`);
        }
        const stats: any = { valid: 0, invalid: 0, duplicate: 0, prov: { imported: 0, updated: 0, skipped: 0 }, api_calls: 1, rate_limit_hits: 0, prefix: task.zip_prefix };
        const firstPage = await fetchNPPESPage(params, stats, requestTimeoutMs);
        if (firstPage.error) throw new Error(firstPage.error);
        let allResults = [...firstPage.results];
        let lastPageSize = firstPage.results.length;
        let skip = apiBatchSize;
        let needSplit = false;
        if (lastPageSize === apiBatchSize) {
          while (lastPageSize === apiBatchSize && skip <= configMaxSkip) {
            if (Date.now() - execStartTime >= MAX_EXEC_MS - 3000) break;
            params.set("skip", String(skip));
            const page = await fetchNPPESPage(params, stats, requestTimeoutMs);
            stats.api_calls++;
            if (page.error || page.results.length === 0) break;
            allResults.push(...page.results);
            lastPageSize = page.results.length;
            skip += apiBatchSize;
          }
          if (lastPageSize === apiBatchSize && skip > configMaxSkip && task.zip_prefix!.length < 5) {
            needSplit = true;
          }
        }
        if (needSplit) {
          if (allResults.length > 0) {
            const transformed = transformResults(allResults, excludedCredentialSet);
            stats.valid += transformed.validRows;
            stats.invalid += transformed.invalidRows;
            stats.excluded = (stats.excluded || 0) + transformed.excludedRows;
            if (!effectiveDryRun) {
              const [provRes] = await Promise.all([
                upsertProviders(transformed.providers),
                upsertLocations(transformed.locations),
                upsertTaxonomies(transformed.taxonomies),
              ]);
              stats.prov = { imported: provRes.imported, updated: provRes.updated, skipped: provRes.skipped };
            }
          }
          const subTasks = [];
          for (let d = 0; d <= 9; d++) {
            subTasks.push({ batch_id: task.batch_id!, state: task.state!, zip_prefix: `${task.zip_prefix}${d}`, status: "pending" as const });
          }
          await db.insert(nppesQueueItems).values(subTasks);
          await incrementBatchQueueSize(task.batch_id!, subTasks.length);
          stats.time_ms = Date.now() - taskStartTime;
          await db.update(nppesQueueItems).set({ status: "completed", updated_date: new Date() }).where(eq(nppesQueueItems.id, task.id));
          await updateBatchStats(task.batch_id!, stats);
        } else if (allResults.length > 0) {
          const transformed = transformResults(allResults, excludedCredentialSet);
          stats.valid += transformed.validRows;
          stats.invalid += transformed.invalidRows;
          stats.excluded = (stats.excluded || 0) + transformed.excludedRows;
          if (!effectiveDryRun) {
            const [provRes] = await Promise.all([
              upsertProviders(transformed.providers),
              upsertLocations(transformed.locations),
              upsertTaxonomies(transformed.taxonomies),
            ]);
            stats.prov = { imported: provRes.imported, updated: provRes.updated, skipped: provRes.skipped };
          }
          stats.time_ms = Date.now() - taskStartTime;
          await db.update(nppesQueueItems).set({ status: "completed", updated_date: new Date() }).where(eq(nppesQueueItems.id, task.id));
          await updateBatchStats(task.batch_id!, stats);
        } else {
          stats.time_ms = Date.now() - taskStartTime;
          await db.update(nppesQueueItems).set({ status: "completed", updated_date: new Date() }).where(eq(nppesQueueItems.id, task.id));
          await updateBatchStats(task.batch_id!, stats);
        }
        tasksProcessed++;
        consecutiveErrors = 0;
        if (stats.shouldSlowDown) await sleep(2000);
        else if (apiDelayMs > 0) await sleep(Math.min(apiDelayMs, 50));
      } catch (e: any) {
        consecutiveErrors++;
        const newRetryCount = (task.retry_count || 0) + 1;
        const newStatus = newRetryCount >= maxRetries ? "failed" : "pending";
        try {
          await db.update(nppesQueueItems).set({ status: newStatus, error_message: String(e.message).substring(0, 500), retry_count: newRetryCount, updated_date: new Date() }).where(eq(nppesQueueItems.id, task.id));
        } catch (dbErr: any) {
          console.warn(`[Crawler Worker] DB error updating task ${task.id}: ${dbErr.message}`);
        }
        if (consecutiveErrors >= 5) {
          console.warn(`[Crawler Worker] Hit ${consecutiveErrors} consecutive errors, backing off 30s. Last: ${e.message}`);
          await sleep(30000);
          consecutiveErrors = 0;
        } else {
          await sleep(consecutiveErrors * 2000);
        }
      }
    }

    const latestConfig = await db.select().from(nppesCrawlerConfigs).where(eq(nppesCrawlerConfigs.config_key, "default")).catch(() => [] as any[]);
    if (latestConfig[0]?.crawler_stopped) {
      return { success: true, processed: tasksProcessed, message: "Worker stopped by stop flag" };
    }

    let remainingQueueSize = 0;
    try {
      const remainingQueue = await db.select({ count: sql<number>`count(*)` }).from(nppesQueueItems).where(eq(nppesQueueItems.status, "pending"));
      remainingQueueSize = remainingQueue[0]?.count || 0;
    } catch (dbErr: any) {
      console.warn(`[Crawler Worker] DB error checking remaining queue: ${dbErr.message}`);
      remainingQueueSize = 1;
    }
    if (remainingQueueSize > 0) {
      setTimeout(() => processQueueWorkerWithRestart(dryRun).catch((e) => console.error("[Crawler] Re-invoke failed:", e.message)), 500);
    }
    return { success: true, processed: tasksProcessed, message: "Time limit reached, re-invoked" };
  } catch (err: any) {
    console.error("[Crawler Worker] crash:", err.message);
    return { success: false, error: err.message };
  } finally {
    activeWorkerCount = Math.max(0, activeWorkerCount - 1);
  }
}

let workerCrashRetries = 0;
const MAX_WORKER_CRASH_RETRIES = 5;

async function processQueueWorkerWithRestart(dryRun: boolean) {
  try {
    const result = await processQueueWorker(dryRun);
    workerCrashRetries = 0;
    return result;
  } catch (e: any) {
    workerCrashRetries++;
    if (workerCrashRetries <= MAX_WORKER_CRASH_RETRIES) {
      const delay = workerCrashRetries * 10000;
      console.warn(`[Crawler] Worker crashed, restarting in ${delay / 1000}s (attempt ${workerCrashRetries}/${MAX_WORKER_CRASH_RETRIES}): ${e.message}`);
      setTimeout(() => processQueueWorkerWithRestart(dryRun).catch(() => {}), delay);
    } else {
      console.error(`[Crawler] Worker crashed ${MAX_WORKER_CRASH_RETRIES} times, giving up. Watchdog will recover.`);
      workerCrashRetries = 0;
    }
    return { success: false, error: e.message };
  }
}

export async function handleNppesCrawler(payload: any, user: any) {
  const { action = "process_queue", states = [], region, concurrency, skip_completed = true, dry_run = false, entity_type, taxonomy_description, city, postal_code, item_ids, batch_id } = payload;

  if (action === "cleanup_orphans") {
    let cleaned = 0;
    const allBatches = await db.select().from(importBatches)
      .where(eq(importBatches.import_type, "nppes_registry"))
      .orderBy(desc(importBatches.created_date)).limit(5000);
    const deadBatchIds = new Set(allBatches.filter((b) => b.status === "cancelled" || b.status === "failed").map((b) => b.id));
    for (const status of ["pending", "paused", "processing"] as const) {
      const items = await db.select().from(nppesQueueItems).where(eq(nppesQueueItems.status, status)).limit(5000);
      const orphans = items.filter((i) => deadBatchIds.has(i.batch_id!));
      for (let i = 0; i < orphans.length; i += 100) {
        const chunk = orphans.slice(i, i + 100);
        await Promise.all(chunk.map((item) =>
          db.update(nppesQueueItems).set({ status: "failed", error_message: "Orphan cleanup", updated_date: new Date() }).where(eq(nppesQueueItems.id, item.id)).catch(() => {})
        ));
        cleaned += chunk.length;
      }
    }
    return { success: true, cleaned, message: `Cleaned ${cleaned} orphaned items from ${deadBatchIds.size} dead batches.` };
  }

  if (action === "status" || action === "batch_status") {
    const crawlBatches = await db.select().from(importBatches)
      .where(eq(importBatches.import_type, "nppes_registry"))
      .orderBy(desc(importBatches.created_date)).limit(5000);
    const crawlerBatches = crawlBatches.filter((b) => b.file_name?.startsWith("crawler_"));

    let total_imported = 0, total_updated = 0, total_skipped = 0, total_api_calls = 0;
    for (const b of crawlerBatches) {
      total_imported += b.imported_rows || 0;
      total_updated += b.updated_rows || 0;
      total_skipped += b.skipped_rows || 0;
      total_api_calls += b.api_requests_count || 0;
    }

    const stateLatest: Record<string, any> = {};
    for (const b of crawlerBatches) {
      const stMatch = b.file_name?.match(/crawler_([A-Z]{2})/i);
      if (!stMatch) continue;
      const st = stMatch[1].toUpperCase();
      if (!stateLatest[st] || new Date(b.created_date!) > new Date(stateLatest[st].created_date)) {
        stateLatest[st] = b;
      }
    }

    const completedStates: string[] = [], failedStates: string[] = [], processingStates: string[] = [], pausedStates: string[] = [];
    for (const [st, b] of Object.entries(stateLatest)) {
      if (b.status === "completed") completedStates.push(st);
      else if (b.status === "failed") failedStates.push(st);
      else if (b.status === "processing" || b.status === "validating") processingStates.push(st);
      else if (b.status === "paused") pausedStates.push(st);
    }
    const knownSet = new Set([...completedStates, ...failedStates, ...processingStates, ...pausedStates]);
    const pendingStates = US_STATES.filter((s) => !knownSet.has(s));

    const activeBatchIds = new Set(crawlerBatches.filter((b) => b.status === "processing" || b.status === "paused").map((b) => b.id));
    const processingItems = await db.select().from(nppesQueueItems).where(eq(nppesQueueItems.status, "processing")).limit(100);
    const active_workers = processingItems.filter((i) => activeBatchIds.has(i.batch_id!)).length;
    const pendingItems = await db.select().from(nppesQueueItems).where(eq(nppesQueueItems.status, "pending")).limit(200);
    const pausedItems = await db.select().from(nppesQueueItems).where(eq(nppesQueueItems.status, "paused")).limit(200);
    const activePendingItems = pendingItems.filter((i) => activeBatchIds.has(i.batch_id!));
    const activePausedItems = pausedItems.filter((i) => activeBatchIds.has(i.batch_id!));
    const hasPaused = activePausedItems.length > 0;
    const hasPending = activePendingItems.length > 0 || active_workers > 0;
    const crawler_status = hasPaused && !hasPending ? "paused" : hasPending ? "running" : "idle";

    const granular_metrics: Record<string, any> = {};
    const allPendingItems = await db.select().from(nppesQueueItems).where(eq(nppesQueueItems.status, "pending")).limit(5000);
    for (const st of processingStates) {
      const b = stateLatest[st];
      if (b) {
        const rp: any = b.retry_params || {};
        const avg_time_ms = rp.completed_items > 0 ? Math.round(rp.total_time_ms / rp.completed_items) : 0;
        const pending_items_count = allPendingItems.filter((i: any) => i.batch_id === b.id).length;
        granular_metrics[st] = {
          avg_prefix_time_ms: avg_time_ms,
          rate_limit_hits: b.rate_limit_count || 0,
          estimated_remaining_ms: pending_items_count * avg_time_ms,
          pending_items: pending_items_count,
          completed_items: rp.completed_items || 0,
          total_queue_items: rp.total_queue_items || (pending_items_count + (rp.completed_items || 0)) || 100,
        };
      }
    }

    const allFailedItems = await db.select().from(nppesQueueItems).where(eq(nppesQueueItems.status, "failed")).limit(500);
    const errorSummary: Record<string, any> = {};
    for (const item of allFailedItems) {
      const msg = item.error_message || "Unknown Error";
      const simpleMsg = msg.replace(/\d+/g, "#").substring(0, 100);
      if (!errorSummary[simpleMsg]) {
        errorSummary[simpleMsg] = { count: 0, original_message: msg, affected_states: new Set(), sample_prefixes: new Set(), item_ids: [] };
      }
      errorSummary[simpleMsg].count++;
      errorSummary[simpleMsg].affected_states.add(item.state);
      if (errorSummary[simpleMsg].sample_prefixes.size < 5) errorSummary[simpleMsg].sample_prefixes.add(item.zip_prefix);
      if (errorSummary[simpleMsg].item_ids.length < 50) errorSummary[simpleMsg].item_ids.push(item.id);
    }
    const formattedErrors = Object.values(errorSummary).map((e: any) => ({
      ...e,
      affected_states: Array.from(e.affected_states),
      sample_prefixes: Array.from(e.sample_prefixes),
    })).sort((a: any, b: any) => b.count - a.count);

    const auto_chain_active = crawler_status === "running" || active_workers > 0 || processingStates.length > 0;

    return {
      crawler_status, active_workers, auto_chain_active, granular_metrics,
      total_states: US_STATES.length, completed: completedStates.length, failed: failedStates.length,
      processing: processingStates.length, pending: pendingStates.length,
      completed_states: completedStates, failed_states: failedStates,
      processing_states: processingStates, paused_states: pausedStates, pending_states: pendingStates,
      paused: pausedStates.length,
      batches: crawlerBatches.slice(0, 60),
      regions: REGION_STATES,
      errors: formattedErrors,
      totals: {
        imported: total_imported, updated: total_updated, skipped: total_skipped,
        api_calls: total_api_calls, processed: total_imported + total_updated + total_skipped,
      },
    };
  }

  if (action === "batch_start") {
    if (user && user.role !== "admin") return { error: "Forbidden" };

    const configs = await db.select().from(nppesCrawlerConfigs).where(eq(nppesCrawlerConfigs.config_key, "default"));
    const config: any = configs[0] || {};
    if (configs[0]?.crawler_stopped) {
      await db.update(nppesCrawlerConfigs).set({ crawler_stopped: false, updated_date: new Date() }).where(eq(nppesCrawlerConfigs.id, configs[0].id));
    }

    let targetStates = states as string[];
    if (region) {
      targetStates = REGION_STATES[region] || US_STATES;
    }
    if (!targetStates || targetStates.length === 0) {
      if (config.crawl_all_states === false && Array.isArray(config.selected_states) && config.selected_states.length > 0) {
        targetStates = config.selected_states as string[];
      } else {
        targetStates = US_STATES;
      }
    }

    const configEntityTypes = Array.isArray(config.crawl_entity_types) && config.crawl_entity_types.length > 0
      ? config.crawl_entity_types as string[]
      : ["NPI-1", "NPI-2"];

    let queued = 0, skipped = 0;
    let processingCount = 0;
    const maxConcurrent = Math.max(1, Number(concurrency || config.concurrency || 4));

    let existingBatches: any[] = [];
    if (skip_completed) {
      existingBatches = await db.select().from(importBatches)
        .where(eq(importBatches.import_type, "nppes_registry"))
        .orderBy(desc(importBatches.created_date)).limit(500);
    }

    for (const st of targetStates) {
      if (skip_completed) {
        const stBatch = existingBatches.find((b) => b.file_name?.includes(`crawler_${st}_`));
        if (stBatch && (stBatch.status === "completed" || stBatch.status === "validating")) {
          skipped++;
          continue;
        }
        if (stBatch && stBatch.status === "processing") {
          await db.update(importBatches).set({ status: "cancelled", cancel_reason: "Replaced by new crawler run", updated_date: new Date() }).where(eq(importBatches.id, stBatch.id));
          await db.update(nppesQueueItems)
            .set({ status: "failed", error_message: "Cancelled by new run", updated_date: new Date() })
            .where(and(eq(nppesQueueItems.batch_id, stBatch.id), inArray(nppesQueueItems.status, ["processing", "pending"])));
        }
      }

      const isInitial = processingCount < maxConcurrent;
      const batchStatus = isInitial ? "processing" : "paused";
      const normalizedPostalCode = normalizePostalCode(postal_code);
      const knownPrefixes = STATE_ZIP_PREFIXES[st] || Array.from({ length: 100 }, (_, i) => String(i).padStart(2, "0"));
      const queuePrefixes = normalizedPostalCode ? [normalizedPostalCode] : knownPrefixes;

      const retryParams: Record<string, any> = { total_queue_items: queuePrefixes.length };
      if (entity_type) {
        retryParams.entity_type = entity_type;
      } else if (configEntityTypes.length === 1) {
        retryParams.entity_type = configEntityTypes[0];
      }
      if (taxonomy_description) retryParams.taxonomy_description = taxonomy_description;
      if (city) retryParams.city = city;
      if (normalizedPostalCode) retryParams.postal_code = normalizedPostalCode;

      const [batch] = await db.insert(importBatches).values({
        import_type: "nppes_registry",
        file_name: `crawler_${st}_all_${Date.now()}`,
        status: batchStatus,
        dry_run: !!dry_run,
        retry_params: retryParams,
      }).returning();

      const itemStatus = isInitial ? "pending" : "paused";
      const items = queuePrefixes.map((prefix) => ({
        batch_id: batch.id,
        state: st,
        zip_prefix: prefix,
        status: itemStatus,
      }));
      if (items.length > 0) {
        for (let ci = 0; ci < items.length; ci += 100) {
          await db.insert(nppesQueueItems).values(items.slice(ci, ci + 100));
        }
      }
      queued++;
      if (isInitial) processingCount++;
    }

    const workersToStart = Math.min(maxConcurrent, MAX_CONCURRENT_WORKERS);
    for (let i = 0; i < workersToStart; i++) {
      setTimeout(() => processQueueWorkerWithRestart(dry_run).catch((e) => console.error(`[Crawler] Worker ${i + 1} failed:`, e.message)), i * 500);
    }

    return { success: true, states_queued: queued, states_completed: 0, states_failed: 0, total_imported: 0, skipped };
  }

  if (action === "batch_stop") {
    if (user && user.role !== "admin") return { error: "Forbidden" };
    try {
      const configs = await db.select().from(nppesCrawlerConfigs).where(eq(nppesCrawlerConfigs.config_key, "default"));
      if (configs[0]) {
        await db.update(nppesCrawlerConfigs).set({ crawler_stopped: true, updated_date: new Date() }).where(eq(nppesCrawlerConfigs.id, configs[0].id));
      } else {
        await db.insert(nppesCrawlerConfigs).values({ config_key: "default", crawler_stopped: true });
      }
    } catch (e: any) { console.warn("[Crawler] Could not set stop flag:", e.message); }

    let batchesCancelled = 0;
    try {
      const activeBatches = await db.select().from(importBatches)
        .where(and(eq(importBatches.import_type, "nppes_registry"), inArray(importBatches.status, ["processing", "paused", "validating"])));
      await Promise.all(activeBatches.map((b) =>
        db.update(importBatches).set({ status: "cancelled", cancel_reason: "Stopped by user", cancelled_at: new Date(), updated_date: new Date() }).where(eq(importBatches.id, b.id)).catch(() => {})
      ));
      batchesCancelled = activeBatches.length;
    } catch (e: any) { console.error("[Crawler] Error cancelling batches:", e.message); }

    let totalStopped = 0;
    try {
      const batchItems = await db.select().from(nppesQueueItems)
        .where(inArray(nppesQueueItems.status, ["pending", "paused", "processing"])).limit(2000);
      for (let i = 0; i < batchItems.length; i += 100) {
        const chunk = batchItems.slice(i, i + 100);
        await Promise.all(chunk.map((p) =>
          db.update(nppesQueueItems).set({ status: "failed", error_message: "Stopped by user", updated_date: new Date() }).where(eq(nppesQueueItems.id, p.id)).catch(() => {})
        ));
        totalStopped += chunk.length;
      }
    } catch (e: any) { console.error("[Crawler] Error stopping items:", e.message); }

    return { success: true, message: `${batchesCancelled} batches cancelled, ${totalStopped} items stopped. Stop flag set.` };
  }

  if (action === "batch_pause") {
    if (user && user.role !== "admin") return { error: "Forbidden" };
    const activeItems = await db.select().from(nppesQueueItems)
      .where(inArray(nppesQueueItems.status, ["pending", "processing"])).limit(5000);
    let paused = 0;
    for (let i = 0; i < activeItems.length; i += 50) {
      const chunk = activeItems.slice(i, i + 50);
      await Promise.all(chunk.map((p) =>
        db.update(nppesQueueItems).set({ status: "paused", updated_date: new Date() }).where(eq(nppesQueueItems.id, p.id))
      ));
      paused += chunk.length;
    }
    const processingBatchList = await db.select().from(importBatches)
      .where(and(eq(importBatches.import_type, "nppes_registry"), eq(importBatches.status, "processing")));
    for (const b of processingBatchList) {
      if (b.file_name?.startsWith("crawler_")) {
        await db.update(importBatches).set({ status: "paused", updated_date: new Date() }).where(eq(importBatches.id, b.id));
      }
    }
    return { success: true, message: `Crawler paused. ${paused} items paused.` };
  }

  if (action === "batch_resume") {
    if (user && user.role !== "admin") return { error: "Forbidden" };
    const configs = await db.select().from(nppesCrawlerConfigs).where(eq(nppesCrawlerConfigs.config_key, "default"));
    const config: any = configs[0] || {};
    const maxConcurrentBatches = Math.max(1, Number(config.concurrency || 4));

    if (configs[0]?.crawler_stopped) {
      await db.update(nppesCrawlerConfigs).set({ crawler_stopped: false, updated_date: new Date() }).where(eq(nppesCrawlerConfigs.id, configs[0].id));
    }

    let batchesToResume: any[] = [];

    if (batch_id) {
      const [targetBatch] = await db.select().from(importBatches).where(eq(importBatches.id, batch_id)).limit(1);
      if (targetBatch && (targetBatch.status === "paused" || targetBatch.status === "failed") && targetBatch.file_name?.startsWith("crawler_")) {
        batchesToResume = [targetBatch];
      } else {
        return { success: false, message: `Batch ${batch_id} is not a resumable crawler batch (status: ${targetBatch?.status || 'not found'}).` };
      }
    } else {
      const resumableBatches = await db.select().from(importBatches)
        .where(and(
          eq(importBatches.import_type, "nppes_registry"),
          inArray(importBatches.status, ["paused", "failed"])
        ))
        .orderBy(asc(importBatches.created_date)).limit(200);
      const crawlerBatches = resumableBatches.filter((pb) => pb.file_name?.startsWith("crawler_"));
      batchesToResume = crawlerBatches.slice(0, maxConcurrentBatches);
    }

    if (batchesToResume.length === 0) {
      return { success: true, message: "No paused or failed crawler batches found." };
    }

    for (const pb of batchesToResume) {
      await db.update(importBatches).set({ status: "processing", updated_date: new Date() }).where(eq(importBatches.id, pb.id));
      await db.update(nppesQueueItems)
        .set({ status: "pending", updated_date: new Date() })
        .where(and(
          eq(nppesQueueItems.batch_id, pb.id),
          inArray(nppesQueueItems.status, ["paused", "failed"])
        ));
    }

    const resumeDryRun = dry_run || batchesToResume.some((pb) => pb.dry_run);
    setTimeout(() => processQueueWorkerWithRestart(resumeDryRun).catch((e) => console.error("[Crawler] Resume invoke failed:", e.message)), 500);

    return { success: true, message: `Crawler resumed ${batchesToResume.length} batch${batchesToResume.length === 1 ? "" : "es"}.` };
  }

  if (action === "retry_errors") {
    if (user && user.role !== "admin") return { error: "Forbidden" };
    if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) return { error: "No item IDs provided" };
    let retried = 0;
    for (let i = 0; i < item_ids.length; i += 50) {
      const chunk = item_ids.slice(i, i + 50);
      await Promise.all(chunk.map((id: number) =>
        db.update(nppesQueueItems).set({ status: "pending", retry_count: 0, error_message: "", updated_date: new Date() }).where(eq(nppesQueueItems.id, id))
      ));
      retried += chunk.length;
    }
    const failedItemRows = await db.select().from(nppesQueueItems).where(inArray(nppesQueueItems.id, item_ids));
    const batchIds = [...new Set(failedItemRows.map((i) => i.batch_id))];
    for (const bid of batchIds) {
      if (!bid) continue;
      try {
        const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, bid)).limit(1);
        if (batch && (batch.status === "failed" || batch.status === "cancelled")) {
          await db.update(importBatches).set({ status: "processing", updated_date: new Date() }).where(eq(importBatches.id, bid));
        }
      } catch (e: any) { console.warn(`[Crawler] Failed to update batch ${bid}:`, e.message); }
    }
    setTimeout(() => processQueueWorkerWithRestart(dry_run).catch((e) => console.error("[Crawler] Retry invoke failed:", e.message)), 500);
    return { success: true, message: `Queued ${retried} failed tasks for retry.` };
  }

  if (action === "process_queue") {
    const result = await processQueueWorkerWithRestart(dry_run);
    return result;
  }

  return { error: "Unknown action" };
}

let watchdogInterval: ReturnType<typeof setInterval> | null = null;
const WATCHDOG_INTERVAL_MS = 5 * 60 * 1000;
const CRAWLER_STALE_THRESHOLD_MS = 10 * 60 * 1000;

export function startCrawlerWatchdog() {
  if (watchdogInterval) return;
  watchdogInterval = setInterval(async () => {
    try {
      const configs = await db.select().from(nppesCrawlerConfigs).where(eq(nppesCrawlerConfigs.config_key, "default")).catch(() => [] as any[]);
      if (configs[0]?.crawler_stopped) return;

      const processingBatches = await db.select().from(importBatches)
        .where(and(eq(importBatches.import_type, "nppes_registry"), eq(importBatches.status, "processing")));
      const crawlerBatches = processingBatches.filter((b) => b.file_name?.startsWith("crawler_"));
      if (crawlerBatches.length === 0) return;

      const staleCrawlers = crawlerBatches.filter((b) => {
        const updated = new Date(b.updated_date || b.created_date!).getTime();
        return Date.now() - updated > CRAWLER_STALE_THRESHOLD_MS;
      });

      if (staleCrawlers.length === 0) return;

      console.log(`[Crawler Watchdog] Detected ${staleCrawlers.length} stale crawler batch(es), recovering...`);

      for (const batch of staleCrawlers) {
        await db.update(nppesQueueItems)
          .set({ status: "pending", updated_date: new Date() })
          .where(and(eq(nppesQueueItems.batch_id, batch.id), eq(nppesQueueItems.status, "processing")));
        await db.update(importBatches).set({ updated_date: new Date() }).where(eq(importBatches.id, batch.id));
      }

      const pendingCount = await db.select({ count: sql<number>`count(*)` }).from(nppesQueueItems).where(eq(nppesQueueItems.status, "pending"));
      if ((pendingCount[0]?.count || 0) > 0 && activeWorkerCount === 0) {
        console.log(`[Crawler Watchdog] Restarting worker — ${pendingCount[0]?.count} pending items, 0 active workers`);
        activeWorkerCount = 0;
        processQueueWorkerWithRestart(false).catch((e) => console.error("[Crawler Watchdog] Worker restart failed:", e.message));
      }
    } catch (e: any) {
      console.error("[Crawler Watchdog] Error:", e.message);
    }
  }, WATCHDOG_INTERVAL_MS);
  console.log("[Crawler Watchdog] Started — checking every 5 minutes");
}
