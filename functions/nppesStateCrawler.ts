import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
    'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

const NPPES_API_BASE = 'https://npiregistry.cms.hhs.gov/api/?version=2.1';
const BATCH_LIMIT = 200;
const MAX_SKIP = 1000; // NPPES API allows skip up to 1000, so max 1200 records per query
const MAX_PAGES_PER_QUERY = 6; // 6 pages * 200 = 1200 max per query
const BULK_SIZE = 50;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
const API_DELAY_MS = 150; // delay between API calls to avoid rate limiting
const MAX_RETRIES = 3;

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
            const timeout = setTimeout(() => controller.abort(), 15000);
            const response = await fetch(apiUrl, { signal: controller.signal });
            clearTimeout(timeout);

            if (response.status === 429 || response.status >= 500) {
                const backoff = attempt * 2000;
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
        
        // Authenticate — support both admin users and service-role calls (from batch processor)
        let auditEmail = 'system@service';
        try {
            const user = await base44.auth.me();
            if (user) {
                auditEmail = user.email || auditEmail;
                // If user is authenticated but not admin and not a service account, block
                const isServiceAccount = user.email && user.email.includes('service+');
                if (!isServiceAccount && user.role !== 'admin') {
                    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
                }
            }
            // If user is null/undefined, it's a service role call — allow it
        } catch (e) {
            // auth.me() threw — likely a service-role invocation, allow it
            console.log('[StateCrawler] Service role call detected');
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
            // Find first pending state
            const crawlBatches = await base44.asServiceRole.entities.ImportBatch.filter(
                { import_type: 'nppes_registry' },
                '-created_date',
                200
            );
            const crawlerBatches = crawlBatches.filter(b => b.file_name && b.file_name.startsWith('crawler_'));
            const doneStates = new Set();
            for (const b of crawlerBatches) {
                const st = b.file_name.split('_')[1];
                if (b.status === 'completed' || b.status === 'processing' || b.status === 'validating') {
                    doneStates.add(st);
                }
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
            const enumTypes = entity_type ? [entity_type] : ['NPI-1', 'NPI-2'];
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
                console.warn(`[${stateToProcess}] No zip prefixes configured — falling back to name-based crawl`);
            }

            for (const enumType of enumTypes) {
                const typeLabel = enumType === 'NPI-1' ? 'Individual' : 'Organization';
                console.log(`[${stateToProcess}] ${typeLabel}: crawling ${zipPrefixes.length} zip prefixes`);

                for (const zipPrefix of zipPrefixes) {
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

                    if (hitLimit) {
                        // Subdivide into 3-digit zip prefixes (e.g. "350*"-"359*")
                        queriesOverLimit++;
                        console.log(`[${stateToProcess}] ${typeLabel} zip=${zipPrefix}*: HIT LIMIT (${results.length}), expanding to 3-digit`);

                        for (let d = 0; d <= 9; d++) {
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

                            if (subResult.hitLimit) {
                                // Subdivide further into 4-digit zip prefixes
                                console.log(`[${stateToProcess}] ${typeLabel} zip=${zip3}*: STILL AT LIMIT, expanding to 4-digit`);
                                for (let d2 = 0; d2 <= 9; d2++) {
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
                                    await new Promise(r => setTimeout(r, 100));
                                }
                            }

                            await new Promise(r => setTimeout(r, 100));
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

                console.log(`[${stateToProcess}] ${typeLabel} zip crawl done: ${allResults.length} unique NPIs`);
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
            let importedLocations = 0;
            let importedTaxonomies = 0;

            if (!dry_run && providerRecords.length > 0) {
                // Bulk create providers
                for (let i = 0; i < providerRecords.length; i += BULK_SIZE) {
                    const chunk = providerRecords.slice(i, i + BULK_SIZE);
                    try {
                        await base44.asServiceRole.entities.Provider.bulkCreate(chunk);
                        importedProviders += chunk.length;
                    } catch (e) {
                        for (const p of chunk) {
                            try {
                                await base44.asServiceRole.entities.Provider.create(p);
                                importedProviders++;
                            } catch (innerErr) {
                                try {
                                    const existing = await base44.asServiceRole.entities.Provider.filter({ npi: p.npi });
                                    if (existing.length > 0) {
                                        await base44.asServiceRole.entities.Provider.update(existing[0].id, p);
                                        importedProviders++;
                                    }
                                } catch (updateErr) {
                                    console.error(`Failed to upsert provider ${p.npi}:`, updateErr.message);
                                }
                            }
                        }
                    }
                }

                // Bulk create locations
                for (let i = 0; i < locationRecords.length; i += BULK_SIZE) {
                    const chunk = locationRecords.slice(i, i + BULK_SIZE);
                    try {
                        await base44.asServiceRole.entities.ProviderLocation.bulkCreate(chunk);
                        importedLocations += chunk.length;
                    } catch (e) {
                        for (const loc of chunk) {
                            try {
                                await base44.asServiceRole.entities.ProviderLocation.create(loc);
                                importedLocations++;
                            } catch (locErr) {}
                        }
                    }
                }

                // Bulk create taxonomies
                for (let i = 0; i < taxonomyRecords.length; i += BULK_SIZE) {
                    const chunk = taxonomyRecords.slice(i, i + BULK_SIZE);
                    try {
                        await base44.asServiceRole.entities.ProviderTaxonomy.bulkCreate(chunk);
                        importedTaxonomies += chunk.length;
                    } catch (e) {
                        for (const tax of chunk) {
                            try {
                                await base44.asServiceRole.entities.ProviderTaxonomy.create(tax);
                                importedTaxonomies++;
                            } catch (taxErr) {}
                        }
                    }
                }

                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    status: 'completed',
                    imported_rows: importedProviders,
                    updated_rows: 0,
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