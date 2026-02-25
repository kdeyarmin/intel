import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Strict time budget: 45s to leave buffer before platform kills us
const MAX_EXEC_MS = 40_000; // Reduced to 40s to be safer
const FETCH_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 500; // Reduced page size for more frequent updates
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
        
        // Allow service role calls (from scheduled imports) or admin users
        let user = null;
        try {
            user = await base44.auth.me();
        } catch (e) {
            // Service role calls may not have a user context — that's OK
        }
        
        // If there's a user, they must be admin. If no user, assume service role call.
        if (user && user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const payload = await req.json();
        const { import_type: raw_import_type, file_url, year = 2023, dry_run = false, resume_offset = 0, batch_id = null, retry_of = null, retry_count = 0, retry_tags = null, category: retryCategory = null } = payload;

        // Resolve aliases before validation
        const ALIASES = { cms_utilization: 'provider_service_utilization' };
        const import_type = ALIASES[raw_import_type] || raw_import_type;
        
        const validTypes = [
            'cms_order_referring', 'opt_out_physicians',
            'hospice_enrollments', 'home_health_enrollments',
            'provider_service_utilization', 'cms_part_d',
            'hospital_general_info', 'nursing_home_compare',
            'home_health_compare', 'provider_ownership',
            'dmepos_suppliers', 'medicare_inpatient_charges',
            'medicare_outpatient_charges',
        ];
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
             // Only allow resume if not already in progress
             if (batch.status === 'processing') {
                 return Response.json({
                     error: `Batch ${batch_id} is already processing`,
                     conflict: true,
                     batch_id: batch.id,
                 }, { status: 409 });
             }
             await base44.asServiceRole.entities.ImportBatch.update(batch.id, { status: 'processing' });
         } else {
             // Check for duplicate import_type already in progress (for new imports only)
             // Filter out signal/control batches
             const activeImports = await base44.asServiceRole.entities.ImportBatch.filter({
                 import_type,
                 status: { $in: ['validating', 'processing'] }
             });
             const realActive = activeImports.filter(b => {
                 const fn = b.file_name || '';
                 return fn !== 'batch_process_active' && fn !== 'crawler_batch_stop_signal' && fn !== 'crawler_auto_stop_signal';
             });
             if (realActive.length > 0) {
                 const existing = realActive[0];
                 // If the active batch has been stuck for over 2 hours, auto-cancel it
                 const stuckMs = Date.now() - new Date(existing.updated_date || existing.created_date).getTime();
                 if (stuckMs > 2 * 60 * 60 * 1000) {
                     console.warn(`Auto-cancelling stale batch ${existing.id} (stuck ${Math.round(stuckMs / 60000)}min)`);
                     await base44.asServiceRole.entities.ImportBatch.update(existing.id, {
                         status: 'failed',
                         cancel_reason: `Auto-cancelled: stuck in "${existing.status}" for ${Math.round(stuckMs / 60000)} minutes`,
                         cancelled_at: new Date().toISOString(),
                     });
                 } else {
                     return Response.json({
                         error: `Import for ${import_type} is already in progress`,
                         conflict: true,
                         existing_batch_id: existing.id,
                         started_at: existing.created_date,
                     }, { status: 409 });
                 }
             }
             batch = await base44.asServiceRole.entities.ImportBatch.create({
                 import_type,
                 file_name: `auto_import_${import_type}_${year}_${Date.now()}`,
                 file_url,
                 data_year: parseInt(year),
                 status: 'processing',
                 dry_run,
                 ...(retry_of ? { retry_of, retry_count: retry_count || 1, tags: retry_tags || ['retry'] } : {}),
                 ...(retryCategory ? { category: retryCategory } : {}),
             });
         }

        try {
            // Probe the URL to detect format
            const probeUrl = file_url + (file_url.includes('?') ? '&' : '?') + '$limit=1';
            console.log(`Probing URL: ${probeUrl}`);
            const probeResp = await fetchWithTimeout(probeUrl);
            if (!probeResp.ok) throw new Error(`Failed to fetch: ${probeResp.status} ${probeResp.statusText}`);
            const probeText = await probeResp.text();

            // Detect HTML responses (expired/changed URLs return CMS landing pages)
            const trimmedProbe = probeText.trim().toLowerCase();
            if (trimmedProbe.startsWith('<!doctype') || trimmedProbe.startsWith('<html') || trimmedProbe.startsWith('<head')) {
                const preview = probeText.substring(0, 200);
                throw new Error(`Downloaded file is an HTML page, not data. The CMS URL may have changed or expired. Content preview: ${preview}`);
            }

            // Detect suspiciously small files (likely error pages or redirects)
            if (probeText.length < 50 && !probeText.trim().startsWith('[') && !probeText.trim().startsWith('{')) {
                throw new Error(`Downloaded file is too small (${probeText.length} bytes) and likely invalid. Content: ${probeText.substring(0, 200)}`);
            }

            const isJsonApi = trimmedProbe.startsWith('[') || trimmedProbe.startsWith('{');

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
                // Streaming page-by-page approach
                while (!isTimeUp(startTime) && !reachedEnd) {
                    const separator = file_url.includes('?') ? '&' : '?';
                    const pageUrl = `${file_url}${separator}$offset=${offset}&$limit=${PAGE_SIZE}`;
                    console.log(`Fetching offset ${offset}...`);

                    let pageResponse;
                    let fetchSuccess = false;
                    for (let fetchAttempt = 0; fetchAttempt < 3; fetchAttempt++) {
                        try {
                            pageResponse = await fetchWithTimeout(pageUrl);
                            if (pageResponse.ok) { fetchSuccess = true; break; }
                            if (pageResponse.status === 429 || pageResponse.status >= 500) {
                                const wait = jitteredBackoff(fetchAttempt);
                                console.warn(`[fetch] HTTP ${pageResponse.status} at offset ${offset}, backing off ${Math.round(wait)}ms (attempt ${fetchAttempt + 1}/3)`);
                                await delay(wait);
                            } else {
                                console.warn(`[fetch] HTTP ${pageResponse.status} at offset ${offset} (non-retryable)`);
                                break;
                            }
                        } catch (e) {
                            if (fetchAttempt < 2) {
                                const wait = jitteredBackoff(fetchAttempt);
                                console.warn(`[fetch] Error at offset ${offset}: ${e.message}, backing off ${Math.round(wait)}ms`);
                                await delay(wait);
                            } else {
                                console.warn(`[fetch] Failed after 3 attempts at offset ${offset}: ${e.message}`);
                            }
                        }
                    }
                    if (!fetchSuccess) break;

                    const pageText = await pageResponse.text();
                    let pageData;
                    try { pageData = JSON.parse(pageText); } catch (e) {
                        console.warn(`JSON parse failed at offset ${offset}`);
                        break;
                    }
                    if (!Array.isArray(pageData) || pageData.length === 0) {
                        reachedEnd = true;
                        break;
                    }

                    // Detect columns from first page
                    if (offset === resume_offset && pageData.length > 0) {
                        columnMapping = Object.keys(pageData[0]);
                        console.log(`Detected ${columnMapping.length} columns: ${columnMapping.slice(0, 5).join(', ')}...`);
                        await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                            column_mapping: { fields: columnMapping },
                        });
                    }

                    // Process page in chunks to allow granular resume
                    let pageProcessedRaw = 0;
                    const seenInPage = new Set();
                    
                    for (let i = 0; i < pageData.length; i += BULK_SIZE) {
                        if (isTimeUp(startTime)) break;

                        const rawChunk = pageData.slice(i, i + BULK_SIZE);
                        const validDataChunk = [];

                        for (const row of rawChunk) {
                            totalProcessed++;
                            const mapped = mapRowToEntity(row, import_type, year);
                            if (!mapped) {
                                invalidRows++;
                                if (errorSamples.length < 5) errorSamples.push({ row: totalProcessed, message: 'Failed to map row' });
                                continue;
                            }

                            const dedupKey = getDedupKey(mapped, import_type);
                            if (!dedupKey) {
                                invalidRows++;
                                if (errorSamples.length < 5) errorSamples.push({ row: totalProcessed, message: 'Missing required identifier' });
                                continue;
                            }

                            if (seenInPage.has(dedupKey)) { duplicateRows++; continue; }
                            seenInPage.add(dedupKey);
                            validRows++;
                            validDataChunk.push(mapped);
                        }

                        // Import this chunk
                        if (!dry_run && validDataChunk.length > 0) {
                            const result = await importChunk(base44, import_type, validDataChunk, startTime);
                            importedCount += result.imported;
                            updatedCount += result.updated;
                            skippedCount += result.skipped;
                        }
                        
                        // Increment offset by the number of raw rows we successfully processed/attempted
                        pageProcessedRaw += rawChunk.length;
                    }

                    offset += pageProcessedRaw;

                    if (pageData.length < PAGE_SIZE) {
                        reachedEnd = true;
                    }

                    // Update progress (heartbeat)
                    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                        total_rows: offset,
                        valid_rows: validRows,
                        invalid_rows: invalidRows,
                        duplicate_rows: duplicateRows,
                        imported_rows: importedCount,
                        updated_rows: updatedCount,
                        skipped_rows: skippedCount,
                        updated_date: new Date().toISOString() // Force updated_date refresh
                    });

                    // Break outer loop if we timed out in the inner loop
                    if (isTimeUp(startTime)) break;
                }
            } else {
                // CSV fallback
                const fullResp = await fetchWithTimeout(file_url, 30000);
                if (!fullResp.ok) throw new Error(`Failed to fetch: ${fullResp.statusText}`);
                const text = await fullResp.text();
                const lines = text.split('\n').filter(l => l.trim());
                const headers = parseCSVLine(lines[0]);
                columnMapping = headers;

                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    column_mapping: { fields: headers },
                    total_rows: lines.length - 1,
                });

                const validDataChunk = [];
                const seenIds = new Set();

                for (let i = 1; i < lines.length; i++) {
                    if (isTimeUp(startTime)) break;
                    const values = parseCSVLine(lines[i]);
                    const row = {};
                    headers.forEach((h, idx) => { row[h] = values[idx]; });
                    totalProcessed++;

                    const mapped = mapRowToEntity(row, import_type, year);
                    if (!mapped) { invalidRows++; continue; }

                    const dedupKey = getDedupKey(mapped, import_type);
                    if (!dedupKey) { invalidRows++; continue; }
                    if (seenIds.has(dedupKey)) { duplicateRows++; continue; }
                    seenIds.add(dedupKey);
                    validRows++;
                    validDataChunk.push(mapped);

                    if (validDataChunk.length >= 200 && !dry_run) {
                        const result = await importChunk(base44, import_type, validDataChunk.splice(0), startTime);
                        importedCount += result.imported;
                        updatedCount += result.updated;
                        skippedCount += result.skipped;
                    }
                }

                if (!dry_run && validDataChunk.length > 0 && !isTimeUp(startTime)) {
                    const result = await importChunk(base44, import_type, validDataChunk, startTime);
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

            // Audit event
            try {
                await base44.asServiceRole.entities.AuditEvent.create({
                    event_type: 'import',
                    user_email: user?.email || 'system',
                    details: {
                        action: `CMS Import: ${import_type}`,
                        entity: import_type,
                        row_count: importedCount,
                    },
                    timestamp: new Date().toISOString(),
                });
            } catch (e) { console.warn('Audit log failed:', e.message); }

            return Response.json({
                success: true, partial, batch_id: batch.id,
                total_processed: totalProcessed, valid_rows: validRows,
                invalid_rows: invalidRows, duplicate_rows: duplicateRows,
                imported_rows: importedCount, updated_rows: updatedCount,
                skipped_rows: skippedCount,
                next_offset: partial ? offset : null,
                resume_offset: partial ? offset : null,
                elapsed_ms: Date.now() - startTime,
                ...(partial ? { hint: `Resume with resume_offset=${offset} and batch_id=${batch.id}` } : {}),
            });

        } catch (error) {
            console.error(`Import error for ${import_type}:`, error.message);
            const isRateLimit = error.message && error.message.includes('Rate limit');
            try {
                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    status: isRateLimit ? 'paused' : 'failed',
                    error_samples: [{ message: error.message }],
                    imported_rows: importedCount || 0,
                    updated_rows: updatedCount || 0,
                    skipped_rows: skippedCount || 0,
                    valid_rows: validRows || 0,
                    invalid_rows: invalidRows || 0,
                    total_rows: totalProcessed || 0,
                    retry_params: { resume_offset: offset || 0 },
                    ...(isRateLimit ? {
                        paused_at: new Date().toISOString(),
                        cancel_reason: 'Rate limited by platform. Wait a few minutes and resume.',
                    } : {
                        cancel_reason: `Failed at offset ${offset || 0}. ${importedCount || 0} rows already saved. Resume with resume_offset=${offset || 0}`,
                    }),
                });
            } catch (e) { console.error('Batch update failed:', e.message); }

            if (!isRateLimit) {
                try {
                    await base44.asServiceRole.entities.ErrorReport.create({
                        error_type: 'import_failure', severity: 'high', source: batch.id,
                        title: `Import failed: ${import_type}`,
                        description: error.message,
                        error_samples: [{ message: error.message }],
                        context: { import_type, file_url, batch_id: batch.id, year },
                        status: 'new',
                    });
                } catch (e) { console.error('Error report creation failed:', e.message); }
            }

            throw error;
        }

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});

// === MAPPERS: Transform raw API rows to entity fields ===

function mapRowToEntity(row, importType, year) {
    try {
        if (importType === 'cms_order_referring') {
            // API fields: NPI, LAST_NAME, FIRST_NAME, PARTB, DME, HHA, PMD, HOSPICE
            const npi = row['NPI'] || row['npi'];
            if (!npi || !validateNPI(npi)) return null;
            const hha = row['HHA'] === 'Y' ? 1 : 0;
            const hospice = row['HOSPICE'] === 'Y' ? 1 : 0;
            const dme = row['DME'] === 'Y' ? 1 : 0;
            const pmd = row['PMD'] === 'Y' ? 1 : 0;
            return {
                npi: String(npi).trim(),
                year: parseInt(year),
                total_referrals: hha + hospice + dme + pmd,
                home_health_referrals: hha,
                hospice_referrals: hospice,
                dme_referrals: dme,
                snf_referrals: 0,
                imaging_referrals: 0,
            };
        }

        if (importType === 'opt_out_physicians') {
            // API fields: NPI, First Name, Last Name, Specialty, Optout Effective Date, etc.
            const npi = row['NPI'] || row['npi'];
            if (!npi || !validateNPI(npi)) return null;
            return {
                npi: String(npi).trim(),
                first_name: row['First Name'] || row['FIRST_NAME'] || '',
                last_name: row['Last Name'] || row['LAST_NAME'] || '',
                opt_out_effective_date: parseDate(row['Optout Effective Date'] || ''),
                opt_out_end_date: parseDate(row['Optout End Date'] || ''),
            };
        }

        if (importType === 'home_health_enrollments') {
            // API fields: ENROLLMENT ID, NPI, CCN, ORGANIZATION NAME, DOING BUSINESS AS NAME, etc.
            const enrollmentId = row['ENROLLMENT ID'] || row['enrollment_id'];
            const npi = row['NPI'] || row['npi'] || '';
            if (!enrollmentId) return null;
            return {
                enrollment_id: String(enrollmentId).trim(),
                npi: String(npi).trim(),
                ccn: row['CCN'] || '',
                organization_name: row['ORGANIZATION NAME'] || '',
                doing_business_as: row['DOING BUSINESS AS NAME'] || '',
                incorporation_date: parseDate(row['INCORPORATION DATE'] || ''),
                incorporation_state: row['INCORPORATION STATE'] || '',
                organization_type: row['ORGANIZATION TYPE STRUCTURE'] || '',
                proprietary_nonprofit: row['PROPRIETARY_NONPROFIT'] || '',
                address_1: row['ADDRESS LINE 1'] || '',
                address_2: row['ADDRESS LINE 2'] || '',
                city: row['CITY'] || '',
                state: row['STATE'] || '',
                zip: row['ZIP CODE'] || '',
                enrollment_state: row['ENROLLMENT STATE'] || '',
                practice_location_type: row['PRACTICE LOCATION TYPE'] || '',
            };
        }

        if (importType === 'hospice_enrollments') {
            const enrollmentId = row['ENROLLMENT ID'] || row['enrollment_id'];
            const npi = row['NPI'] || row['npi'] || '';
            if (!enrollmentId) return null;
            return {
                enrollment_id: String(enrollmentId).trim(),
                npi: String(npi).trim(),
                ccn: row['CCN'] || '',
                organization_name: row['ORGANIZATION NAME'] || '',
                doing_business_as: row['DOING BUSINESS AS NAME'] || '',
                incorporation_date: parseDate(row['INCORPORATION DATE'] || ''),
                incorporation_state: row['INCORPORATION STATE'] || '',
                organization_type: row['ORGANIZATION TYPE STRUCTURE'] || '',
                proprietary_nonprofit: row['PROPRIETARY_NONPROFIT'] || '',
                address_1: row['ADDRESS LINE 1'] || '',
                address_2: row['ADDRESS LINE 2'] || '',
                city: row['CITY'] || '',
                state: row['STATE'] || '',
                zip: row['ZIP CODE'] || '',
                enrollment_state: row['ENROLLMENT STATE'] || '',
            };
        }

        if (importType === 'provider_service_utilization') {
            // API fields: Rndrng_NPI, HCPCS_Cd, HCPCS_Desc, Tot_Benes, Tot_Srvcs, etc.
            const npi = row['Rndrng_NPI'] || row['rndrng_npi'];
            if (!npi || !validateNPI(npi)) return null;
            return {
                npi: String(npi).trim(),
                hcpcs_code: row['HCPCS_Cd'] || '',
                hcpcs_description: row['HCPCS_Desc'] || '',
                drug_indicator: row['HCPCS_Drug_Ind'] || '',
                place_of_service: row['Place_Of_Srvc'] || '',
                total_beneficiaries: safeNum(row['Tot_Benes']),
                total_services: safeNum(row['Tot_Srvcs']),
                avg_submitted_charge: safeNum(row['Avg_Sbmtd_Chrg']),
                avg_medicare_allowed: safeNum(row['Avg_Mdcr_Alowd_Amt']),
                avg_medicare_payment: safeNum(row['Avg_Mdcr_Pymt_Amt']),
                data_year: parseInt(year),
            };
        }

        if (importType === 'cms_part_d') {
            const npi = row['Prscrbr_NPI'] || row['prscrbr_npi'] || row['NPI'] || row['npi'];
            if (!npi || !validateNPI(npi)) return null;
            return {
                npi: String(npi).trim(),
                last_name: row['Prscrbr_Last_Org_Name'] || row['Last Name'] || '',
                first_name: row['Prscrbr_First_Name'] || row['First Name'] || '',
                city: row['Prscrbr_City'] || row['City'] || '',
                state: row['Prscrbr_State_Abrvtn'] || row['State'] || '',
                specialty: row['Prscrbr_Type'] || row['Specialty'] || '',
                drug_name: row['Brnd_Name'] || row['Drug Name'] || '',
                generic_name: row['Gnrc_Name'] || row['Generic Name'] || '',
                total_claims: safeNum(row['Tot_Clms'] || row['Total Claims']),
                total_drug_cost: safeNum(row['Tot_Drug_Cst'] || row['Total Drug Cost']),
                total_beneficiaries: safeNum(row['Tot_Benes'] || row['Total Medicare Beneficiaries']),
                total_day_supply: safeNum(row['Tot_Day_Suply'] || row['Total Day Supply']),
                data_year: parseInt(year),
            };
        }

        if (importType === 'hospital_general_info') {
            const facilityId = row['Facility ID'] || row['facility_id'] || row['Provider ID'] || row['provider_id'] || row['Facility Id'] || '';
            if (!facilityId) return null;
            return {
                facility_id: String(facilityId).trim(),
                facility_name: row['Facility Name'] || row['facility_name'] || row['Hospital Name'] || row['hospital_name'] || '',
                address: row['Address'] || row['address'] || '',
                city: row['City'] || row['city'] || row['City/Town'] || '',
                state: row['State'] || row['state'] || '',
                zip_code: row['ZIP Code'] || row['zip_code'] || row['ZIP'] || row['zip'] || '',
                county: row['County Name'] || row['county_name'] || row['County/Parish'] || '',
                phone: row['Phone Number'] || row['phone_number'] || row['Telephone Number'] || row['telephone_number'] || '',
                hospital_type: row['Hospital Type'] || row['hospital_type'] || '',
                hospital_ownership: row['Hospital Ownership'] || row['hospital_ownership'] || '',
                emergency_services: row['Emergency Services'] || row['emergency_services'] || '',
                overall_rating: safeNum(row['Hospital overall rating'] || row['hospital_overall_rating']),
                mortality_rating: row['Mortality national comparison'] || row['mortality_national_comparison'] || '',
                safety_rating: row['Safety of care national comparison'] || row['safety_of_care_national_comparison'] || '',
                readmission_rating: row['Readmission national comparison'] || row['readmission_national_comparison'] || '',
                patient_experience_rating: row['Patient experience national comparison'] || row['patient_experience_national_comparison'] || '',
                effectiveness_rating: row['Effectiveness of care national comparison'] || row['effectiveness_of_care_national_comparison'] || '',
                timeliness_rating: row['Timeliness of care national comparison'] || row['timeliness_of_care_national_comparison'] || '',
                imaging_rating: row['Efficient use of medical imaging national comparison'] || row['efficient_use_of_medical_imaging_national_comparison'] || '',
            };
        }

        if (importType === 'nursing_home_compare') {
            const providerId = row['Federal Provider Number'] || row['federal_provider_number'] || row['CMS Certification Number (CCN)'] || row['cms_certification_number_ccn'] || row['provnum'] || '';
            if (!providerId) return null;
            return {
                provider_id: String(providerId).trim(),
                provider_name: row['Provider Name'] || row['provider_name'] || row['provname'] || '',
                address: row['Provider Address'] || row['provider_address'] || '',
                city: row['Provider City'] || row['provider_city'] || row['city'] || '',
                state: row['Provider State'] || row['provider_state'] || row['state'] || '',
                zip_code: row['Provider Zip Code'] || row['provider_zip_code'] || row['zip'] || '',
                phone: row['Provider Phone Number'] || row['provider_phone_number'] || row['phone'] || '',
                provider_type: row['Provider Type'] || row['provider_type'] || '',
                ownership_type: row['Ownership Type'] || row['ownership_type'] || '',
                number_of_beds: safeNum(row['Number of Certified Beds'] || row['number_of_certified_beds'] || row['bedcnt']),
                number_of_residents: safeNum(row['Average Number of Residents per Day'] || row['average_number_of_residents_per_day'] || row['restot']),
                overall_rating: safeNum(row['Overall Rating'] || row['overall_rating']),
                health_inspection_rating: safeNum(row['Health Inspection Rating'] || row['health_inspection_rating']),
                staffing_rating: safeNum(row['Staffing Rating'] || row['staffing_rating']),
                quality_rating: safeNum(row['QM Rating'] || row['qm_rating'] || row['Quality Measure Rating'] || row['quality_measure_rating']),
                total_penalties_amount: safeNum(row['Total Amount of Fines in Dollars'] || row['total_amount_of_fines_in_dollars'] || row['fine_tot']),
                number_of_penalties: safeNum(row['Total Number of Penalties'] || row['total_number_of_penalties']),
                abuse_icon: row['Abuse Icon'] || row['abuse_icon'] || '',
                special_focus: row['SFF'] || row['sff'] || row['special_focus_status'] || '',
            };
        }

        if (importType === 'home_health_compare') {
            const ccn = row['CMS Certification Number (CCN)'] || row['cms_certification_number_ccn'] || row['Federal Provider Number'] || row['federal_provider_number'] || '';
            if (!ccn) return null;
            return {
                ccn: String(ccn).trim(),
                provider_name: row['Provider Name'] || row['provider_name'] || '',
                address: row['Address'] || row['address'] || '',
                city: row['City'] || row['city'] || row['City/Town'] || row['city_town'] || '',
                state: row['State'] || row['state'] || '',
                zip_code: row['Zip'] || row['zip'] || row['ZIP Code'] || row['zip_code'] || '',
                phone: row['Phone'] || row['phone'] || row['Telephone Number'] || row['telephone_number'] || '',
                ownership_type: row['Type of Ownership'] || row['type_of_ownership'] || '',
                offers_nursing: row['Offers Nursing Care Services'] || row['offers_nursing_care_services'] || '',
                offers_pt: row['Offers Physical Therapy Services'] || row['offers_physical_therapy_services'] || '',
                offers_ot: row['Offers Occupational Therapy Services'] || row['offers_occupational_therapy_services'] || '',
                offers_speech: row['Offers Speech Pathology Services'] || row['offers_speech_pathology_services'] || '',
                offers_medical_social: row['Offers Medical Social Services'] || row['offers_medical_social_services'] || '',
                offers_aide: row['Offers Home Health Aide Services'] || row['offers_home_health_aide_services'] || '',
                quality_star_rating: safeNum(row['Quality of Patient Care Star Rating'] || row['quality_of_patient_care_star_rating']),
                patient_survey_star_rating: safeNum(row['Patient Survey Star Rating'] || row['patient_survey_star_rating'] || row['HHCAHPS Survey Summary Star Rating'] || row['hhcahps_survey_summary_star_rating']),
                how_often_timely_care: row['How often the home health team began their patients\' care in a timely manner'] || row['how_often_the_home_health_team_began_their_patients_care_in_a_timely_manner'] || '',
                how_often_taught_drugs: row['How often the home health team taught patients (or their family caregivers) about their drugs'] || row['how_often_the_home_health_team_taught_patients_or_their_family_caregivers_about_their_drugs'] || '',
            };
        }

        if (importType === 'provider_ownership') {
            const enrollmentId = row['ENROLLMENT ID'] || row['enrollment_id'] || row['Enrollment Id'] || '';
            const associateId = row['ASSOCIATE ID'] || row['associate_id'] || row['Associate Id'] || '';
            if (!enrollmentId) return null;
            return {
                enrollment_id: String(enrollmentId).trim(),
                associate_id: String(associateId).trim(),
                npi: String(row['NPI'] || row['npi'] || '').trim(),
                organization_name: row['ORGANIZATION NAME'] || row['organization_name'] || '',
                doing_business_as: row['DOING BUSINESS AS NAME'] || row['doing_business_as_name'] || '',
                associate_id_owner: row['ASSOCIATE ID - OWNER'] || row['associate_id_owner'] || row['associate_id___owner'] || '',
                owner_type: row['OWNER TYPE'] || row['owner_type'] || '',
                owner_name: row['OWNER NAME'] || row['owner_name'] || '',
                owner_first_name: row['FIRST NAME'] || row['first_name'] || '',
                owner_last_name: row['LAST NAME'] || row['last_name'] || '',
                owner_title: row['TITLE'] || row['title'] || '',
                ownership_percentage: safeNum(row['PERCENTAGE OWNERSHIP'] || row['percentage_ownership']),
                address_1: row['ADDRESS LINE 1'] || row['address_line_1'] || '',
                city: row['CITY'] || row['city'] || '',
                state: row['STATE'] || row['state'] || '',
                zip: row['ZIP CODE'] || row['zip_code'] || '',
                role_code: row['ROLE CODE'] || row['role_code'] || '',
                role_text: row['ROLE TEXT'] || row['role_text'] || '',
            };
        }

        if (importType === 'dmepos_suppliers') {
            const npi = row['NPI'] || row['npi'] || '';
            if (!npi || !validateNPI(npi)) return null;
            return {
                npi: String(npi).trim(),
                supplier_name: row['SUPPLIER NAME'] || row['supplier_name'] || row['Organization Name'] || row['organization_name'] || '',
                address_1: row['ADDRESS LINE 1'] || row['address_line_1'] || '',
                address_2: row['ADDRESS LINE 2'] || row['address_line_2'] || '',
                city: row['CITY'] || row['city'] || '',
                state: row['STATE'] || row['state'] || '',
                zip: row['ZIP CODE'] || row['zip_code'] || '',
                phone: row['PHONE'] || row['phone'] || row['Telephone Number'] || row['telephone_number'] || '',
                supplier_type: row['SUPPLIER TYPE'] || row['supplier_type'] || row['Provider Type'] || row['provider_type'] || '',
                accepts_assignment: row['ACCEPTS ASSIGNMENT'] || row['accepts_assignment'] || '',
                participates_medicare: row['PARTICIPATES IN MEDICARE'] || row['participates_in_medicare'] || '',
            };
        }

        if (importType === 'medicare_inpatient_charges') {
            const providerId = row['Rndrng_Prvdr_CCN'] || row['rndrng_prvdr_ccn'] || row['Provider Id'] || row['provider_id'] || '';
            const drgCode = row['DRG_Cd'] || row['drg_cd'] || row['DRG Definition'] || row['drg_definition'] || '';
            if (!providerId) return null;
            return {
                provider_id: String(providerId).trim(),
                provider_name: row['Rndrng_Prvdr_Org_Name'] || row['rndrng_prvdr_org_name'] || row['Provider Name'] || row['provider_name'] || '',
                provider_city: row['Rndrng_Prvdr_City'] || row['rndrng_prvdr_city'] || row['Provider City'] || row['provider_city'] || '',
                provider_state: row['Rndrng_Prvdr_State_Abrvtn'] || row['rndrng_prvdr_state_abrvtn'] || row['Provider State'] || row['provider_state'] || '',
                provider_zip: row['Rndrng_Prvdr_Zip5'] || row['rndrng_prvdr_zip5'] || row['Provider Zip Code'] || row['provider_zip_code'] || '',
                drg_code: String(drgCode).trim(),
                drg_description: row['DRG_Desc'] || row['drg_desc'] || row['DRG Description'] || '',
                total_discharges: safeNum(row['Tot_Dschrgs'] || row['tot_dschrgs'] || row['Total Discharges'] || row['total_discharges']),
                avg_covered_charges: safeNum(row['Avg_Submtd_Cvrd_Chrg'] || row['avg_submtd_cvrd_chrg'] || row['Average Covered Charges'] || row['average_covered_charges']),
                avg_total_payments: safeNum(row['Avg_Tot_Pymt_Amt'] || row['avg_tot_pymt_amt'] || row['Average Total Payments'] || row['average_total_payments']),
                avg_medicare_payments: safeNum(row['Avg_Mdcr_Pymt_Amt'] || row['avg_mdcr_pymt_amt'] || row['Average Medicare Payments'] || row['average_medicare_payments']),
                data_year: parseInt(year),
            };
        }

        if (importType === 'medicare_outpatient_charges') {
            const providerId = row['Rndrng_Prvdr_CCN'] || row['rndrng_prvdr_ccn'] || row['Provider Id'] || row['provider_id'] || '';
            const apcCode = row['APC_Cd'] || row['apc_cd'] || row['APC'] || row['apc'] || '';
            if (!providerId) return null;
            return {
                provider_id: String(providerId).trim(),
                provider_name: row['Rndrng_Prvdr_Org_Name'] || row['rndrng_prvdr_org_name'] || row['Provider Name'] || row['provider_name'] || '',
                provider_city: row['Rndrng_Prvdr_City'] || row['rndrng_prvdr_city'] || row['Provider City'] || row['provider_city'] || '',
                provider_state: row['Rndrng_Prvdr_State_Abrvtn'] || row['rndrng_prvdr_state_abrvtn'] || row['Provider State'] || row['provider_state'] || '',
                provider_zip: row['Rndrng_Prvdr_Zip5'] || row['rndrng_prvdr_zip5'] || row['Provider Zip Code'] || row['provider_zip_code'] || '',
                apc_code: String(apcCode).trim(),
                apc_description: row['APC_Desc'] || row['apc_desc'] || row['APC Description'] || '',
                total_services: safeNum(row['Capc_Srvcs'] || row['capc_srvcs'] || row['Outpatient Services'] || row['outpatient_services']),
                avg_charges: safeNum(row['Avg_Submtd_Cvrd_Chrg'] || row['avg_submtd_cvrd_chrg'] || row['Average Estimated Submitted Charges'] || row['average_estimated_submitted_charges']),
                avg_total_payments: safeNum(row['Avg_Tot_Pymt_Amt'] || row['avg_tot_pymt_amt'] || row['Average Total Payments'] || row['average_total_payments']),
                avg_medicare_payments: safeNum(row['Avg_Mdcr_Pymt_Amt'] || row['avg_mdcr_pymt_amt'] || row['Average Medicare Payments'] || row['average_medicare_payments']),
                data_year: parseInt(year),
            };
        }

        return null;
    } catch (e) {
        console.warn(`Map error: ${e.message}`);
        return null;
    }
}

function getDedupKey(mapped, importType) {
    if (importType === 'cms_order_referring') return mapped.npi ? `${mapped.npi}_${mapped.year}` : null;
    if (importType === 'opt_out_physicians') return mapped.npi || null;
    if (importType === 'home_health_enrollments') return mapped.enrollment_id || null;
    if (importType === 'hospice_enrollments') return mapped.enrollment_id || null;
    if (importType === 'provider_service_utilization') return mapped.npi ? `${mapped.npi}_${mapped.hcpcs_code}` : null;
    if (importType === 'cms_part_d') return mapped.npi ? `${mapped.npi}_${mapped.drug_name}_${mapped.data_year}` : null;
    if (importType === 'hospital_general_info') return mapped.facility_id || null;
    if (importType === 'nursing_home_compare') return mapped.provider_id || null;
    if (importType === 'home_health_compare') return mapped.ccn || null;
    if (importType === 'provider_ownership') return mapped.enrollment_id ? `${mapped.enrollment_id}_${mapped.associate_id_owner || mapped.associate_id}` : null;
    if (importType === 'dmepos_suppliers') return mapped.npi || null;
    if (importType === 'medicare_inpatient_charges') return mapped.provider_id ? `${mapped.provider_id}_${mapped.drg_code}_${mapped.data_year}` : null;
    if (importType === 'medicare_outpatient_charges') return mapped.provider_id ? `${mapped.provider_id}_${mapped.apc_code}_${mapped.data_year}` : null;
    return null;
}

function validateNPI(npi) {
    if (!npi) return false;
    return String(npi).replace(/\D/g, '').length === 10;
}

function safeNum(val) {
    if (!val) return 0;
    const n = parseFloat(String(val).replace(/[,$%\s]/g, ''));
    return isNaN(n) ? 0 : n;
}

function parseDate(dateStr) {
    if (!dateStr) return '';
    // Handle MM/DD/YYYY
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    }
    // Handle YYYY-MM-DD already
    if (dateStr.includes('-')) return dateStr;
    return '';
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitteredBackoff(attempt) { return Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 15000); }

function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                fields.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
    }
    fields.push(current.trim());
    return fields;
}

// Bulk importer with exponential backoff + jitter for rate limit handling
async function importChunk(base44, importType, records, startTime) {
    let imported = 0, updated = 0, skipped = 0;
    const chunkErrors = [];

    const entityMap = {
        'cms_order_referring': 'CMSReferral',
        'opt_out_physicians': 'OptOutPhysician',
        'hospice_enrollments': 'HospiceEnrollment',
        'home_health_enrollments': 'HomeHealthEnrollment',
        'provider_service_utilization': 'ProviderServiceUtilization',
        'cms_part_d': 'PartDPrescriber',
        'hospital_general_info': 'HospitalGeneralInfo',
        'nursing_home_compare': 'NursingHomeCompare',
        'home_health_compare': 'HomeHealthCompare',
        'provider_ownership': 'ProviderOwnership',
        'dmepos_suppliers': 'DMEPOSSupplier',
        'medicare_inpatient_charges': 'MedicareInpatientCharge',
        'medicare_outpatient_charges': 'MedicareOutpatientCharge',
    };

    const entityName = entityMap[importType];
    if (!entityName) return { imported: 0, updated: 0, skipped: 0, errors: [] };
    const entity = base44.asServiceRole.entities[entityName];

    for (let i = 0; i < records.length; i += BULK_SIZE) {
        if (isTimeUp(startTime)) break;
        const chunk = records.slice(i, i + BULK_SIZE);
        let success = false;

        for (let attempt = 0; attempt < 4; attempt++) {
            try {
                await entity.bulkCreate(chunk);
                imported += chunk.length;
                success = true;
                break;
            } catch (e) {
                const isRetryable = e.message?.includes('Rate limit') || e.message?.includes('timeout') || e.message?.includes('network') || e.message?.includes('503');
                if (isRetryable && attempt < 3) {
                    const wait = jitteredBackoff(attempt);
                    console.warn(`[importChunk] Attempt ${attempt + 1}/4 failed (${e.message}), backing off ${Math.round(wait)}ms`);
                    await delay(wait);
                } else {
                    chunkErrors.push({ chunk_start: i, chunk_size: chunk.length, error: e.message, attempts: attempt + 1 });
                    console.warn(`[importChunk] Chunk ${i} permanently failed after ${attempt + 1} attempts: ${e.message}`);
                    skipped += chunk.length;
                    break;
                }
            }
        }
        // Adaptive delay: longer after retries, shorter on clean runs
        if (i + BULK_SIZE < records.length) {
            await delay(success ? 150 : 500);
        }
    }

    return { imported, updated, skipped, errors: chunkErrors };
}