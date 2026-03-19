import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
    'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];
const NPPES_API_BASE = 'https://npiregistry.cms.hhs.gov/api/?version=2.1';
const MAX_EXEC_MS = 20000;

type CrawlerPayload = {
    action?: string;
    states?: string[];
    region?: string;
    concurrency?: number;
    skip_completed?: boolean;
    dry_run?: boolean;
    item_ids?: string[];
};

type TransformedProvider = {
    npi: string;
    entity_type: string;
    status: string;
    needs_nppes_enrichment: boolean;
    first_name?: string;
    last_name?: string;
    middle_name?: string;
    credential?: string;
    gender?: string;
    organization_name?: string;
    enumeration_date?: string;
    last_update_date?: string;
};

type ErrorSummaryEntry = {
    count: number;
    original_message: string;
    affected_states: Set<string>;
    sample_prefixes: Set<string>;
    item_ids: string[];
};

type WorkerStats = {
    valid: number;
    invalid: number;
    duplicate: number;
    prov: { imported: number; updated: number; skipped: number };
    api_calls: number;
    rate_limit_hits: number;
    prefix: string;
    time_ms?: number;
    shouldSlowDown?: boolean;
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function withRetry(fn, maxRetries = 5) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try { return await fn(); } catch (e) {
            const isRateLimit = /429|rate limit|too many requests/i.test(e.message);
            const isNetwork = /network|connection|reset|timeout/i.test(e.message);
            if ((isRateLimit || isNetwork) && attempt < maxRetries) {
                const backoff = Math.min((Math.pow(2, attempt) * 500) + (Math.random() * 1000), 5000);
                console.warn(`[Retry] Attempt ${attempt} failed (${e.message}). Retrying in ${backoff}ms...`);
                await sleep(backoff); 
                continue;
            }
            throw e;
        }
    }
}

function isIdentical(a, b, fields) {
    for (const f of fields) { if ((a[f] ?? '').toString().trim() !== (b[f] ?? '').toString().trim()) return false; }
    return true;
}

async function batchLookupByNPI(entity, npis, base44) {
    const resultMap = {};
    if (!npis || npis.length === 0) return resultMap;
    try {
        const limit = npis.length * 20 + 100;
        const found = await withRetry(() => base44.asServiceRole.entities[entity].filter({ npi: { $in: npis } }, undefined, limit));
        for (const record of found) {
            if (!resultMap[record.npi]) resultMap[record.npi] = [];
            resultMap[record.npi].push(record);
        }
    } catch (e) { console.warn(`[BatchLookup] Error for ${entity}: ${e.message}`); }
    return resultMap;
}

async function upsertProviders(records, base44) {
    const FIELDS = ['first_name','last_name','middle_name','credential','gender','organization_name','status','entity_type','last_update_date'];
    let imported = 0, updated = 0, skipped = 0;
    const BULK_SIZE = 50;
    for (let i = 0; i < records.length; i += BULK_SIZE) {
        const chunk = records.slice(i, i + BULK_SIZE);
        const npis = chunk.map(p => p.npi);
        try {
            const existing = await withRetry(() => base44.asServiceRole.entities.Provider.filter({ npi: { $in: npis } }, undefined, 1000));
            const existingMap = new Map(existing.map(e => [e.npi, e]));
            const toCreate = [], updateTasks = [];
            for (const p of chunk) {
                const ex = existingMap.get(p.npi);
                if (!ex) { toCreate.push(p); }
                else {
                    if (ex.last_update_date !== p.last_update_date || ex.status !== p.status || !isIdentical(p, ex, FIELDS)) {
                        const merged = { ...ex, ...p };
                        for (const k of Object.keys(merged)) {
                            if ((merged[k] === null || merged[k] === undefined || merged[k] === '') && ex[k]) merged[k] = ex[k];
                        }
                        updateTasks.push(async () => {
                            await withRetry(() => base44.asServiceRole.entities.Provider.update(ex.id, merged));
                        });
                    } else { skipped++; }
                }
            }
            if (toCreate.length > 0) { await withRetry(() => base44.asServiceRole.entities.Provider.bulkCreate(toCreate)); imported += toCreate.length; }
            if (updateTasks.length > 0) {
                for (let j = 0; j < updateTasks.length; j += 2) {
                    await Promise.all(updateTasks.slice(j, j + 2).map(t => t().catch(()=>{})));
                    if (j + 2 < updateTasks.length) await sleep(200);
                }
                updated += updateTasks.length;
            }
            await sleep(50); // Reduced throttle delay
        } catch (e) {
            // Fallback: Parallelized individual ops
            await Promise.all(chunk.map(async p => {
                try {
                    const ex = (await withRetry(() => base44.asServiceRole.entities.Provider.filter({ npi: p.npi })))[0];
                    if (!ex) { await withRetry(() => base44.asServiceRole.entities.Provider.create(p)); imported++; }
                    else if (ex.last_update_date !== p.last_update_date || ex.status !== p.status || !isIdentical(p, ex, FIELDS)) {
                        const merged = { ...ex, ...p };
                        for (const k of Object.keys(merged)) {
                            if ((merged[k] === null || merged[k] === undefined || merged[k] === '') && ex[k]) merged[k] = ex[k];
                        }
                        await withRetry(() => base44.asServiceRole.entities.Provider.update(ex.id, merged));
                        updated++;
                    }
                    else { skipped++; }
                } catch (err) {}
            }));
        }
    }
    return { imported, updated, skipped };
}

async function upsertLocations(records, base44) {
    const FIELDS = ['address_1','address_2','city','state','zip','phone','fax'];
    let imported = 0, updated = 0, skipped = 0;
    const BULK_SIZE = 50;
    for (let i = 0; i < records.length; i += BULK_SIZE) {
        const chunk = records.slice(i, i + BULK_SIZE);
        const npis = [...new Set(chunk.map(l => l.npi))];
        const existingMap = await batchLookupByNPI('ProviderLocation', npis, base44);
        const toCreate = [], updateTasks = [];
        for (const loc of chunk) {
            const exLocs = existingMap[loc.npi] || [];
            const match = exLocs.find(ex => ex.location_type === loc.location_type && (ex.address_1 || '').trim().toLowerCase() === (loc.address_1 || '').trim().toLowerCase() && (ex.zip || '').substring(0, 5) === (loc.zip || '').substring(0, 5));
            if (!match) { 
                // Inherit email from any existing location of this provider if the new one doesn't have it
                const oldLocWithEmail = exLocs.find(ex => ex.email);
                if (oldLocWithEmail) {
                    loc.email = oldLocWithEmail.email;
                    loc.email_confidence = oldLocWithEmail.email_confidence;
                    loc.email_source = oldLocWithEmail.email_source;
                }
                toCreate.push(loc); 
            }
            else if (isIdentical(loc, match, FIELDS)) { skipped++; }
            else {
                const merged = { ...match, ...loc };
                for (const k of Object.keys(merged)) {
                    if ((merged[k] === null || merged[k] === undefined || merged[k] === '') && match[k]) merged[k] = match[k];
                }
                updateTasks.push(async () => {
                    await withRetry(() => base44.asServiceRole.entities.ProviderLocation.update(match.id, merged));
                });
            }
        }
        if (updateTasks.length > 0) {
            for (let j = 0; j < updateTasks.length; j += 5) {
                await Promise.all(updateTasks.slice(j, j + 5).map(t => t().catch(()=>{})));
                if (j + 5 < updateTasks.length) await sleep(100);
            }
            updated += updateTasks.length;
        }
        if (toCreate.length > 0) {
            try { await withRetry(() => base44.asServiceRole.entities.ProviderLocation.bulkCreate(toCreate)); imported += toCreate.length; }
            catch (e) { 
                await Promise.all(toCreate.map(async loc => { 
                    try { await withRetry(() => base44.asServiceRole.entities.ProviderLocation.create(loc)); imported++; } catch (err) {} 
                })); 
            }
        }
    }
    return { imported, updated, skipped };
}

async function upsertTaxonomies(records, base44) {
    const FIELDS = ['taxonomy_description','primary_flag','license_number','state'];
    let imported = 0, updated = 0, skipped = 0;
    const BULK_SIZE = 50;
    for (let i = 0; i < records.length; i += BULK_SIZE) {
        const chunk = records.slice(i, i + BULK_SIZE);
        const npis = [...new Set(chunk.map(t => t.npi))];
        const existingMap = await batchLookupByNPI('ProviderTaxonomy', npis, base44);
        const toCreate = [], updateTasks = [];
        for (const tax of chunk) {
            const exTaxes = existingMap[tax.npi] || [];
            const match = exTaxes.find(ex => (ex.taxonomy_code || '').trim() === (tax.taxonomy_code || '').trim());
            if (!match) { toCreate.push(tax); }
            else if (isIdentical(tax, match, FIELDS)) { skipped++; }
            else {
                const merged = { ...match, ...tax };
                for (const k of Object.keys(merged)) {
                    if ((merged[k] === null || merged[k] === undefined || merged[k] === '') && match[k]) merged[k] = match[k];
                }
                updateTasks.push(async () => {
                    await withRetry(() => base44.asServiceRole.entities.ProviderTaxonomy.update(match.id, merged));
                });
            }
        }
        if (updateTasks.length > 0) {
            for (let j = 0; j < updateTasks.length; j += 5) {
                await Promise.all(updateTasks.slice(j, j + 5).map(t => t().catch(()=>{})));
                if (j + 5 < updateTasks.length) await sleep(100);
            }
            updated += updateTasks.length;
        }
        if (toCreate.length > 0) {
            try { await withRetry(() => base44.asServiceRole.entities.ProviderTaxonomy.bulkCreate(toCreate)); imported += toCreate.length; }
            catch (e) { 
                await Promise.all(toCreate.map(async tax => { 
                    try { await withRetry(() => base44.asServiceRole.entities.ProviderTaxonomy.create(tax)); imported++; } catch (err) {} 
                })); 
            }
        }
    }
    return { imported, updated, skipped };
}

function transformResults(allResults) {
    let validRows = 0, invalidRows = 0, duplicateRows = 0;
    const seenNPIs = new Set();
    const providers: TransformedProvider[] = [], locations = [], taxonomies = [], errors = [];
    for (const result of allResults) {
        const npi = String(result.number || '');
        if (!npi || npi.length !== 10) { invalidRows++; if (errors.length < 10) errors.push({ npi: npi || 'missing', message: 'Invalid NPI' }); continue; }
        if (seenNPIs.has(npi)) { duplicateRows++; continue; }
        seenNPIs.add(npi);
        validRows++;

        const basic = result.basic || {};
        const isIndividual = result.enumeration_type === 'NPI-1';
        const status = basic.status === 'A' ? 'Active' : 'Deactivated';
        
        if (status === 'Active' && !basic.enumeration_date && !basic.last_updated) {
            invalidRows++;
            if (errors.length < 10) errors.push({ npi, message: 'Active provider missing enumeration and update dates' });
            continue; 
        }

        const provider = { npi, entity_type: isIndividual ? 'Individual' : 'Organization', status, needs_nppes_enrichment: false };
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
            let zip = (addr.postal_code || '').substring(0, 10);
            const rawZip = zip.replace(/[^0-9]/g, '');
            if (rawZip && rawZip.length !== 5 && rawZip.length !== 9) { if (errors.length < 10) errors.push({ npi, message: `Invalid ZIP format: ${zip}` }); }
            let phone = (addr.telephone_number || '').trim();
            const rawPhone = phone.replace(/[^0-9]/g, '');
            if (phone && rawPhone.length < 10) { if (errors.length < 10) errors.push({ npi, message: `Invalid phone format: ${phone}` }); phone = ''; }
            locations.push({
                npi, location_type: addr.address_purpose === 'MAILING' ? 'Mailing' : 'Practice',
                is_primary: addr.address_purpose === 'LOCATION',
                address_1: (addr.address_1 || '').trim(), address_2: (addr.address_2 || '').trim(),
                city: (addr.city || '').trim(), state: (addr.state || '').trim(),
                zip: zip, phone: phone, fax: (addr.fax_number || '').trim(),
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

// In-memory cache for NPPES API responses
const apiCache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours - Aggressive caching
const MAX_CACHE_SIZE = 5000;

let globalRateLimitDelay = 0;
let lastRateLimitHit = 0;

async function fetchNPPESPage(params, stats) {
    const apiUrl = `${NPPES_API_BASE}&${params.toString()}`;
    
    // Check Cache
    if (apiCache.has(apiUrl)) {
        const cached = apiCache.get(apiUrl);
        if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
            return cached.data;
        } else {
            apiCache.delete(apiUrl);
        }
    }

    if (globalRateLimitDelay > 0) {
        if (Date.now() - lastRateLimitHit > 60000) {
            globalRateLimitDelay = 0;
        } else {
            console.log(`[Crawler Worker] Applying dynamic rate limit delay: ${globalRateLimitDelay}ms`);
            await sleep(globalRateLimitDelay);
        }
    }

    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            console.log(`[Crawler Worker] Fetching page: ${apiUrl.replace(NPPES_API_BASE, '')} (Attempt ${attempt})`);
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000 + (attempt * 2000)); // Increase timeout per attempt
            const response = await fetch(apiUrl, { signal: controller.signal });
            clearTimeout(timeout);
            
            if (response.status === 429 && stats) {
                stats.rate_limit_hits = (stats.rate_limit_hits || 0) + 1;
                stats.shouldSlowDown = true; 
                globalRateLimitDelay = Math.min((globalRateLimitDelay || 2000) * 1.5, 15000);
                lastRateLimitHit = Date.now();
                console.warn(`[Crawler Worker] Rate limit 429 encountered. Backing off for ${globalRateLimitDelay}ms`);
            }
            if (response.status === 429 || response.status >= 500) {
                const backoff = Math.min(attempt * 3000 + (Math.random() * 1000), 15000); // Exponential-ish backoff with max 15s
                await sleep(backoff);
                continue;
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            const resultData = { 
                results: data.results || [], 
                count: data.result_count || 0,
                error: data.Errors && data.Errors.length > 0 ? data.Errors.map(e => e.description).join('; ') : null
            };

            // Only cache successful, non-error responses
            if (!resultData.error) {
                if (apiCache.size >= MAX_CACHE_SIZE) {
                    // Evict oldest (first inserted in Map) to manage memory efficiently
                    const firstKey = apiCache.keys().next().value;
                    apiCache.delete(firstKey);
                }
                apiCache.set(apiUrl, { timestamp: Date.now(), data: resultData });
            }
            
            return resultData;
        } catch (e) {
            if (attempt === 5) throw e;
            await sleep(attempt * 1500);
        }
    }
}

async function updateBatchStats(base44, batchId, stats) {
    try {
        const batch = await base44.asServiceRole.entities.ImportBatch.get(batchId);
        if (batch) {
            const retry_params = batch.retry_params || {};
            if (stats.time_ms) {
                retry_params.total_time_ms = (retry_params.total_time_ms || 0) + stats.time_ms;
                retry_params.completed_items = (retry_params.completed_items || 0) + 1;
                retry_params.processed_prefixes = retry_params.processed_prefixes || [];
                if (stats.prefix && !retry_params.processed_prefixes.includes(stats.prefix)) {
                    retry_params.processed_prefixes.push(stats.prefix);
                }
            }
            await base44.asServiceRole.entities.ImportBatch.update(batchId, {
                valid_rows: (batch.valid_rows || 0) + (stats.valid || 0),
                invalid_rows: (batch.invalid_rows || 0) + (stats.invalid || 0),
                imported_rows: (batch.imported_rows || 0) + (stats.prov?.imported || 0),
                updated_rows: (batch.updated_rows || 0) + (stats.prov?.updated || 0),
                skipped_rows: (batch.skipped_rows || 0) + (stats.prov?.skipped || 0),
                api_requests_count: (batch.api_requests_count || 0) + (stats.api_calls || 0),
                rate_limit_count: (batch.rate_limit_count || 0) + (stats.rate_limit_hits || 0),
                retry_params
            });
        }
    } catch(e) {}
}

Deno.serve(async (req) => {
    try {
        let execStartTime = Date.now();
        const base44 = createClientFromRequest(req);
        let user = null;
        try { user = await base44.auth.me(); } catch(e) {}
        
        let payload: CrawlerPayload = {};
        try { payload = await req.json(); } catch(e) {}
        
        const { action = 'process_queue', states = [], region, concurrency = 1, skip_completed = true, dry_run = false } = payload;

    // --- UI COMPATIBILITY ACTIONS ---
    if (action === 'status' || action === 'batch_status') {
        // Fetch more batches to ensure we don't drop counts as the history grows
        const crawlBatches = await base44.asServiceRole.entities.ImportBatch.filter({ import_type: 'nppes_registry' }, '-created_date', 5000);
        const crawlerBatches = crawlBatches.filter(b => b.file_name?.startsWith('crawler_'));
        
        let total_imported = 0, total_updated = 0, total_skipped = 0, total_api_calls = 0;
        for (const b of crawlerBatches) {
            total_imported += (b.imported_rows || 0);
            total_updated += (b.updated_rows || 0);
            total_skipped += (b.skipped_rows || 0);
            total_api_calls += (b.api_requests_count || 0);
        }

        const stateLatest = {};
        for (const b of crawlerBatches) {
            const st = b.file_name.split('_')[1];
            if (!st || st.length > 2) continue;
            if (!stateLatest[st] || new Date(b.created_date) > new Date(stateLatest[st].created_date)) {
                stateLatest[st] = b;
            }
        }
        
        const completedStates = [], failedStates = [], processingStates = [];
        for (const [st, b] of Object.entries(stateLatest)) {
            if (b.status === 'completed') completedStates.push(st);
            else if (b.status === 'failed') failedStates.push(st);
            else processingStates.push(st);
        }
        const doneSet = new Set([...completedStates, ...failedStates]);
        const pendingStates = US_STATES.filter(s => !doneSet.has(s) && !processingStates.includes(s));
        
        const REGION_STATES = {
            northeast: ['CT','ME','MA','NH','RI','VT','NJ','NY','PA','DE','MD','DC'],
            southeast: ['FL','GA','NC','SC','VA','WV','AL','KY','MS','TN','AR','LA'],
            midwest: ['IL','IN','MI','OH','WI','IA','KS','MN','MO','NE','ND','SD'],
            west: ['AK','CA','HI','OR','WA','AZ','CO','ID','MT','NV','NM','UT','WY'],
            south_central: ['TX','OK','NM','AR']
        };

        // Determine if crawler is paused (has paused tasks) or running (has processing/pending tasks)
        const processingItems = await base44.asServiceRole.entities.NPPESQueueItem.filter({ status: 'processing' }, undefined, 100);
        const active_workers = processingItems.length;

        const allItems = await base44.asServiceRole.entities.NPPESQueueItem.filter({}, undefined, 100);
        const hasPaused = allItems.some(i => i.status === 'paused');
        const hasPending = allItems.some(i => i.status === 'pending' || i.status === 'processing');
        const crawler_status = hasPaused && !hasPending ? 'paused' : (hasPending ? 'running' : 'idle');

        const granular_metrics = {};
        
        // Optimize: Fetch all pending items for the current batches in one go to avoid rate limits
        const processingBatchIds = processingStates.map(st => stateLatest[st]?.id).filter(Boolean);
        let allPendingItems = [];
        if (processingBatchIds.length > 0) {
            // we can only do $in for a reasonable amount, let's just fetch up to 10000 pending items globally
            allPendingItems = await base44.asServiceRole.entities.NPPESQueueItem.filter({ status: 'pending' }, undefined, 5000);
        }
        
        for (const st of processingStates) {
            const b = stateLatest[st];
            if (b) {
                const rp = b.retry_params || {};
                const avg_time_ms = rp.completed_items > 0 ? Math.round(rp.total_time_ms / rp.completed_items) : 0;
                const pending_items = allPendingItems.filter(i => i.batch_id === b.id).length;
                const estimated_remaining_ms = pending_items * avg_time_ms;

                granular_metrics[st] = {
                    avg_prefix_time_ms: avg_time_ms,
                    rate_limit_hits: b.rate_limit_count || 0,
                    estimated_remaining_ms,
                    pending_items,
                    completed_items: rp.completed_items || 0
                };
            }
        }

        // Collect Error Summary
        const allFailedItems = await base44.asServiceRole.entities.NPPESQueueItem.filter({ status: 'failed' }, undefined, 500);
        const errorSummary: Record<string, ErrorSummaryEntry> = {};
        for (const item of allFailedItems) {
            const msg = item.error_message || 'Unknown Error';
            // Simplify error message for grouping (e.g. remove specific numbers if any)
            const simpleMsg = msg.replace(/\d+/g, '#').substring(0, 100); 
            if (!errorSummary[simpleMsg]) {
                errorSummary[simpleMsg] = {
                    count: 0,
                    original_message: msg,
                    affected_states: new Set(),
                    sample_prefixes: new Set(),
                    item_ids: []
                };
            }
            errorSummary[simpleMsg].count++;
            errorSummary[simpleMsg].affected_states.add(item.state);
            if (errorSummary[simpleMsg].sample_prefixes.size < 5) errorSummary[simpleMsg].sample_prefixes.add(item.zip_prefix);
            if (errorSummary[simpleMsg].item_ids.length < 50) errorSummary[simpleMsg].item_ids.push(item.id);
        }

        const formattedErrors = Object.values(errorSummary).map(e => ({
            ...e,
            affected_states: Array.from(e.affected_states),
            sample_prefixes: Array.from(e.sample_prefixes)
        })).sort((a,b) => b.count - a.count);

        return Response.json({
            crawler_status,
            active_workers,
            granular_metrics,
            total_states: US_STATES.length, completed: completedStates.length, failed: failedStates.length,
            processing: processingStates.length, pending: pendingStates.length,
            completed_states: completedStates, failed_states: failedStates,
            processing_states: processingStates, pending_states: pendingStates,
            batches: crawlerBatches.slice(0, 60),
            regions: REGION_STATES,
            errors: formattedErrors,
            totals: {
                imported: total_imported,
                updated: total_updated,
                skipped: total_skipped,
                api_calls: total_api_calls,
                processed: total_imported + total_updated + total_skipped
            }
        });
    }

    if (action === 'batch_start') {
        if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
        
        // Load configuration
        const configs = await base44.asServiceRole.entities.NPPESCrawlerConfig.filter({ config_key: 'default' });
        const config = configs[0] || {};

        let targetStates = states;
        if (region) {
            const REGION_STATES = {
                northeast: ['CT','ME','MA','NH','RI','VT','NJ','NY','PA','DE','MD','DC'],
                southeast: ['FL','GA','NC','SC','VA','WV','AL','KY','MS','TN','AR','LA'],
                midwest: ['IL','IN','MI','OH','WI','IA','KS','MN','MO','NE','ND','SD'],
                west: ['AK','CA','HI','OR','WA','AZ','CO','ID','MT','NV','NM','UT','WY'],
                south_central: ['TX','OK','NM','AR']
            };
            targetStates = REGION_STATES[region] || US_STATES;
        }
        
        if (!targetStates || targetStates.length === 0) {
            targetStates = config.crawl_all_states !== false ? US_STATES : (config.selected_states || US_STATES);
            if (targetStates.length === 0) targetStates = US_STATES;
        }

        let queued = 0, skipped = 0;
        let processingCount = 0;
        const maxConcurrent = concurrency || config.concurrency || 4;

        let existingBatches = [];
        if (skip_completed) {
            existingBatches = await base44.asServiceRole.entities.ImportBatch.filter({ import_type: 'nppes_registry' }, '-created_date', 500);
        }

        for (const st of targetStates) {
            if (skip_completed) {
                const stBatch = existingBatches.find(b => b.file_name?.includes(`crawler_${st}_`));
                if (stBatch && (stBatch.status === 'completed' || stBatch.status === 'processing' || stBatch.status === 'validating')) { 
                    skipped++; 
                    continue; 
                }
            }
            
            const isInitial = processingCount < maxConcurrent;
            const batchStatus = isInitial ? 'processing' : 'paused';
            
            const batch = await withRetry(() => base44.asServiceRole.entities.ImportBatch.create({
                import_type: 'nppes_registry',
                file_name: `crawler_${st}_all_${Date.now()}`,
                status: batchStatus,
                dry_run: !!dry_run
            }));
            const items = [];
            const itemStatus = isInitial ? 'pending' : 'paused';
            for (let i = 0; i <= 99; i++) {
                items.push({ batch_id: batch.id, state: st, zip_prefix: String(i).padStart(2, '0'), status: itemStatus });
            }
            await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.bulkCreate(items));
            queued++;
            if (isInitial) processingCount++;
            await sleep(300);
        }
        
        // Dynamic worker pool initialization
        // We start with a lower base concurrency and let the queue processor self-adjust
        const activeWorkersCount = await base44.asServiceRole.entities.NPPESQueueItem.filter({ status: 'processing' }, undefined, 10).then(res => res.length).catch(() => 0);
        
        const targetWorkers = Math.min(maxConcurrent, 3); // Max initial cluster
        const workersToStart = Math.max(0, targetWorkers - activeWorkersCount);
        
        for(let i = 0; i < workersToStart; i++) {
            base44.asServiceRole.functions.invoke('nppesCrawler', { action: 'process_queue', dry_run }).catch(()=>{});
        }
        
        return Response.json({ success: true, states_queued: queued, states_completed: 0, states_failed: 0, total_imported: 0, skipped });
    }

    if (action === 'batch_stop') {
        if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
        const pending = await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.filter({ status: { $in: ['pending', 'paused', 'processing'] } }, undefined, 5000));
        for (let i = 0; i < pending.length; i += 50) {
           const chunk = pending.slice(i, i+50);
           await Promise.all(chunk.map(p => withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.update(p.id, { status: 'failed', error_message: 'Stopped by user' }))));
        }
        
        // Also cancel any active batches
        const processingBatches = await withRetry(() => base44.asServiceRole.entities.ImportBatch.filter({ import_type: 'nppes_registry', status: { $in: ['processing', 'paused'] } }));
        for (const b of processingBatches) {
            await withRetry(() => base44.asServiceRole.entities.ImportBatch.update(b.id, { status: 'cancelled', cancel_reason: 'Stopped by user', cancelled_at: new Date().toISOString() }));
        }

        return Response.json({ success: true, message: 'All tasks and batches stopped.' });
    }

    if (action === 'batch_pause') {
        if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
        const pending = await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.filter({ status: 'pending' }, undefined, 1000));
        for (let i = 0; i < pending.length; i += 50) {
           const chunk = pending.slice(i, i+50);
           await Promise.all(chunk.map(p => withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.update(p.id, { status: 'paused' }))));
        }
        return Response.json({ success: true, message: 'Crawler paused.' });
    }

    if (action === 'batch_resume') {
        if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
        const pausedItems = await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.filter({ status: 'paused' }, undefined, 1000));
        for (let i = 0; i < pausedItems.length; i += 50) {
           const chunk = pausedItems.slice(i, i+50);
           await Promise.all(chunk.map(p => withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.update(p.id, { status: 'pending' }))));
        }
        // Trigger worker pool
        base44.asServiceRole.functions.invoke('nppesCrawler', { action: 'process_queue' }).catch(()=>{});
        return Response.json({ success: true, message: 'Crawler resumed.' });
    }

    if (action === 'retry_errors') {
        if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
        const { item_ids } = payload;
        if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) return Response.json({ error: 'No item IDs provided' }, { status: 400 });
        
        let retried = 0;
        for (let i = 0; i < item_ids.length; i += 50) {
            const chunk = item_ids.slice(i, i+50);
            await Promise.all(chunk.map(id => withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.update(id, { status: 'pending', retry_count: 0, error_message: '' }))));
            retried += chunk.length;
        }

        // Make sure associated batches are set back to processing if they were failed
        const items = await base44.asServiceRole.entities.NPPESQueueItem.filter({ id: { $in: item_ids } });
        const batchIds = [...new Set(items.map(i => i.batch_id))];
        for (const bid of batchIds) {
            await withRetry(() => base44.asServiceRole.entities.ImportBatch.update(bid, { status: 'processing' }));
        }

        base44.asServiceRole.functions.invoke('nppesCrawler', { action: 'process_queue' }).catch(()=>{});
        return Response.json({ success: true, message: `Queued ${retried} failed tasks for retry.` });
    }

    // --- WORKER LOGIC ---
    if (action === 'process_queue') {
        const configs = await base44.asServiceRole.entities.NPPESCrawlerConfig.filter({ config_key: 'default' });
        const config = configs[0] || {};
        const apiBatchSize = config.api_batch_size || 200;
        const maxRetries = config.max_retries || 3;
        const apiDelayMs = config.api_delay_ms !== undefined ? config.api_delay_ms : 200;
        
        // Recover stuck items (older than 10 mins)
        const stuck = await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.filter({ status: 'processing' }, 'updated_date', 200));
        let recoveredCount = 0;
        for (const item of stuck) {
            // Check if stuck for more than 10 minutes
            if (Date.now() - new Date(item.updated_date).getTime() > 600000) {
                await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.update(item.id, { status: 'pending', retry_count: (item.retry_count || 0) + 1 }));
                recoveredCount++;
            }
        }

        let tasksProcessed = 0;
        let consecutiveErrors = 0;
        
        // Process loop until time limit
        while ((Date.now() - execStartTime) < MAX_EXEC_MS) {
            const pendingList = await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.filter({ status: 'pending' }, 'created_date', 1));
            if (pendingList.length === 0) {
                // Double check for any stuck items that we might have missed in the initial check
                // This handles cases where items got stuck *during* this execution cycle or the initial check didn't catch them
                const recentStuck = await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.filter({ status: 'processing' }, 'updated_date', 50));
                const actuallyStuck = recentStuck.filter(i => Date.now() - new Date(i.updated_date).getTime() > 600000);
                
                if (actuallyStuck.length > 0) {
                    for (const item of actuallyStuck) {
                        await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.update(item.id, { status: 'pending', retry_count: (item.retry_count || 0) + 1 }));
                    }
                    // Continue the loop to pick up these newly recovered items
                    continue;
                }

                // Check if any batches are fully done
                const processingBatches = await withRetry(() => base44.asServiceRole.entities.ImportBatch.filter({ import_type: 'nppes_registry', status: 'processing' }));
                let batchesClosed = 0;
                for (const b of processingBatches) {
                    const items = await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.filter({ batch_id: b.id }, undefined, 10000));
                    // If no items found, it's an empty batch or error, verify if we should close it
                    if (items.length === 0) {
                        // Empty batch?
                        continue;
                    }
                    
                    const allDone = items.every(i => i.status === 'completed' || i.status === 'failed');
                    if (allDone) {
                        const failedItems = items.filter(i => i.status === 'failed');
                        const hasErrors = failedItems.length > 0;
                        const updates = { 
                            status: hasErrors ? 'failed' : 'completed', 
                            completed_at: new Date().toISOString() 
                        };
                        
                        if (hasErrors) {
                            // Collect error samples from failed items
                            const errorSamples = failedItems.slice(0, 5).map(i => ({
                                phase: 'crawler',
                                detail: i.error_message || 'Unknown error',
                                item_id: i.id,
                                zip_prefix: i.zip_prefix,
                                timestamp: new Date().toISOString()
                            }));
                            updates.error_samples = errorSamples;
                            updates.cancel_reason = `Batch failed with ${failedItems.length} errors. Sample: ${errorSamples[0].detail}`;
                        }

                        await withRetry(() => base44.asServiceRole.entities.ImportBatch.update(b.id, updates));
                        batchesClosed++;
                        
                        // Trigger automated data validation checks
                        base44.asServiceRole.functions.invoke('validateNPPESBatch', { batch_id: b.id }).catch(e => console.error("Validation invoke error:", e));
                        
                        // Wake up next paused batch to maintain concurrency limit
                        try {
                            const pausedBatches = await withRetry(() => base44.asServiceRole.entities.ImportBatch.filter({ import_type: 'nppes_registry', status: 'paused' }, 'created_date', 5));
                            const nextPaused = pausedBatches.find(pb => pb.file_name?.startsWith('crawler_'));
                            if (nextPaused) {
                                await withRetry(() => base44.asServiceRole.entities.ImportBatch.update(nextPaused.id, { status: 'processing' }));
                                const pausedItems = await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.filter({ batch_id: nextPaused.id, status: 'paused' }, undefined, 100));
                                await Promise.all(pausedItems.map(pi => withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.update(pi.id, { status: 'pending' }))));
                                console.log(`[Crawler Worker] Woke up next paused state batch: ${nextPaused.file_name}`);
                            }
                        } catch(e) { console.error("Failed to wake up next batch:", e); }
                    }
                }
                
                if (batchesClosed > 0) {
                    // If we closed batches, maybe return success but indicate we are done
                    return Response.json({ success: true, message: `Queue empty. Closed ${batchesClosed} batches.`, processed: tasksProcessed });
                }
                
                // If we are here, queue is empty and no batches to close, and no stuck items recovered.
                return Response.json({ success: true, message: "Queue empty", processed: tasksProcessed });
            }

            const task = pendingList[0];
            if (task.retry_count > maxRetries) {
                await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.update(task.id, { status: 'failed', error_message: 'Max retries exceeded' }));
                continue;
            }

            // Mark processing
            await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.update(task.id, { status: 'processing' }));
            
            // Check if batch exists
            try {
                await base44.asServiceRole.entities.ImportBatch.get(task.batch_id);
            } catch (e) {
                await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.update(task.id, { status: 'failed', error_message: 'Batch was deleted' }));
                continue;
            }

            const taskStartTime = Date.now();
            try {
                const params = new URLSearchParams();
                params.set('version', '2.1');
                params.set('limit', String(apiBatchSize));
                params.set('state', task.state);
                params.set('postal_code', `${task.zip_prefix}*`);
                
                let stats: WorkerStats = { valid: 0, invalid: 0, duplicate: 0, prov: { imported: 0, updated: 0, skipped: 0 }, api_calls: 1, rate_limit_hits: 0, prefix: task.zip_prefix };
                
                // First query to get results
                const firstPage = await fetchNPPESPage(params, stats);
                if (firstPage.error) throw new Error(firstPage.error);
                
                let allResults = [...firstPage.results];
                let currentCount = firstPage.count;
                let skip = apiBatchSize;
                let needSplit = false;
                const maxSkip = config.max_skip || 1000;

                if (currentCount === apiBatchSize) {
                    while (currentCount === apiBatchSize && skip <= maxSkip) {
                        if ((Date.now() - execStartTime) >= MAX_EXEC_MS - 2000) {
                            throw new Error('Task pagination timed out, will retry');
                        }
                        params.set('skip', String(skip));
                        const page = await fetchNPPESPage(params, stats);
                        stats.api_calls++;
                        if (page.error || page.results.length === 0) break;
                        allResults.push(...page.results);
                        currentCount = page.count;
                        skip += apiBatchSize;
                    }
                    if (currentCount === apiBatchSize && skip > maxSkip && task.zip_prefix.length < 9) {
                        needSplit = true;
                    }
                }
                
                if (needSplit) {
                    // Split task: Create 10 sub-tasks and complete current
                    const subTasks = [];
                    for(let i=0; i<=9; i++) {
                        subTasks.push({ batch_id: task.batch_id, state: task.state, zip_prefix: `${task.zip_prefix}${i}`, status: 'pending' });
                    }
                    await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.bulkCreate(subTasks));
                    await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.update(task.id, { status: 'completed' }));
                    stats.time_ms = Date.now() - taskStartTime;
                    await updateBatchStats(base44, task.batch_id, stats);
                } else if (allResults.length > 0) {
                    const transformed = transformResults(allResults);
                    stats.valid += transformed.validRows;
                    stats.invalid += transformed.invalidRows;
                    
                    if (!dry_run) {
                        // Sequential processing to reduce rate limiting on the Base44 DB
                        const provRes = await upsertProviders(transformed.providers, base44);
                        const locRes = await upsertLocations(transformed.locations, base44);
                        const taxRes = await upsertTaxonomies(transformed.taxonomies, base44);
                        stats.prov = { imported: provRes.imported, updated: provRes.updated, skipped: provRes.skipped };
                    }
                    
                    await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.update(task.id, { status: 'completed' }));
                    stats.time_ms = Date.now() - taskStartTime;
                    await updateBatchStats(base44, task.batch_id, stats);
                } else {
                    // Zero results
                    await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.update(task.id, { status: 'completed' }));
                    stats.time_ms = Date.now() - taskStartTime;
                    await updateBatchStats(base44, task.batch_id, stats);
                }
                tasksProcessed++;
                consecutiveErrors = 0; // Reset error counter on success
                
                // Dynamic Delay: if we hit rate limits, slow down this worker significantly
                if (stats.shouldSlowDown) {
                     await sleep(config.retry_backoff_ms || 5000);
                } else {
                     await sleep(apiDelayMs);
                }
                
            } catch (e) {
                consecutiveErrors++;
                const newRetryCount = (task.retry_count || 0) + 1;
                const newStatus = newRetryCount >= 3 ? 'failed' : 'pending';
                await withRetry(() => base44.asServiceRole.entities.NPPESQueueItem.update(task.id, { status: newStatus, error_message: e.message, retry_count: newRetryCount }));
                // If we're failing repeatedly, break the loop early to let the worker die/backoff
                if (consecutiveErrors >= 3) {
                     console.warn(`Worker hit 3 consecutive errors, backing off. Last error: ${e.message}`);
                     
                     // Create an alert for sustained high error rates
                     await withRetry(() => base44.asServiceRole.entities.DataQualityAlert.create({
                        alert_type: 'new_issue_detected',
                        severity: 'high',
                        title: 'Sustained Crawler Error Rate',
                        description: `Worker hit ${consecutiveErrors} consecutive errors on state ${task.state}. Last error: ${e.message}`,
                        status: 'new',
                        action_required: true
                     }));

                     break; 
                }
                await sleep(consecutiveErrors * 2000); // Backoff before picking up next task
            }
        }
        
        // Intelligent Re-invocation based on performance and queue depth
        const remainingQueueSize = await base44.asServiceRole.entities.NPPESQueueItem.filter({ status: 'pending' }, undefined, 100).then(r => r.length).catch(() => 0);
        
        console.log(`[Crawler Worker] Cycle complete. Processed: ${tasksProcessed}, Consecutive Errors: ${consecutiveErrors}, Queue Depth: ${remainingQueueSize}`);

        if (remainingQueueSize > 0) {
            // Determine if we should spawn another worker to help, or just re-invoke self
            // If the queue is large and we didn't have many errors, spawn an extra helper (up to a reasonable limit)
            const activeWorkersCount = await base44.asServiceRole.entities.NPPESQueueItem.filter({ status: 'processing' }, undefined, 100).then(res => res.length).catch(() => 0);
            
            // Re-invoke self
            console.log(`[Crawler Worker] Re-invoking self...`);
            base44.asServiceRole.functions.invoke('nppesCrawler', { action: 'process_queue', dry_run }).catch(e => console.error("Self-invoke error:", e));

            // Dynamically scale up if queue is large, we are healthy, and under worker cap
            const targetWorkers = Math.min(Math.ceil(remainingQueueSize / 5), 3);
            if (consecutiveErrors === 0 && activeWorkersCount < targetWorkers) {
                 console.log(`[Crawler Worker] Queue depth triggers scale up. Spawning new worker (Active: ${activeWorkersCount}, Target: ${targetWorkers})`);
                 base44.asServiceRole.functions.invoke('nppesCrawler', { action: 'process_queue', dry_run }).catch(()=>{});
            } else if (consecutiveErrors > 2 && activeWorkersCount > 2) {
                 console.warn(`[Crawler Worker] High error rate. Will rely on fewer workers to avoid overwhelming the API.`);
            }
        }
        
        return Response.json({ success: true, processed: tasksProcessed, message: 'Time limit reached, re-invoked' });
    }
    
    return Response.json({ error: 'Unknown action' }, { status: 400 });
    } catch (err) {
        console.error("Crawler crash:", err);
        return Response.json({ error: err.message }, { status: 500 });
    }
});