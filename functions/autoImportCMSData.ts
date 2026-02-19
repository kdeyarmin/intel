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
        const validTypes = ['cms_utilization', 'cms_order_referring', 'cms_part_d', 'nursing_home_chains'];
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

                // Get identifier based on import type
                let identifier;
                if (import_type === 'nursing_home_chains') {
                    const chainColumn = columnMapping['Chain'] || 'Chain';
                    identifier = row[chainColumn];
                    if (!identifier || identifier.trim() === '') {
                        invalidRows++;
                        if (errorSamples.length < 10) {
                            errorSamples.push({
                                row: i + 1,
                                message: 'Missing chain name',
                            });
                        }
                        continue;
                    }
                } else {
                    const npiColumn = columnMapping['NPI'] || 'NPI';
                    identifier = row[npiColumn];
                }

                if (import_type !== 'nursing_home_chains' && !validateNPI(identifier)) {
                    invalidRows++;
                    if (errorSamples.length < 10) {
                        errorSamples.push({
                            row: i + 1,
                            npi: identifier || 'missing',
                            message: 'Invalid NPI format (must be 10 digits)',
                        });
                    }
                } else if (seenNPIs.has(identifier)) {
                    duplicateRows++;
                } else {
                    seenNPIs.add(identifier);
                    validRows++;
                    
                    // Map data based on import type
                    const mappedData = mapCMSData(row, columnMapping, import_type, year);
                    if (import_type !== 'nursing_home_chains') {
                        mappedData.npi = identifier;
                        mappedData.isDuplicate = existingNPIs.has(identifier);
                    }
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
            'HHA': ['hha'],
            'HOSPICE': ['hospice'],
            'DME': ['dme'],
            'PARTB': ['partb'],
            'PMD': ['pmd'],
        };

        Object.entries(patterns).forEach(([key, patterns]) => {
            for (const pattern of patterns) {
                const idx = normalizedHeaders.findIndex(h => h === pattern);
                if (idx !== -1) {
                    mapping[key] = headers[idx];
                    break;
                }
            }
        });
    } else if (importType === 'nursing_home_chains') {
        const patterns = {
            'Chain': ['chain'],
            'Chain ID': ['chain id', 'chain_id'],
            'Number of facilities': ['number of facilities', 'facilities'],
            'Average overall 5-star rating': ['average overall 5-star rating', 'overall rating'],
            'Average health inspection rating': ['average health inspection rating'],
            'Average staffing rating': ['average staffing rating'],
            'Average quality rating': ['average quality rating'],
            'Average total nurse hours per resident day': ['average total nurse hours per resident day'],
            'Average total Registered Nurse hours per resident day': ['average total registered nurse hours per resident day'],
            'Average total nursing staff turnover percentage': ['average total nursing staff turnover percentage'],
            'Average Registered Nurse turnover percentage': ['average registered nurse turnover percentage'],
            'Total number of fines': ['total number of fines'],
            'Total amount of fines in dollars': ['total amount of fines in dollars'],
            'Average percentage of short-stay residents who were re-hospitalized after a nursing home admission': ['average percentage of short-stay residents who were re-hospitalized'],
            'Average percentage of long-stay residents who received an antipsychotic medication': ['average percentage of long-stay residents who received an antipsychotic medication'],
            'Average percentage of long-stay residents experiencing one or more falls with major injury': ['average percentage of long-stay residents experiencing one or more falls with major injury'],
            'Average percentage of long-stay residents with pressure ulcers': ['average percentage of long-stay residents with pressure ulcers'],
            'Average percentage of long-stay residents with a urinary tract infection': ['average percentage of long-stay residents with a urinary tract infection'],
        };

        Object.entries(patterns).forEach(([key, patterns]) => {
            for (const pattern of patterns) {
                const idx = normalizedHeaders.findIndex(h => h.includes(pattern.toLowerCase()));
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
        const hha = row[columnMapping['HHA']] === 'Y' ? 1 : 0;
        const hospice = row[columnMapping['HOSPICE']] === 'Y' ? 1 : 0;
        const dme = row[columnMapping['DME']] === 'Y' ? 1 : 0;
        const pmd = row[columnMapping['PMD']] === 'Y' ? 1 : 0;
        
        mappedData.year = year;
        mappedData.total_referrals = hha + hospice + dme + pmd;
        mappedData.home_health_referrals = hha;
        mappedData.hospice_referrals = hospice;
        mappedData.dme_referrals = dme;
        mappedData.snf_referrals = 0;
        mappedData.imaging_referrals = 0;
    } else if (importType === 'nursing_home_chains') {
        mappedData.chain_name = row[columnMapping['Chain']] || '';
        mappedData.chain_id = row[columnMapping['Chain ID']] || '';
        mappedData.number_of_facilities = parseFloat(row[columnMapping['Number of facilities']] || 0);
        mappedData.avg_overall_rating = parseFloat(row[columnMapping['Average overall 5-star rating']] || 0);
        mappedData.avg_health_inspection_rating = parseFloat(row[columnMapping['Average health inspection rating']] || 0);
        mappedData.avg_staffing_rating = parseFloat(row[columnMapping['Average staffing rating']] || 0);
        mappedData.avg_quality_rating = parseFloat(row[columnMapping['Average quality rating']] || 0);
        mappedData.avg_nurse_hours_per_resident_day = parseFloat(row[columnMapping['Average total nurse hours per resident day']] || 0);
        mappedData.avg_rn_hours_per_resident_day = parseFloat(row[columnMapping['Average total Registered Nurse hours per resident day']] || 0);
        mappedData.avg_staff_turnover_percentage = parseFloat(row[columnMapping['Average total nursing staff turnover percentage']] || 0);
        mappedData.avg_rn_turnover_percentage = parseFloat(row[columnMapping['Average Registered Nurse turnover percentage']] || 0);
        mappedData.total_fines = parseFloat(row[columnMapping['Total number of fines']] || 0);
        mappedData.total_fines_amount = parseFloat(row[columnMapping['Total amount of fines in dollars']] || 0);
        mappedData.avg_rehospitalization_rate = parseFloat(row[columnMapping['Average percentage of short-stay residents who were re-hospitalized after a nursing home admission']] || 0);
        mappedData.avg_antipsychotic_use = parseFloat(row[columnMapping['Average percentage of long-stay residents who received an antipsychotic medication']] || 0);
        mappedData.avg_falls_with_injury = parseFloat(row[columnMapping['Average percentage of long-stay residents experiencing one or more falls with major injury']] || 0);
        mappedData.avg_pressure_ulcers = parseFloat(row[columnMapping['Average percentage of long-stay residents with pressure ulcers']] || 0);
        mappedData.avg_uti_rate = parseFloat(row[columnMapping['Average percentage of long-stay residents with a urinary tract infection']] || 0);
        mappedData.data_year = year;
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
                    year: parseInt(row.year),
                    total_referrals: parseInt(row.total_referrals),
                    home_health_referrals: parseInt(row.home_health_referrals),
                    hospice_referrals: parseInt(row.hospice_referrals),
                    snf_referrals: parseInt(row.snf_referrals || 0),
                    dme_referrals: parseInt(row.dme_referrals || 0),
                    imaging_referrals: parseInt(row.imaging_referrals || 0),
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
    } else if (importType === 'nursing_home_chains') {
        for (const row of validData) {
            try {
                const chainData = {
                    chain_name: row.chain_name,
                    chain_id: row.chain_id,
                    number_of_facilities: row.number_of_facilities,
                    avg_overall_rating: row.avg_overall_rating,
                    avg_health_inspection_rating: row.avg_health_inspection_rating,
                    avg_staffing_rating: row.avg_staffing_rating,
                    avg_quality_rating: row.avg_quality_rating,
                    avg_nurse_hours_per_resident_day: row.avg_nurse_hours_per_resident_day,
                    avg_rn_hours_per_resident_day: row.avg_rn_hours_per_resident_day,
                    avg_staff_turnover_percentage: row.avg_staff_turnover_percentage,
                    avg_rn_turnover_percentage: row.avg_rn_turnover_percentage,
                    total_fines: row.total_fines,
                    total_fines_amount: row.total_fines_amount,
                    avg_rehospitalization_rate: row.avg_rehospitalization_rate,
                    avg_antipsychotic_use: row.avg_antipsychotic_use,
                    avg_falls_with_injury: row.avg_falls_with_injury,
                    avg_pressure_ulcers: row.avg_pressure_ulcers,
                    avg_uti_rate: row.avg_uti_rate,
                    data_year: parseInt(year),
                };

                const existingChain = await base44.asServiceRole.entities.NursingHomeChain.filter({
                    chain_name: row.chain_name,
                    data_year: parseInt(year)
                });

                if (existingChain.length === 0) {
                    await base44.asServiceRole.entities.NursingHomeChain.create(chainData);
                    imported++;
                } else {
                    await base44.asServiceRole.entities.NursingHomeChain.update(existingChain[0].id, chainData);
                    updated++;
                }
            } catch (error) {
                console.error('Failed to import nursing home chain record:', error);
            }
        }
    }

    return { imported, updated };
}