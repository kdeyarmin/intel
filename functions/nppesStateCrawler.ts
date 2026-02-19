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
let MAX_CRAWL_MS = 55000;
// Write concurrency: how many bulk create/update operations to run in parallel
const WRITE_CONCURRENCY = 5;

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
            REQUEST_TIMEOUT_MS = c.request_timeout_ms || 15000;
            CRAWL_ENTITY_TYPES = (c.crawl_entity_types && c.crawl_entity_types.length > 0) ? c.crawl_entity_types : ['NPI-1', 'NPI-2'];
            MAX_CRAWL_MS = Math.min((c.max_crawl_duration_sec || 55) * 1000, 55000);
            MAX_PAGES_PER_QUERY = Math.floor(MAX_SKIP / BATCH_LIMIT) + 1;
            console.log(`[Config] Loaded: batch=${BATCH_LIMIT}, bulk=${BULK_SIZE}, retries=${MAX_RETRIES}, delay=${API_DELAY_MS}ms, timeout=${REQUEST_TIMEOUT_MS}ms, types=${CRAWL_ENTITY_TYPES.join(',')}, maxDuration=${MAX_CRAWL_MS/1000}s`);
        } else {
            console.log('[Config] No custom config found, using defaults');
        }
    } catch (e) {
        console.warn('[Config] Failed to load config, using defaults:', e.message);
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

async function fetchNPPESPage(params, retries = MAX_RETRIES) {
    const apiUrl = `${NPPES_API_BASE}&${params.toString()}`;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
            const response = await fetch(apiUrl, { signal: controller.signal });
            clearTimeout(timeout);

            if (response.status === 429 || response.status >= 500) {
                const backoff = attempt * RETRY_BACKOFF_MS;
                console.log(`[NPPES] HTTP ${response.status}, retry ${attempt}/${retries} in ${backoff}ms`);
                await new Promise(r => setTimeout(r, backoff));
                continue;
            }
            if (!response.ok) {
                return { error: `HTTP ${response.status} ${response.statusText}`, results: [] };
            }
            const data = await response.json();
            if (data.Errors && data.Errors.length > 0) {
                const errMsg = data.Errors.map(e => e.description).join('; ');
                return { error: errMsg, results: [], result_count: 0, noResults: true };
            }
            return { results: data.results || [], result_count: data.result_count || 0, error: null };
        } catch (e) {
            if (e.name === 'AbortError') {
                if (attempt === retries) return { error: 'Request timeout', results: [], result_count: 0 };
                await new Promise(r => setTimeout(r, attempt * 1000));
                continue;
            }
            if (attempt === retries) return { error: e.message, results: [], result_count: 0 };
            await new Promise(r => setTimeout(r, attempt * 1500));
        }
    }
    return { error: 'Max retries exceeded', results: [], result_count: 0 };
}

async function fetchAllPages(baseParams, stateCode) {
    const allResults = [];
    let skip = 0;
    let hitLimit = false;

    for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
        baseParams.set('skip', String(skip));
        const data = await fetchNPPESPage(baseParams);
        if (data.error) break;
        if (data.results.length === 0) break;
        allResults.push(...data.results);
        if (data.results.length < BATCH_LIMIT) break;
        skip += BATCH_LIMIT;
        if (skip > MAX_SKIP) { hitLimit = true; break; }
        await new Promise(r => setTimeout(r, 100));
    }
    return { results: allResults, hitLimit };
}

// ---- OPTIMIZED WRITE HELPERS ----

// Run promises in batches of N concurrency
async function runConcurrent(tasks, concurrency) {
    const results = [];
    for (let i = 0; i < tasks.length; i += concurrency) {
        const batch = tasks.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(fn => fn()));
        results.push(...batchResults);
    }
    return results;
}

// Batch-lookup existing records for a set of NPIs using a single filter call per chunk
// Returns Map<npi, record[]>
async function batchLookupByNPI(entity, npis, base44) {
    const resultMap = {};
    // Query all at once — the filter will return matches for any NPI in the list
    // We need to query in chunks because filters only match one value at a time
    // Optimization: do parallel lookups in groups of WRITE_CONCURRENCY
    const lookupTasks = npis.map(npi => async () => {
        try {
            const found = await base44.asServiceRole.entities[entity].filter({ npi });
            if (found.length > 0) resultMap[npi] = found;
        } catch (e) { /* ignore */ }
    });
    await runConcurrent(lookupTasks, WRITE_CONCURRENCY);
    return resultMap;
}

function isMoreComplete(incoming, existing, fields) {
    let incomingFilled = 0, existingFilled = 0;
    for (const f of fields) {
        if (incoming[f] && String(incoming[f]).trim()) incomingFilled++;
        if (existing[f] && String(existing[f]).trim()) existingFilled++;
    }
    return incomingFilled > existingFilled;
}

function isNewer(incoming, existing) {
    const inDate = incoming.last_update_date || incoming.enumeration_date || '';
    const exDate = existing.last_update_date || existing.enumeration_date || '';
    if (!inDate) return false;
    if (!exDate) return true;
    return inDate > exDate;
}

function isIdentical(incoming, existing, fields) {
    for (const f of fields) {
        const a = (incoming[f] ?? '').toString().trim();
        const b = (existing[f] ?? '').toString().trim();
        if (a !== b) return false;
    }
    return true;
}

async function upsertProviders(providerRecords, base44) {
    const PROVIDER_KEY_FIELDS = ['first_name','last_name','organization_name','credential','gender','status','entity_type','enumeration_date','last_update_date'];
    let imported = 0, updated = 0, skipped = 0;

    for (let i = 0; i < providerRecords.length; i += BULK_SIZE) {
        const chunk = providerRecords.slice(i, i + BULK_SIZE);
        const npisInChunk = [...new Set(chunk.map(p => p.npi))];

        // Parallel batch lookup
        const existingMap = await batchLookupByNPI('Provider', npisInChunk, base44);

        const toCreate = [];
        const updateTasks = [];

        for (const p of chunk) {
            const existingArr = existingMap[p.npi];
            const existing = existingArr ? existingArr[0] : null;
            if (!existing) {
                toCreate.push(p);
            } else if (isIdentical(p, existing, PROVIDER_KEY_FIELDS)) {
                skipped++;
            } else if (isNewer(p, existing) || isMoreComplete(p, existing, PROVIDER_KEY_FIELDS)) {
                const merged = { ...p };
                for (const f of PROVIDER_KEY_FIELDS) { if (!merged[f] && existing[f]) merged[f] = existing[f]; }
                merged.needs_nppes_enrichment = false;
                updateTasks.push(async () => {
                    try { await base44.asServiceRole.entities.Provider.update(existing.id, merged); } catch (e) {
                        console.error(`Failed to update provider ${p.npi}:`, e.message);
                    }
                });
            } else {
                skipped++;
            }
        }

        // Run updates in parallel
        if (updateTasks.length > 0) {
            await runConcurrent(updateTasks, WRITE_CONCURRENCY);
            updated += updateTasks.length;
        }

        // Bulk create new records
        if (toCreate.length > 0) {
            try {
                await base44.asServiceRole.entities.Provider.bulkCreate(toCreate);
                imported += toCreate.length;
            } catch (e) {
                // Fallback: parallel individual creates
                const createTasks = toCreate.map(p => async () => {
                    try { await base44.asServiceRole.entities.Provider.create(p); imported++; } catch (err) {
                        console.error(`Failed to create provider ${p.npi}:`, err.message);
                    }
                });
                await runConcurrent(createTasks, WRITE_CONCURRENCY);
            }
        }

        if (i > 0 && i % 500 === 0) console.log(`[Providers] Progress: ${i}/${providerRecords.length}`);
    }
    return { imported, updated, skipped };
}

async function upsertLocations(locationRecords, base44) {
    const LOC_COMPARE_FIELDS = ['address_1','address_2','city','state','zip','phone','fax'];
    let imported = 0, updated = 0, skipped = 0;

    for (let i = 0; i < locationRecords.length; i += BULK_SIZE) {
        const chunk = locationRecords.slice(i, i + BULK_SIZE);
        const npiSet = [...new Set(chunk.map(l => l.npi))];
        const existingLocMap = await batchLookupByNPI('ProviderLocation', npiSet, base44);

        const toCreate = [];
        const updateTasks = [];

        for (const loc of chunk) {
            const existingLocs = existingLocMap[loc.npi] || [];
            const match = existingLocs.find(ex =>
                ex.location_type === loc.location_type &&
                (ex.address_1 || '').trim().toLowerCase() === (loc.address_1 || '').trim().toLowerCase() &&
                (ex.zip || '').substring(0, 5) === (loc.zip || '').substring(0, 5)
            );

            if (!match) {
                toCreate.push(loc);
            } else if (isIdentical(loc, match, LOC_COMPARE_FIELDS)) {
                skipped++;
            } else {
                const merged = { ...loc };
                for (const f of LOC_COMPARE_FIELDS) { if (!merged[f] && match[f]) merged[f] = match[f]; }
                updateTasks.push(async () => {
                    try { await base44.asServiceRole.entities.ProviderLocation.update(match.id, merged); } catch (e) {
                        console.error(`Failed to update location for ${loc.npi}:`, e.message);
                    }
                });
            }
        }

        if (updateTasks.length > 0) {
            await runConcurrent(updateTasks, WRITE_CONCURRENCY);
            updated += updateTasks.length;
        }

        if (toCreate.length > 0) {
            try {
                await base44.asServiceRole.entities.ProviderLocation.bulkCreate(toCreate);
                imported += toCreate.length;
            } catch (e) {
                const createTasks = toCreate.map(loc => async () => {
                    try { await base44.asServiceRole.entities.ProviderLocation.create(loc); imported++; } catch (err) {}
                });
                await runConcurrent(createTasks, WRITE_CONCURRENCY);
            }
        }
    }
    return { imported, updated, skipped };
}

async function upsertTaxonomies(taxonomyRecords, base44) {
    const TAX_COMPARE_FIELDS = ['taxonomy_description','primary_flag','license_number','state'];
    let imported = 0, updated = 0, skipped = 0;

    for (let i = 0; i < taxonomyRecords.length; i += BULK_SIZE) {
        const chunk = taxonomyRecords.slice(i, i + BULK_SIZE);
        const npiSet = [...new Set(chunk.map(t => t.npi))];
        const existingTaxMap = await batchLookupByNPI('ProviderTaxonomy', npiSet, base44);

        const toCreate = [];
        const updateTasks = [];

        for (const tax of chunk) {
            const existingTaxes = existingTaxMap[tax.npi] || [];
            const match = existingTaxes.find(ex =>
                (ex.taxonomy_code || '').trim() === (tax.taxonomy_code || '').trim()
            );

            if (!match) {
                toCreate.push(tax);
            } else if (isIdentical(tax, match, TAX_COMPARE_FIELDS)) {
                skipped++;
            } else {
                const merged = { ...tax };
                for (const f of TAX_COMPARE_FIELDS) { if (!merged[f] && match[f]) merged[f] = match[f]; }
                updateTasks.push(async () => {
                    try { await base44.asServiceRole.entities.ProviderTaxonomy.update(match.id, merged); } catch (e) {
                        console.error(`Failed to update taxonomy for ${tax.npi}:`, e.message);
                    }
                });
            }
        }

        if (updateTasks.length > 0) {
            await runConcurrent(updateTasks, WRITE_CONCURRENCY);
            updated += updateTasks.length;
        }

        if (toCreate.length > 0) {
            try {
                await base44.asServiceRole.entities.ProviderTaxonomy.bulkCreate(toCreate);
                imported += toCreate.length;
            } catch (e) {
                const createTasks = toCreate.map(tax => async () => {
                    try { await base44.asServiceRole.entities.ProviderTaxonomy.create(tax); imported++; } catch (err) {}
                });
                await runConcurrent(createTasks, WRITE_CONCURRENCY);
            }
        }
    }
    return { imported, updated, skipped };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        await loadConfig(base44);

        let auditEmail = 'system@service';
        try {
            const user = await base44.auth.me();
            if (user) {
                auditEmail = user.email || auditEmail;
                const isServiceAccount = (user.email || '').includes('service+') || (user.email || '').includes('@no-reply.base44.com');
                if (!isServiceAccount && user.role !== 'admin') {
                    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
                }
            }
        } catch (e) {
            console.log('[StateCrawler] auth.me() failed — treating as service/internal call');
        }

        const payload = await req.json();
        const {
            action = 'start',
            taxonomy_description = '',
            entity_type = '',
            dry_run = false,
            target_state = '',
        } = payload;

        // Normalize action: 'process_next' is equivalent to 'start'
        const effectiveAction = (action === 'process_next') ? 'start' : action;

        // STATUS
        if (effectiveAction === 'status') {
            const crawlBatches = await base44.asServiceRole.entities.ImportBatch.filter(
                { import_type: 'nppes_registry' }, '-created_date', 200
            );
            const crawlerBatches = crawlBatches.filter(b => b.file_name && b.file_name.startsWith('crawler_'));
            const completedStates = [], failedStates = [], processingStates = [];
            for (const b of crawlerBatches) {
                const stateCode = b.file_name.split('_')[1];
                if (b.status === 'completed') completedStates.push(stateCode);
                else if (b.status === 'failed') failedStates.push(stateCode);
                else processingStates.push(stateCode);
            }
            const doneSet = new Set([...completedStates, ...failedStates]);
            const pendingStates = US_STATES.filter(s => !doneSet.has(s));
            return Response.json({
                total_states: US_STATES.length,
                completed: completedStates.length, failed: failedStates.length,
                processing: processingStates.length, pending: pendingStates.length,
                completed_states: completedStates, failed_states: failedStates,
                processing_states: processingStates, pending_states: pendingStates,
                batches: crawlerBatches.slice(0, 60),
            });
        }

        // Determine state
        let stateToProcess = target_state;
        if (!stateToProcess) {
            const crawlBatches = await base44.asServiceRole.entities.ImportBatch.filter(
                { import_type: 'nppes_registry' }, '-created_date', 200
            );
            const doneStates = new Set();
            for (const b of crawlBatches.filter(b => b.file_name?.startsWith('crawler_') && !b.file_name.includes('stop_signal'))) {
                doneStates.add(b.file_name.split('_')[1]);
            }
            stateToProcess = US_STATES.find(s => !doneStates.has(s));
        }

        if (!stateToProcess) {
            return Response.json({ success: true, message: 'All states have been processed!', done: true });
        }

        console.log(`[Crawler] Processing state: ${stateToProcess}, taxonomy: ${taxonomy_description}, dry_run: ${dry_run}`);

        const batch = await base44.asServiceRole.entities.ImportBatch.create({
            import_type: 'nppes_registry',
            file_name: `crawler_${stateToProcess}_${taxonomy_description || 'all'}_${Date.now()}`,
            file_url: `NPPES API crawler - ${stateToProcess}`,
            status: 'validating',
            dry_run,
        });

        try {
            // ---- FETCH PHASE ----
            const enumTypes = entity_type ? [entity_type] : CRAWL_ENTITY_TYPES;
            let allResults = [];
            const seenNPIsInFetch = new Set();
            let queriesOverLimit = 0;

            function addUniqueResults(results) {
                for (const r of results) {
                    const npi = String(r.number || '');
                    if (npi && !seenNPIsInFetch.has(npi)) {
                        seenNPIsInFetch.add(npi);
                        allResults.push(r);
                    }
                }
            }

            const zipPrefixes = STATE_ZIP_PREFIXES[stateToProcess] || [];
            if (zipPrefixes.length === 0) {
                throw new Error(`No zip prefixes configured for state ${stateToProcess}`);
            }

            const crawlStartTime = Date.now();
            let timedOut = false;
            function checkTimeout() {
                if (Date.now() - crawlStartTime > MAX_CRAWL_MS) { timedOut = true; return true; }
                return false;
            }

            for (const enumType of enumTypes) {
                if (timedOut) break;
                const typeLabel = enumType === 'NPI-1' ? 'Individual' : 'Organization';
                console.log(`[${stateToProcess}] ${typeLabel}: crawling ${zipPrefixes.length} zip prefixes`);

                for (const zipPrefix of zipPrefixes) {
                    if (checkTimeout()) break;

                    const params = new URLSearchParams();
                    params.set('version', '2.1');
                    params.set('limit', String(BATCH_LIMIT));
                    params.set('state', stateToProcess);
                    params.set('enumeration_type', enumType);
                    params.set('postal_code', `${zipPrefix}*`);
                    if (taxonomy_description) params.set('taxonomy_description', taxonomy_description);

                    const { results, hitLimit } = await fetchAllPages(params, stateToProcess);
                    const beforeCount = allResults.length;
                    addUniqueResults(results);

                    if (hitLimit && !checkTimeout()) {
                        queriesOverLimit++;
                        console.log(`[${stateToProcess}] ${typeLabel} zip=${zipPrefix}*: HIT LIMIT (${results.length}), expanding to 3-digit`);

                        for (let d = 0; d <= 9; d++) {
                            if (checkTimeout()) break;
                            const zip3 = `${zipPrefix}${d}`;
                            const subParams = new URLSearchParams();
                            subParams.set('version', '2.1');
                            subParams.set('limit', String(BATCH_LIMIT));
                            subParams.set('state', stateToProcess);
                            subParams.set('enumeration_type', enumType);
                            subParams.set('postal_code', `${zip3}*`);
                            if (taxonomy_description) subParams.set('taxonomy_description', taxonomy_description);

                            const subResult = await fetchAllPages(subParams, stateToProcess);
                            addUniqueResults(subResult.results);

                            if (subResult.hitLimit && !checkTimeout()) {
                                console.log(`[${stateToProcess}] ${typeLabel} zip=${zip3}*: STILL AT LIMIT, expanding to 4-digit`);
                                for (let d2 = 0; d2 <= 9; d2++) {
                                    if (checkTimeout()) break;
                                    const zip4 = `${zip3}${d2}`;
                                    const deepParams = new URLSearchParams();
                                    deepParams.set('version', '2.1');
                                    deepParams.set('limit', String(BATCH_LIMIT));
                                    deepParams.set('state', stateToProcess);
                                    deepParams.set('enumeration_type', enumType);
                                    deepParams.set('postal_code', `${zip4}*`);
                                    if (taxonomy_description) deepParams.set('taxonomy_description', taxonomy_description);

                                    const deepResult = await fetchAllPages(deepParams, stateToProcess);
                                    addUniqueResults(deepResult.results);
                                    if (deepResult.hitLimit) console.warn(`[${stateToProcess}] ${typeLabel} zip=${zip4}*: STILL AT LIMIT`);
                                    await new Promise(r => setTimeout(r, 50));
                                }
                            }
                            await new Promise(r => setTimeout(r, 50));
                        }
                    }

                    const added = allResults.length - beforeCount;
                    if (added > 0) console.log(`[${stateToProcess}] ${typeLabel} zip=${zipPrefix}*: +${added} unique (total: ${allResults.length})`);

                    await base44.asServiceRole.entities.ImportBatch.update(batch.id, { total_rows: allResults.length });
                    await new Promise(r => setTimeout(r, API_DELAY_MS));
                }

                console.log(`[${stateToProcess}] ${typeLabel} zip crawl done: ${allResults.length} unique NPIs${timedOut ? ' (TIMED OUT — partial)' : ''}`);
            }

            if (timedOut) console.warn(`[${stateToProcess}] Hit time limit — saving ${allResults.length} partial records`);
            if (queriesOverLimit > 0) console.log(`[${stateToProcess}] ${queriesOverLimit} zip prefix(es) required subdivision`);
            console.log(`[${stateToProcess}] Total fetched: ${allResults.length}`);

            // ---- TRANSFORM PHASE ----
            let validRows = 0, invalidRows = 0, duplicateRows = 0;
            const seenNPIs = new Set();
            const providerRecords = [], locationRecords = [], taxonomyRecords = [], errorSamples = [];

            for (const result of allResults) {
                const npi = String(result.number || '');
                if (!npi || npi.length !== 10) {
                    invalidRows++;
                    if (errorSamples.length < 10) errorSamples.push({ npi: npi || 'missing', message: 'Invalid NPI' });
                    continue;
                }
                if (seenNPIs.has(npi)) { duplicateRows++; continue; }
                seenNPIs.add(npi);
                validRows++;

                const basic = result.basic || {};
                const isIndividual = result.enumeration_type === 'NPI-1';
                const provider = {
                    npi,
                    entity_type: isIndividual ? 'Individual' : 'Organization',
                    status: basic.status === 'A' ? 'Active' : 'Deactivated',
                    needs_nppes_enrichment: false,
                };
                if (isIndividual) {
                    provider.first_name = (basic.first_name || '').trim();
                    provider.last_name = (basic.last_name || '').trim();
                    provider.middle_name = (basic.middle_name || '').trim();
                    provider.credential = (basic.credential || '').trim();
                    provider.gender = basic.gender === 'M' ? 'M' : basic.gender === 'F' ? 'F' : '';
                } else {
                    provider.organization_name = (basic.organization_name || '').trim();
                }
                if (basic.enumeration_date) provider.enumeration_date = basic.enumeration_date;
                if (basic.last_updated) provider.last_update_date = basic.last_updated;
                providerRecords.push(provider);

                for (const addr of (result.addresses || [])) {
                    locationRecords.push({
                        npi,
                        location_type: addr.address_purpose === 'MAILING' ? 'Mailing' : 'Practice',
                        is_primary: addr.address_purpose === 'LOCATION',
                        address_1: (addr.address_1 || '').trim(),
                        address_2: (addr.address_2 || '').trim(),
                        city: (addr.city || '').trim(),
                        state: (addr.state || '').trim(),
                        zip: (addr.postal_code || '').substring(0, 10),
                        phone: (addr.telephone_number || '').trim(),
                        fax: (addr.fax_number || '').trim(),
                    });
                }

                for (const tax of (result.taxonomies || [])) {
                    taxonomyRecords.push({
                        npi,
                        taxonomy_code: (tax.code || '').trim(),
                        taxonomy_description: (tax.desc || '').trim(),
                        primary_flag: tax.primary === true,
                        license_number: (tax.license || '').trim(),
                        state: (tax.state || '').trim(),
                    });
                }
            }

            await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                status: dry_run ? 'completed' : 'processing',
                total_rows: allResults.length,
                valid_rows: validRows,
                invalid_rows: invalidRows,
                duplicate_rows: duplicateRows,
                error_samples: errorSamples,
            });

            // ---- WRITE PHASE: run all three entity types in PARALLEL ----
            let provResult = { imported: 0, updated: 0, skipped: 0 };
            let locResult = { imported: 0, updated: 0, skipped: 0 };
            let taxResult = { imported: 0, updated: 0, skipped: 0 };

            if (!dry_run && providerRecords.length > 0) {
                console.log(`[${stateToProcess}] Starting parallel write: ${providerRecords.length} providers, ${locationRecords.length} locations, ${taxonomyRecords.length} taxonomies`);

                // Run providers, locations, and taxonomies concurrently
                [provResult, locResult, taxResult] = await Promise.all([
                    upsertProviders(providerRecords, base44),
                    upsertLocations(locationRecords, base44),
                    upsertTaxonomies(taxonomyRecords, base44),
                ]);

                console.log(`[${stateToProcess}] Write complete: Prov(${provResult.imported}c/${provResult.updated}u/${provResult.skipped}s) Loc(${locResult.imported}c/${locResult.updated}u/${locResult.skipped}s) Tax(${taxResult.imported}c/${taxResult.updated}u/${taxResult.skipped}s)`);

                const dedupSummary = {
                    providers: { created: provResult.imported, updated: provResult.updated, skipped: provResult.skipped },
                    locations: { created: locResult.imported, updated: locResult.updated, skipped: locResult.skipped },
                    taxonomies: { created: taxResult.imported, updated: taxResult.updated, skipped: taxResult.skipped },
                };

                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    status: 'completed',
                    imported_rows: provResult.imported,
                    updated_rows: provResult.updated + locResult.updated + taxResult.updated,
                    skipped_rows: provResult.skipped + locResult.skipped + taxResult.skipped,
                    dedup_summary: dedupSummary,
                    completed_at: new Date().toISOString(),
                });
            } else {
                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                });
            }

            // Audit
            await base44.asServiceRole.entities.AuditEvent.create({
                event_type: 'import',
                user_email: auditEmail,
                details: {
                    action: 'NPPES State Crawler',
                    entity: 'nppes_registry',
                    state: stateToProcess,
                    row_count: validRows,
                    imported_providers: provResult.imported,
                    updated_providers: provResult.updated,
                    skipped_providers: provResult.skipped,
                    imported_locations: locResult.imported,
                    updated_locations: locResult.updated,
                    imported_taxonomies: taxResult.imported,
                    updated_taxonomies: taxResult.updated,
                    message: dry_run ? `Dry run for ${stateToProcess}` : `Import completed for ${stateToProcess}: ${provResult.imported} new, ${provResult.updated} updated, ${provResult.skipped} skipped providers`,
                },
                timestamp: new Date().toISOString(),
            });

            // Determine next state
            const crawlBatches2 = await base44.asServiceRole.entities.ImportBatch.filter({ import_type: 'nppes_registry' }, '-created_date', 200);
            const doneStates2 = new Set();
            for (const b of crawlBatches2.filter(b => b.file_name?.startsWith('crawler_'))) {
                const st = b.file_name.split('_')[1];
                if (b.status === 'completed' || b.status === 'failed') doneStates2.add(st);
            }
            const nextState = US_STATES.find(s => !doneStates2.has(s));

            return Response.json({
                success: true,
                state: stateToProcess,
                done: !nextState,
                next_state: nextState || null,
                batch_id: batch.id,
                total_fetched: allResults.length,
                valid_rows: validRows,
                invalid_rows: invalidRows,
                duplicate_rows: duplicateRows,
                imported_providers: provResult.imported,
                updated_providers: provResult.updated,
                skipped_providers: provResult.skipped,
                imported_locations: locResult.imported,
                updated_locations: locResult.updated,
                skipped_locations: locResult.skipped,
                imported_taxonomies: taxResult.imported,
                updated_taxonomies: taxResult.updated,
                skipped_taxonomies: taxResult.skipped,
                dry_run,
            });

        } catch (error) {
            console.error(`[${stateToProcess}] Import error:`, error);
            await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                status: 'failed',
                error_samples: [{ message: error.message }],
            });

            await base44.asServiceRole.entities.ErrorReport.create({
                error_type: 'import_failure',
                severity: 'high',
                source: batch.id,
                title: `NPPES Crawler Failed - ${stateToProcess}`,
                description: `State crawler failed for ${stateToProcess}: ${error.message}`,
                error_samples: [{ message: error.message }],
                context: { state: stateToProcess, taxonomy_description, batch_id: batch.id },
                status: 'new',
            });

            const doneStates3 = new Set();
            const crawlBatches3 = await base44.asServiceRole.entities.ImportBatch.filter({ import_type: 'nppes_registry' }, '-created_date', 200);
            for (const b of crawlBatches3.filter(b => b.file_name?.startsWith('crawler_'))) {
                const st = b.file_name.split('_')[1];
                if (b.status === 'completed' || b.status === 'failed') doneStates3.add(st);
            }
            const nextState = US_STATES.find(s => !doneStates3.has(s));

            return Response.json({
                success: false, state: stateToProcess, error: error.message,
                done: !nextState, next_state: nextState || null, batch_id: batch.id,
            });
        }

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});