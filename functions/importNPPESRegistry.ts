import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const NPPES_API_BASE = 'https://npiregistry.cms.hhs.gov/api/?version=2.1';
const BATCH_LIMIT = 200; // NPPES API max per request
const MAX_PAGES = 50; // Safety limit: 50 * 200 = 10,000 providers max per run

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const payload = await req.json();
        const {
            state = '',
            taxonomy_description = '',
            entity_type = '', // 'NPI-1' (Individual) or 'NPI-2' (Organization)
            city = '',
            postal_code = '',
            first_name = '',
            last_name = '',
            organization_name = '',
            dry_run = false,
            max_pages = MAX_PAGES,
        } = payload;

        // Build NPPES API query params
        const params = new URLSearchParams();
        params.set('version', '2.1');
        params.set('limit', String(BATCH_LIMIT));
        if (state) params.set('state', state.toUpperCase());
        if (taxonomy_description) params.set('taxonomy_description', taxonomy_description);
        if (entity_type) params.set('enumeration_type', entity_type);
        if (city) params.set('city', city);
        if (postal_code) params.set('postal_code', postal_code);
        if (first_name) params.set('first_name', first_name);
        if (last_name) params.set('last_name', last_name);
        if (organization_name) params.set('organization_name', organization_name);

        // Require at least one substantive search criteria (NPPES API requires more than just enumeration_type)
        const hasSubstantiveFilter = state || taxonomy_description || city || postal_code || first_name || last_name || organization_name;
        if (!hasSubstantiveFilter) {
            return Response.json({ error: 'At least one search criteria beyond Provider Type is required (e.g., State, Specialty, City, Name)' }, { status: 400 });
        }

        // Create import batch
        const batch = await base44.asServiceRole.entities.ImportBatch.create({
            import_type: 'nppes_registry',
            file_name: `nppes_api_${state || 'all'}_${taxonomy_description || 'all'}_${Date.now()}`,
            file_url: `${NPPES_API_BASE}&${params.toString()}`,
            status: 'validating',
            dry_run,
        });

        console.log(`Starting NPPES Registry import. Filters: state=${state}, taxonomy=${taxonomy_description}, entity_type=${entity_type}`);

        try {
            // Fetch all pages from NPPES API
            let allResults = [];
            let skip = 0;
            const pageLimit = Math.min(max_pages, MAX_PAGES);

            for (let page = 0; page < pageLimit; page++) {
                params.set('skip', String(skip));
                const apiUrl = `${NPPES_API_BASE}&${params.toString()}`;
                console.log(`Fetching page ${page + 1}, skip=${skip}...`);

                const response = await fetch(apiUrl);
                if (!response.ok) {
                    throw new Error(`NPPES API error: ${response.status} ${response.statusText}`);
                }

                const data = await response.json();
                
                // Check for NPPES API errors
                if (data.Errors && data.Errors.length > 0) {
                    const errMsg = data.Errors.map(e => e.description).join('; ');
                    console.error(`NPPES API returned errors: ${errMsg}`);
                    throw new Error(`NPPES API error: ${errMsg}`);
                }
                
                const resultCount = data.result_count || 0;
                const results = data.results || [];

                if (results.length === 0) {
                    console.log(`No more results at skip=${skip}. Done.`);
                    break;
                }

                allResults = allResults.concat(results);
                console.log(`Got ${results.length} results (total so far: ${allResults.length})`);

                // Update batch progress
                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    total_rows: resultCount || allResults.length,
                });

                if (results.length < BATCH_LIMIT) {
                    break; // Last page
                }
                skip += BATCH_LIMIT;
            }

            console.log(`Total NPPES results fetched: ${allResults.length}`);

            // Transform NPPES results to provider data
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

                // Build provider record
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

                if (basic.enumeration_date) {
                    provider.enumeration_date = basic.enumeration_date;
                }
                if (basic.last_updated) {
                    provider.last_update_date = basic.last_updated;
                }

                providerRecords.push(provider);

                // Build location records from addresses
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

                // Build taxonomy records
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

            // Update batch with validation results
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
                const BULK_SIZE = 50;

                // Bulk create providers
                console.log(`Importing ${providerRecords.length} providers...`);
                for (let i = 0; i < providerRecords.length; i += BULK_SIZE) {
                    const chunk = providerRecords.slice(i, i + BULK_SIZE);
                    try {
                        await base44.asServiceRole.entities.Provider.bulkCreate(chunk);
                        importedProviders += chunk.length;
                    } catch (e) {
                        // Some may already exist — try individual creates/updates
                        for (const p of chunk) {
                            try {
                                await base44.asServiceRole.entities.Provider.create(p);
                                importedProviders++;
                            } catch (innerErr) {
                                // Try update if create fails (likely duplicate NPI)
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
                    if (i % 500 === 0 && i > 0) {
                        console.log(`Provider import progress: ${i}/${providerRecords.length}`);
                    }
                }

                // Bulk create locations
                console.log(`Importing ${locationRecords.length} locations...`);
                for (let i = 0; i < locationRecords.length; i += BULK_SIZE) {
                    const chunk = locationRecords.slice(i, i + BULK_SIZE);
                    try {
                        await base44.asServiceRole.entities.ProviderLocation.bulkCreate(chunk);
                        importedLocations += chunk.length;
                    } catch (e) {
                        // Best effort
                        for (const loc of chunk) {
                            try {
                                await base44.asServiceRole.entities.ProviderLocation.create(loc);
                                importedLocations++;
                            } catch (locErr) {
                                // Skip duplicates
                            }
                        }
                    }
                }

                // Bulk create taxonomies
                console.log(`Importing ${taxonomyRecords.length} taxonomies...`);
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
                            } catch (taxErr) {
                                // Skip duplicates
                            }
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

            // Log audit
            await base44.asServiceRole.entities.AuditEvent.create({
                event_type: 'import',
                user_email: user.email,
                details: {
                    action: 'NPPES Registry API Import',
                    entity: 'nppes_registry',
                    row_count: validRows,
                    imported_providers: importedProviders,
                    imported_locations: importedLocations,
                    imported_taxonomies: importedTaxonomies,
                    filters: { state, taxonomy_description, entity_type, city, postal_code },
                    message: dry_run ? 'Dry run validation completed' : 'Import completed successfully',
                },
                timestamp: new Date().toISOString(),
            });

            return Response.json({
                success: true,
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
            console.error('NPPES import error:', error);
            await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                status: 'failed',
                error_samples: [{ message: error.message }],
            });

            try {
                await base44.asServiceRole.entities.ErrorReport.create({
                    error_type: 'import_failure',
                    severity: 'high',
                    source: batch.id,
                    title: 'NPPES Registry Import Failed',
                    description: `NPPES API import failed: ${error.message}`,
                    error_samples: [{ message: error.message, stack: error.stack }],
                    context: { state, taxonomy_description, entity_type, batch_id: batch.id },
                    status: 'new',
                });
            } catch (notifErr) {
                console.error('Failed to create error report:', notifErr);
            }

            throw error;
        }

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});