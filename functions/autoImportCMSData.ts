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
        const validTypes = ['cms_utilization', 'cms_order_referring', 'cms_part_d', 'nursing_home_chains', 'hospice_enrollments', 'home_health_enrollments', 'home_health_cost_reports', 'cms_service_utilization', 'provider_service_utilization'];
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
                } else if (import_type === 'hospice_enrollments' || import_type === 'home_health_enrollments') {
                    const enrollmentColumn = columnMapping['ENROLLMENT ID'] || 'ENROLLMENT ID';
                    identifier = row[enrollmentColumn];
                    if (!identifier || identifier.trim() === '') {
                        invalidRows++;
                        if (errorSamples.length < 10) {
                            errorSamples.push({
                                row: i + 1,
                                message: 'Missing enrollment ID',
                            });
                        }
                        continue;
                    }
                } else if (import_type === 'home_health_cost_reports') {
                    const rptColumn = columnMapping['rpt_rec_num'] || 'rpt_rec_num';
                    identifier = row[rptColumn];
                    if (!identifier || identifier.trim() === '') {
                        invalidRows++;
                        if (errorSamples.length < 10) {
                            errorSamples.push({
                                row: i + 1,
                                message: 'Missing report record number',
                            });
                        }
                        continue;
                    }
                } else if (import_type === 'cms_service_utilization') {
                    const hcpcsColumn = columnMapping['HCPCS_Cd'] || 'HCPCS_Cd';
                    identifier = row[hcpcsColumn];
                    if (!identifier || identifier.trim() === '') {
                        invalidRows++;
                        if (errorSamples.length < 10) {
                            errorSamples.push({
                                row: i + 1,
                                message: 'Missing HCPCS code',
                            });
                        }
                        continue;
                    }
                } else if (import_type === 'provider_service_utilization') {
                    const npiColumn = columnMapping['Rndrng_NPI'] || 'Rndrng_NPI';
                    identifier = row[npiColumn];
                    if (!identifier || identifier.trim() === '') {
                        invalidRows++;
                        if (errorSamples.length < 10) {
                            errorSamples.push({
                                row: i + 1,
                                message: 'Missing NPI',
                            });
                        }
                        continue;
                    }
                } else {
                    const npiColumn = columnMapping['NPI'] || 'NPI';
                    identifier = row[npiColumn];
                }

                if (import_type !== 'nursing_home_chains' && import_type !== 'hospice_enrollments' && import_type !== 'home_health_enrollments' && import_type !== 'home_health_cost_reports' && import_type !== 'cms_service_utilization' && import_type !== 'provider_service_utilization' && !validateNPI(identifier)) {
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
                    if (import_type !== 'nursing_home_chains' && import_type !== 'hospice_enrollments' && import_type !== 'home_health_enrollments' && import_type !== 'home_health_cost_reports' && import_type !== 'cms_service_utilization' && import_type !== 'provider_service_utilization') {
                        mappedData.npi = identifier;
                        mappedData.isDuplicate = existingNPIs.has(identifier);
                    } else if (import_type === 'provider_service_utilization') {
                        mappedData.npi = identifier;
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
    } else if (importType === 'hospice_enrollments') {
        const patterns = {
            'ENROLLMENT ID': ['enrollment id'],
            'NPI': ['npi'],
            'CCN': ['ccn'],
            'ORGANIZATION NAME': ['organization name'],
            'DOING BUSINESS AS NAME': ['doing business as name'],
            'INCORPORATION DATE': ['incorporation date'],
            'INCORPORATION STATE': ['incorporation state'],
            'ORGANIZATION TYPE STRUCTURE': ['organization type structure'],
            'PROPRIETARY_NONPROFIT': ['proprietary_nonprofit'],
            'ADDRESS LINE 1': ['address line 1'],
            'ADDRESS LINE 2': ['address line 2'],
            'CITY': ['city'],
            'STATE': ['state'],
            'ZIP CODE': ['zip code'],
            'ENROLLMENT STATE': ['enrollment state'],
        };

        Object.entries(patterns).forEach(([key, patterns]) => {
            for (const pattern of patterns) {
                const idx = normalizedHeaders.findIndex(h => h === pattern.toLowerCase());
                if (idx !== -1) {
                    mapping[key] = headers[idx];
                    break;
                }
            }
        });
    } else if (importType === 'home_health_enrollments') {
        const patterns = {
            'ENROLLMENT ID': ['enrollment id'],
            'NPI': ['npi'],
            'CCN': ['ccn'],
            'ORGANIZATION NAME': ['organization name'],
            'DOING BUSINESS AS NAME': ['doing business as name'],
            'INCORPORATION DATE': ['incorporation date'],
            'INCORPORATION STATE': ['incorporation state'],
            'ORGANIZATION TYPE STRUCTURE': ['organization type structure'],
            'PROPRIETARY_NONPROFIT': ['proprietary_nonprofit'],
            'ADDRESS LINE 1': ['address line 1'],
            'ADDRESS LINE 2': ['address line 2'],
            'CITY': ['city'],
            'STATE': ['state'],
            'ZIP CODE': ['zip code'],
            'ENROLLMENT STATE': ['enrollment state'],
            'PRACTICE LOCATION TYPE': ['practice location type'],
        };

        Object.entries(patterns).forEach(([key, patterns]) => {
            for (const pattern of patterns) {
                const idx = normalizedHeaders.findIndex(h => h === pattern.toLowerCase());
                if (idx !== -1) {
                    mapping[key] = headers[idx];
                    break;
                }
            }
        });
    } else if (importType === 'home_health_cost_reports') {
        const patterns = {
            'rpt_rec_num': ['rpt_rec_num'],
            'Provider CCN': ['provider ccn'],
            'HHA Name': ['hha name'],
            'Street Address': ['street address'],
            'City': ['city'],
            'State Code': ['state code'],
            'Zip Code': ['zip code'],
            'Type of Control': ['type of control'],
            'Fiscal Year Begin Date': ['fiscal year begin date'],
            'Fiscal Year End Date': ['fiscal year end date'],
            'Total, Medicare Title XVIII Visits': ['total, medicare title xviii visits'],
            'Total, Medicaid Title XIX Visits': ['total, medicaid title xix visits'],
            'Total, Total Visits': ['total, total visits'],
            'Total Episodes-Total Visits': ['total episodes-total visits'],
            'Total Episodes-Total Charges': ['total episodes-total charges'],
            'Total Cost': ['total cost'],
            'Net Patient Revenues (line 1 minus line 2) XVIII Medicare': ['net patient revenues (line 1 minus line 2) xviii medicare'],
            'Net Patient Revenues (line 1 minus line 2) XIX Medicaid': ['net patient revenues (line 1 minus line 2) xix medicaid'],
            'Net Patient Revenues (line 1 minus line 2) Total': ['net patient revenues (line 1 minus line 2) total'],
            'Less Total Operating Expenses (sum of lines 4 through 16)': ['less total operating expenses'],
            'Net Income or Loss for the period (line 18 plus line 32)': ['net income or loss for the period'],
            'Total Assets': ['total assets'],
            'Total Liabilities': ['total liabilities'],
        };

        Object.entries(patterns).forEach(([key, patterns]) => {
            for (const pattern of patterns) {
                const idx = normalizedHeaders.findIndex(h => h === pattern.toLowerCase());
                if (idx !== -1) {
                    mapping[key] = headers[idx];
                    break;
                }
            }
        });
    } else if (importType === 'cms_service_utilization') {
        const patterns = {
            'Rndrng_Prvdr_Geo_Lvl': ['rndrng_prvdr_geo_lvl'],
            'Rndrng_Prvdr_Geo_Cd': ['rndrng_prvdr_geo_cd'],
            'Rndrng_Prvdr_Geo_Desc': ['rndrng_prvdr_geo_desc'],
            'HCPCS_Cd': ['hcpcs_cd'],
            'HCPCS_Desc': ['hcpcs_desc'],
            'HCPCS_Drug_Ind': ['hcpcs_drug_ind'],
            'Place_Of_Srvc': ['place_of_srvc'],
            'Tot_Rndrng_Prvdrs': ['tot_rndrng_prvdrs'],
            'Tot_Benes': ['tot_benes'],
            'Tot_Srvcs': ['tot_srvcs'],
            'Avg_Sbmtd_Chrg': ['avg_sbmtd_chrg'],
            'Avg_Mdcr_Alowd_Amt': ['avg_mdcr_alowd_amt'],
            'Avg_Mdcr_Pymt_Amt': ['avg_mdcr_pymt_amt'],
        };

        Object.entries(patterns).forEach(([key, patterns]) => {
            for (const pattern of patterns) {
                const idx = normalizedHeaders.findIndex(h => h === pattern.toLowerCase());
                if (idx !== -1) {
                    mapping[key] = headers[idx];
                    break;
                }
            }
        });
    } else if (importType === 'provider_service_utilization') {
        const patterns = {
            'Rndrng_NPI': ['rndrng_npi'],
            'HCPCS_Cd': ['hcpcs_cd'],
            'HCPCS_Desc': ['hcpcs_desc'],
            'HCPCS_Drug_Ind': ['hcpcs_drug_ind'],
            'Place_Of_Srvc': ['place_of_srvc'],
            'Tot_Benes': ['tot_benes'],
            'Tot_Srvcs': ['tot_srvcs'],
            'Avg_Sbmtd_Chrg': ['avg_sbmtd_chrg'],
            'Avg_Mdcr_Alowd_Amt': ['avg_mdcr_alowd_amt'],
            'Avg_Mdcr_Pymt_Amt': ['avg_mdcr_pymt_amt'],
        };

        Object.entries(patterns).forEach(([key, patterns]) => {
            for (const pattern of patterns) {
                const idx = normalizedHeaders.findIndex(h => h === pattern.toLowerCase());
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
    } else if (importType === 'hospice_enrollments') {
        mappedData.enrollment_id = row[columnMapping['ENROLLMENT ID']] || '';
        mappedData.npi = row[columnMapping['NPI']] || '';
        mappedData.ccn = row[columnMapping['CCN']] || '';
        mappedData.organization_name = row[columnMapping['ORGANIZATION NAME']] || '';
        mappedData.doing_business_as = row[columnMapping['DOING BUSINESS AS NAME']] || '';
        mappedData.incorporation_date = row[columnMapping['INCORPORATION DATE']] || '';
        mappedData.incorporation_state = row[columnMapping['INCORPORATION STATE']] || '';
        mappedData.organization_type = row[columnMapping['ORGANIZATION TYPE STRUCTURE']] || '';
        mappedData.proprietary_nonprofit = row[columnMapping['PROPRIETARY_NONPROFIT']] || '';
        mappedData.address_1 = row[columnMapping['ADDRESS LINE 1']] || '';
        mappedData.address_2 = row[columnMapping['ADDRESS LINE 2']] || '';
        mappedData.city = row[columnMapping['CITY']] || '';
        mappedData.state = row[columnMapping['STATE']] || '';
        mappedData.zip = row[columnMapping['ZIP CODE']] || '';
        mappedData.enrollment_state = row[columnMapping['ENROLLMENT STATE']] || '';
    } else if (importType === 'home_health_enrollments') {
        mappedData.enrollment_id = row[columnMapping['ENROLLMENT ID']] || '';
        mappedData.npi = row[columnMapping['NPI']] || '';
        mappedData.ccn = row[columnMapping['CCN']] || '';
        mappedData.organization_name = row[columnMapping['ORGANIZATION NAME']] || '';
        mappedData.doing_business_as = row[columnMapping['DOING BUSINESS AS NAME']] || '';
        mappedData.incorporation_date = row[columnMapping['INCORPORATION DATE']] || '';
        mappedData.incorporation_state = row[columnMapping['INCORPORATION STATE']] || '';
        mappedData.organization_type = row[columnMapping['ORGANIZATION TYPE STRUCTURE']] || '';
        mappedData.proprietary_nonprofit = row[columnMapping['PROPRIETARY_NONPROFIT']] || '';
        mappedData.address_1 = row[columnMapping['ADDRESS LINE 1']] || '';
        mappedData.address_2 = row[columnMapping['ADDRESS LINE 2']] || '';
        mappedData.city = row[columnMapping['CITY']] || '';
        mappedData.state = row[columnMapping['STATE']] || '';
        mappedData.zip = row[columnMapping['ZIP CODE']] || '';
        mappedData.enrollment_state = row[columnMapping['ENROLLMENT STATE']] || '';
        mappedData.practice_location_type = row[columnMapping['PRACTICE LOCATION TYPE']] || '';
    } else if (importType === 'home_health_cost_reports') {
        mappedData.rpt_rec_num = row[columnMapping['rpt_rec_num']] || '';
        mappedData.ccn = row[columnMapping['Provider CCN']] || '';
        mappedData.hha_name = row[columnMapping['HHA Name']] || '';
        mappedData.street_address = row[columnMapping['Street Address']] || '';
        mappedData.city = row[columnMapping['City']] || '';
        mappedData.state = row[columnMapping['State Code']] || '';
        mappedData.zip = row[columnMapping['Zip Code']] || '';
        mappedData.type_of_control = row[columnMapping['Type of Control']] || '';
        mappedData.fiscal_year_begin = row[columnMapping['Fiscal Year Begin Date']] || '';
        mappedData.fiscal_year_end = row[columnMapping['Fiscal Year End Date']] || '';
        mappedData.total_medicare_visits = parseFloat(row[columnMapping['Total, Medicare Title XVIII Visits']] || 0);
        mappedData.total_medicaid_visits = parseFloat(row[columnMapping['Total, Medicaid Title XIX Visits']] || 0);
        mappedData.total_visits = parseFloat(row[columnMapping['Total, Total Visits']] || 0);
        mappedData.total_episodes = parseFloat(row[columnMapping['Total Episodes-Total Visits']] || 0);
        mappedData.total_charges = parseFloat(row[columnMapping['Total Episodes-Total Charges']] || 0);
        mappedData.total_cost = parseFloat(row[columnMapping['Total Cost']] || 0);
        mappedData.net_patient_revenue_medicare = parseFloat(row[columnMapping['Net Patient Revenues (line 1 minus line 2) XVIII Medicare']] || 0);
        mappedData.net_patient_revenue_medicaid = parseFloat(row[columnMapping['Net Patient Revenues (line 1 minus line 2) XIX Medicaid']] || 0);
        mappedData.net_patient_revenue_total = parseFloat(row[columnMapping['Net Patient Revenues (line 1 minus line 2) Total']] || 0);
        mappedData.total_operating_expenses = parseFloat(row[columnMapping['Less Total Operating Expenses (sum of lines 4 through 16)']] || 0);
        mappedData.net_income = parseFloat(row[columnMapping['Net Income or Loss for the period (line 18 plus line 32)']] || 0);
        mappedData.total_assets = parseFloat(row[columnMapping['Total Assets']] || 0);
        mappedData.total_liabilities = parseFloat(row[columnMapping['Total Liabilities']] || 0);
    } else if (importType === 'cms_service_utilization') {
        mappedData.geo_level = row[columnMapping['Rndrng_Prvdr_Geo_Lvl']] || '';
        mappedData.geo_code = row[columnMapping['Rndrng_Prvdr_Geo_Cd']] || '';
        mappedData.geo_description = row[columnMapping['Rndrng_Prvdr_Geo_Desc']] || '';
        mappedData.hcpcs_code = row[columnMapping['HCPCS_Cd']] || '';
        mappedData.hcpcs_description = row[columnMapping['HCPCS_Desc']] || '';
        mappedData.drug_indicator = row[columnMapping['HCPCS_Drug_Ind']] || '';
        mappedData.place_of_service = row[columnMapping['Place_Of_Srvc']] || '';
        mappedData.total_providers = parseFloat(row[columnMapping['Tot_Rndrng_Prvdrs']] || 0);
        mappedData.total_beneficiaries = parseFloat(row[columnMapping['Tot_Benes']] || 0);
        mappedData.total_services = parseFloat(row[columnMapping['Tot_Srvcs']] || 0);
        mappedData.avg_submitted_charge = parseFloat(row[columnMapping['Avg_Sbmtd_Chrg']] || 0);
        mappedData.avg_medicare_allowed = parseFloat(row[columnMapping['Avg_Mdcr_Alowd_Amt']] || 0);
        mappedData.avg_medicare_payment = parseFloat(row[columnMapping['Avg_Mdcr_Pymt_Amt']] || 0);
        mappedData.data_year = year;
    } else if (importType === 'provider_service_utilization') {
        mappedData.npi = row[columnMapping['Rndrng_NPI']] || '';
        mappedData.hcpcs_code = row[columnMapping['HCPCS_Cd']] || '';
        mappedData.hcpcs_description = row[columnMapping['HCPCS_Desc']] || '';
        mappedData.drug_indicator = row[columnMapping['HCPCS_Drug_Ind']] || '';
        mappedData.place_of_service = row[columnMapping['Place_Of_Srvc']] || '';
        mappedData.total_beneficiaries = parseFloat(row[columnMapping['Tot_Benes']] || 0);
        mappedData.total_services = parseFloat(row[columnMapping['Tot_Srvcs']] || 0);
        mappedData.avg_submitted_charge = parseFloat(row[columnMapping['Avg_Sbmtd_Chrg']] || 0);
        mappedData.avg_medicare_allowed = parseFloat(row[columnMapping['Avg_Mdcr_Alowd_Amt']] || 0);
        mappedData.avg_medicare_payment = parseFloat(row[columnMapping['Avg_Mdcr_Pymt_Amt']] || 0);
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
    } else if (importType === 'hospice_enrollments') {
        for (const row of validData) {
            try {
                // Create provider placeholder if doesn't exist
                const existingProvider = await base44.asServiceRole.entities.Provider.filter({ npi: row.npi });
                if (existingProvider.length === 0 && row.npi) {
                    await base44.asServiceRole.entities.Provider.create({
                        npi: row.npi,
                        organization_name: row.organization_name,
                        entity_type: 'Organization',
                        status: 'Active',
                        needs_nppes_enrichment: true,
                    });
                }

                const hospiceData = {
                    enrollment_id: row.enrollment_id,
                    npi: row.npi,
                    ccn: row.ccn,
                    organization_name: row.organization_name,
                    doing_business_as: row.doing_business_as,
                    incorporation_date: row.incorporation_date,
                    incorporation_state: row.incorporation_state,
                    organization_type: row.organization_type,
                    proprietary_nonprofit: row.proprietary_nonprofit,
                    address_1: row.address_1,
                    address_2: row.address_2,
                    city: row.city,
                    state: row.state,
                    zip: row.zip,
                    enrollment_state: row.enrollment_state,
                };

                const existingHospice = await base44.asServiceRole.entities.HospiceEnrollment.filter({
                    enrollment_id: row.enrollment_id
                });

                if (existingHospice.length === 0) {
                    await base44.asServiceRole.entities.HospiceEnrollment.create(hospiceData);
                    imported++;
                } else {
                    await base44.asServiceRole.entities.HospiceEnrollment.update(existingHospice[0].id, hospiceData);
                    updated++;
                }
            } catch (error) {
                console.error('Failed to import hospice enrollment record:', error);
            }
        }
    } else if (importType === 'home_health_enrollments') {
        for (const row of validData) {
            try {
                // Create provider placeholder if doesn't exist
                const existingProvider = await base44.asServiceRole.entities.Provider.filter({ npi: row.npi });
                if (existingProvider.length === 0 && row.npi) {
                    await base44.asServiceRole.entities.Provider.create({
                        npi: row.npi,
                        organization_name: row.organization_name,
                        entity_type: 'Organization',
                        status: 'Active',
                        needs_nppes_enrichment: true,
                    });
                }

                const homeHealthData = {
                    enrollment_id: row.enrollment_id,
                    npi: row.npi,
                    ccn: row.ccn,
                    organization_name: row.organization_name,
                    doing_business_as: row.doing_business_as,
                    incorporation_date: row.incorporation_date,
                    incorporation_state: row.incorporation_state,
                    organization_type: row.organization_type,
                    proprietary_nonprofit: row.proprietary_nonprofit,
                    address_1: row.address_1,
                    address_2: row.address_2,
                    city: row.city,
                    state: row.state,
                    zip: row.zip,
                    enrollment_state: row.enrollment_state,
                    practice_location_type: row.practice_location_type,
                };

                const existingHomeHealth = await base44.asServiceRole.entities.HomeHealthEnrollment.filter({
                    enrollment_id: row.enrollment_id
                });

                if (existingHomeHealth.length === 0) {
                    await base44.asServiceRole.entities.HomeHealthEnrollment.create(homeHealthData);
                    imported++;
                } else {
                    await base44.asServiceRole.entities.HomeHealthEnrollment.update(existingHomeHealth[0].id, homeHealthData);
                    updated++;
                }
            } catch (error) {
                console.error('Failed to import home health enrollment record:', error);
            }
        }
    } else if (importType === 'home_health_cost_reports') {
        for (const row of validData) {
            try {
                const costReportData = {
                    rpt_rec_num: row.rpt_rec_num,
                    ccn: row.ccn,
                    hha_name: row.hha_name,
                    street_address: row.street_address,
                    city: row.city,
                    state: row.state,
                    zip: row.zip,
                    type_of_control: row.type_of_control,
                    fiscal_year_begin: row.fiscal_year_begin,
                    fiscal_year_end: row.fiscal_year_end,
                    total_medicare_visits: row.total_medicare_visits,
                    total_medicaid_visits: row.total_medicaid_visits,
                    total_visits: row.total_visits,
                    total_episodes: row.total_episodes,
                    total_charges: row.total_charges,
                    total_cost: row.total_cost,
                    net_patient_revenue_medicare: row.net_patient_revenue_medicare,
                    net_patient_revenue_medicaid: row.net_patient_revenue_medicaid,
                    net_patient_revenue_total: row.net_patient_revenue_total,
                    total_operating_expenses: row.total_operating_expenses,
                    net_income: row.net_income,
                    total_assets: row.total_assets,
                    total_liabilities: row.total_liabilities,
                };

                const existingReport = await base44.asServiceRole.entities.HomeHealthCostReport.filter({
                    rpt_rec_num: row.rpt_rec_num
                });

                if (existingReport.length === 0) {
                    await base44.asServiceRole.entities.HomeHealthCostReport.create(costReportData);
                    imported++;
                } else {
                    await base44.asServiceRole.entities.HomeHealthCostReport.update(existingReport[0].id, costReportData);
                    updated++;
                }
            } catch (error) {
                console.error('Failed to import home health cost report record:', error);
            }
        }
    } else if (importType === 'cms_service_utilization') {
        for (const row of validData) {
            try {
                const serviceData = {
                    geo_level: row.geo_level,
                    geo_code: row.geo_code,
                    geo_description: row.geo_description,
                    hcpcs_code: row.hcpcs_code,
                    hcpcs_description: row.hcpcs_description,
                    drug_indicator: row.drug_indicator,
                    place_of_service: row.place_of_service,
                    total_providers: row.total_providers,
                    total_beneficiaries: row.total_beneficiaries,
                    total_services: row.total_services,
                    avg_submitted_charge: row.avg_submitted_charge,
                    avg_medicare_allowed: row.avg_medicare_allowed,
                    avg_medicare_payment: row.avg_medicare_payment,
                    data_year: parseInt(year),
                };

                const existingService = await base44.asServiceRole.entities.CMSServiceUtilization.filter({
                    hcpcs_code: row.hcpcs_code,
                    geo_code: row.geo_code,
                    place_of_service: row.place_of_service,
                    data_year: parseInt(year)
                });

                if (existingService.length === 0) {
                    await base44.asServiceRole.entities.CMSServiceUtilization.create(serviceData);
                    imported++;
                } else {
                    await base44.asServiceRole.entities.CMSServiceUtilization.update(existingService[0].id, serviceData);
                    updated++;
                }
            } catch (error) {
                console.error('Failed to import service utilization record:', error);
            }
        }
    } else if (importType === 'provider_service_utilization') {
        for (const row of validData) {
            try {
                const providerNPI = row.npi;

                const existingProvider = await base44.asServiceRole.entities.Provider.filter({ npi: providerNPI });
                if (existingProvider.length === 0) {
                    await base44.asServiceRole.entities.Provider.create({
                        npi: providerNPI,
                        needs_nppes_enrichment: true,
                    });
                }

                const serviceData = {
                    npi: row.npi,
                    hcpcs_code: row.hcpcs_code,
                    hcpcs_description: row.hcpcs_description,
                    drug_indicator: row.drug_indicator,
                    place_of_service: row.place_of_service,
                    total_beneficiaries: row.total_beneficiaries,
                    total_services: row.total_services,
                    avg_submitted_charge: row.avg_submitted_charge,
                    avg_medicare_allowed: row.avg_medicare_allowed,
                    avg_medicare_payment: row.avg_medicare_payment,
                    data_year: parseInt(year),
                };

                const existingService = await base44.asServiceRole.entities.ProviderServiceUtilization.filter({
                    npi: row.npi,
                    hcpcs_code: row.hcpcs_code,
                    place_of_service: row.place_of_service,
                    data_year: parseInt(year)
                });

                if (existingService.length === 0) {
                    await base44.asServiceRole.entities.ProviderServiceUtilization.create(serviceData);
                    imported++;
                } else {
                    await base44.asServiceRole.entities.ProviderServiceUtilization.update(existingService[0].id, serviceData);
                    updated++;
                }
            } catch (error) {
                console.error('Failed to import provider service utilization record:', error);
            }
        }
    }

    return { imported, updated };
}