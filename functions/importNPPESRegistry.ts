import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const NPPES_API_BASE = 'https://npiregistry.cms.hhs.gov/api/?version=2.1';
const BATCH_LIMIT = 200;
const MAX_PAGES = 50;
const BULK_SIZE = 50;
const WRITE_CONCURRENCY = 5;

// Run promise-returning fns in batches of N
async function runConcurrent(tasks, concurrency) {
    const results = [];
    for (let i = 0; i < tasks.length; i += concurrency) {
        const batch = tasks.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(fn => fn()));
        results.push(...batchResults);
    }
    return results;
}

// Batch-lookup existing records by NPI using parallel queries
async function batchLookupByNPI(entity, npis, base44) {
    const resultMap = {};
    const lookupTasks = npis.map(npi => async () => {
        try {
            const found = await base44.asServiceRole.entities[entity].filter({ npi });
            if (found.length > 0) resultMap[npi] = found;
        } catch (e) { /* ignore */ }
    });
    await runConcurrent(lookupTasks, WRITE_CONCURRENCY);
    return resultMap;
}

function isIdentical(incoming, existing, fields) {
    for (const f of fields) {
        const a = (incoming[f] ?? '').toString().trim();
        const b = (existing[f] ?? '').toString().trim();
        if (a !== b) return false;
    }
    return true;
}

function isNewer(incoming, existing) {
    const inDate = incoming.last_update_date || incoming.enumeration_date || '';
    const exDate = existing.last_update_date || existing.enumeration_date || '';
    if (!inDate) return false;
    if (!exDate) return true;
    return inDate > exDate;
}

async function upsertProviders(records, base44) {
    const KEY_FIELDS = ['first_name','last_name','organization_name','credential','gender','status','entity_type','enumeration_date','last_update_date'];
    let imported = 0, updated = 0, skipped = 0;

    for (let i = 0; i < records.length; i += BULK_SIZE) {
        const chunk = records.slice(i, i + BULK_SIZE);
        const npis = [...new Set(chunk.map(p => p.npi))];
        const existingMap = await batchLookupByNPI('Provider', npis, base44);

        const toCreate = [];
        const updateTasks = [];

        for (const p of chunk) {
            const existing = existingMap[p.npi]?.[0];
            if (!existing) {
                toCreate.push(p);
            } else if (isIdentical(p, existing, KEY_FIELDS)) {
                skipped++;
            } else if (isNewer(p, existing)) {
                const merged = { ...p };
                for (const f of KEY_FIELDS) { if (!merged[f] && existing[f]) merged[f] = existing[f]; }
                merged.needs_nppes_enrichment = false;
                updateTasks.push(async () => {
                    try { await base44.asServiceRole.entities.Provider.update(existing.id, merged); } catch (e) {}
                });
            } else {
                skipped++;
            }
        }

        if (updateTasks.length > 0) {
            await runConcurrent(updateTasks, WRITE_CONCURRENCY);
            updated += updateTasks.length;
        }

        if (toCreate.length > 0) {
            try {
                await base44.asServiceRole.entities.Provider.bulkCreate(toCreate);
                imported += toCreate.length;
            } catch (e) {
                const tasks = toCreate.map(p => async () => {
                    try { await base44.asServiceRole.entities.Provider.create(p); imported++; } catch (err) {}
                });
                await runConcurrent(tasks, WRITE_CONCURRENCY);
            }
        }
        if (i > 0 && i % 500 === 0) console.log(`[Providers] ${i}/${records.length}`);
    }
    return { imported, updated, skipped };
}

async function upsertLocations(records, base44) {
    const FIELDS = ['address_1','address_2','city','state','zip','phone','fax'];
    let imported = 0, updated = 0, skipped = 0;

    for (let i = 0; i < records.length; i += BULK_SIZE) {
        const chunk = records.slice(i, i + BULK_SIZE);
        const npis = [...new Set(chunk.map(l => l.npi))];
        const existingMap = await batchLookupByNPI('ProviderLocation', npis, base44);

        const toCreate = [];
        const updateTasks = [];

        for (const loc of chunk) {
            const matches = existingMap[loc.npi] || [];
            const match = matches.find(ex =>
                ex.location_type === loc.location_type &&
                (ex.address_1 || '').trim().toLowerCase() === (loc.address_1 || '').trim().toLowerCase() &&
                (ex.zip || '').substring(0, 5) === (loc.zip || '').substring(0, 5)
            );
            if (!match) {
                toCreate.push(loc);
            } else if (isIdentical(loc, match, FIELDS)) {
                skipped++;
            } else {
                const merged = { ...loc };
                for (const f of FIELDS) { if (!merged[f] && match[f]) merged[f] = match[f]; }
                updateTasks.push(async () => {
                    try { await base44.asServiceRole.entities.ProviderLocation.update(match.id, merged); } catch (e) {}
                });
            }
        }

        if (updateTasks.length > 0) { await runConcurrent(updateTasks, WRITE_CONCURRENCY); updated += updateTasks.length; }
        if (toCreate.length > 0) {
            try { await base44.asServiceRole.entities.ProviderLocation.bulkCreate(toCreate); imported += toCreate.length; } catch (e) {
                const tasks = toCreate.map(l => async () => { try { await base44.asServiceRole.entities.ProviderLocation.create(l); imported++; } catch (err) {} });
                await runConcurrent(tasks, WRITE_CONCURRENCY);
            }
        }
    }
    return { imported, updated, skipped };
}

async function upsertTaxonomies(records, base44) {
    const FIELDS = ['taxonomy_description','primary_flag','license_number','state'];
    let imported = 0, updated = 0, skipped = 0;

    for (let i = 0; i < records.length; i += BULK_SIZE) {
        const chunk = records.slice(i, i + BULK_SIZE);
        const npis = [...new Set(chunk.map(t => t.npi))];
        const existingMap = await batchLookupByNPI('ProviderTaxonomy', npis, base44);

        const toCreate = [];
        const updateTasks = [];

        for (const tax of chunk) {
            const matches = existingMap[tax.npi] || [];
            const match = matches.find(ex => (ex.taxonomy_code || '').trim() === (tax.taxonomy_code || '').trim());
            if (!match) {
                toCreate.push(tax);
            } else if (isIdentical(tax, match, FIELDS)) {
                skipped++;
            } else {
                const merged = { ...tax };
                for (const f of FIELDS) { if (!merged[f] && match[f]) merged[f] = match[f]; }
                updateTasks.push(async () => {
                    try { await base44.asServiceRole.entities.ProviderTaxonomy.update(match.id, merged); } catch (e) {}
                });
            }
        }

        if (updateTasks.length > 0) { await runConcurrent(updateTasks, WRITE_CONCURRENCY); updated += updateTasks.length; }
        if (toCreate.length > 0) {
            try { await base44.asServiceRole.entities.ProviderTaxonomy.bulkCreate(toCreate); imported += toCreate.length; } catch (e) {
                const tasks = toCreate.map(t => async () => { try { await base44.asServiceRole.entities.ProviderTaxonomy.create(t); imported++; } catch (err) {} });
                await runConcurrent(tasks, WRITE_CONCURRENCY);
            }
        }
    }
    return { imported, updated, skipped };
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
            state = '', taxonomy_description = '', entity_type = '',
            city = '', postal_code = '', first_name = '', last_name = '',
            organization_name = '', dry_run = false, max_pages = MAX_PAGES,
        } = payload;

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

        const hasSubstantiveFilter = state || taxonomy_description || city || postal_code || first_name || last_name || organization_name;
        if (!hasSubstantiveFilter) {
            return Response.json({ error: 'At least one search criteria beyond Provider Type is required' }, { status: 400 });
        }

        const batch = await base44.asServiceRole.entities.ImportBatch.create({
            import_type: 'nppes_registry',
            file_name: `nppes_api_${state || 'all'}_${taxonomy_description || 'all'}_${Date.now()}`,
            file_url: `${NPPES_API_BASE}&${params.toString()}`,
            status: 'processing',
            dry_run,
        });

        console.log(`Starting NPPES import. state=${state}, taxonomy=${taxonomy_description}, entity_type=${entity_type}`);

        try {
            // Fetch all pages
            let allResults = [];
            let skip = 0;
            const pageLimit = Math.min(max_pages, MAX_PAGES);

            for (let page = 0; page < pageLimit; page++) {
                params.set('skip', String(skip));
                const apiUrl = `${NPPES_API_BASE}&${params.toString()}`;
                console.log(`Fetching page ${page + 1}, skip=${skip}...`);

                const response = await fetch(apiUrl);
                if (!response.ok) throw new Error(`NPPES API error: ${response.status} ${response.statusText}`);

                const data = await response.json();
                if (data.Errors && data.Errors.length > 0) {
                    throw new Error(`NPPES API error: ${data.Errors.map(e => e.description).join('; ')}`);
                }

                const results = data.results || [];
                if (results.length === 0) break;
                allResults = allResults.concat(results);
                console.log(`Got ${results.length} results (total: ${allResults.length})`);

                await base44.asServiceRole.entities.ImportBatch.update(batch.id, { total_rows: data.result_count || allResults.length });
                if (results.length < BATCH_LIMIT) break;
                skip += BATCH_LIMIT;
            }

            console.log(`Total NPPES results fetched: ${allResults.length}`);

            // Transform
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

            let provResult = { imported: 0, updated: 0, skipped: 0 };
            let locResult = { imported: 0, updated: 0, skipped: 0 };
            let taxResult = { imported: 0, updated: 0, skipped: 0 };

            if (!dry_run && providerRecords.length > 0) {
                console.log(`Parallel write: ${providerRecords.length} providers, ${locationRecords.length} locations, ${taxonomyRecords.length} taxonomies`);

                [provResult, locResult, taxResult] = await Promise.all([
                    upsertProviders(providerRecords, base44),
                    upsertLocations(locationRecords, base44),
                    upsertTaxonomies(taxonomyRecords, base44),
                ]);

                console.log(`Write complete: Prov(${provResult.imported}c/${provResult.updated}u/${provResult.skipped}s) Loc(${locResult.imported}c/${locResult.updated}u/${locResult.skipped}s) Tax(${taxResult.imported}c/${taxResult.updated}u/${taxResult.skipped}s)`);

                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    status: 'completed',
                    imported_rows: provResult.imported,
                    updated_rows: provResult.updated + locResult.updated + taxResult.updated,
                    skipped_rows: provResult.skipped + locResult.skipped + taxResult.skipped,
                    dedup_summary: {
                        providers: provResult,
                        locations: locResult,
                        taxonomies: taxResult,
                    },
                    completed_at: new Date().toISOString(),
                });
            } else {
                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                });
            }

            await base44.asServiceRole.entities.AuditEvent.create({
                event_type: 'import',
                user_email: user.email,
                details: {
                    action: 'NPPES Registry API Import',
                    entity: 'nppes_registry',
                    row_count: validRows,
                    imported_providers: provResult.imported,
                    updated_providers: provResult.updated,
                    imported_locations: locResult.imported,
                    imported_taxonomies: taxResult.imported,
                    filters: { state, taxonomy_description, entity_type, city, postal_code },
                    message: dry_run ? 'Dry run completed' : 'Import completed',
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
                imported_providers: provResult.imported,
                updated_providers: provResult.updated,
                skipped_providers: provResult.skipped,
                imported_locations: locResult.imported,
                imported_taxonomies: taxResult.imported,
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