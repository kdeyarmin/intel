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
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
let API_DELAY_MS = 80;
let MAX_RETRIES = 3;
let RETRY_BACKOFF_MS = 2000;
let REQUEST_TIMEOUT_MS = 15000;
let CRAWL_ENTITY_TYPES = ['NPI-1', 'NPI-2'];
let MAX_CRAWL_MS = 160000;

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
            MAX_CRAWL_MS = (c.max_crawl_duration_sec || 160) * 1000;
            MAX_PAGES_PER_QUERY = Math.floor(MAX_SKIP / BATCH_LIMIT) + 1;
            console.log(`[Config] Loaded: batch=${BATCH_LIMIT}, bulk=${BULK_SIZE}, retries=${MAX_RETRIES}, delay=${API_DELAY_MS}ms, timeout=${REQUEST_TIMEOUT_MS}ms, types=${CRAWL_ENTITY_TYPES.join(',')}, maxDuration=${MAX_CRAWL_MS/1000}s`);
        } else {
            console.log('[Config] No custom config found, using defaults');
        }
    } catch (e) {
        console.warn('[Config] Failed to load config, using defaults:', e.message);
    }
}

// Zip code prefix ranges per state (2-digit prefixes). NPPES requires 2+ chars for wildcard.
// Using postal_code with 2-digit wildcard (e.g. "35*") as additional criteria alongside state.
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

// Fetch a single page from NPPES API with retry logic
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
                // Don't retry "no results" style errors
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

// Fetch all results for a given set of params, paginating through skip.
// Returns { results[], hitLimit: bool } — hitLimit=true means >1200 records exist.
async function fetchAllPages(baseParams, stateCode) {
    const allResults = [];
    let skip = 0;
    let hitLimit = false;

    for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
        baseParams.set('skip', String(skip));
        const data = await fetchNPPESPage(baseParams);

        if (data.error) {
            // No results or no record type responses — just stop paginating, not a problem
            break;
        }

        if (data.results.length === 0) break;
        allResults.push(...data.results);

        if (data.results.length < BATCH_LIMIT) break;
        skip += BATCH_LIMIT;
        if (skip > MAX_SKIP) {
            // We've hit the 1200 record limit for this query — caller should subdivide
            hitLimit = true;
            break;
        }
        await new Promise(r => setTimeout(r, 100));
    }

    return { results: allResults, hitLimit };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Load config from entity
        await loadConfig(base44);

        let auditEmail = 'system@service';
        try {
            const user = await base44.auth.me();
            if (user) {
                auditEmail = user.email || auditEmail;
                // Allow service accounts and admins
                const isServiceAccount = (user.email || '').includes('service+') || (user.email || '').includes('@no-reply.base44.com');
                if (!isServiceAccount && user.role !== 'admin') {
                    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
                }
            }
        } catch (e) {
            // me() threw — this is a service-role or internal call, allow it
            console.log('[StateCrawler] auth.me() failed — treating as service/internal call');
        }

        const payload = await req.json();
        const {
            action = 'start',        // 'start' = begin full crawl, 'status' = get progress, 'process_next' = do one state
            taxonomy_description = '',
            entity_type = '',
            dry_run = false,
            target_state = '',       // optional: process only a specific state
        } = payload;

        // STATUS: return current crawl progress
        if (action === 'status') {
            const crawlBatches = await base44.asServiceRole.entities.ImportBatch.filter(
                { import_type: 'nppes_registry' },
                '-created_date',
                200
            );
            
            // Find batches from state crawler (file_name starts with "crawler_")
            const crawlerBatches = crawlBatches.filter(b => b.file_name && b.file_name.startsWith('crawler_'));
            
            const completedStates = [];
            const failedStates = [];
            const processingStates = [];
            
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
                completed: completedStates.length,
                failed: failedStates.length,
                processing: processingStates.length,
                pending: pendingStates.length,
                completed_states: completedStates,
                failed_states: failedStates,
                processing_states: processingStates,
                pending_states: pendingStates,
                batches: crawlerBatches.slice(0, 60),
            });
        }

        // PROCESS_NEXT or START: process one state at a time
        // Determine which state to process
        let stateToProcess = target_state;

        if (!stateToProcess) {
            // Find first pending state — skip completed, failed, processing, and validating
            const crawlBatches = await base44.asServiceRole.entities.ImportBatch.filter(
                { import_type: 'nppes_registry' },
                '-created_date',
                200
            );
            const crawlerBatches = crawlBatches.filter(b => b.file_name && b.file_name.startsWith('crawler_') && !b.file_name.includes('stop_signal'));
            const doneStates = new Set();
            for (const b of crawlerBatches) {
                const st = b.file_name.split('_')[1];
                // Skip ANY state that already has a batch record (completed, failed, processing, validating)
                doneStates.add(st);
            }
            stateToProcess = US_STATES.find(s => !doneStates.has(s));
        }

        if (!stateToProcess) {
            return Response.json({ success: true, message: 'All states have been processed!', done: true });
        }

        console.log(`[Crawler] Processing state: ${stateToProcess}, taxonomy: ${taxonomy_description}, dry_run: ${dry_run}`);

        // Create batch record for tracking
        const batch = await base44.asServiceRole.entities.ImportBatch.create({
            import_type: 'nppes_registry',
            file_name: `crawler_${stateToProcess}_${taxonomy_description || 'all'}_${Date.now()}`,
            file_url: `NPPES API crawler - ${stateToProcess}`,
            status: 'validating',
            dry_run,
        });

        try {
            // NPPES API: "state" alone triggers "Field state requires additional search criteria".
            // Strategy: iterate A-Z on last_name (NPI-1) and organization_name (NPI-2).
            // Each single-letter wildcard (e.g. "s*") can return max 1200 records (skip caps at 1000).
            // If a single letter hits the 1200 limit, we auto-subdivide into two-letter prefixes
            // (e.g. "sa*", "sb*", ... "sz*") to capture all records for that letter.
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

            function buildParams(stateCode, enumType, nameField, prefix, taxDesc) {
                const params = new URLSearchParams();
                params.set('version', '2.1');
                params.set('limit', String(BATCH_LIMIT));
                params.set('state', stateCode);
                params.set('enumeration_type', enumType);
                params.set(nameField, `${prefix}*`);
                if (taxDesc) params.set('taxonomy_description', taxDesc);
                return params;
            }

            // NPPES API Strategy:
            // "state" alone gives "requires additional search criteria" error.
            // Solution: use postal_code 2-digit wildcard (e.g. "35*") as the additional criterion.
            //   - Each state has only ~2-5 two-digit zip prefixes → very few queries needed.
            //   - If a zip prefix returns 1200+ results (the API skip limit), subdivide into
            //     3-digit zip prefixes (e.g. "350*", "351*", ... "359*").
            //   - We query BOTH enum types per zip prefix in a single pass.
            // This is much faster than iterating 676 name prefixes.
            const zipPrefixes = STATE_ZIP_PREFIXES[stateToProcess] || [];
            if (zipPrefixes.length === 0) {
                throw new Error(`No zip prefixes configured for state ${stateToProcess} — cannot crawl without additional search criteria`);
            }

            // Time guard: abort gracefully if approaching the function timeout
            const crawlStartTime = Date.now();
            let timedOut = false;

            function checkTimeout() {
                if (Date.now() - crawlStartTime > MAX_CRAWL_MS) {
                    timedOut = true;
                    return true;
                }
                return false;
            }

            for (const enumType of enumTypes) {
                if (timedOut) break;
                const typeLabel = enumType === 'NPI-1' ? 'Individual' : 'Organization';
                console.log(`[${stateToProcess}] ${typeLabel}: crawling ${zipPrefixes.length} zip prefixes`);

                for (const zipPrefix of zipPrefixes) {
                    if (checkTimeout()) break;

                    // Query with 2-digit zip prefix
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
                        // Subdivide into 3-digit zip prefixes (e.g. "350*"-"359*")
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
                                // Subdivide further into 4-digit zip prefixes
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

                                    if (deepResult.hitLimit) {
                                        console.warn(`[${stateToProcess}] ${typeLabel} zip=${zip4}*: STILL AT LIMIT — some records may be missed`);
                                    }
                                    await new Promise(r => setTimeout(r, 50));
                                }
                            }

                            await new Promise(r => setTimeout(r, 50));
                        }
                    }

                    const added = allResults.length - beforeCount;
                    if (added > 0) {
                        console.log(`[${stateToProcess}] ${typeLabel} zip=${zipPrefix}*: +${added} unique (total: ${allResults.length})`);
                    }

                    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                        total_rows: allResults.length,
                    });

                    await new Promise(r => setTimeout(r, API_DELAY_MS));
                }

                console.log(`[${stateToProcess}] ${typeLabel} zip crawl done: ${allResults.length} unique NPIs${timedOut ? ' (TIMED OUT — partial)' : ''}`);
            }

            if (timedOut) {
                console.warn(`[${stateToProcess}] Hit time limit after ${Math.round((Date.now() - crawlStartTime) / 1000)}s — saving ${allResults.length} records collected so far`);
            }

            if (queriesOverLimit > 0) {
                console.log(`[${stateToProcess}] ${queriesOverLimit} zip prefix(es) required subdivision`);
            }

            console.log(`[${stateToProcess}] Total fetched: ${allResults.length}`);

            // Transform results
            let validRows = 0;
            let invalidRows = 0;
            let duplicateRows = 0;
            const seenNPIs = new Set();
            const providerRecords = [];
            const locationRecords = [];
            const taxonomyRecords = [];
            const errorSamples = [];

            for (const result of allResults) {
                const npi = String(result.number || '');
                if (!npi || npi.length !== 10) {
                    invalidRows++;
                    if (errorSamples.length < 10) {
                        errorSamples.push({ npi: npi || 'missing', message: 'Invalid NPI' });
                    }
                    continue;
                }
                if (seenNPIs.has(npi)) {
                    duplicateRows++;
                    continue;
                }
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

                const addresses = result.addresses || [];
                for (const addr of addresses) {
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

                const taxonomies = result.taxonomies || [];
                for (const tax of taxonomies) {
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

            let importedProviders = 0;
            let updatedProviders = 0;
            let skippedProviders = 0;
            let importedLocations = 0;
            let updatedLocations = 0;
            let skippedLocations = 0;
            let importedTaxonomies = 0;
            let updatedTaxonomies = 0;
            let skippedTaxonomies = 0;

            // Helper: check if incoming record has more complete data than existing
            function isMoreComplete(incoming, existing, fields) {
                let incomingFilled = 0;
                let existingFilled = 0;
                for (const f of fields) {
                    if (incoming[f] && String(incoming[f]).trim()) incomingFilled++;
                    if (existing[f] && String(existing[f]).trim()) existingFilled++;
                }
                return incomingFilled > existingFilled;
            }

            // Helper: check if incoming record is newer based on last_update_date
            function isNewer(incoming, existing) {
                const inDate = incoming.last_update_date || incoming.enumeration_date || '';
                const exDate = existing.last_update_date || existing.enumeration_date || '';
                if (!inDate) return false;
                if (!exDate) return true;
                return inDate > exDate;
            }

            // Helper: check if two records are effectively identical on key fields
            function isIdentical(incoming, existing, fields) {
                for (const f of fields) {
                    const a = (incoming[f] ?? '').toString().trim();
                    const b = (existing[f] ?? '').toString().trim();
                    if (a !== b) return false;
                }
                return true;
            }

            if (!dry_run && providerRecords.length > 0) {
                // --- PROVIDERS: smart upsert ---
                const PROVIDER_KEY_FIELDS = ['first_name','last_name','organization_name','credential','gender','status','entity_type','enumeration_date','last_update_date'];

                for (let i = 0; i < providerRecords.length; i += BULK_SIZE) {
                    const chunk = providerRecords.slice(i, i + BULK_SIZE);
                    // Batch-lookup existing providers by NPI
                    const npisInChunk = chunk.map(p => p.npi);
                    let existingMap = {};
                    for (const npi of npisInChunk) {
                        try {
                            const found = await base44.asServiceRole.entities.Provider.filter({ npi });
                            if (found.length > 0) existingMap[npi] = found[0];
                        } catch (e) {}
                    }

                    const toCreate = [];
                    for (const p of chunk) {
                        const existing = existingMap[p.npi];
                        if (!existing) {
                            toCreate.push(p);
                        } else if (isIdentical(p, existing, PROVIDER_KEY_FIELDS)) {
                            skippedProviders++;
                        } else if (isNewer(p, existing) || isMoreComplete(p, existing, PROVIDER_KEY_FIELDS)) {
                            // Merge: keep existing values for empty incoming fields
                            const merged = { ...p };
                            for (const f of PROVIDER_KEY_FIELDS) {
                                if (!merged[f] && existing[f]) merged[f] = existing[f];
                            }
                            merged.needs_nppes_enrichment = false;
                            try {
                                await base44.asServiceRole.entities.Provider.update(existing.id, merged);
                                updatedProviders++;
                            } catch (e) {
                                console.error(`Failed to update provider ${p.npi}:`, e.message);
                            }
                        } else {
                            skippedProviders++;
                        }
                    }

                    if (toCreate.length > 0) {
                        try {
                            await base44.asServiceRole.entities.Provider.bulkCreate(toCreate);
                            importedProviders += toCreate.length;
                        } catch (e) {
                            for (const p of toCreate) {
                                try {
                                    await base44.asServiceRole.entities.Provider.create(p);
                                    importedProviders++;
                                } catch (createErr) {
                                    console.error(`Failed to create provider ${p.npi}:`, createErr.message);
                                }
                            }
                        }
                    }
                }

                // --- LOCATIONS: deduplicate by NPI + location_type + address_1 + zip ---
                const LOC_COMPARE_FIELDS = ['address_1','address_2','city','state','zip','phone','fax'];

                for (let i = 0; i < locationRecords.length; i += BULK_SIZE) {
                    const chunk = locationRecords.slice(i, i + BULK_SIZE);
                    // Group by NPI for batch lookup
                    const npiSet = new Set(chunk.map(l => l.npi));
                    let existingLocMap = {}; // npi -> array of existing locations
                    for (const npi of npiSet) {
                        try {
                            const found = await base44.asServiceRole.entities.ProviderLocation.filter({ npi });
                            if (found.length > 0) existingLocMap[npi] = found;
                        } catch (e) {}
                    }

                    const toCreate = [];
                    for (const loc of chunk) {
                        const existingLocs = existingLocMap[loc.npi] || [];
                        // Match on NPI + location_type + normalized address_1
                        const match = existingLocs.find(ex =>
                            ex.location_type === loc.location_type &&
                            (ex.address_1 || '').trim().toLowerCase() === (loc.address_1 || '').trim().toLowerCase() &&
                            (ex.zip || '').substring(0, 5) === (loc.zip || '').substring(0, 5)
                        );

                        if (!match) {
                            toCreate.push(loc);
                        } else if (isIdentical(loc, match, LOC_COMPARE_FIELDS)) {
                            skippedLocations++;
                        } else {
                            // Update with newer data, keep existing non-empty fields
                            const merged = { ...loc };
                            for (const f of LOC_COMPARE_FIELDS) {
                                if (!merged[f] && match[f]) merged[f] = match[f];
                            }
                            try {
                                await base44.asServiceRole.entities.ProviderLocation.update(match.id, merged);
                                updatedLocations++;
                            } catch (e) {
                                console.error(`Failed to update location for ${loc.npi}:`, e.message);
                            }
                        }
                    }

                    if (toCreate.length > 0) {
                        try {
                            await base44.asServiceRole.entities.ProviderLocation.bulkCreate(toCreate);
                            importedLocations += toCreate.length;
                        } catch (e) {
                            for (const loc of toCreate) {
                                try {
                                    await base44.asServiceRole.entities.ProviderLocation.create(loc);
                                    importedLocations++;
                                } catch (locErr) {}
                            }
                        }
                    }
                }

                // --- TAXONOMIES: deduplicate by NPI + taxonomy_code ---
                const TAX_COMPARE_FIELDS = ['taxonomy_description','primary_flag','license_number','state'];

                for (let i = 0; i < taxonomyRecords.length; i += BULK_SIZE) {
                    const chunk = taxonomyRecords.slice(i, i + BULK_SIZE);
                    const npiSet = new Set(chunk.map(t => t.npi));
                    let existingTaxMap = {}; // npi -> array
                    for (const npi of npiSet) {
                        try {
                            const found = await base44.asServiceRole.entities.ProviderTaxonomy.filter({ npi });
                            if (found.length > 0) existingTaxMap[npi] = found;
                        } catch (e) {}
                    }

                    const toCreate = [];
                    for (const tax of chunk) {
                        const existingTaxes = existingTaxMap[tax.npi] || [];
                        const match = existingTaxes.find(ex =>
                            (ex.taxonomy_code || '').trim() === (tax.taxonomy_code || '').trim()
                        );

                        if (!match) {
                            toCreate.push(tax);
                        } else if (isIdentical(tax, match, TAX_COMPARE_FIELDS)) {
                            skippedTaxonomies++;
                        } else {
                            const merged = { ...tax };
                            for (const f of TAX_COMPARE_FIELDS) {
                                if (!merged[f] && match[f]) merged[f] = match[f];
                            }
                            try {
                                await base44.asServiceRole.entities.ProviderTaxonomy.update(match.id, merged);
                                updatedTaxonomies++;
                            } catch (e) {
                                console.error(`Failed to update taxonomy for ${tax.npi}:`, e.message);
                            }
                        }
                    }

                    if (toCreate.length > 0) {
                        try {
                            await base44.asServiceRole.entities.ProviderTaxonomy.bulkCreate(toCreate);
                            importedTaxonomies += toCreate.length;
                        } catch (e) {
                            for (const tax of toCreate) {
                                try {
                                    await base44.asServiceRole.entities.ProviderTaxonomy.create(tax);
                                    importedTaxonomies++;
                                } catch (taxErr) {}
                            }
                        }
                    }
                }

                const dedupSummary = {
                    providers: { created: importedProviders, updated: updatedProviders, skipped: skippedProviders },
                    locations: { created: importedLocations, updated: updatedLocations, skipped: skippedLocations },
                    taxonomies: { created: importedTaxonomies, updated: updatedTaxonomies, skipped: skippedTaxonomies },
                };
                console.log(`[${stateToProcess}] Dedup summary:`, JSON.stringify(dedupSummary));

                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    status: 'completed',
                    imported_rows: importedProviders,
                    updated_rows: updatedProviders + updatedLocations + updatedTaxonomies,
                    skipped_rows: skippedProviders + skippedLocations + skippedTaxonomies,
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
                    imported_providers: importedProviders,
                    imported_locations: importedLocations,
                    imported_taxonomies: importedTaxonomies,
                    message: dry_run ? `Dry run for ${stateToProcess}` : `Import completed for ${stateToProcess}`,
                },
                timestamp: new Date().toISOString(),
            });

            // Determine next state
            const crawlBatches2 = await base44.asServiceRole.entities.ImportBatch.filter(
                { import_type: 'nppes_registry' },
                '-created_date',
                200
            );
            const crawlerBatches2 = crawlBatches2.filter(b => b.file_name && b.file_name.startsWith('crawler_'));
            const doneStates2 = new Set();
            for (const b of crawlerBatches2) {
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
                imported_providers: importedProviders,
                imported_locations: importedLocations,
                imported_taxonomies: importedTaxonomies,
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

            // Still return success so the caller can continue to next state
            const doneStates3 = new Set();
            const crawlBatches3 = await base44.asServiceRole.entities.ImportBatch.filter(
                { import_type: 'nppes_registry' }, '-created_date', 200
            );
            for (const b of crawlBatches3.filter(b => b.file_name?.startsWith('crawler_'))) {
                const st = b.file_name.split('_')[1];
                if (b.status === 'completed' || b.status === 'failed') doneStates3.add(st);
            }
            const nextState = US_STATES.find(s => !doneStates3.has(s));

            return Response.json({
                success: false,
                state: stateToProcess,
                error: error.message,
                done: !nextState,
                next_state: nextState || null,
                batch_id: batch.id,
            });
        }

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});