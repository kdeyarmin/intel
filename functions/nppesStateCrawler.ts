import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
    'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

const NPPES_API_BASE = 'https://npiregistry.cms.hhs.gov/api/?version=2.1';

// Defaults — overridden by NPPESCrawlerConfig entity at runtime
let BATCH_LIMIT = 200;
let MAX_PAGES_PER_QUERY = 10; // Increased to properly detect when API paging limit is hit
let MAX_SKIP = 1000; // NPPES API hard limit
let BULK_SIZE = 50;
let CONCURRENCY_LIMIT = 4;
let API_DELAY_MS = 200; // Increased default to reduce rate limits
let MAX_RETRIES = 3;
let RETRY_BACKOFF_MS = 5000; // Increased default for rate limits
let REQUEST_TIMEOUT_MS = 15000;
let CRAWL_ENTITY_TYPES = ['NPI-1', 'NPI-2'];
// Hard ceiling: respond before platform kills us (platform limit ~60s)
const MAX_EXEC_MS = 50000;

let execStartTime = Date.now();

function timeLeft() { return MAX_EXEC_MS - (Date.now() - execStartTime); }
function isTimeUp() { return timeLeft() < 5000; } // 5s safety buffer

// ---- ERROR CATEGORIZATION ----
function categorizeError(error) {
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('429') || msg.includes('rate limit')) return 'rate_limit';
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return 'api_downtime';
    if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('network')) return 'network_error';
    if (msg.includes('validation') || msg.includes('schema') || msg.includes('parse')) return 'data_validation';
    return 'unknown';
}

async function loadConfig(base44) {
    try {
        const configs = await base44.asServiceRole.entities.NPPESCrawlerConfig.filter({ config_key: 'default' });
        if (configs.length > 0) {
            const c = configs[0];
            BATCH_LIMIT = c.api_batch_size || 200;
            BULK_SIZE = c.import_chunk_size || 50;
            MAX_RETRIES = c.max_retries || 3;
            API_DELAY_MS = Math.max(c.api_delay_ms ?? 100, 50); // Minimum 50ms
            RETRY_BACKOFF_MS = c.retry_backoff_ms || 2000;
            REQUEST_TIMEOUT_MS = Math.min(c.request_timeout_ms || 10000, 10000);
            CRAWL_ENTITY_TYPES = (c.crawl_entity_types && c.crawl_entity_types.length > 0) ? c.crawl_entity_types : ['NPI-1', 'NPI-2'];
            MAX_PAGES_PER_QUERY = c.max_pages_per_query || 6;
            MAX_SKIP = c.max_skip || 1000;
            CONCURRENCY_LIMIT = c.concurrency || 4;
        }
    } catch (e) {
        console.warn('[Config] Failed to load:', e.message);
    }
}

const STATE_ZIP_PREFIXES = {
    AL: ['35','36'], AK: ['99'], AZ: ['85','86'], AR: ['71','72','75'],
    CA: ['90','91','92','93','94','95','96'], CO: ['80','81'], CT: ['06'],
    DE: ['19'], DC: ['20'], FL: ['32','33','34'], GA: ['30','31','39'],
    HI: ['96'], ID: ['83'], IL: ['60','61','62'], IN: ['46','47'],
    IA: ['50','51','52','68'], KS: ['66','67'], KY: ['40','41','42'],
    LA: ['70','71'], ME: ['03','04'], MD: ['20','21'],
    MA: ['01','02','05'], MI: ['48','49'], MN: ['55','56'],
    MS: ['38','39','71'], MO: ['63','64','65'], MT: ['59'],
    NE: ['68','69'], NV: ['88','89'], NH: ['03'],
    NJ: ['07','08'], NM: ['87','88'], NY: ['06','10','11','12','13','14'],
    NC: ['27','28'], ND: ['58'], OH: ['43','44','45'],
    OK: ['73','74'], OR: ['97'], PA: ['15','16','17','18','19'],
    RI: ['02'], SC: ['29'], SD: ['57'], TN: ['37','38'],
    TX: ['73','75','76','77','78','79','88'], UT: ['84'],
    VT: ['05'], VA: ['20','22','23','24'], WA: ['98','99'],
    WV: ['24','25','26'], WI: ['53','54'], WY: ['82','83']
};

// ---- RATE LIMITER ----
// We use a shared lock for "fetch" operations to enforce a global rate limit across parallel tasks.
const fetchLock = {
    promise: Promise.resolve(),
    async run(fn, delay) {
        // Enqueue the operation
        const op = this.promise.then(async () => {
            await new Promise(r => setTimeout(r, delay));
            return fn();
        });
        // Update tail, handling errors so queue doesn't stall on rejections
        this.promise = op.catch(() => {});
        return op;
    }
};

async function fetchNPPESPage(params, batch, base44) {
    const apiUrl = `${NPPES_API_BASE}&${params.toString()}`;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (isTimeUp()) return { error: 'time_up', results: [], result_count: 0 };
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

            // Increment API request count before making the request
            if (batch?.id && base44) {
                try {
                   await base44.asServiceRole.entities.ImportBatch.update(batch.id, { api_requests_count: (batch.api_requests_count || 0) + 1 });
                } catch(e) { /* ignore stats update error */ }
            }
            
            // Execute with rate limiting
            const response = await fetchLock.run(() => fetch(apiUrl, { signal: controller.signal }), API_DELAY_MS);
            
            clearTimeout(timeout);
            
            if (response.status === 429 || response.status >= 500) {
                // Increment rate limit count on 429 error
                if (response.status === 429 && batch?.id && base44) {
                    try {
                        await base44.asServiceRole.entities.ImportBatch.update(batch.id, { rate_limit_count: (batch.rate_limit_count || 0) + 1 });
                    } catch(e) { /* ignore stats update error */ }
                }

                const isRateLimit = response.status === 429;
                const backoff = attempt * (isRateLimit ? RETRY_BACKOFF_MS * 2 : RETRY_BACKOFF_MS);
                console.warn(`[API] ${response.status} error. Backing off ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})...`);
                await new Promise(r => setTimeout(r, Math.min(backoff, 10000)));
                continue;
            }
            if (!response.ok) return { error: `HTTP ${response.status}`, results: [], requests: attempt };
            
            const data = await response.json();
            if (data.Errors && data.Errors.length > 0) {
                // If it's a transient error reported in body, retry
                const errStr = JSON.stringify(data.Errors);
                if (errStr.includes('unavailable') || errStr.includes('timeout')) {
                     console.warn(`[API] Transient error in response body. Retrying in 1s (attempt ${attempt}/${MAX_RETRIES})...`);
                     await new Promise(r => setTimeout(r, 1000));
                     continue;
                }
                return { error: data.Errors.map(e => e.description).join('; '), results: [], noResults: true };
            }
            return { results: data.results || [], result_count: data.result_count || 0, error: null };
        } catch (e) {
            if (attempt === MAX_RETRIES) return { error: e.message, results: [] };
            console.warn(`[API] Fetch error: ${e.message}. Retrying in ${attempt}s (attempt ${attempt}/${MAX_RETRIES})...`);
            await new Promise(r => setTimeout(r, attempt * 1000));
        }
    }
    return { error: 'Max retries', results: [] };
}

async function fetchAllPages(baseParams, batch, base44) {
    const allResults = [];
    let skip = 0;
    let hitLimit = false;
    let totalAvailable = 0;
    for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
        if (isTimeUp()) break;
        baseParams.set('skip', String(skip));
        const data = await fetchNPPESPage(baseParams, batch, base44);
        if (data.error) {
             console.warn(`[FetchAllPages] Error on skip ${skip}: ${data.error}`);
             break;
        }
        if (data.result_count && data.result_count > totalAvailable) totalAvailable = data.result_count;
        if (data.results.length === 0) break;
        allResults.push(...data.results);
        if (data.results.length < BATCH_LIMIT) break;
        skip += BATCH_LIMIT;
        if (skip > MAX_SKIP) { hitLimit = true; break; }
    }
    // Also flag hitLimit if the API reported more results than we fetched
    if (totalAvailable > allResults.length) hitLimit = true;
    return { results: allResults, hitLimit, totalAvailable };
}

// ---- WRITE HELPERS ----
async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry(fn, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (e) {
            const is429 = /429|rate limit/i.test(e.message);
            if (is429 && attempt < maxRetries) {
                await sleep(attempt * 1000);
                continue;
            }
            throw e;
        }
    }
}

async function runConcurrent(tasks, concurrency) {
    const results = [];
    for (let i = 0; i < tasks.length; i += concurrency) {
        if (isTimeUp()) break;
        const batch = tasks.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(fn => fn()));
        results.push(...batchResults);
        // Small delay between concurrent batches to avoid rate limits
        if (i + concurrency < tasks.length) await sleep(200);
    }
    return results;
}

async function batchLookupByNPI(entity, npis, base44) {
    const resultMap = {};
    if (!npis || npis.length === 0) return resultMap;
    
    try {
        // Bulk lookup using $in operator
        // Use a high limit to ensure we get all records for the batch (assuming avg < 20 records per NPI)
        const limit = npis.length * 20 + 100; 
        const found = await withRetry(() => base44.asServiceRole.entities[entity].filter({ 
            npi: { $in: npis } 
        }, undefined, limit));
        
        for (const record of found) {
            if (!resultMap[record.npi]) resultMap[record.npi] = [];
            resultMap[record.npi].push(record);
        }
    } catch (e) { 
        console.warn(`[BatchLookup] Error for ${entity}: ${e.message}`);
    }
    return resultMap;
}

function isIdentical(a, b, fields) {
    for (const f of fields) {
        if ((a[f] ?? '').toString().trim() !== (b[f] ?? '').toString().trim()) return false;
    }
    return true;
}

function isNewer(incoming, existing) {
    const iDate = incoming.last_update_date || incoming.enumeration_date || '';
    const eDate = existing.last_update_date || existing.enumeration_date || '';
    return iDate && (!eDate || iDate > eDate);
}

function isMoreComplete(incoming, existing, fields) {
    let ic = 0, ec = 0;
    for (const f of fields) {
        if (incoming[f] && String(incoming[f]).trim()) ic++;
        if (existing[f] && String(existing[f]).trim()) ec++;
    }
    return ic > ec;
}

async function upsertProviders(records, base44) {
    // Optimized for speed: use bulk create where possible, only update if needed
    const FIELDS = ['first_name','last_name','organization_name','status','entity_type','last_update_date'];
    let imported = 0, updated = 0, skipped = 0;
    
    for (let i = 0; i < records.length; i += BULK_SIZE) {
        if (isTimeUp()) break;
        const chunk = records.slice(i, i + BULK_SIZE);
        const npis = chunk.map(p => p.npi);
        
        try {
            const existing = await withRetry(() => base44.asServiceRole.entities.Provider.filter({ 
                npi: { $in: npis } 
            }, undefined, 1000));
            const existingMap = new Map(existing.map(e => [e.npi, e]));
            
            const toCreate = [];
            const updatePromises = [];
            
            for (const p of chunk) {
                const ex = existingMap.get(p.npi);
                if (!ex) {
                    toCreate.push(p);
                } else {
                    if (ex.last_update_date !== p.last_update_date || ex.status !== p.status || !isIdentical(p, ex, FIELDS)) {
                        updatePromises.push(base44.asServiceRole.entities.Provider.update(ex.id, p).catch(() => {}));
                    } else {
                        skipped++;
                    }
                }
            }
            
            if (toCreate.length > 0) {
                await withRetry(() => base44.asServiceRole.entities.Provider.bulkCreate(toCreate));
                imported += toCreate.length;
            }
            if (updatePromises.length > 0) {
                await Promise.all(updatePromises);
                updated += updatePromises.length;
            }
        } catch (e) {
            console.error('[UpsertProviders] Error:', e.message);
            // On error, try one by one to save some records if bulk fails
            for (const p of chunk) {
                if (isTimeUp()) break;
                try {
                    const ex = (await withRetry(() => base44.asServiceRole.entities.Provider.filter({ npi: p.npi })))[0];
                    if (!ex) {
                        await withRetry(() => base44.asServiceRole.entities.Provider.create(p));
                        imported++;
                    } else if (ex.last_update_date !== p.last_update_date || ex.status !== p.status || !isIdentical(p, ex, FIELDS)) {
                        await withRetry(() => base44.asServiceRole.entities.Provider.update(ex.id, p));
                        updated++;
                    } else {
                        skipped++;
                    }
                } catch (err) {
                    console.error(`[UpsertProviders] Fallback failed for NPI ${p.npi}:`, err.message);
                }
                await sleep(50); // Small delay for individual writes
            }
        }
    }
    return { imported, updated, skipped };
}


async function upsertLocations(records, base44) {
    const FIELDS = ['address_1','address_2','city','state','zip','phone','fax'];
    let imported = 0, updated = 0, skipped = 0;
    const chunkSize = BULK_SIZE; 
    for (let i = 0; i < records.length; i += chunkSize) {
        if (isTimeUp()) break;
        const chunk = records.slice(i, i + chunkSize);
        const npis = [...new Set(chunk.map(l => l.npi))];
        const existingMap = await batchLookupByNPI('ProviderLocation', npis, base44);
        const toCreate = [], updateTasks = [];
        for (const loc of chunk) {
            const exLocs = existingMap[loc.npi] || [];
            const match = exLocs.find(ex =>
                ex.location_type === loc.location_type &&
                (ex.address_1 || '').trim().toLowerCase() === (loc.address_1 || '').trim().toLowerCase() &&
                (ex.zip || '').substring(0, 5) === (loc.zip || '').substring(0, 5)
            );
            if (!match) { toCreate.push(loc); }
            else if (isIdentical(loc, match, FIELDS)) { skipped++; }
            else {
                const merged = { ...loc };
                for (const f of FIELDS) { if (!merged[f] && match[f]) merged[f] = match[f]; }
                updateTasks.push(async () => {
                    try { await withRetry(() => base44.asServiceRole.entities.ProviderLocation.update(match.id, merged)); } catch (e) {}
                });
            }
        }
        if (updateTasks.length > 0) { await runConcurrent(updateTasks, 2); updated += updateTasks.length; }
        if (toCreate.length > 0) {
            try {
                await withRetry(() => base44.asServiceRole.entities.ProviderLocation.bulkCreate(toCreate));
                imported += toCreate.length;
            } catch (e) {
                for (const loc of toCreate) {
                    if (isTimeUp()) break;
                    try { await withRetry(() => base44.asServiceRole.entities.ProviderLocation.create(loc)); imported++; } catch (err) {}
                    await sleep(100);
                }
            }
        }
        await sleep(100); // Throttle between chunks
    }
    return { imported, updated, skipped };
}

async function upsertTaxonomies(records, base44) {
    const FIELDS = ['taxonomy_description','primary_flag','license_number','state'];
    let imported = 0, updated = 0, skipped = 0;
    const chunkSize = BULK_SIZE; 
    for (let i = 0; i < records.length; i += chunkSize) {
        if (isTimeUp()) break;
        const chunk = records.slice(i, i + chunkSize);
        const npis = [...new Set(chunk.map(t => t.npi))];
        const existingMap = await batchLookupByNPI('ProviderTaxonomy', npis, base44);
        const toCreate = [], updateTasks = [];
        for (const tax of chunk) {
            const exTaxes = existingMap[tax.npi] || [];
            const match = exTaxes.find(ex => (ex.taxonomy_code || '').trim() === (tax.taxonomy_code || '').trim());
            if (!match) { toCreate.push(tax); }
            else if (isIdentical(tax, match, FIELDS)) { skipped++; }
            else {
                const merged = { ...tax };
                for (const f of FIELDS) { if (!merged[f] && match[f]) merged[f] = match[f]; }
                updateTasks.push(async () => {
                    try { await withRetry(() => base44.asServiceRole.entities.ProviderTaxonomy.update(match.id, merged)); } catch (e) {}
                });
            }
        }
        if (updateTasks.length > 0) { await runConcurrent(updateTasks, 2); updated += updateTasks.length; }
        if (toCreate.length > 0) {
            try {
                await withRetry(() => base44.asServiceRole.entities.ProviderTaxonomy.bulkCreate(toCreate));
                imported += toCreate.length;
            } catch (e) {
                for (const tax of toCreate) {
                    if (isTimeUp()) break;
                    try { await withRetry(() => base44.asServiceRole.entities.ProviderTaxonomy.create(tax)); imported++; } catch (err) {}
                    await sleep(100);
                }
            }
        }
        await sleep(100); // Throttle between chunks
    }
    return { imported, updated, skipped };
}

// ---- RECURSIVE ZIP EXPANSION ----
// When a zip prefix returns more results than we can page through (>1200),
// we expand it by appending 0-9 and querying each sub-prefix separately.
// This recurses up to 5-digit zip codes to handle very dense areas.
async function expandZipPrefix(prefix, baseParams, batch, base44, stats, dry_run) {
    for (let d = 0; d <= 9 && !isTimeUp(); d++) {
        const subZip = `${prefix}${d}`;
        const subParams = new URLSearchParams(baseParams);
        subParams.set('postal_code', `${subZip}*`);
        const subResult = await fetchAllPages(subParams, batch, base44);

        if (subResult.results.length > 0) {
            const transformed = transformResults(subResult.results);
            stats.valid += transformed.validRows;
            stats.invalid += transformed.invalidRows;
            stats.duplicate += transformed.duplicateRows;
            if (transformed.errors.length > 0 && stats.errors.length < 10) stats.errors.push(...transformed.errors);
            if (!dry_run) {
                const provRes = await upsertProviders(transformed.providers, base44);
                stats.prov.imported += provRes.imported;
                stats.prov.updated += provRes.updated;
                stats.prov.skipped += provRes.skipped;
                if (!isTimeUp()) {
                    const locRes = await upsertLocations(transformed.locations, base44);
                    stats.loc.imported += locRes.imported;
                    stats.loc.updated += locRes.updated;
                    stats.loc.skipped += locRes.skipped;
                }
                if (!isTimeUp()) {
                    const taxRes = await upsertTaxonomies(transformed.taxonomies, base44);
                    stats.tax.imported += taxRes.imported;
                    stats.tax.updated += taxRes.updated;
                    stats.tax.skipped += taxRes.skipped;
                }
            }
        }

        // If sub-prefix ALSO hit the limit and we haven't reached 5-digit zips yet, go deeper
        if (subResult.hitLimit && subZip.length < 5 && !isTimeUp()) {
            console.log(`[Crawler] Sub-prefix ${subZip}* still has ${subResult.totalAvailable || '1200+'} results, expanding deeper...`);
            await expandZipPrefix(subZip, baseParams, batch, base44, stats, dry_run);
        }
        await sleep(100);
    }
}

// ---- TRANSFORM: convert raw NPPES API results to entity records ----
function transformResults(allResults) {
    let validRows = 0, invalidRows = 0, duplicateRows = 0;
    const seenNPIs = new Set();
    const providers = [], locations = [], taxonomies = [], errors = [];

    for (const result of allResults) {
        const npi = String(result.number || '');
        if (!npi || npi.length !== 10) { invalidRows++; if (errors.length < 10) errors.push({ npi: npi || 'missing', message: 'Invalid NPI' }); continue; }
        if (seenNPIs.has(npi)) { duplicateRows++; continue; }
        seenNPIs.add(npi);
        validRows++;

        const basic = result.basic || {};
        const isIndividual = result.enumeration_type === 'NPI-1';
        const provider = { npi, entity_type: isIndividual ? 'Individual' : 'Organization', status: basic.status === 'A' ? 'Active' : 'Deactivated', needs_nppes_enrichment: false };
        if (isIndividual) {
            provider.first_name = (basic.first_name || '').trim();
            provider.last_name = (basic.last_name || '').trim();
            provider.middle_name = (basic.middle_name || '').trim();
            provider.credential = (basic.credential || '').trim();
            provider.gender = basic.gender === 'M' ? 'M' : basic.gender === 'F' ? 'F' : '';
        } else { provider.organization_name = (basic.organization_name || '').trim(); }
        if (basic.enumeration_date) provider.enumeration_date = basic.enumeration_date;
        if (basic.last_updated) provider.last_update_date = basic.last_updated;
        providers.push(provider);

        for (const addr of (result.addresses || [])) {
            locations.push({
                npi, location_type: addr.address_purpose === 'MAILING' ? 'Mailing' : 'Practice',
                is_primary: addr.address_purpose === 'LOCATION',
                address_1: (addr.address_1 || '').trim(), address_2: (addr.address_2 || '').trim(),
                city: (addr.city || '').trim(), state: (addr.state || '').trim(),
                zip: (addr.postal_code || '').substring(0, 10),
                phone: (addr.telephone_number || '').trim(), fax: (addr.fax_number || '').trim(),
            });
        }
        for (const tax of (result.taxonomies || [])) {
            taxonomies.push({
                npi, taxonomy_code: (tax.code || '').trim(), taxonomy_description: (tax.desc || '').trim(),
                primary_flag: tax.primary === true, license_number: (tax.license || '').trim(), state: (tax.state || '').trim(),
            });
        }
    }
    return { providers, locations, taxonomies, validRows, invalidRows, duplicateRows, errors };
}

// ==========================================
// MAIN: 3-phase approach with chunked execution
// Phase 1 (fetch): fetches NPPES data for one zip prefix at a time, saves to batch
// Phase 2 (write): writes saved data to entities
// Each invocation handles ONE PHASE and responds quickly
// ==========================================

Deno.serve(async (req) => {
    execStartTime = Date.now();

    try {
        const base44 = createClientFromRequest(req);
        await loadConfig(base44);

        const payload = await req.json();
        const { action = 'start', taxonomy_description = '', entity_type = '', dry_run = false, target_state = '', retry_count = 0, retry_of = null } = payload;

        // Normalize 'process_next' to 'start'
        const effectiveAction = (action === 'process_next') ? 'start' : action;

        // RESET
        if (effectiveAction === 'reset') {
            const crawlBatches = await base44.asServiceRole.entities.ImportBatch.filter({ import_type: 'nppes_registry' }, '-created_date', 1000);
            const crawlerBatches = crawlBatches.filter(b => b.file_name?.startsWith('crawler_'));
            
            let deletedCount = 0;
            for (const b of crawlerBatches) {
                try {
                    await base44.asServiceRole.entities.ImportBatch.delete(b.id);
                    deletedCount++;
                } catch (e) {
                    console.error(`Failed to delete batch ${b.id}:`, e.message);
                }
            }
            
            return Response.json({ success: true, message: `Reset complete. Deleted ${deletedCount} crawler batches.`, deleted_count: deletedCount });
        }

        // STATUS
        if (effectiveAction === 'status') {
            const crawlBatches = await base44.asServiceRole.entities.ImportBatch.filter({ import_type: 'nppes_registry' }, '-created_date', 200);
            const crawlerBatches = crawlBatches.filter(b => b.file_name?.startsWith('crawler_') && !b.file_name.includes('stop_signal'));
            const completedStates = [], failedStates = [], processingStates = [];
            for (const b of crawlerBatches) {
                const st = b.file_name.split('_')[1];
                if (!st || st.length > 2) continue; // skip non-state entries
                if (b.status === 'completed') completedStates.push(st);
                else if (b.status === 'failed') failedStates.push(st);
                else processingStates.push(st);
            }
            const doneSet = new Set([...completedStates, ...failedStates]);
            const pendingStates = US_STATES.filter(s => !doneSet.has(s));
            return Response.json({
                total_states: US_STATES.length, completed: completedStates.length, failed: failedStates.length,
                processing: processingStates.length, pending: pendingStates.length,
                completed_states: completedStates, failed_states: failedStates,
                processing_states: processingStates, pending_states: pendingStates,
                batches: crawlerBatches.slice(0, 60),
            });
        }

        let stateToProcess = target_state;
        
        // If target_state was explicitly passed (e.g. for auto-retry), we use it.
        // But we must ensure it's not currently running in another batch to avoid double processing.
        if (stateToProcess) {
            const runningBatches = await base44.asServiceRole.entities.ImportBatch.filter({ status: 'processing' });
            const isAlreadyRunning = runningBatches.some(b => b.file_name?.includes(`crawler_${stateToProcess}_`));
            if (isAlreadyRunning) {
                console.log(`[Crawler] Target state ${stateToProcess} is already running. Skipping override.`);
                stateToProcess = null; // Fall back to finding next available
            }
        }

        if (!stateToProcess) {
             const crawlBatches = await base44.asServiceRole.entities.ImportBatch.filter({ import_type: 'nppes_registry' }, '-created_date', 300);
             const doneStates = new Set();
             for (const b of crawlBatches.filter(b => b.file_name?.startsWith('crawler_'))) {
                 const st = b.file_name.split('_')[1];
                 if (st && b.status === 'completed') doneStates.add(st);
             }
             const processingBatches = crawlBatches.filter(b => b.status === 'processing');
             const processingStates = new Set(processingBatches.map(b => b.file_name?.split('_')[1]).filter(s => s));
             
             stateToProcess = US_STATES.find(s => !doneStates.has(s) && !processingStates.has(s));
             
             if (!stateToProcess && processingBatches.length > 0) {
                 // Pick the oldest processing batch to resume if no new state is found
                 const oldestProcessing = processingBatches.sort((a,b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime())[0];
                 stateToProcess = oldestProcessing?.file_name.split('_')[1];
                 if (stateToProcess) {
                     console.log(`[Crawler] Resuming processing state ${stateToProcess} from batch ${oldestProcessing.id}`);
                 }
             }
        }
        
        if (!stateToProcess) return Response.json({ success: true, message: 'All states processed!', done: true });

        // RESUMPTION LOGIC
        let batch;
        let processedPrefixes = new Set();
        
        const recentBatches = await base44.asServiceRole.entities.ImportBatch.filter({
            import_type: 'nppes_registry',
            status: 'processing'
        });
        const resumeBatch = recentBatches.find(b => b.file_name?.includes(`crawler_${stateToProcess}_`));
        
        if (resumeBatch) {
            batch = resumeBatch;
            if (batch.retry_params?.processed_prefixes) {
                batch.retry_params.processed_prefixes.forEach(p => processedPrefixes.add(p));
            }
            console.log(`[Crawler] Resuming batch ${batch.id} for ${stateToProcess}. Skipped ${processedPrefixes.size} prefixes.`);
        } else {
             batch = await base44.asServiceRole.entities.ImportBatch.create({
                import_type: 'nppes_registry',
                file_name: `crawler_${stateToProcess}_${taxonomy_description || 'all'}_${Date.now()}`,
                file_url: `NPPES API crawler - ${stateToProcess}`,
                status: 'processing',
                dry_run,
                retry_count: retry_count,
                retry_of: retry_of,
                retry_params: { processed_prefixes: [] }
            });
        }

        const zipPrefixes = STATE_ZIP_PREFIXES[stateToProcess] || [];
        const pendingPrefixes = zipPrefixes.filter(p => !processedPrefixes.has(p));
        
        if (pendingPrefixes.length === 0) {
             await base44.asServiceRole.entities.ImportBatch.update(batch.id, { status: 'completed', completed_at: new Date().toISOString() });
             return Response.json({ 
                 success: true, 
                 state: stateToProcess, 
                 done: false, 
                 message: `State ${stateToProcess} completed.`,
                 valid_rows: 0,
                 imported_providers: 0,
                 updated_providers: 0,
                 skipped_providers: 0,
                 stats: { valid: 0, prov: { imported: 0, updated: 0, skipped: 0 } }
             }); // Next run will pick next state
        }

        console.log(`[Crawler] State=${stateToProcess}, processing ${pendingPrefixes.length} prefixes. Current batch: ${batch.id}`);

        // PARALLEL PROCESSING
        // We run multiple prefixes in parallel. `fetchNPPESPage` uses `fetchLock` to enforce global rate limit on API calls.
        // Higher concurrency allows DB writes (which are slow) to happen in parallel while keeping the API busy.
        const CONCURRENCY = CONCURRENCY_LIMIT || 4; 
        
        let stats = {
            valid: 0, invalid: 0, duplicate: 0,
            prov: { imported: 0, updated: 0, skipped: 0 },
            loc: { imported: 0, updated: 0, skipped: 0 },
            tax: { imported: 0, updated: 0, skipped: 0 },
            errors: []
        };
        
        const processPrefix = async (prefix) => {
            if (isTimeUp()) return;
            
            try {
                for (const enumType of (entity_type ? [entity_type] : CRAWL_ENTITY_TYPES)) {
                    if (isTimeUp()) break;
                    
                    const params = new URLSearchParams();
                    params.set('version', '2.1');
                    params.set('limit', String(BATCH_LIMIT));
                    params.set('state', stateToProcess);
                    params.set('enumeration_type', enumType);
                    params.set('postal_code', `${prefix}*`);
                    if (taxonomy_description) params.set('taxonomy_description', taxonomy_description);

                    const { results, hitLimit } = await fetchAllPages(params, batch, base44);
                    
                    if (results.length > 0) {
                        const { providers, locations, taxonomies, validRows, invalidRows, duplicateRows, errors } = transformResults(results);
                        stats.valid += validRows;
                        stats.invalid += invalidRows;
                        stats.duplicate += duplicateRows;
                        if (errors.length > 0 && stats.errors.length < 10) stats.errors.push(...errors);

                        if (!dry_run) {
                            const provRes = await upsertProviders(providers, base44);
                            stats.prov.imported += provRes.imported;
                            stats.prov.updated += provRes.updated;
                            stats.prov.skipped += provRes.skipped;

                            if (!isTimeUp()) {
                                const locRes = await upsertLocations(locations, base44);
                                stats.loc.imported += locRes.imported;
                                stats.loc.updated += locRes.updated;
                                stats.loc.skipped += locRes.skipped;
                            }
                            if (!isTimeUp()) {
                                const taxRes = await upsertTaxonomies(taxonomies, base44);
                                stats.tax.imported += taxRes.imported;
                                stats.tax.updated += taxRes.updated;
                                stats.tax.skipped += taxRes.skipped;
                            }
                        }
                    }
                    
                    // Handle deep expansion if limit hit — recursively narrow zip prefix
                    // until results fit within the API's skip limit (1200 = 200 * 6 pages)
                    if (hitLimit && !isTimeUp()) {
                        await expandZipPrefix(prefix, params, batch, base44, stats, dry_run);
                    }
                }
                
                processedPrefixes.add(prefix);
                // Update batch periodically to save progress
                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                     retry_params: { processed_prefixes: Array.from(processedPrefixes) },
                     valid_rows: (batch.valid_rows || 0) + stats.valid,
                     imported_rows: (batch.imported_rows || 0) + stats.prov.imported,
                     updated_rows: (batch.updated_rows || 0) + stats.prov.updated,
                     skipped_rows: (batch.skipped_rows || 0) + stats.prov.skipped,
                }).catch(()=>{}); // Ignore update errors to not break main flow
                
            } catch (err) {
                console.error(`[Prefix ${prefix} ERROR]`, err.message);
                const cat = categorizeError(err);
                stats.errors.push({ prefix, message: err.message, category: cat });
            }
        };

        // Run worker pool
        const queue = [...pendingPrefixes];
        const workers = Array(CONCURRENCY).fill(null).map(async () => {
            while(queue.length > 0 && !isTimeUp()) {
                const p = queue.shift();
                if (p) await processPrefix(p); // Ensure p is not undefined
            }
        });
        
        await Promise.all(workers);
        
        // Final update
        const allPendingProcessed = queue.length === 0;
        const finalStatus = allPendingProcessed ? 'completed' : 'processing'; 
        
        await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
             status: finalStatus,
             retry_params: { processed_prefixes: Array.from(processedPrefixes) },
             valid_rows: (batch.valid_rows || 0) + stats.valid,
             imported_rows: (batch.imported_rows || 0) + stats.prov.imported,
             updated_rows: (batch.updated_rows || 0) + stats.prov.updated,
             skipped_rows: (batch.skipped_rows || 0) + stats.prov.skipped,
             completed_at: allPendingProcessed ? new Date().toISOString() : undefined
        });

        // Error Reporting
        if (stats.errors.length > 0) {
             const cats = [...new Set(stats.errors.map(e => e.category))];
             for (const cat of cats) {
                 const errs = stats.errors.filter(e => e.category === cat);
                 try {
                    await base44.asServiceRole.entities.ErrorReport.create({
                        error_type: 'import_failure',
                        error_category: cat, 
                        severity: cat === 'rate_limit' || cat === 'api_downtime' ? 'high' : 'medium',
                        source: batch.id,
                        title: `Crawler Errors: ${cat} in ${stateToProcess}`,
                        description: `Encountered ${errs.length} errors of type ${cat}. State: ${stateToProcess}`,
                        error_samples: errs.slice(0, 5),
                        context: { state: stateToProcess, batch_id: batch.id, taxonomy: taxonomy_description },
                        status: 'new'
                    });
                 } catch (e) { console.error('Failed to create ErrorReport:', e.message); }
             }
        }

        return Response.json({
            success: true,
            state: stateToProcess,
            done: finalStatus === 'completed',
            stats: stats,
            // Flatten stats for nppesBatchProcessor compatibility
            valid_rows: stats.valid,
            imported_providers: stats.prov.imported,
            updated_providers: stats.prov.updated,
            skipped_providers: stats.prov.skipped,
            
            batch_id: batch.id,
            resume_next: !allPendingProcessed,
            elapsed_ms: Date.now() - execStartTime,
        });

    } catch (error) {
        return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
    }
});