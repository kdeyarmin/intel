import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
    'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

const NPPES_API_BASE = 'https://npiregistry.cms.hhs.gov/api/?version=2.1';

// Defaults — overridden by NPPESCrawlerConfig entity at runtime
let BATCH_LIMIT = 200;
let MAX_SKIP = 1000;
let MAX_PAGES_PER_QUERY = 6;
let BULK_SIZE = 50;
let API_DELAY_MS = 80;
let MAX_RETRIES = 3;
let RETRY_BACKOFF_MS = 2000;
let REQUEST_TIMEOUT_MS = 15000;
let CRAWL_ENTITY_TYPES = ['NPI-1', 'NPI-2'];
// Hard ceiling: respond before platform kills us (platform limit ~60s)
const MAX_EXEC_MS = 50000;
const WRITE_CONCURRENCY = 5;
// Reserve time for the write phase — stop fetching when this much time remains
const WRITE_RESERVE_MS = 25000;

let execStartTime = Date.now();

function timeLeft() { return MAX_EXEC_MS - (Date.now() - execStartTime); }
function isTimeUp() { return timeLeft() < 3000; } // 3s safety buffer
function isFetchTimeUp() { return timeLeft() < WRITE_RESERVE_MS; } // stop fetching, save time for writes

async function loadConfig(base44) {
    try {
        const configs = await base44.asServiceRole.entities.NPPESCrawlerConfig.filter({ config_key: 'default' });
        if (configs.length > 0) {
            const c = configs[0];
            BATCH_LIMIT = c.api_batch_size || 200;
            BULK_SIZE = c.import_chunk_size || 50;
            MAX_RETRIES = c.max_retries || 3;
            API_DELAY_MS = c.api_delay_ms ?? 80;
            RETRY_BACKOFF_MS = c.retry_backoff_ms || 2000;
            REQUEST_TIMEOUT_MS = Math.min(c.request_timeout_ms || 10000, 10000);
            CRAWL_ENTITY_TYPES = (c.crawl_entity_types && c.crawl_entity_types.length > 0) ? c.crawl_entity_types : ['NPI-1', 'NPI-2'];
            MAX_PAGES_PER_QUERY = Math.floor(MAX_SKIP / BATCH_LIMIT) + 1;
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

async function fetchNPPESPage(params) {
    const apiUrl = `${NPPES_API_BASE}&${params.toString()}`;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        if (isTimeUp()) return { error: 'time_up', results: [], result_count: 0 };
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
            const response = await fetch(apiUrl, { signal: controller.signal });
            clearTimeout(timeout);
            if (response.status === 429 || response.status >= 500) {
                const backoff = attempt * RETRY_BACKOFF_MS;
                await new Promise(r => setTimeout(r, Math.min(backoff, 3000)));
                continue;
            }
            if (!response.ok) return { error: `HTTP ${response.status}`, results: [] };
            const data = await response.json();
            if (data.Errors && data.Errors.length > 0) {
                return { error: data.Errors.map(e => e.description).join('; '), results: [], noResults: true };
            }
            return { results: data.results || [], result_count: data.result_count || 0, error: null };
        } catch (e) {
            if (attempt === MAX_RETRIES) return { error: e.message, results: [] };
            await new Promise(r => setTimeout(r, attempt * 1000));
        }
    }
    return { error: 'Max retries', results: [] };
}

async function fetchAllPages(baseParams) {
    const allResults = [];
    let skip = 0;
    let hitLimit = false;
    for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
        if (isFetchTimeUp()) break;
        baseParams.set('skip', String(skip));
        const data = await fetchNPPESPage(baseParams);
        if (data.error) break;
        if (data.results.length === 0) break;
        allResults.push(...data.results);
        if (data.results.length < BATCH_LIMIT) break;
        skip += BATCH_LIMIT;
        if (skip > MAX_SKIP) { hitLimit = true; break; }
        await new Promise(r => setTimeout(r, 80));
    }
    return { results: allResults, hitLimit };
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
                const backoff = attempt * 2000 + Math.random() * 1000;
                console.warn(`[Retry] Rate limited, waiting ${Math.round(backoff)}ms (attempt ${attempt}/${maxRetries})`);
                await sleep(backoff);
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
    // Process lookups sequentially in small batches to avoid rate limits
    for (let i = 0; i < npis.length; i += 3) {
        if (isTimeUp()) break;
        const batch = npis.slice(i, i + 3);
        await Promise.all(batch.map(async (npi) => {
            try {
                const found = await withRetry(() => base44.asServiceRole.entities[entity].filter({ npi }));
                if (found.length > 0) resultMap[npi] = found;
            } catch (e) { /* ignore after retries */ }
        }));
        if (i + 3 < npis.length) await sleep(150);
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
    const FIELDS = ['first_name','last_name','organization_name','credential','gender','status','entity_type','enumeration_date','last_update_date'];
    let imported = 0, updated = 0, skipped = 0;
    // Use smaller chunks to reduce per-chunk lookup pressure
    const chunkSize = Math.min(BULK_SIZE, 20);
    for (let i = 0; i < records.length; i += chunkSize) {
        if (isTimeUp()) break;
        const chunk = records.slice(i, i + chunkSize);
        const npis = [...new Set(chunk.map(p => p.npi))];
        const existingMap = await batchLookupByNPI('Provider', npis, base44);
        const toCreate = [], updateTasks = [];
        for (const p of chunk) {
            const ex = existingMap[p.npi]?.[0];
            if (!ex) { toCreate.push(p); }
            else if (isIdentical(p, ex, FIELDS)) { skipped++; }
            else if (isNewer(p, ex) || isMoreComplete(p, ex, FIELDS)) {
                const merged = { ...p };
                for (const f of FIELDS) { if (!merged[f] && ex[f]) merged[f] = ex[f]; }
                merged.needs_nppes_enrichment = false;
                updateTasks.push(async () => {
                    try { await withRetry(() => base44.asServiceRole.entities.Provider.update(ex.id, merged)); } catch (e) {}
                });
            } else { skipped++; }
        }
        if (updateTasks.length > 0) { await runConcurrent(updateTasks, 2); updated += updateTasks.length; }
        if (toCreate.length > 0) {
            try {
                await withRetry(() => base44.asServiceRole.entities.Provider.bulkCreate(toCreate));
                imported += toCreate.length;
            } catch (e) {
                // Fallback: create one by one with delays
                for (const p of toCreate) {
                    if (isTimeUp()) break;
                    try { await withRetry(() => base44.asServiceRole.entities.Provider.create(p)); imported++; } catch (err) {}
                    await sleep(100);
                }
            }
        }
        // Throttle between chunks
        await sleep(300);
    }
    return { imported, updated, skipped };
}

async function upsertLocations(records, base44) {
    const FIELDS = ['address_1','address_2','city','state','zip','phone','fax'];
    let imported = 0, updated = 0, skipped = 0;
    const chunkSize = Math.min(BULK_SIZE, 20);
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
        await sleep(300);
    }
    return { imported, updated, skipped };
}

async function upsertTaxonomies(records, base44) {
    const FIELDS = ['taxonomy_description','primary_flag','license_number','state'];
    let imported = 0, updated = 0, skipped = 0;
    const chunkSize = Math.min(BULK_SIZE, 20);
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
        await sleep(300);
    }
    return { imported, updated, skipped };
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

        let auditEmail = 'system@service';
        try {
            const user = await base44.auth.me();
            if (user) {
                auditEmail = user.email || auditEmail;
                const isService = (user.email || '').includes('service+') || (user.email || '').includes('@no-reply.base44.com');
                if (!isService && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
            }
        } catch (e) { /* service call */ }

        const payload = await req.json();
        const { action = 'start', taxonomy_description = '', entity_type = '', dry_run = false, target_state = '', phase = 'fetch', ignore_history = false } = payload;

        // Normalize 'process_next' to 'start'
        const effectiveAction = (action === 'process_next') ? 'start' : action;

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

        // Determine state
        let stateToProcess = target_state;
        if (!stateToProcess) {
            if (ignore_history) {
                // If ignoring history, just pick the first state or rotate?
                // Actually, ignore_history usually implies we want to restart from scratch.
                // But blindly picking first state might restart AL every time.
                // A better approach for "process all again" is needed.
                // For now, if ignore_history is true, we simply DONT check doneStates.
                // But we still need to pick ONE state.
                // Let's assume the caller will likely call this in a loop or we just pick the first one 
                // that ISNT currently processing (to avoid double processing).
                
                // Actually, let's just pick the first state in US_STATES if we're ignoring history
                // AND we rely on the fact that this script runs one state at a time.
                // BUT if we want to "Process Next" ignoring history, we need to know what was processed "recently" in THIS run.
                // That requires state tracking.
                // Simple fallback: If ignore_history, we pick the state that hasn't been run *in the last 24 hours*?
                // Or: we just rely on `target_state` being passed by the caller (batch processor) when forcing re-crawl.
                
                // If `ignore_history` is true but no target_state, we default to the first state that isn't CURRENTLY running.
                const runningBatches = await base44.asServiceRole.entities.ImportBatch.filter({ status: 'processing' });
                const runningStates = new Set(runningBatches.map(b => b.file_name?.split('_')[1]).filter(s => s));
                stateToProcess = US_STATES.find(s => !runningStates.has(s));
            } else {
                const crawlBatches = await base44.asServiceRole.entities.ImportBatch.filter({ import_type: 'nppes_registry' }, '-created_date', 200);
                const doneStates = new Set();
                for (const b of crawlBatches.filter(b => b.file_name?.startsWith('crawler_') && !b.file_name.includes('stop_signal'))) {
                    const st = b.file_name.split('_')[1];
                    if (st && st.length <= 2 && US_STATES.includes(st)) doneStates.add(st);
                }
                stateToProcess = US_STATES.find(s => !doneStates.has(s));
            }
        }

        if (!stateToProcess) return Response.json({ success: true, message: 'All states processed!', done: true });

        const zipPrefixes = STATE_ZIP_PREFIXES[stateToProcess] || [];
        if (zipPrefixes.length === 0) return Response.json({ error: `No zip prefixes for ${stateToProcess}` }, { status: 400 });

        console.log(`[Crawler] State=${stateToProcess}, phase=${phase}, taxonomy=${taxonomy_description || 'all'}`);

        // ---- FETCH PHASE ----
        // Fetch as much data as we can within our time budget, then return with what we got.
        // The auto-chain caller will invoke the write phase separately if needed.

        const batch = await base44.asServiceRole.entities.ImportBatch.create({
            import_type: 'nppes_registry',
            file_name: `crawler_${stateToProcess}_${taxonomy_description || 'all'}_${Date.now()}`,
            file_url: `NPPES API crawler - ${stateToProcess}`,
            status: 'validating',
            dry_run,
        });

        try {
            const enumTypes = entity_type ? [entity_type] : CRAWL_ENTITY_TYPES;
            let allResults = [];
            const seenNPIs = new Set();

            function addUnique(results) {
                for (const r of results) {
                    const npi = String(r.number || '');
                    if (npi && !seenNPIs.has(npi)) { seenNPIs.add(npi); allResults.push(r); }
                }
            }

            let fetchComplete = true;

            for (const enumType of enumTypes) {
                if (isFetchTimeUp()) { fetchComplete = false; break; }
                const typeLabel = enumType === 'NPI-1' ? 'Individual' : 'Organization';
                console.log(`[${stateToProcess}] ${typeLabel}: ${zipPrefixes.length} zip prefixes`);

                for (const zipPrefix of zipPrefixes) {
                    if (isFetchTimeUp()) { fetchComplete = false; break; }

                    const params = new URLSearchParams();
                    params.set('version', '2.1');
                    params.set('limit', String(BATCH_LIMIT));
                    params.set('state', stateToProcess);
                    params.set('enumeration_type', enumType);
                    params.set('postal_code', `${zipPrefix}*`);
                    if (taxonomy_description) params.set('taxonomy_description', taxonomy_description);

                    const { results, hitLimit } = await fetchAllPages(params);
                    addUnique(results);

                    // Expand to 3-digit if we hit the limit
                    if (hitLimit && !isFetchTimeUp()) {
                        for (let d = 0; d <= 9 && !isFetchTimeUp(); d++) {
                            const zip3 = `${zipPrefix}${d}`;
                            const subParams = new URLSearchParams();
                            subParams.set('version', '2.1'); subParams.set('limit', String(BATCH_LIMIT));
                            subParams.set('state', stateToProcess); subParams.set('enumeration_type', enumType);
                            subParams.set('postal_code', `${zip3}*`);
                            if (taxonomy_description) subParams.set('taxonomy_description', taxonomy_description);
                            const subResult = await fetchAllPages(subParams);
                            addUnique(subResult.results);
                            if (subResult.hitLimit && !isFetchTimeUp()) {
                                for (let d2 = 0; d2 <= 9 && !isFetchTimeUp(); d2++) {
                                    const zip4 = `${zip3}${d2}`;
                                    const deepParams = new URLSearchParams();
                                    deepParams.set('version', '2.1'); deepParams.set('limit', String(BATCH_LIMIT));
                                    deepParams.set('state', stateToProcess); deepParams.set('enumeration_type', enumType);
                                    deepParams.set('postal_code', `${zip4}*`);
                                    if (taxonomy_description) deepParams.set('taxonomy_description', taxonomy_description);
                                    const deepResult = await fetchAllPages(deepParams);
                                    addUnique(deepResult.results);
                                    await new Promise(r => setTimeout(r, 30));
                                }
                            }
                            await new Promise(r => setTimeout(r, 30));
                        }
                    }
                    await new Promise(r => setTimeout(r, API_DELAY_MS));
                }
            }

            console.log(`[${stateToProcess}] Fetched ${allResults.length} unique NPIs (complete=${fetchComplete})`);

            // Transform
            const { providers, locations, taxonomies, validRows, invalidRows, duplicateRows, errors } = transformResults(allResults);

            await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                status: dry_run ? 'completed' : 'processing',
                total_rows: allResults.length, valid_rows: validRows, invalid_rows: invalidRows,
                duplicate_rows: duplicateRows, error_samples: errors,
            });

            // ---- WRITE PHASE (only if time remains and not dry run) ----
            let provResult = { imported: 0, updated: 0, skipped: 0 };
            let locResult = { imported: 0, updated: 0, skipped: 0 };
            let taxResult = { imported: 0, updated: 0, skipped: 0 };
            let writeComplete = false;

            if (!dry_run && providers.length > 0 && !isTimeUp()) {
                console.log(`[${stateToProcess}] Writing: ${providers.length} providers, ${locations.length} locations, ${taxonomies.length} taxonomies`);

                // Write providers first (most important), then locations and taxonomies if time permits
                provResult = await upsertProviders(providers, base44);
                if (!isTimeUp()) locResult = await upsertLocations(locations, base44);
                if (!isTimeUp()) taxResult = await upsertTaxonomies(taxonomies, base44);

                writeComplete = !isTimeUp();

                console.log(`[${stateToProcess}] Write ${writeComplete ? 'complete' : 'PARTIAL'}: P(${provResult.imported}c/${provResult.updated}u/${provResult.skipped}s) L(${locResult.imported}c) T(${taxResult.imported}c)`);
            }

            // Only mark as completed if we actually wrote data (or it was a dry run or there was nothing to write)
            const didWrite = provResult.imported > 0 || provResult.updated > 0;
            const nothingToWrite = providers.length === 0;
            const finalStatus = dry_run || nothingToWrite || didWrite ? 'completed' : 'failed';

            await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                status: finalStatus,
                imported_rows: provResult.imported,
                updated_rows: provResult.updated + locResult.updated + taxResult.updated,
                skipped_rows: provResult.skipped + locResult.skipped + taxResult.skipped,
                dedup_summary: {
                    providers: { created: provResult.imported, updated: provResult.updated, skipped: provResult.skipped },
                    locations: { created: locResult.imported, updated: locResult.updated, skipped: locResult.skipped },
                    taxonomies: { created: taxResult.imported, updated: taxResult.updated, skipped: taxResult.skipped },
                    fetch_complete: fetchComplete, write_complete: writeComplete,
                },
                completed_at: new Date().toISOString(),
            });

            // Determine next state
            const crawlBatches2 = await base44.asServiceRole.entities.ImportBatch.filter({ import_type: 'nppes_registry' }, '-created_date', 200);
            const doneStates2 = new Set();
            for (const b of crawlBatches2.filter(b => b.file_name?.startsWith('crawler_') && !b.file_name.includes('stop_signal'))) {
                const st = b.file_name.split('_')[1];
                if (st && st.length <= 2 && US_STATES.includes(st) && (b.status === 'completed' || b.status === 'failed')) doneStates2.add(st);
            }
            const nextState = US_STATES.find(s => !doneStates2.has(s));

            return Response.json({
                success: true, state: stateToProcess, done: !nextState, next_state: nextState || null,
                batch_id: batch.id, total_fetched: allResults.length, valid_rows: validRows,
                invalid_rows: invalidRows, duplicate_rows: duplicateRows, fetch_complete: fetchComplete,
                write_complete: writeComplete,
                imported_providers: provResult.imported, updated_providers: provResult.updated, skipped_providers: provResult.skipped,
                imported_locations: locResult.imported, imported_taxonomies: taxResult.imported,
                dry_run, elapsed_ms: Date.now() - execStartTime,
            });

        } catch (error) {
            console.error(`[${stateToProcess}] Error:`, error.message);
            await base44.asServiceRole.entities.ImportBatch.update(batch.id, { status: 'failed', error_samples: [{ message: error.message }] });

            try {
                await base44.asServiceRole.entities.ErrorReport.create({
                    error_type: 'import_failure', severity: 'high', source: batch.id,
                    title: `NPPES Crawler Failed - ${stateToProcess}`,
                    description: `${stateToProcess}: ${error.message}`,
                    error_samples: [{ message: error.message }],
                    context: { state: stateToProcess, taxonomy_description, batch_id: batch.id },
                    status: 'new',
                });
            } catch (e) {}

            const crawlBatches3 = await base44.asServiceRole.entities.ImportBatch.filter({ import_type: 'nppes_registry' }, '-created_date', 200);
            const doneStates3 = new Set();
            for (const b of crawlBatches3.filter(b => b.file_name?.startsWith('crawler_') && !b.file_name.includes('stop_signal'))) {
                const st = b.file_name.split('_')[1];
                if (st && st.length <= 2 && US_STATES.includes(st) && (b.status === 'completed' || b.status === 'failed')) doneStates3.add(st);
            }
            const nextState = US_STATES.find(s => !doneStates3.has(s));

            return Response.json({
                success: false, state: stateToProcess, error: error.message,
                done: !nextState, next_state: nextState || null, batch_id: batch.id,
                elapsed_ms: Date.now() - execStartTime,
            });
        }

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});