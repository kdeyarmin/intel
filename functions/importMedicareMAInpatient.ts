import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const MAX_EXEC_MS = 25000;
let execStart = Date.now();
function isTimeUp() { return (Date.now() - execStart) > MAX_EXEC_MS; }
function elapsed() { return Date.now() - execStart; }

// URLs are now managed via ImportScheduleConfig entity
const FALLBACK_MA_URL = 'https://data.cms.gov/sites/default/files/2024-05/CPS%20MDCR%20INPT%20MA%202021%20FINAL_0.zip';

const MAX_NETWORK_RETRIES = 3;
const RETRY_BACKOFF_MS = 2000;

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Fetch with automatic retry for transient network errors
async function fetchWithRetry(url, options = {}, label = 'fetch') {
  let lastError;
  for (let attempt = 1; attempt <= MAX_NETWORK_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 30000);
      const resp = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      if (resp.ok) return resp;
      // Non-retryable HTTP errors
      if (resp.status >= 400 && resp.status < 500) {
        throw new Error(`${label}: HTTP ${resp.status} ${resp.statusText} (non-retryable)`);
      }
      // Server errors (5xx) are retryable
      lastError = new Error(`${label}: HTTP ${resp.status} ${resp.statusText}`);
      console.warn(`${label} attempt ${attempt}/${MAX_NETWORK_RETRIES} failed: ${lastError.message}`);
    } catch (e) {
      lastError = e;
      const isAbort = e.name === 'AbortError';
      const isNetwork = e.message?.includes('fetch') || e.message?.includes('network') || isAbort;
      if (!isNetwork && !e.message?.includes('HTTP 5')) {
        // Non-retryable error
        throw new Error(`${label}: ${e.message}`);
      }
      console.warn(`${label} attempt ${attempt}/${MAX_NETWORK_RETRIES} failed: ${isAbort ? 'timeout' : e.message}`);
    }
    if (attempt < MAX_NETWORK_RETRIES) {
      const wait = RETRY_BACKOFF_MS * attempt;
      console.log(`${label}: retrying in ${wait}ms...`);
      await delay(wait);
    }
  }
  throw new Error(`${label}: Failed after ${MAX_NETWORK_RETRIES} attempts. Last error: ${lastError?.message || 'unknown'}`);
}

function classifyTable(sheetName) {
  const name = sheetName.toUpperCase().replace(/\s+/g, ' ');
  if (name.includes('MA 4') || name.includes('MA4') || name.includes('TABLE 4')) return 'MA4';
  if (name.includes('MA 5') || name.includes('MA5') || name.includes('TABLE 5')) return 'MA5';
  if (name.includes('MA 6') || name.includes('MA6') || name.includes('TABLE 6')) return 'MA6';
  if (name.includes('MA 7') || name.includes('MA7') || name.includes('TABLE 7')) return 'MA7';
  return null;
}

function safeNum(val) {
  if (val === '' || val === null || val === undefined || val === '*' || val === '—' || val === '-' || val === 'N/A') return null;
  const num = parseFloat(String(val).replace(/[,$%\s]/g, ''));
  return isNaN(num) ? null : num;
}

// ============================================================
// Validation Rules
// ============================================================
const VALIDATION_RULES = {
  // Required fields per table type
  required_fields: {
    MA4: ['category', 'hospital_type'],
    MA5: ['category', 'entitlement_type'],
    MA6: ['category', 'demographic_group'],
    MA7: ['category'],
  },
  // Fields that must be numeric when present (non-null)
  numeric_fields: [
    'total_discharges', 'total_covered_days', 'total_stays', 'persons_served',
    'avg_length_of_stay', 'covered_days_per_1000', 'discharges_per_1000', 'total_enrollees',
  ],
  // Cross-field consistency checks
  consistency_checks: [
    {
      name: 'discharges_vs_persons',
      check: (r) => {
        if (r.total_discharges != null && r.persons_served != null && r.persons_served > 0) {
          return r.total_discharges >= r.persons_served;
        }
        return true;
      },
      message: 'total_discharges should be >= persons_served (a person can have multiple discharges)',
      severity: 'warning',
    },
    {
      name: 'avg_los_range',
      check: (r) => {
        if (r.avg_length_of_stay != null) {
          return r.avg_length_of_stay > 0 && r.avg_length_of_stay < 365;
        }
        return true;
      },
      message: 'avg_length_of_stay should be between 0 and 365 days',
      severity: 'error',
    },
    {
      name: 'covered_days_vs_stays',
      check: (r) => {
        if (r.total_covered_days != null && r.total_stays != null && r.total_stays > 0) {
          return r.total_covered_days >= r.total_stays;
        }
        return true;
      },
      message: 'total_covered_days should be >= total_stays (each stay has at least 1 day)',
      severity: 'warning',
    },
    {
      name: 'per_1000_range',
      check: (r) => {
        if (r.discharges_per_1000 != null) return r.discharges_per_1000 >= 0 && r.discharges_per_1000 <= 5000;
        if (r.covered_days_per_1000 != null) return r.covered_days_per_1000 >= 0 && r.covered_days_per_1000 <= 50000;
        return true;
      },
      message: 'Per-1,000 rates are outside plausible range',
      severity: 'warning',
    },
    {
      name: 'negative_values',
      check: (r) => {
        for (const f of ['total_discharges', 'total_covered_days', 'total_stays', 'persons_served', 'total_enrollees']) {
          if (r[f] != null && r[f] < 0) return false;
        }
        return true;
      },
      message: 'Count fields should not be negative',
      severity: 'error',
    },
    {
      name: 'ma7_state_code',
      check: (r) => {
        if (r.table_name !== 'MA7' || !r.state) return true;
        return /^[A-Z]{2}$/.test(r.state);
      },
      message: 'MA7 state code should be a 2-letter abbreviation',
      severity: 'error',
    },
  ],
};

// Validate a single record, returns { valid, errors[], warnings[] }
function validateRecord(record, rowIndex, sheetName) {
  const errors = [];
  const warnings = [];
  const table = record.table_name;

  // 1. Required fields
  const requiredFields = VALIDATION_RULES.required_fields[table] || ['category'];
  for (const field of requiredFields) {
    const val = record[field];
    if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '')) {
      errors.push({ rule: 'required_field', field, message: `Missing required field "${field}"`, row: rowIndex, sheet: sheetName });
    }
  }

  // 2. Data year sanity
  if (record.data_year != null && (record.data_year < 2000 || record.data_year > 2030)) {
    errors.push({ rule: 'data_year_range', field: 'data_year', message: `data_year ${record.data_year} is outside 2000-2030`, row: rowIndex, sheet: sheetName });
  }

  // 3. Numeric type checks
  for (const field of VALIDATION_RULES.numeric_fields) {
    const val = record[field];
    if (val !== undefined && val !== null) {
      if (typeof val !== 'number' || !isFinite(val)) {
        errors.push({ rule: 'numeric_type', field, message: `"${field}" has non-numeric value: ${JSON.stringify(val)}`, row: rowIndex, sheet: sheetName });
      }
    }
  }

  // 4. At least one numeric metric should be present
  const hasAnyMetric = VALIDATION_RULES.numeric_fields.some(f => record[f] != null);
  if (!hasAnyMetric) {
    return { valid: false, skip: true, errors: [], warnings: [] };
  }

  // 5. Cross-field consistency
  for (const check of VALIDATION_RULES.consistency_checks) {
    if (!check.check(record)) {
      const entry = { rule: check.name, field: null, message: check.message, row: rowIndex, sheet: sheetName };
      if (check.severity === 'error') errors.push(entry);
      else warnings.push(entry);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// Validate all records, returns summary + detailed issues
function validateAllRecords(records) {
  const allErrors = [];
  const allWarnings = [];
  const ruleCounts = {};
  let validCount = 0;
  let invalidCount = 0;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const result = validateRecord(r, i, r.table_name);
    if (result.valid) {
      validCount++;
    } else {
      invalidCount++;
    }
    for (const e of result.errors) {
      ruleCounts[e.rule] = (ruleCounts[e.rule] || 0) + 1;
      if (allErrors.length < 50) allErrors.push(e);
    }
    for (const w of result.warnings) {
      ruleCounts[w.rule] = (ruleCounts[w.rule] || 0) + 1;
      if (allWarnings.length < 50) allWarnings.push(w);
    }
  }

  return {
    total: records.length,
    valid: validCount,
    invalid: invalidCount,
    error_count: allErrors.length,
    warning_count: allWarnings.length,
    rule_summary: ruleCounts,
    errors: allErrors,
    warnings: allWarnings,
  };
}

function mapRowToRecord(row, tableName, dataYear, rowIndex, sheetName) {
  const headers = Object.keys(row);
  const record = { table_name: tableName, data_year: dataYear, raw_data: row };
  try {
    for (const h of headers) {
      const hl = h.toLowerCase();
      if (!record.category && (hl.includes('type of hospital') || hl.includes('type of entitlement') || hl.includes('demographic') || hl.includes('category') || hl.includes('state') || hl.includes('area of residence') || hl.includes('sex') || hl.includes('race') || hl.includes('age') || hl === headers[0].toLowerCase())) {
        record.category = String(row[h] || '').trim();
      }
      if (hl.includes('discharge') && !hl.includes('per')) record.total_discharges = safeNum(row[h]);
      if (hl.includes('covered day') && !hl.includes('per')) record.total_covered_days = safeNum(row[h]);
      if (hl.includes('stay') && !hl.includes('length') && !hl.includes('per')) record.total_stays = safeNum(row[h]);
      if (hl.includes('person') && (hl.includes('served') || hl.includes('utilization') || hl.includes('use'))) record.persons_served = safeNum(row[h]);
      if (hl.includes('average length') || (hl.includes('avg') && hl.includes('stay'))) record.avg_length_of_stay = safeNum(row[h]);
      if (hl.includes('covered day') && hl.includes('per') && hl.includes('1,000')) record.covered_days_per_1000 = safeNum(row[h]);
      if (hl.includes('discharge') && hl.includes('per') && hl.includes('1,000')) record.discharges_per_1000 = safeNum(row[h]);
      if (hl.includes('enrollee') || hl.includes('enrollment')) record.total_enrollees = safeNum(row[h]);
    }
    if (!record.category && headers.length > 0) record.category = String(row[headers[0]] || '').trim();
    if (tableName === 'MA4') record.hospital_type = record.category;
    if (tableName === 'MA5') record.entitlement_type = record.category;
    if (tableName === 'MA6') record.demographic_group = record.category;
    if (tableName === 'MA7') {
      const cat = record.category || '';
      if (cat.length === 2 && cat === cat.toUpperCase()) record.state = cat;
    }
  } catch (e) {
    console.error(`Row mapping error in sheet "${sheetName}" row ${rowIndex}: ${e.message}`, JSON.stringify(row).substring(0, 200));
    return { _error: true, _errorMsg: `Sheet "${sheetName}" row ${rowIndex}: ${e.message}`, _row: row };
  }
  return record;
}

Deno.serve(async (req) => {
  execStart = Date.now();
  const base44 = createClientFromRequest(req);
  
  // Allow service role calls (from triggerImport, cancelStalledImports) or admin users
  let user = null;
  try { user = await base44.auth.me(); } catch (e) { /* service role call */ }
  const isService = user && user.email && user.email.includes('service+');
  if (user && user.role !== 'admin' && !isService) return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

  const payload = await req.json().catch(() => ({}));
  const { action = 'import', year = 2021, dry_run = false, custom_url, sheet_filter, row_offset = 0, row_limit } = payload;

  if (action === 'list_years') {
    return Response.json({
      available_years: [2021, 2020, 2019, 2018, 2017, 2016],
      source: 'CMS Program Statistics - Medicare Advantage Inpatient Hospital',
    });
  }

  let downloadUrl = custom_url;
  if (!downloadUrl) {
    const configs = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ import_type: 'medicare_ma_inpatient' });
    if (configs.length > 0) {
      downloadUrl = configs[0].api_url;
    } else {
      downloadUrl = FALLBACK_MA_URL;
    }
  }

  if (!downloadUrl) {
    return Response.json({ error: `No download URL configured for Medicare MA Inpatient`, hint: 'Check ImportScheduleConfig' }, { status: 400 });
  }

  let batch;
  if (action === 'resume' && payload.batch_id) {
    batch = await base44.asServiceRole.entities.ImportBatch.get(payload.batch_id);
    if (!batch) return Response.json({ error: 'Batch not found' }, { status: 404 });
    await base44.asServiceRole.entities.ImportBatch.update(batch.id, { status: 'processing' });
  } else {
    // try to find existing batch if not resuming to avoid duplicate active ones
    const existingActive = await base44.asServiceRole.entities.ImportBatch.filter({
        import_type: 'medicare_ma_inpatient',
        status: { $in: ['processing', 'validating'] }
    });
    
    if (existingActive.length > 0) {
        batch = existingActive[0];
        console.log(`Using existing active batch: ${batch.id}`);
    } else {
        batch = await base44.asServiceRole.entities.ImportBatch.create({
          import_type: 'medicare_ma_inpatient',
          file_name: `medicare_ma_inpatient_${year}`,
          file_url: downloadUrl,
          status: 'processing',
          dry_run,
          retry_params: sheet_filter || row_offset || row_limit ? { sheet_filter, row_offset, row_limit } : undefined,
        });
    }
  }

  const errorSamples = [];
  const addError = (phase, detail, context) => {
    const entry = { phase, detail: String(detail).substring(0, 500), timestamp: new Date().toISOString(), ...context };
    console.error(`[${phase}] ${detail}`, context ? JSON.stringify(context) : '');
    if (errorSamples.length < 25) errorSamples.push(entry);
  };

  try {
    // === Step 1: Download ZIP with retry ===
    console.log(`[download] Fetching: ${downloadUrl}`);
    const resp = await fetchWithRetry(downloadUrl, { 
      timeoutMs: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'application/zip, application/octet-stream, */*'
      }
    }, 'ZIP download');
    const arrayBuffer = await resp.arrayBuffer();
    const sizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(1);
    console.log(`[download] Complete: ${sizeMB}MB in ${elapsed()}ms`);

    if (arrayBuffer.byteLength < 1000) {
      throw new Error(`Downloaded file too small (${arrayBuffer.byteLength} bytes) — likely not a valid ZIP. Check the URL.`);
    }

    // === Step 2: Extract ZIP ===
    let zip, xlsxData, xlsxFileName;
    try {
      const JSZip = (await import('npm:jszip@3.10.1')).default;
      zip = await JSZip.loadAsync(arrayBuffer);
      const fileNames = Object.keys(zip.files);
      console.log(`[extract] ZIP contains: ${fileNames.join(', ')}`);
      xlsxFileName = fileNames.find(f => f.toLowerCase().endsWith('.xlsx') || f.toLowerCase().endsWith('.xls'));
      if (!xlsxFileName) {
        throw new Error(`No XLSX/XLS file found in ZIP. Files found: ${fileNames.join(', ')}`);
      }
      console.log(`[extract] Extracting: ${xlsxFileName}`);
      xlsxData = await zip.files[xlsxFileName].async('uint8array');
      console.log(`[extract] XLSX size: ${(xlsxData.length / 1024).toFixed(0)}KB`);
    } catch (e) {
      if (e.message.includes('No XLSX')) throw e;
      throw new Error(`ZIP extraction failed: ${e.message}. The file may be corrupted or not a valid ZIP archive.`);
    }

    // === Step 3: Parse XLSX ===
    let workbook;
    try {
      const XLSX = await import('npm:xlsx@0.18.5');
      workbook = XLSX.read(xlsxData, { type: 'array' });
      console.log(`[parse] Sheets found: ${workbook.SheetNames.join(', ')}`);

      // Apply sheet filter if provided (e.g. ["MA4", "MA5"])
      const targetSheets = sheet_filter
        ? workbook.SheetNames.filter(s => {
            const t = classifyTable(s);
            return t && sheet_filter.includes(t);
          })
        : workbook.SheetNames;

      const allRecords = [];
      const sheetSummaries = [];
      const sheetErrors = {};

      for (const sheetName of targetSheets) {
        const tableName = classifyTable(sheetName);
        if (!tableName) {
          console.log(`[parse] Skipping unrecognized sheet: "${sheetName}"`);
          continue;
        }

        const sheet = workbook.Sheets[sheetName];
        if (!sheet) {
          addError('parse', `Sheet "${sheetName}" exists but has no data`, { sheet: sheetName, table: tableName });
          continue;
        }

        let rawData;
        try {
          rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        } catch (e) {
          addError('parse', `Failed to parse sheet "${sheetName}": ${e.message}`, { sheet: sheetName, table: tableName });
          sheetErrors[sheetName] = e.message;
          continue;
        }

        if (rawData.length < 2) {
          addError('parse', `Sheet "${sheetName}" has insufficient data rows (${rawData.length})`, { sheet: sheetName, table: tableName });
          continue;
        }

        let headerIdx = 0;
        for (let i = 0; i < Math.min(rawData.length, 15); i++) {
          if (rawData[i].filter(c => c !== '' && c !== null && c !== undefined).length >= 3) { headerIdx = i; break; }
        }
        const headers = rawData[headerIdx].map(h => String(h || '').trim());
        console.log(`[parse] ${sheetName} -> ${tableName}: headers at row ${headerIdx}, columns: ${headers.filter(Boolean).join(', ').substring(0, 200)}`);

        let rowCount = 0;
        let sheetRowErrors = 0;
        for (let i = headerIdx + 1; i < rawData.length; i++) {
          const row = rawData[i];
          if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;
          const obj = {};
          headers.forEach((h, idx) => { if (h) obj[h] = row[idx] !== undefined ? row[idx] : ''; });
          const record = mapRowToRecord(obj, tableName, year, i, sheetName);
          if (record._error) {
            sheetRowErrors++;
            addError('mapping', record._errorMsg, { sheet: sheetName, table: tableName, row_index: i });
            continue;
          }
          if (record.category) { allRecords.push(record); rowCount++; }
        }
        console.log(`[parse] ${sheetName} -> ${tableName}: ${rowCount} valid rows, ${sheetRowErrors} errors`);
        sheetSummaries.push({ sheet: sheetName, table: tableName, rows: rowCount, errors: sheetRowErrors });
        if (sheetRowErrors > 0) sheetErrors[sheetName] = `${sheetRowErrors} row mapping errors`;
      }

      console.log(`[parse] Total records: ${allRecords.length}, parse errors: ${errorSamples.length}`);

      // === Step 3b: Validate all records (single pass) ===
      console.log(`[validate] Running validation on ${allRecords.length} records...`);
      const validRecords = [];
      const validation = { total: allRecords.length, valid: 0, invalid: 0, error_count: 0, warning_count: 0, rule_summary: {}, errors: [], warnings: [] };
      
      for (let i = 0; i < allRecords.length; i++) {
        const result = validateRecord(allRecords[i], i, allRecords[i].table_name);
        if (result.skip) {
          continue;
        }
        if (result.valid) {
          validation.valid++;
          validRecords.push(allRecords[i]);
        } else {
          validation.invalid++;
        }
        for (const e of result.errors) {
          validation.rule_summary[e.rule] = (validation.rule_summary[e.rule] || 0) + 1;
          validation.error_count++;
          if (validation.errors.length < 50) validation.errors.push(e);
          if (errorSamples.length < 25) addError('validation', `[${e.rule}] ${e.message}`, { sheet: e.sheet, row_index: e.row, field: e.field });
        }
        for (const w of result.warnings) {
          validation.rule_summary[w.rule] = (validation.rule_summary[w.rule] || 0) + 1;
          validation.warning_count++;
          if (validation.warnings.length < 50) validation.warnings.push(w);
        }
      }
      console.log(`[validate] ${validRecords.length} passed, ${validation.invalid} rejected, ${validation.warning_count} warnings`);

      // Apply row_offset/row_limit for range-based retries
      let recordsToProcess = validRecords;
      const effectiveOffset = row_offset || 0;
      if (effectiveOffset > 0 || row_limit) {
        const end = row_limit ? effectiveOffset + row_limit : validRecords.length;
        recordsToProcess = validRecords.slice(effectiveOffset, end);
        console.log(`[range] Processing rows ${effectiveOffset} to ${Math.min(end, validRecords.length)} of ${validRecords.length}`);
      }

      await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
        total_rows: allRecords.length,
        valid_rows: validRecords.length,
        invalid_rows: validation.invalid,
        column_mapping: { sheets: sheetSummaries, sheet_errors: Object.keys(sheetErrors).length ? sheetErrors : undefined },
        error_samples: errorSamples.length > 0 ? errorSamples : undefined,
        dedup_summary: {
          validation_rule_summary: validation.rule_summary,
          validation_warnings: validation.warning_count,
        },
      });

      // === Step 4: Import with retry per chunk ===
      let imported = 0;
      let chunkErrors = 0;
      let fatalRateLimit = false;
      const CHUNK = 30;

      if (!dry_run && recordsToProcess.length > 0) {
        if (effectiveOffset === 0) {
          const existing = await base44.asServiceRole.entities.MedicareMAInpatient.filter({ data_year: year }, '-created_date', 1);
          if (existing.length > 0) {
            console.log(`Clearing existing ${year} records...`);
            while (true) {
                if (isTimeUp()) break;
                const batchRecs = await base44.asServiceRole.entities.MedicareMAInpatient.filter({ data_year: year }, '-created_date', 500);
                if (batchRecs.length === 0) break;
                
                for (let i = 0; i < batchRecs.length; i += 50) {
                    const chunk = batchRecs.slice(i, i + 50);
                    await Promise.all(chunk.map(async (rec) => {
                        try {
                            await base44.asServiceRole.entities.MedicareMAInpatient.delete(rec.id);
                        } catch (e) {
                            if (e.message?.includes('Rate limit') || e.message?.includes('429')) {
                                await delay(3000);
                                try { await base44.asServiceRole.entities.MedicareMAInpatient.delete(rec.id); } catch(e2) {}
                            }
                        }
                    }));
                    await delay(100);
                }
            }
          }
        }

        for (let i = 0; i < recordsToProcess.length; i += CHUNK) {
          if (isTimeUp()) {
            console.warn(`[import] Time limit reached at ${imported}/${recordsToProcess.length} (${elapsed()}ms)`);
            break;
          }
          const chunk = recordsToProcess.slice(i, i + CHUNK);
          let chunkImported = false;

          for (let attempt = 1; attempt <= 6; attempt++) {
            try {
              await base44.asServiceRole.entities.MedicareMAInpatient.bulkCreate(chunk);
              imported += chunk.length;
              chunkImported = true;
              break;
            } catch (e) {
              const isRateLimit = e.message?.includes('Rate limit');
              if (isRateLimit && attempt < 6) {
                const waitMs = attempt * 10000 + Math.random() * 5000; // Exponentially longer wait
                console.warn(`[import] Rate limited at chunk ${i}, waiting ${Math.round(waitMs)}ms...`);
                await delay(waitMs);
              } else if (attempt < 6 && (e.message?.includes('timeout') || e.message?.includes('network'))) {
                console.warn(`[import] Network error at chunk ${i}, retrying (${attempt}/6): ${e.message}`);
                await delay(attempt * 2000);
              } else {
                addError('import', `Chunk ${i}-${i + chunk.length} failed: ${e.message}`, {
                  chunk_start: i + effectiveOffset,
                  chunk_size: chunk.length,
                  attempts: attempt,
                  first_record_category: chunk[0]?.category,
                  first_record_table: chunk[0]?.table_name,
                });
                chunkErrors++;
                if (isRateLimit || e.message?.includes('timeout') || e.message?.includes('network')) {
                  fatalRateLimit = true;
                }
                break;
              }
            }
          }

          if (fatalRateLimit) {
            console.error(`[import] Fatal error (rate limit/timeout) at chunk ${i}, stopping chunk loop.`);
            break;
          }

          // Larger delay between successful chunks to avoid rate limits
          if (chunkImported && i + CHUNK < recordsToProcess.length) {
            await delay(2500);
          }
        }
      }

      const timedOut = !dry_run && imported < recordsToProcess.length && (isTimeUp() || fatalRateLimit);
      const finalStatus = dry_run ? 'completed'
        : timedOut ? 'paused'
        : chunkErrors > 0 && imported === 0 ? 'failed'
        : chunkErrors > 0 ? 'completed'
        : 'completed';

      await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
        status: finalStatus,
        imported_rows: (batch.imported_rows || 0) + imported,
        skipped_rows: (batch.skipped_rows || 0) + (chunkErrors * CHUNK),
        completed_at: new Date().toISOString(),
        error_samples: errorSamples.length > 0 ? errorSamples : undefined,
        ...(timedOut ? {
          paused_at: new Date().toISOString(),
          cancel_reason: `${fatalRateLimit ? 'Rate limit or network error' : 'Time limit'} reached. Imported ${imported} of ${recordsToProcess.length}. Resume from offset ${effectiveOffset + imported}.`,
          retry_params: { row_offset: effectiveOffset + imported }
        } : {
          cancel_reason: "",
          paused_at: ""
        }),
      });

      // Update schedule config
      try {
        const configs = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ import_type: 'medicare_ma_inpatient' });
        if (configs.length > 0) {
          await base44.asServiceRole.entities.ImportScheduleConfig.update(configs[0].id, {
            last_run_at: new Date().toISOString(),
            last_run_status: finalStatus === 'failed' ? 'failed' : finalStatus === 'paused' ? 'partial' : 'success',
            last_run_summary: `${dry_run ? 'Validated' : 'Imported'} ${dry_run ? recordsToProcess.length : imported} records from ${sheetSummaries.length} sheets for year ${year}${chunkErrors > 0 ? `, ${chunkErrors} chunk errors` : ''}${timedOut ? ' (timed out, resumable)' : ''}`,
          });
        }
      } catch (e) { console.warn('[schedule] Config update failed:', e.message); }

      await base44.asServiceRole.entities.AuditEvent.create({
        event_type: 'import', user_email: user?.email || 'system',
        details: { action: 'Medicare MA Inpatient Import', entity: 'MedicareMAInpatient', year, imported_count: imported, errors: errorSamples.length, status: finalStatus },
        timestamp: new Date().toISOString(),
      });

      if (timedOut && !dry_run) {
        base44.asServiceRole.functions.invoke('importMedicareMAInpatient', {
          action: 'resume',
          batch_id: batch.id,
          year,
          custom_url: downloadUrl,
          sheet_filter,
          row_limit,
          row_offset: effectiveOffset + imported
        }).catch(e => console.error(`[importMedicareMAInpatient] Auto-resume invoke error:`, e));
      }

      return Response.json({
        success: true,
        batch_id: batch.id,
        year,
        dry_run,
        status: finalStatus,
        sheets_parsed: sheetSummaries,
        total_records: allRecords.length,
        records_validated: validRecords.length,
        records_rejected: validation.invalid,
        records_in_range: recordsToProcess.length,
        imported,
        chunk_errors: chunkErrors,
        parse_errors: errorSamples.filter(e => e.phase !== 'import' && e.phase !== 'validation').length,
        validation_errors: validation.error_count,
        validation_warnings: validation.warning_count,
        validation_rule_summary: validation.rule_summary,
        import_errors: errorSamples.filter(e => e.phase === 'import').length,
        elapsed_ms: elapsed(),
        ...(timedOut ? {
          timed_out: true,
          resume_offset: effectiveOffset + imported,
          remaining: recordsToProcess.length - imported,
          hint: `Re-run with row_offset=${effectiveOffset + imported} to resume`,
        } : {}),
        ...(validation.errors.length > 0 ? { validation_error_samples: validation.errors.slice(0, 15) } : {}),
        ...(validation.warnings.length > 0 ? { validation_warning_samples: validation.warnings.slice(0, 10) } : {}),
        ...(errorSamples.length > 0 ? { error_samples: errorSamples.slice(0, 10) } : {}),
      });

    } catch (parseError) {
      throw new Error(`XLSX parsing failed: ${parseError.message}`);
    }

  } catch (error) {
    const errorMessage = error.message || 'Unknown error';
    const errorPhase = errorMessage.includes('download') || errorMessage.includes('ZIP download') ? 'download'
      : errorMessage.includes('extract') || errorMessage.includes('ZIP') ? 'extraction'
      : errorMessage.includes('XLSX') || errorMessage.includes('parse') ? 'parsing'
      : errorMessage.includes('Rate limit') ? 'rate_limit'
      : 'unknown';

    console.error(`[fatal:${errorPhase}] ${errorMessage}`);

    const isRetryable = errorPhase === 'download' || errorPhase === 'rate_limit' || errorMessage.includes('timeout');
    const batchStatus = isRetryable ? 'paused' : 'failed';

    try {
      await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
        status: batchStatus,
        error_samples: [...errorSamples, { phase: errorPhase, detail: errorMessage, timestamp: new Date().toISOString(), retryable: isRetryable }],
        ...(isRetryable ? { paused_at: new Date().toISOString(), cancel_reason: `${errorPhase} error (retryable): ${errorMessage}` } : {}),
      });
    } catch (e) { console.error('[fatal] Batch status update failed:', e.message); }

    // Create error report for non-retryable failures
    if (!isRetryable) {
      try {
        await base44.asServiceRole.entities.ErrorReport.create({
          error_type: 'import_failure',
          severity: 'high',
          source: batch.id,
          title: `Medicare MA Inpatient import failed at ${errorPhase} phase`,
          description: errorMessage,
          error_samples: errorSamples.slice(0, 10),
          context: { import_type: 'medicare_ma_inpatient', year, phase: errorPhase, batch_id: batch.id, url: downloadUrl },
          status: 'new',
        });
      } catch (e) { console.error('[fatal] Error report creation failed:', e.message); }
    }

    try {
      const configs = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ import_type: 'medicare_ma_inpatient' });
      if (configs.length > 0) {
        await base44.asServiceRole.entities.ImportScheduleConfig.update(configs[0].id, {
          last_run_at: new Date().toISOString(), last_run_status: 'failed', last_run_summary: `Failed at ${errorPhase}: ${errorMessage.substring(0, 200)}`,
        });
      }
    } catch (e) {}

    return Response.json({
      error: errorMessage,
      error_phase: errorPhase,
      retryable: isRetryable,
      batch_id: batch.id,
      error_samples: errorSamples.slice(0, 5),
      hint: isRetryable
        ? 'This error is transient. Wait a few minutes and retry the import.'
        : `The import failed during the ${errorPhase} phase. Check the error details and batch error log for specifics.`,
    }, { status: 500 });
  }
});