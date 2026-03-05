import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Strict time budget: 25s to leave buffer before platform 30s timeout kills us
const MAX_EXEC_MS = 25_000; 
const FETCH_TIMEOUT_MS = 10_000;
const PAGE_SIZE = 300; // Reduced page size for more frequent updates
const BULK_SIZE = 30;

function isTimeUp(startTime) {
    return Date.now() - startTime > MAX_EXEC_MS;
}

async function fetchWithTimeout(url, startTime, defaultTimeoutMs = FETCH_TIMEOUT_MS) {
    const remaining = startTime ? MAX_EXEC_MS - (Date.now() - startTime) : defaultTimeoutMs;
    const timeoutMs = Math.min(defaultTimeoutMs, Math.max(100, remaining));
    
    if (timeoutMs <= 100) throw new Error('Time limit reached before fetch');
    
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
        
        const isService = user && user.email && user.email.includes('service+');
        if (user && user.role !== 'admin' && !isService) {
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
            'provider_service_utilization', 'medical_equipment_suppliers',
            'hospice_provider_measures', 'hospice_state_measures',
            'hospice_national_measures', 'snf_provider_measures',
            'nursing_home_providers', 'nursing_home_deficiencies',
            'home_health_national_measures'
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
            const isCmsDataApi = file_url.includes('data-api/v1/dataset');
            const isDkanApi = file_url.includes('provider-data/api');
            let probeLimit = '$limit=1';
            if (isCmsDataApi) probeLimit = 'size=1';
            else if (isDkanApi) probeLimit = 'limit=1';
            
            const probeUrl = file_url + (file_url.includes('?') ? '&' : '?') + probeLimit;
            console.log(`Probing URL: ${probeUrl}`);
            const probeResp = await fetchWithTimeout(probeUrl, startTime);
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

            let totalProcessed = resume_offset || 0;
            let validRows = 0;
            let invalidRows = 0;
            let duplicateRows = 0;
            let importedCount = 0;
            let updatedCount = 0;
            let skippedCount = 0;
            
            const initialImported = batch.imported_rows || 0;
            const initialUpdated = batch.updated_rows || 0;
            const initialSkipped = batch.skipped_rows || 0;
            const initialValid = batch.valid_rows || 0;
            const initialInvalid = batch.invalid_rows || 0;
            const initialDupes = batch.duplicate_rows || 0;
            const errorSamples = [];
            let columnMapping = {};
            let offset = resume_offset;
            let reachedEnd = false;

            if (isJsonApi) {
                // Streaming page-by-page approach
                while (!isTimeUp(startTime) && !reachedEnd) {
                    const separator = file_url.includes('?') ? '&' : '?';
                    const isCmsDataApi = file_url.includes('data-api/v1/dataset');
                    const isDkanApi = file_url.includes('provider-data/api');
                    let offsetParam, limitParam;
                    if (isCmsDataApi) {
                        offsetParam = `offset=${offset}`;
                        limitParam = `size=${PAGE_SIZE}`;
                    } else if (isDkanApi) {
                        offsetParam = `offset=${offset}`;
                        limitParam = `limit=${PAGE_SIZE}`;
                    } else {
                        offsetParam = `$offset=${offset}`;
                        limitParam = `$limit=${PAGE_SIZE}`;
                    }
                    const pageUrl = `${file_url}${separator}${offsetParam}&${limitParam}`;
                    console.log(`Fetching offset ${offset}...`);

                    let pageResponse;
                    let fetchSuccess = false;
                    for (let fetchAttempt = 0; fetchAttempt < 3; fetchAttempt++) {
                        if (isTimeUp(startTime)) break;
                        try {
                            pageResponse = await fetchWithTimeout(pageUrl, startTime);
                            if (pageResponse.ok) { fetchSuccess = true; break; }
                            if (pageResponse.status === 429 || pageResponse.status >= 500) {
                                const wait = jitteredBackoff(fetchAttempt);
                                console.warn(`[fetch] HTTP ${pageResponse.status} at offset ${offset}, backing off ${Math.round(wait)}ms (attempt ${fetchAttempt + 1}/3)`);
                                await delay(wait, startTime);
                            } else {
                                console.warn(`[fetch] HTTP ${pageResponse.status} at offset ${offset} (non-retryable)`);
                                break;
                            }
                        } catch (e) {
                            if (fetchAttempt < 2) {
                                const wait = jitteredBackoff(fetchAttempt);
                                console.warn(`[fetch] Error at offset ${offset}: ${e.message}, backing off ${Math.round(wait)}ms`);
                                await delay(wait, startTime);
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
                    if (pageData && pageData.results && Array.isArray(pageData.results)) {
                        pageData = pageData.results;
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
                        let chunkAborted = false;
                        if (!dry_run && validDataChunk.length > 0) {
                            const result = await importChunk(base44, import_type, validDataChunk, startTime);
                            importedCount += result.imported;
                            updatedCount += result.updated;
                            skippedCount += result.skipped;
                            if (result.aborted) {
                                chunkAborted = true;
                            }
                        }
                        
                        if (chunkAborted) break;

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
                        valid_rows: initialValid + validRows,
                        invalid_rows: initialInvalid + invalidRows,
                        duplicate_rows: initialDupes + duplicateRows,
                        imported_rows: initialImported + importedCount,
                        updated_rows: initialUpdated + updatedCount,
                        skipped_rows: initialSkipped + skippedCount,
                        updated_date: new Date().toISOString() // Force updated_date refresh
                    });

                    // Break outer loop if we timed out in the inner loop
                    if (isTimeUp(startTime)) break;
                }
            } else {
                // CSV fallback
                const fullResp = await fetchWithTimeout(file_url, startTime, 30000);
                if (!fullResp.ok) throw new Error(`Failed to fetch: ${fullResp.statusText}`);
                const text = await fullResp.text();
                const lines = text.split('\n').filter(l => l.trim());
                const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                columnMapping = headers;

                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    column_mapping: { fields: headers },
                    total_rows: lines.length - 1,
                });

                const validDataChunk = [];
                const seenIds = new Set();
                
                let startIdx = 1;
                if (resume_offset > 0) {
                    startIdx = resume_offset + 1; // +1 for header
                }

                for (let i = startIdx; i < lines.length; i++) {
                    if (isTimeUp(startTime)) break;
                    const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
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
                        if (result.aborted) break;
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
                valid_rows: initialValid + validRows,
                invalid_rows: initialInvalid + invalidRows,
                duplicate_rows: initialDupes + duplicateRows,
                imported_rows: initialImported + importedCount,
                updated_rows: initialUpdated + updatedCount,
                skipped_rows: initialSkipped + skippedCount,
                error_samples: errorSamples.length > 0 ? errorSamples : [],
                dedup_summary: { created: importedCount, updated: updatedCount, skipped: skippedCount },
                ...(partial ? {
                    paused_at: new Date().toISOString(),
                    cancel_reason: `Auto-paused at offset ${offset}: time limit. Resume with resume_offset=${offset}`,
                    retry_params: { resume_offset: offset },
                } : {
                    completed_at: new Date().toISOString(),
                    cancel_reason: "",
                    paused_at: "",
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

            if (partial && !dry_run) {
                // Auto-resume for the next pass
                base44.asServiceRole.functions.invoke('autoImportCMSData', {
                    import_type: raw_import_type,
                    file_url,
                    year,
                    dry_run,
                    resume_offset: offset,
                    batch_id: batch.id,
                    retry_of,
                    retry_count,
                    retry_tags,
                    category: retryCategory
                }).catch(e => console.error(`[autoImportCMSData] Auto-resume invoke error:`, e));
            }

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
            // If it's a rate limit error, mark as paused (retryable) not failed
            const isRateLimit = error.message && error.message.includes('Rate limit');
            try {
                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    status: isRateLimit ? 'paused' : 'failed',
                    error_samples: [{ message: error.message }],
                    ...(isRateLimit ? {
                        paused_at: new Date().toISOString(),
                        cancel_reason: 'Rate limited by platform. Wait a few minutes and resume.',
                    } : {}),
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

        if (importType === 'medical_equipment_suppliers') {
            const providerId = row['provider_id'];
            if (!providerId) return null;
            return {
                provider_id: String(providerId).trim(),
                accepts_assignment: row['acceptsassignement'] || '',
                participation_begin_date: parseDate(row['participationbegindate'] || ''),
                business_name: row['businessname'] || '',
                practice_name: row['practicename'] || '',
                address_1: row['practiceaddress1'] || '',
                address_2: row['practiceaddress2'] || '',
                city: row['practicecity'] || '',
                state: row['practicestate'] || '',
                zip: row['practicezip9code'] || '',
                phone: row['telephonenumber'] || '',
                specialties: row['specialitieslist'] || '',
                provider_type: row['providertypelist'] || '',
                supplies: row['supplieslist'] || '',
                latitude: row['latitude'] || '',
                longitude: row['longitude'] || '',
                is_contracted_for_cba: row['is_contracted_for_cba'] || ''
            };
        }

        if (importType === 'hospice_provider_measures') {
            const ccn = row['cms_certification_number_ccn'];
            const measureCode = row['measure_code'];
            if (!ccn || !measureCode) return null;
            return {
                ccn: String(ccn).trim(),
                facility_name: row['facility_name'] || '',
                address_1: row['address_line_1'] || '',
                address_2: row['address_line_2'] || '',
                city: row['citytown'] || '',
                state: row['state'] || '',
                zip: row['zip_code'] || '',
                county: row['countyparish'] || '',
                phone: row['telephone_number'] || '',
                cms_region: row['cms_region'] || '',
                measure_code: String(measureCode).trim(),
                measure_name: row['measure_name'] || '',
                score: row['score'] || '',
                star_rating: row['star_rating'] || '',
                footnote: row['footnote'] || '',
                date_range: row['date'] || ''
            };
        }

        if (importType === 'hospice_state_measures') {
            const state = row['state'];
            const measureCode = row['measure_code'];
            if (!state || !measureCode) return null;
            return {
                state: String(state).trim(),
                measure_code: String(measureCode).trim(),
                measure_name: row['measure_name'] || '',
                score: row['score'] || '',
                footnote: row['footnote'] || '',
                measure_date_range: row['measure_date_range'] || ''
            };
        }

        if (importType === 'hospice_national_measures') {
            const measureCode = row['measure_code'];
            if (!measureCode) return null;
            return {
                measure_code: String(measureCode).trim(),
                measure_name: row['measure_name'] || '',
                score: row['score'] || '',
                footnote: row['footnote'] || '',
                date_range: row['date'] || ''
            };
        }

        if (importType === 'snf_provider_measures') {
            const ccn = row['cms_certification_number_ccn'];
            const measureCode = row['measure_code'];
            if (!ccn || !measureCode) return null;
            return {
                ccn: String(ccn).trim(),
                provider_name: row['provider_name'] || '',
                address_1: row['address_line_1'] || '',
                city: row['citytown'] || '',
                state: row['state'] || '',
                zip: row['zip_code'] || '',
                county: row['countyparish'] || '',
                phone: row['telephone_number'] || '',
                cms_region: row['cms_region'] || '',
                measure_code: String(measureCode).trim(),
                score: row['score'] || '',
                footnote: row['footnote'] || '',
                start_date: row['start_date'] || '',
                end_date: row['end_date'] || '',
                measure_date_range: row['measure_date_range'] || '',
                location_string: row['location1'] || ''
            };
        }

        if (importType === 'nursing_home_providers') {
            const ccn = row['cms_certification_number_ccn'];
            if (!ccn) return null;
            return {
                ccn: String(ccn).trim(),
                provider_name: row['provider_name'] || '',
                provider_address: row['provider_address'] || '',
                city: row['citytown'] || '',
                state: row['state'] || '',
                zip: row['zip_code'] || '',
                phone: row['telephone_number'] || '',
                county: row['countyparish'] || '',
                urban: row['urban'] || '',
                ownership_type: row['ownership_type'] || '',
                number_of_certified_beds: row['number_of_certified_beds'] || '',
                overall_rating: row['overall_rating'] || '',
                health_inspection_rating: row['health_inspection_rating'] || '',
                qm_rating: row['qm_rating'] || '',
                staffing_rating: row['staffing_rating'] || '',
                location_string: row['location'] || ''
            };
        }

        if (importType === 'nursing_home_deficiencies') {
            const ccn = row['cms_certification_number_ccn'];
            if (!ccn) return null;
            return {
                ccn: String(ccn).trim(),
                provider_name: row['provider_name'] || '',
                provider_address: row['provider_address'] || '',
                city: row['citytown'] || '',
                state: row['state'] || '',
                zip: row['zip_code'] || '',
                inspection_cycle: row['inspection_cycle'] || '',
                health_survey_date: row['health_survey_date'] || '',
                fire_safety_survey_date: row['fire_safety_survey_date'] || '',
                total_number_of_health_deficiencies: row['total_number_of_health_deficiencies'] || '',
                total_number_of_fire_safety_deficiencies: row['total_number_of_fire_safety_deficiencies'] || '',
                location_string: row['location'] || ''
            };
        }

        if (importType === 'home_health_national_measures') {
            const country = row['country'];
            if (!country) return null;
            return {
                country: String(country).trim(),
                quality_of_patient_care_star_rating: row['quality_of_patient_care_star_rating'] || '',
                discharge_function_score: row['discharge_function_score'] || '',
                transfer_of_health_information_to_the_provider: row['transfer_of_health_information_to_the_provider'] || '',
                transfer_of_health_information_to_the_patient: row['transfer_of_health_information_to_the_patient'] || '',
                ppr_national_observed_rate: row['ppr_national_observed_rate'] || '',
                dtc_national_observed_rate: row['dtc_national_observed_rate'] || '',
                pph_national_observed_rate: row['pph_national_observed_rate'] || ''
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
    if (importType === 'medical_equipment_suppliers') return mapped.provider_id || null;
    if (importType === 'hospice_provider_measures') return (mapped.ccn && mapped.measure_code) ? `${mapped.ccn}_${mapped.measure_code}` : null;
    if (importType === 'hospice_state_measures') return (mapped.state && mapped.measure_code) ? `${mapped.state}_${mapped.measure_code}` : null;
    if (importType === 'hospice_national_measures') return mapped.measure_code || null;
    if (importType === 'snf_provider_measures') return (mapped.ccn && mapped.measure_code) ? `${mapped.ccn}_${mapped.measure_code}` : null;
    if (importType === 'nursing_home_providers') return mapped.ccn || null;
    if (importType === 'nursing_home_deficiencies') return mapped.ccn || null;
    if (importType === 'home_health_national_measures') return mapped.country || null;
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

function delay(ms, startTime) {
    if (startTime) {
        const remaining = MAX_EXEC_MS - (Date.now() - startTime);
        if (remaining <= 0) return Promise.resolve();
        return new Promise(r => setTimeout(r, Math.min(ms, remaining)));
    }
    return new Promise(r => setTimeout(r, ms));
}
function jitteredBackoff(attempt) { return Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 15000); }

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
        'medical_equipment_suppliers': 'MedicalEquipmentSupplier',
        'hospice_provider_measures': 'HospiceProviderMeasure',
        'hospice_state_measures': 'HospiceStateMeasure',
        'hospice_national_measures': 'HospiceNationalMeasure',
        'snf_provider_measures': 'SNFProviderMeasure',
        'nursing_home_providers': 'NursingHomeProvider',
        'nursing_home_deficiencies': 'NursingHomeDeficiency',
        'home_health_national_measures': 'HomeHealthNationalMeasure',
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
                    if (Date.now() - startTime + wait > MAX_EXEC_MS) {
                        return { imported, updated, skipped, errors: chunkErrors, aborted: true };
                    }
                    console.warn(`[importChunk] Attempt ${attempt + 1}/4 failed (${e.message}), backing off ${Math.round(wait)}ms`);
                    await delay(wait, startTime);
                } else {
                    chunkErrors.push({ chunk_start: i, chunk_size: chunk.length, error: e.message, attempts: attempt + 1 });
                    console.warn(`[importChunk] Chunk ${i} permanently failed after ${attempt + 1} attempts: ${e.message}`);
                    skipped += chunk.length;
                    if (isRetryable) {
                        // Rate limit exhausted retries, abort the whole chunk processing
                        return { imported, updated, skipped, errors: chunkErrors, aborted: true, fatalError: true };
                    }
                    break;
                }
            }
        }
        // Adaptive delay: longer after retries, shorter on clean runs
        if (i + BULK_SIZE < records.length) {
            await delay(success ? 350 : 1500, startTime);
        }
    }

    return { imported, updated, skipped, errors: chunkErrors };
}