import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Strict time budget: 45s to leave buffer before platform kills us
const MAX_EXEC_MS = 45_000;
const FETCH_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 1000;
const BULK_SIZE = 50;

function isTimeUp(startTime) {
    return Date.now() - startTime > MAX_EXEC_MS;
}

async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        return res;
    } finally {
        clearTimeout(timer);
    }
}

Deno.serve(async (req) => {
    const startTime = Date.now();

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const payload = await req.json();
        const { import_type, file_url, year = 2023, dry_run = false, resume_offset = 0, batch_id = null } = payload;

        const validTypes = ['cms_utilization', 'cms_order_referring', 'cms_part_d', 'nursing_home_chains', 'hospice_enrollments', 'home_health_enrollments', 'home_health_cost_reports', 'cms_service_utilization', 'provider_service_utilization', 'home_health_pdgm', 'inpatient_drg', 'provider_ownership', 'opt_out_physicians', 'medicare_hha_stats'];
        if (!validTypes.includes(import_type)) {
            return Response.json({ error: `Invalid import type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
        }

        if (!file_url) {
            return Response.json({ error: 'file_url is required' }, { status: 400 });
        }

        // Create or resume batch
        let batch;
        if (batch_id) {
            const existing = await base44.asServiceRole.entities.ImportBatch.filter({ id: batch_id });
            batch = existing[0];
            if (!batch) return Response.json({ error: 'Batch not found' }, { status: 404 });
            await base44.asServiceRole.entities.ImportBatch.update(batch.id, { status: 'processing' });
        } else {
            batch = await base44.asServiceRole.entities.ImportBatch.create({
                import_type,
                file_name: `auto_import_${import_type}_${year}_${Date.now()}.csv`,
                file_url,
                status: 'validating',
                dry_run,
            });
        }

        try {
            // Detect if JSON API or CSV
            const probeResp = await fetchWithTimeout(file_url + (file_url.includes('?') ? '&' : '?') + '$limit=1');
            if (!probeResp.ok) throw new Error(`Failed to fetch file: ${probeResp.statusText}`);
            const probeText = await probeResp.text();
            const isJsonApi = probeText.trim().startsWith('[');

            let totalProcessed = 0;
            let validRows = 0;
            let invalidRows = 0;
            let duplicateRows = 0;
            let importedCount = 0;
            let updatedCount = 0;
            let skippedCount = 0;
            const errorSamples = [];
            let columnMapping = {};
            let offset = resume_offset;
            let reachedEnd = false;

            if (isJsonApi) {
                // === STREAMING PAGE-BY-PAGE APPROACH ===
                // Fetch one page, validate, import, then fetch next page
                // This avoids loading entire dataset in memory
                
                while (!isTimeUp(startTime) && !reachedEnd) {
                    const separator = file_url.includes('?') ? '&' : '?';
                    const pageUrl = `${file_url}${separator}$offset=${offset}&$limit=${PAGE_SIZE}`;
                    console.log(`Fetching page at offset ${offset}...`);
                    
                    let pageResponse;
                    try {
                        pageResponse = await fetchWithTimeout(pageUrl);
                    } catch (e) {
                        console.warn(`Fetch timeout at offset ${offset}: ${e.message}`);
                        break;
                    }
                    if (!pageResponse.ok) {
                        console.warn(`Fetch failed at offset ${offset}: ${pageResponse.statusText}`);
                        break;
                    }
                    
                    const pageText = await pageResponse.text();
                    let pageData;
                    try { pageData = JSON.parse(pageText); } catch (e) { break; }
                    if (!Array.isArray(pageData) || pageData.length === 0) {
                        reachedEnd = true;
                        break;
                    }

                    // Detect columns from first page
                    if (offset === resume_offset && pageData.length > 0) {
                        const headers = Object.keys(pageData[0]);
                        columnMapping = detectCMSColumns(headers, import_type);
                        await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                            column_mapping: columnMapping, status: 'processing',
                        });
                    }

                    // Validate + map this page
                    const validDataChunk = [];
                    const seenInPage = new Set();
                    
                    for (const row of pageData) {
                        totalProcessed++;
                        const identifier = getIdentifier(row, columnMapping, import_type);
                        
                        if (!identifier) {
                            invalidRows++;
                            if (errorSamples.length < 5) errorSamples.push({ row: totalProcessed, message: 'Missing identifier' });
                            continue;
                        }

                        if (needsNpiValidation(import_type) && !validateNPI(identifier)) {
                            invalidRows++;
                            if (errorSamples.length < 5) errorSamples.push({ row: totalProcessed, npi: identifier, message: 'Invalid NPI' });
                            continue;
                        }

                        if (seenInPage.has(identifier)) { duplicateRows++; continue; }
                        seenInPage.add(identifier);
                        validRows++;

                        const mapped = mapCMSData(row, columnMapping, import_type, year);
                        if (needsNpiField(import_type)) mapped.npi = identifier;
                        validDataChunk.push(mapped);
                    }

                    // Import this chunk immediately (don't accumulate)
                    if (!dry_run && validDataChunk.length > 0 && !isTimeUp(startTime)) {
                        const result = await importChunk(base44, import_type, validDataChunk, year, startTime);
                        importedCount += result.imported;
                        updatedCount += result.updated;
                        skippedCount += result.skipped;
                    }

                    offset += pageData.length;
                    
                    if (pageData.length < PAGE_SIZE) {
                        reachedEnd = true;
                    }

                    // Update progress
                    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                        total_rows: offset,
                        valid_rows: validRows,
                        invalid_rows: invalidRows,
                        duplicate_rows: duplicateRows,
                        imported_rows: importedCount,
                        updated_rows: updatedCount,
                        skipped_rows: skippedCount,
                    });
                }
            } else {
                // CSV handling - load all at once (CSVs are typically smaller)
                const fullResp = await fetchWithTimeout(file_url, 30000);
                if (!fullResp.ok) throw new Error(`Failed to fetch: ${fullResp.statusText}`);
                const text = await fullResp.text();
                const lines = text.split('\n').filter(l => l.trim());
                const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                columnMapping = detectCMSColumns(headers, import_type);

                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    column_mapping: columnMapping, total_rows: lines.length - 1, status: 'processing',
                });

                const validDataChunk = [];
                const seenIds = new Set();

                for (let i = 1; i < lines.length; i++) {
                    if (isTimeUp(startTime)) break;
                    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
                    const row = {};
                    headers.forEach((h, idx) => { row[h] = values[idx]; });
                    totalProcessed++;

                    const identifier = getIdentifier(row, columnMapping, import_type);
                    if (!identifier) { invalidRows++; continue; }
                    if (needsNpiValidation(import_type) && !validateNPI(identifier)) { invalidRows++; continue; }
                    if (seenIds.has(identifier)) { duplicateRows++; continue; }
                    seenIds.add(identifier);
                    validRows++;

                    const mapped = mapCMSData(row, columnMapping, import_type, year);
                    if (needsNpiField(import_type)) mapped.npi = identifier;
                    validDataChunk.push(mapped);

                    // Import in batches of 200 to avoid memory buildup
                    if (validDataChunk.length >= 200 && !dry_run) {
                        const result = await importChunk(base44, import_type, validDataChunk.splice(0), year, startTime);
                        importedCount += result.imported;
                        updatedCount += result.updated;
                        skippedCount += result.skipped;
                        validDataChunk.length = 0;
                    }
                }

                // Import remaining
                if (!dry_run && validDataChunk.length > 0 && !isTimeUp(startTime)) {
                    const result = await importChunk(base44, import_type, validDataChunk, year, startTime);
                    importedCount += result.imported;
                    updatedCount += result.updated;
                    skippedCount += result.skipped;
                }

                reachedEnd = totalProcessed >= lines.length - 1;
            }

            const partial = !reachedEnd;
            const finalStatus = dry_run ? 'completed' : partial ? 'paused' : 'completed';

            await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                status: finalStatus,
                total_rows: offset || totalProcessed,
                valid_rows: validRows,
                invalid_rows: invalidRows,
                duplicate_rows: duplicateRows,
                imported_rows: importedCount,
                updated_rows: updatedCount,
                skipped_rows: skippedCount,
                error_samples: errorSamples,
                dedup_summary: { created: importedCount, updated: updatedCount, skipped: skippedCount },
                ...(partial ? {
                    paused_at: new Date().toISOString(),
                    cancel_reason: `Auto-paused at offset ${offset}: time limit. Resume with resume_offset=${offset}`,
                    retry_params: { resume_offset: offset },
                } : {
                    completed_at: new Date().toISOString(),
                }),
            });

            // Audit
            await base44.asServiceRole.entities.AuditEvent.create({
                event_type: 'import', user_email: user.email,
                details: { action: 'CMS Data Import', entity: import_type, imported: importedCount, updated: updatedCount, partial },
                timestamp: new Date().toISOString(),
            });

            return Response.json({
                success: true, partial, batch_id: batch.id,
                total_processed: totalProcessed, valid_rows: validRows,
                imported_rows: importedCount, updated_rows: updatedCount,
                next_offset: partial ? offset : null,
                elapsed_ms: Date.now() - startTime,
            });

        } catch (error) {
            await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                status: 'failed', error_samples: [{ message: error.message }],
            });

            try {
                const errorReport = await base44.asServiceRole.entities.ErrorReport.create({
                    error_type: 'import_failure', severity: 'high', source: batch.id,
                    title: `Import failed: ${import_type}`,
                    description: `Automated import for ${import_type} failed: ${error.message}`,
                    error_samples: [{ message: error.message }],
                    context: { import_type, file_url, batch_id: batch.id, year },
                    status: 'new',
                });
                await base44.asServiceRole.functions.invoke('sendErrorNotification', {
                    error_report_id: errorReport.id, batch_id: batch.id,
                });
            } catch (e) { console.error('Notification failed:', e.message); }

            throw error;
        }

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});

// === HELPERS ===

function validateNPI(npi) {
    if (!npi) return false;
    return String(npi).replace(/\D/g, '').length === 10;
}

function needsNpiValidation(importType) {
    return !['nursing_home_chains', 'hospice_enrollments', 'home_health_enrollments', 'home_health_cost_reports', 'cms_service_utilization', 'provider_service_utilization', 'home_health_pdgm', 'inpatient_drg', 'provider_ownership', 'opt_out_physicians'].includes(importType);
}

function needsNpiField(importType) {
    return ['cms_utilization', 'cms_order_referring', 'provider_service_utilization', 'opt_out_physicians'].includes(importType);
}

function getIdentifier(row, mapping, importType) {
    const idFields = {
        'nursing_home_chains': 'Chain',
        'hospice_enrollments': 'ENROLLMENT ID',
        'home_health_enrollments': 'ENROLLMENT ID',
        'home_health_cost_reports': 'rpt_rec_num',
        'cms_service_utilization': 'HCPCS_Cd',
        'provider_service_utilization': 'Rndrng_NPI',
        'home_health_pdgm': 'PRVDR_ID',
        'inpatient_drg': 'Rndrng_Prvdr_CCN',
        'provider_ownership': 'ENROLLMENT ID',
        'opt_out_physicians': 'NPI',
    };
    const field = idFields[importType] || 'NPI';
    const col = mapping[field] || field;
    const val = row[col];
    return val && String(val).trim() !== '' ? String(val).trim() : null;
}

// Lightweight chunk importer — no upsert for bulk types, just bulkCreate
async function importChunk(base44, importType, records, year, startTime) {
    let imported = 0, updated = 0, skipped = 0;

    const entityMap = {
        'cms_utilization': 'CMSUtilization',
        'cms_order_referring': 'CMSReferral',
        'nursing_home_chains': 'NursingHomeChain',
        'hospice_enrollments': 'HospiceEnrollment',
        'home_health_enrollments': 'HomeHealthEnrollment',
        'home_health_cost_reports': 'HomeHealthCostReport',
        'cms_service_utilization': 'CMSServiceUtilization',
        'provider_service_utilization': 'ProviderServiceUtilization',
        'home_health_pdgm': 'HomeHealthPDGM',
        'inpatient_drg': 'InpatientDRG',
        'provider_ownership': 'ProviderOwnership',
        'opt_out_physicians': 'OptOutPhysician',
    };

    const entityName = entityMap[importType];
    if (!entityName) return { imported: 0, updated: 0, skipped: 0 };
    const entity = base44.asServiceRole.entities[entityName];

    // For large datasets, just bulkCreate (no upsert) for speed
    for (let i = 0; i < records.length; i += BULK_SIZE) {
        if (isTimeUp(startTime)) break;
        const chunk = records.slice(i, i + BULK_SIZE);
        await entity.bulkCreate(chunk);
        imported += chunk.length;
    }

    return { imported, updated, skipped };
}

function detectCMSColumns(headers, importType) {
    const mapping = {};
    const nh = headers.map(h => h.toLowerCase().trim());

    // NPI
    for (const p of ['npi', 'national_provider_identifier', 'provider_npi']) {
        const idx = nh.findIndex(h => h.includes(p));
        if (idx !== -1) { mapping['NPI'] = headers[idx]; break; }
    }

    const patterns = {
        'cms_utilization': { 'Year': ['year'], 'Total Services': ['number_of_services', 'total_services', 'line_srvc_cnt'], 'Medicare Beneficiaries': ['number_of_medicare_beneficiaries', 'bene_unique_cnt'], 'Medicare Payment Amount': ['average_medicare_payment_amt', 'total_medicare_payment'] },
        'cms_order_referring': { 'HHA': ['hha'], 'HOSPICE': ['hospice'], 'DME': ['dme'], 'PMD': ['pmd'] },
        'nursing_home_chains': { 'Chain': ['chain'], 'Chain ID': ['chain id'], 'Number of facilities': ['number of facilities'] },
        'hospice_enrollments': { 'ENROLLMENT ID': ['enrollment id'], 'NPI': ['npi'], 'CCN': ['ccn'], 'ORGANIZATION NAME': ['organization name'], 'DOING BUSINESS AS NAME': ['doing business as name'], 'CITY': ['city'], 'STATE': ['state'], 'ZIP CODE': ['zip code'], 'ENROLLMENT STATE': ['enrollment state'] },
        'home_health_enrollments': { 'ENROLLMENT ID': ['enrollment id'], 'NPI': ['npi'], 'CCN': ['ccn'], 'ORGANIZATION NAME': ['organization name'], 'DOING BUSINESS AS NAME': ['doing business as name'], 'CITY': ['city'], 'STATE': ['state'], 'ZIP CODE': ['zip code'], 'ENROLLMENT STATE': ['enrollment state'], 'PRACTICE LOCATION TYPE': ['practice location type'] },
        'home_health_cost_reports': { 'rpt_rec_num': ['rpt_rec_num'], 'Provider CCN': ['provider ccn'], 'HHA Name': ['hha name'], 'City': ['city'], 'State Code': ['state code'] },
        'cms_service_utilization': { 'Rndrng_Prvdr_Geo_Lvl': ['rndrng_prvdr_geo_lvl'], 'HCPCS_Cd': ['hcpcs_cd'], 'HCPCS_Desc': ['hcpcs_desc'], 'Tot_Srvcs': ['tot_srvcs'], 'Avg_Mdcr_Pymt_Amt': ['avg_mdcr_pymt_amt'] },
        'provider_service_utilization': { 'Rndrng_NPI': ['rndrng_npi'], 'HCPCS_Cd': ['hcpcs_cd'], 'HCPCS_Desc': ['hcpcs_desc'], 'Tot_Benes': ['tot_benes'], 'Tot_Srvcs': ['tot_srvcs'], 'Avg_Sbmtd_Chrg': ['avg_sbmtd_chrg'], 'Avg_Mdcr_Alowd_Amt': ['avg_mdcr_alowd_amt'], 'Avg_Mdcr_Pymt_Amt': ['avg_mdcr_pymt_amt'] },
        'home_health_pdgm': { 'PRVDR_ID': ['prvdr_id'], 'PRVDR_NAME': ['prvdr_name'], 'STATE': ['state'], 'GRPNG': ['grpng'] },
        'inpatient_drg': { 'Rndrng_Prvdr_CCN': ['rndrng_prvdr_ccn'], 'DRG_Cd': ['drg_cd'], 'Tot_Dschrgs': ['tot_dschrgs'], 'Avg_Mdcr_Pymt_Amt': ['avg_mdcr_pymt_amt'] },
        'provider_ownership': { 'ENROLLMENT ID': ['enrollment id'], 'ASSOCIATE ID': ['associate id'], 'ORGANIZATION NAME': ['organization name'] },
        'opt_out_physicians': { 'NPI': ['npi'], 'LAST_NAME': ['last_name'], 'FIRST_NAME': ['first_name'] },
    };

    const typePatterns = patterns[importType] || {};
    for (const [key, pats] of Object.entries(typePatterns)) {
        for (const pat of pats) {
            const idx = nh.findIndex(h => h.includes(pat.toLowerCase()));
            if (idx !== -1) { mapping[key] = headers[idx]; break; }
        }
    }
    return mapping;
}

function mapCMSData(row, cm, importType, year) {
    const m = {};
    const g = (k) => row[cm[k]] || row[k] || '';
    const n = (k) => { const v = g(k); return v ? parseFloat(String(v).replace(/[,$%\s]/g, '')) || 0 : 0; };

    if (importType === 'cms_utilization') {
        m.year = parseInt(g('Year') || year);
        m.total_services = n('Total Services');
        m.total_medicare_beneficiaries = n('Medicare Beneficiaries');
        m.total_medicare_payment = n('Medicare Payment Amount');
    } else if (importType === 'cms_order_referring') {
        m.year = year;
        const hha = g('HHA') === 'Y' ? 1 : 0, hospice = g('HOSPICE') === 'Y' ? 1 : 0, dme = g('DME') === 'Y' ? 1 : 0, pmd = g('PMD') === 'Y' ? 1 : 0;
        m.total_referrals = hha + hospice + dme + pmd;
        m.home_health_referrals = hha; m.hospice_referrals = hospice; m.dme_referrals = dme;
        m.snf_referrals = 0; m.imaging_referrals = 0;
    } else if (importType === 'nursing_home_chains') {
        m.chain_name = g('Chain'); m.chain_id = g('Chain ID');
        m.number_of_facilities = n('Number of facilities');
        m.data_year = parseInt(year);
    } else if (importType === 'hospice_enrollments') {
        m.enrollment_id = g('ENROLLMENT ID'); m.npi = g('NPI'); m.ccn = g('CCN');
        m.organization_name = g('ORGANIZATION NAME'); m.doing_business_as = g('DOING BUSINESS AS NAME');
        m.city = g('CITY'); m.state = g('STATE'); m.zip = g('ZIP CODE');
        m.enrollment_state = g('ENROLLMENT STATE');
    } else if (importType === 'home_health_enrollments') {
        m.enrollment_id = g('ENROLLMENT ID'); m.npi = g('NPI'); m.ccn = g('CCN');
        m.organization_name = g('ORGANIZATION NAME'); m.doing_business_as = g('DOING BUSINESS AS NAME');
        m.city = g('CITY'); m.state = g('STATE'); m.zip = g('ZIP CODE');
        m.enrollment_state = g('ENROLLMENT STATE'); m.practice_location_type = g('PRACTICE LOCATION TYPE');
    } else if (importType === 'home_health_cost_reports') {
        m.rpt_rec_num = g('rpt_rec_num'); m.ccn = g('Provider CCN'); m.hha_name = g('HHA Name');
        m.city = g('City'); m.state = g('State Code'); m.zip = g('Zip Code');
    } else if (importType === 'cms_service_utilization') {
        m.geo_level = g('Rndrng_Prvdr_Geo_Lvl'); m.hcpcs_code = g('HCPCS_Cd');
        m.hcpcs_description = g('HCPCS_Desc'); m.total_services = n('Tot_Srvcs');
        m.avg_medicare_payment = n('Avg_Mdcr_Pymt_Amt'); m.data_year = parseInt(year);
    } else if (importType === 'provider_service_utilization') {
        m.npi = g('Rndrng_NPI'); m.hcpcs_code = g('HCPCS_Cd'); m.hcpcs_description = g('HCPCS_Desc');
        m.drug_indicator = g('HCPCS_Drug_Ind'); m.place_of_service = g('Place_Of_Srvc');
        m.total_beneficiaries = n('Tot_Benes'); m.total_services = n('Tot_Srvcs');
        m.avg_submitted_charge = n('Avg_Sbmtd_Chrg'); m.avg_medicare_allowed = n('Avg_Mdcr_Alowd_Amt');
        m.avg_medicare_payment = n('Avg_Mdcr_Pymt_Amt'); m.data_year = parseInt(year);
    } else if (importType === 'home_health_pdgm') {
        m.provider_id = g('PRVDR_ID'); m.provider_name = g('PRVDR_NAME');
        m.state = g('STATE'); m.grouping_code = g('GRPNG'); m.data_year = parseInt(year);
    } else if (importType === 'inpatient_drg') {
        m.provider_ccn = g('Rndrng_Prvdr_CCN'); m.drg_code = g('DRG_Cd');
        m.total_discharges = n('Tot_Dschrgs'); m.avg_medicare_payment = n('Avg_Mdcr_Pymt_Amt');
        m.data_year = parseInt(year);
    } else if (importType === 'provider_ownership') {
        m.enrollment_id = g('ENROLLMENT ID'); m.associate_id = g('ASSOCIATE ID');
        m.organization_name = g('ORGANIZATION NAME');
    } else if (importType === 'opt_out_physicians') {
        m.npi = g('NPI'); m.last_name = g('LAST_NAME'); m.first_name = g('FIRST_NAME');
    }
    return m;
}