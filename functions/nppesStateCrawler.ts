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
const API_DELAY_MS = 250; // delay between API calls to avoid rate limiting
const MAX_RETRIES = 3;

// Fetch a single page from NPPES API with retry logic
async function fetchNPPESPage(params, retries = MAX_RETRIES) {
    const apiUrl = `${NPPES_API_BASE}&${params.toString()}`;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(apiUrl);
            if (response.status === 429 || response.status >= 500) {
                // Rate limited or server error — wait and retry
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
                return { error: errMsg, results: [], result_count: 0 };
            }
            return { results: data.results || [], result_count: data.result_count || 0, error: null };
        } catch (e) {
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
            // "No results" is not a real error
            if (/no results/i.test(data.error) || /no record/i.test(data.error)) break;
            console.log(`[${stateCode}] API note: ${data.error}`);
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
        await new Promise(r => setTimeout(r, API_DELAY_MS));
    }

    return { results: allResults, hitLimit };
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
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

            for (const enumType of enumTypes) {
                const nameField = enumType === 'NPI-1' ? 'last_name' : 'organization_name';
                const typeLabel = enumType === 'NPI-1' ? 'Individual' : 'Organization';

                console.log(`[${stateToProcess}] Starting ${typeLabel} crawl (${nameField})`);

                for (const letter of ALPHABET) {
                    // First pass: single-letter prefix
                    const params = buildParams(stateToProcess, enumType, nameField, letter, taxonomy_description);
                    console.log(`[${stateToProcess}] ${typeLabel} ${letter}*`);

                    const { results, hitLimit } = await fetchAllPages(params, stateToProcess);
                    const beforeCount = allResults.length;
                    addUniqueResults(results);

                    if (hitLimit) {
                        // This letter has >1200 records — subdivide into two-letter prefixes
                        queriesOverLimit++;
                        console.log(`[${stateToProcess}] ${typeLabel} ${letter}*: HIT 1200 LIMIT (got ${results.length}), subdividing into ${letter}a*-${letter}z*`);

                        for (const letter2 of ALPHABET) {
                            const subPrefix = `${letter}${letter2}`;
                            const subParams = buildParams(stateToProcess, enumType, nameField, subPrefix, taxonomy_description);
                            console.log(`[${stateToProcess}] ${typeLabel} ${subPrefix}*`);

                            const subResult = await fetchAllPages(subParams, stateToProcess);
                            addUniqueResults(subResult.results);

                            if (subResult.hitLimit) {
                                // Even two-letter prefix hit the limit — very rare, log warning
                                console.warn(`[${stateToProcess}] ${typeLabel} ${subPrefix}*: STILL AT LIMIT (${subResult.results.length}), some records may be missed`);
                            }

                            await new Promise(r => setTimeout(r, API_DELAY_MS));
                        }
                    }

                    const added = allResults.length - beforeCount;
                    if (added > 0) {
                        console.log(`[${stateToProcess}] ${typeLabel} ${letter}*: +${added} unique (total: ${allResults.length})`);
                    }

                    // Update batch progress periodically
                    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                        total_rows: allResults.length,
                    });

                    await new Promise(r => setTimeout(r, API_DELAY_MS));
                }

                console.log(`[${stateToProcess}] ${typeLabel} crawl done: ${allResults.length} unique NPIs so far`);
            }

            if (queriesOverLimit > 0) {
                console.log(`[${stateToProcess}] ${queriesOverLimit} letter(s) required two-letter subdivision`);
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
                user_email: user.email,
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