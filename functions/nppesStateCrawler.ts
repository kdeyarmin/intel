import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
    'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

const NPPES_API_BASE = 'https://npiregistry.cms.hhs.gov/api/?version=2.1';
const BATCH_LIMIT = 200;
const MAX_SKIP = 1000; // NPPES API allows skip up to 1000, so max 1200 records per query
const BULK_SIZE = 50;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

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
            // Build NPPES params
            const params = new URLSearchParams();
            params.set('version', '2.1');
            params.set('limit', String(BATCH_LIMIT));
            params.set('state', stateToProcess);
            if (taxonomy_description) params.set('taxonomy_description', taxonomy_description);
            if (entity_type) params.set('enumeration_type', entity_type);

            // Fetch all pages
            let allResults = [];
            let skip = 0;

            for (let page = 0; page < MAX_PAGES; page++) {
                params.set('skip', String(skip));
                const apiUrl = `${NPPES_API_BASE}&${params.toString()}`;
                console.log(`[${stateToProcess}] Fetching page ${page + 1}, skip=${skip}...`);

                const response = await fetch(apiUrl);
                if (!response.ok) {
                    throw new Error(`NPPES API error: ${response.status} ${response.statusText}`);
                }

                const data = await response.json();

                if (data.Errors && data.Errors.length > 0) {
                    const errMsg = data.Errors.map(e => e.description).join('; ');
                    throw new Error(`NPPES API error: ${errMsg}`);
                }

                const results = data.results || [];
                if (results.length === 0) {
                    console.log(`[${stateToProcess}] No more results at skip=${skip}. Done.`);
                    break;
                }

                allResults = allResults.concat(results);
                console.log(`[${stateToProcess}] Got ${results.length} results (total: ${allResults.length})`);

                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    total_rows: data.result_count || allResults.length,
                });

                if (results.length < BATCH_LIMIT) break;
                skip += BATCH_LIMIT;
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