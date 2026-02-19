import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const payload = await req.json();
        const { import_type, file_url, year = 2023, dry_run = false } = payload;

        // Validate import type
        const validTypes = ['cms_utilization', 'cms_order_referring', 'cms_part_d'];
        if (!validTypes.includes(import_type)) {
            return Response.json({ 
                error: `Invalid import type. Must be one of: ${validTypes.join(', ')}` 
            }, { status: 400 });
        }

        if (!file_url) {
            return Response.json({ error: 'file_url is required' }, { status: 400 });
        }

        // Create import batch
        const batch = await base44.asServiceRole.entities.ImportBatch.create({
            import_type,
            file_name: `auto_import_${import_type}_${year}_${Date.now()}.csv`,
            file_url,
            status: 'validating',
            dry_run,
        });

        try {
            // Fetch and parse CSV
            const response = await fetch(file_url);
            if (!response.ok) {
                throw new Error(`Failed to fetch file: ${response.statusText}`);
            }

            const text = await response.text();
            const lines = text.split('\n').filter(l => l.trim());
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

            // Auto-detect column mapping based on common CMS column names
            const columnMapping = detectCMSColumns(headers, import_type);

            await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                column_mapping: columnMapping
            });

            // Validate and process data
            let validRows = 0;
            let invalidRows = 0;
            let duplicateRows = 0;
            const errorSamples = [];
            const validData = [];
            const seenNPIs = new Set();

            // Get existing NPIs
            const existingProviders = await base44.asServiceRole.entities.Provider.list();
            const existingNPIs = new Set(existingProviders.map(p => p.npi));

            for (let i = 1; i < lines.length && i < 100001; i++) {
                const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
                const row = {};
                headers.forEach((h, idx) => { row[h] = values[idx]; });

                // Get NPI from mapped column
                const npiColumn = columnMapping['NPI'] || 'NPI';
                const npi = row[npiColumn];

                if (!validateNPI(npi)) {
                    invalidRows++;
                    if (errorSamples.length < 10) {
                        errorSamples.push({
                            row: i + 1,
                            npi: npi || 'missing',
                            message: 'Invalid NPI format (must be 10 digits)',
                        });
                    }
                } else if (seenNPIs.has(npi)) {
                    duplicateRows++;
                } else {
                    seenNPIs.add(npi);
                    validRows++;
                    
                    // Map data based on import type
                    const mappedData = mapCMSData(row, columnMapping, import_type, year);
                    mappedData.npi = npi;
                    mappedData.isDuplicate = existingNPIs.has(npi);
                    validData.push(mappedData);
                }
            }

            // Update batch with validation results
            await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                status: dry_run ? 'completed' : 'processing',
                total_rows: lines.length - 1,
                valid_rows: validRows,
                invalid_rows: invalidRows,
                duplicate_rows: duplicateRows,
                error_samples: errorSamples,
            });

            // Import data if not dry run
            let importedCount = 0;
            let updatedCount = 0;

            if (!dry_run && validData.length > 0) {
                const result = await importCMSData(base44, import_type, validData, year);
                importedCount = result.imported;
                updatedCount = result.updated;

                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    status: 'completed',
                    imported_rows: importedCount,
                    updated_rows: updatedCount,
                    completed_at: new Date().toISOString(),
                });
            } else {
                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                });
            }

            // Log audit event
            await base44.asServiceRole.entities.AuditEvent.create({
                event_type: 'import',
                user_email: user.email,
                details: {
                    action: 'Automated CMS Data Import',
                    entity: import_type,
                    row_count: validRows,
                    imported_count: importedCount,
                    updated_count: updatedCount,
                    message: dry_run ? 'Dry run validation completed' : 'Import completed successfully'
                },
                timestamp: new Date().toISOString(),
            });

            return Response.json({
                success: true,
                batch_id: batch.id,
                total_rows: lines.length - 1,
                valid_rows: validRows,
                invalid_rows: invalidRows,
                duplicate_rows: duplicateRows,
                imported_rows: importedCount,
                updated_rows: updatedCount,
                dry_run,
            });

        } catch (error) {
            await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                status: 'failed',
                error_samples: [{ message: error.message }],
            });
            throw error;
        }

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});

function validateNPI(npi) {
    if (!npi) return false;
    const cleaned = String(npi).replace(/\D/g, '');
    return cleaned.length === 10;
}

function detectCMSColumns(headers, importType) {
    const mapping = {};
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

    // Common NPI column names
    const npiPatterns = ['npi', 'national_provider_identifier', 'provider_npi'];
    for (const pattern of npiPatterns) {
        const idx = normalizedHeaders.findIndex(h => h.includes(pattern));
        if (idx !== -1) {
            mapping['NPI'] = headers[idx];
            break;
        }
    }

    if (importType === 'cms_utilization') {
        const patterns = {
            'Year': ['year', 'data_year', 'cy'],
            'Total Services': ['number_of_services', 'total_services', 'line_srvc_cnt'],
            'Medicare Beneficiaries': ['number_of_medicare_beneficiaries', 'bene_unique_cnt', 'beneficiaries'],
            'Medicare Payment Amount': ['average_medicare_payment_amt', 'total_medicare_payment', 'medicare_payment'],
        };

        Object.entries(patterns).forEach(([key, patterns]) => {
            for (const pattern of patterns) {
                const idx = normalizedHeaders.findIndex(h => h.includes(pattern));
                if (idx !== -1) {
                    mapping[key] = headers[idx];
                    break;
                }
            }
        });
    } else if (importType === 'cms_order_referring') {
        const patterns = {
            'Year': ['year', 'data_year'],
            'Total Referrals': ['total_referrals', 'referral_count'],
            'Home Health Referrals': ['hha_referrals', 'home_health'],
            'Hospice Referrals': ['hospice_referrals', 'hospice'],
        };

        Object.entries(patterns).forEach(([key, patterns]) => {
            for (const pattern of patterns) {
                const idx = normalizedHeaders.findIndex(h => h.includes(pattern));
                if (idx !== -1) {
                    mapping[key] = headers[idx];
                    break;
                }
            }
        });
    }

    return mapping;
}

function mapCMSData(row, columnMapping, importType, year) {
    const mappedData = {};

    if (importType === 'cms_utilization') {
        mappedData.Year = row[columnMapping['Year']] || String(year);
        mappedData['Total Services'] = row[columnMapping['Total Services']] || '0';
        mappedData['Medicare Beneficiaries'] = row[columnMapping['Medicare Beneficiaries']] || '0';
        mappedData['Medicare Payment Amount'] = row[columnMapping['Medicare Payment Amount']] || '0';
    } else if (importType === 'cms_order_referring') {
        mappedData.Year = row[columnMapping['Year']] || String(year);
        mappedData['Total Referrals'] = row[columnMapping['Total Referrals']] || '0';
        mappedData['Home Health Referrals'] = row[columnMapping['Home Health Referrals']] || '0';
        mappedData['Hospice Referrals'] = row[columnMapping['Hospice Referrals']] || '0';
    }

    return mappedData;
}

async function importCMSData(base44, importType, validData, year) {
    let imported = 0;
    let updated = 0;

    if (importType === 'cms_utilization') {
        for (const row of validData) {
            try {
                // Create provider placeholder if doesn't exist
                const existingProvider = await base44.asServiceRole.entities.Provider.filter({ npi: row.npi });
                if (existingProvider.length === 0) {
                    await base44.asServiceRole.entities.Provider.create({
                        npi: row.npi,
                        status: 'Active',
                        needs_nppes_enrichment: true,
                    });
                }

                const utilData = {
                    npi: row.npi,
                    year: parseInt(row.Year || year),
                    total_services: parseFloat(row['Total Services'] || 0),
                    total_medicare_beneficiaries: parseFloat(row['Medicare Beneficiaries'] || 0),
                    total_medicare_payment: parseFloat(row['Medicare Payment Amount'] || 0),
                };

                const existingUtil = await base44.asServiceRole.entities.CMSUtilization.filter({
                    npi: row.npi,
                    year: utilData.year
                });

                if (existingUtil.length === 0) {
                    await base44.asServiceRole.entities.CMSUtilization.create(utilData);
                    imported++;
                } else {
                    await base44.asServiceRole.entities.CMSUtilization.update(existingUtil[0].id, utilData);
                    updated++;
                }
            } catch (error) {
                console.error('Failed to import utilization record:', error);
            }
        }
    } else if (importType === 'cms_order_referring') {
        for (const row of validData) {
            try {
                const existingProvider = await base44.asServiceRole.entities.Provider.filter({ npi: row.npi });
                if (existingProvider.length === 0) {
                    await base44.asServiceRole.entities.Provider.create({
                        npi: row.npi,
                        status: 'Active',
                        needs_nppes_enrichment: true,
                    });
                }

                const refData = {
                    npi: row.npi,
                    year: parseInt(row.Year || year),
                    total_referrals: parseFloat(row['Total Referrals'] || 0),
                    home_health_referrals: parseFloat(row['Home Health Referrals'] || 0),
                    hospice_referrals: parseFloat(row['Hospice Referrals'] || 0),
                };

                const existingRef = await base44.asServiceRole.entities.CMSReferral.filter({
                    npi: row.npi,
                    year: refData.year
                });

                if (existingRef.length === 0) {
                    await base44.asServiceRole.entities.CMSReferral.create(refData);
                    imported++;
                } else {
                    await base44.asServiceRole.entities.CMSReferral.update(existingRef[0].id, refData);
                    updated++;
                }
            } catch (error) {
                console.error('Failed to import referral record:', error);
            }
        }
    }

    return { imported, updated };
}