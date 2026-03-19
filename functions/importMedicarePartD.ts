import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import * as XLSX from 'npm:xlsx@0.18.5';
import JSZip from 'npm:jszip@3.10.1';

const MAX_EXEC_MS = 25_000;
const CHUNK = 25;
const MAX_FLOAT = 999999999999.99;
const MAX_INT = 2147483647;
let execStart = Date.now();
function isTimeUp() { return (Date.now() - execStart) > MAX_EXEC_MS; }
function elapsed() { return Date.now() - execStart; }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitteredBackoff(attempt) { return Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 10000); }

const CMS_PARTD_URLS = {
  2023: 'https://data.cms.gov/sites/default/files/2026-01/MDCR%20PARTD_CPS_01CPD_2023.zip',
  2022: 'https://data.cms.gov/sites/default/files/2024-10/CPS%20MDCR%20PARTD%202022.zip',
  2021: 'https://data.cms.gov/sites/default/files/2023-02/CPS%20MDCR%20PARTD%202021.zip',
  2020: 'https://data.cms.gov/sites/default/files/2022-02/CPS%20MDCR%20PARTD%202020.zip',
};
const LATEST_AVAILABLE_YEAR = Math.max(...Object.keys(CMS_PARTD_URLS).map(Number));

const FINANCIAL_FIELDS = ['total_spending', 'out_of_pocket_costs', 'low_income_subsidy_spending', 'reinsurance_spending', 'gap_discount_spending', 'total_drug_cost', 'beneficiary_cost_share'];
const COUNT_FIELDS = ['persons_with_part_d', 'total_claims', 'total_prescriptions', 'total_standardized_30_day_fills', 'brand_claims', 'generic_claims'];
const NUMERIC_FIELDS = [...FINANCIAL_FIELDS, ...COUNT_FIELDS];

function clampNumericFields(record) {
  for (const f of FINANCIAL_FIELDS) {
    if (record[f] != null) {
      if (record[f] > MAX_FLOAT) record[f] = MAX_FLOAT;
      if (record[f] < -MAX_FLOAT) record[f] = -MAX_FLOAT;
    }
  }
  for (const f of COUNT_FIELDS) {
    if (record[f] != null) {
      if (record[f] > MAX_INT) record[f] = MAX_INT;
      if (record[f] < -MAX_INT) record[f] = -MAX_INT;
    }
  }
  if (record.raw_data && typeof record.raw_data === 'object') {
    for (const key of Object.keys(record.raw_data)) {
      record.raw_data[key] = String(record.raw_data[key] ?? '');
    }
  }
  return record;
}

async function downloadAndParseZip(url) {
  console.log(`Downloading ZIP from: ${url}`);
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'application/zip, application/octet-stream, */*'
    }
  });
  if (!resp.ok) throw new Error(`Failed to download: ${resp.status} ${resp.statusText}`);
  const arrayBuffer = await resp.arrayBuffer();
  if (arrayBuffer.byteLength < 1000) {
    const text = new TextDecoder().decode(arrayBuffer);
    throw new Error(`Downloaded file is too small (${arrayBuffer.byteLength} bytes). Content preview: ${text.substring(0, 200)}`);
  }
  const header = new Uint8Array(arrayBuffer.slice(0, 4));
  const isZip = header[0] === 0x50 && header[1] === 0x4B;
  if (!isZip) {
    try {
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
      if (workbook.SheetNames.length > 0) return workbook;
    } catch (_) {}
    const text = new TextDecoder().decode(arrayBuffer.slice(0, 200));
    throw new Error(`Downloaded file is not a valid ZIP/XLSX archive. Header: ${header[0]},${header[1]}. Content preview: ${text}`);
  }
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const fileNames = Object.keys(zip.files);
    const xlsxFile = fileNames.find(f => /\.(xlsx|xls|csv)$/i.test(f));
    if (!xlsxFile) throw new Error(`No data file in ZIP. Files: ${fileNames.join(', ')}`);
    const data = await zip.files[xlsxFile].async('uint8array');
    if (/\.csv$/i.test(xlsxFile)) return XLSX.read(new TextDecoder().decode(data), { type: 'string' });
    return XLSX.read(data, { type: 'array' });
  } catch (e) {
    throw new Error(`Failed to parse ZIP file: ${e.message}`);
  }
}

function parseSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rawData.length < 2) return [];
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rawData.length, 15); i++) {
    if (rawData[i].filter(c => c !== '' && c !== null && c !== undefined).length >= 3) { headerIdx = i; break; }
  }
  const headers = rawData[headerIdx].map(h => String(h || '').trim());
  const rows = [];
  for (let i = headerIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;
    const obj = { _rowIndex: i + 1 };
    headers.forEach((h, idx) => { if (h) obj[h] = row[idx] !== undefined ? row[idx] : ''; });
    rows.push(obj);
  }
  return rows;
}

function classifyPartDTable(sheetName) {
  const name = sheetName.toUpperCase().replace(/\s+/g, ' ');
  for (let i = 6; i >= 1; i--) {
    if (name.includes(`PD${i}`) || name.includes(`PD ${i}`) || name.includes(`PARTD${i}`) || name.includes(`PARTD ${i}`) || name.includes(`PART D ${i}`) || name.includes(`TABLE ${i}`)) return `PD${i}`;
  }
  return null;
}

function safeNum(val) {
  if (val === '' || val === null || val === undefined || val === '*' || val === '—' || val === '-' || val === 'N/A') return null;
  const num = parseFloat(String(val).replace(/[,$%\s]/g, ''));
  return isNaN(num) ? null : num;
}

function mapPartDRow(row, tableName, dataYear) {
  const headers = Object.keys(row).filter(h => h !== '_rowIndex');
  const record = { table_name: tableName, data_year: dataYear, raw_data: {} };
  headers.forEach(h => { record.raw_data[h] = String(row[h] ?? ''); });

  for (const h of headers) {
    const hl = h.toLowerCase();
    if (!record.category && (hl.includes('entitlement') || hl.includes('demographic') || hl.includes('state') || hl.includes('area') || hl.includes('type') || hl.includes('sex') || hl.includes('race') || hl.includes('age') || hl.includes('plan') || hl === headers[0].toLowerCase())) {
      record.category = String(row[h] || '').trim();
    }
    if (hl.includes('person') && (hl.includes('part d') || hl.includes('served') || hl.includes('enrolled'))) record.persons_with_part_d = safeNum(row[h]);
    if (hl.includes('claim') && hl.includes('total') && !hl.includes('brand') && !hl.includes('generic')) record.total_claims = safeNum(row[h]);
    if (hl.includes('prescription') && !hl.includes('per')) record.total_prescriptions = safeNum(row[h]);
    if (hl.includes('standardized') && hl.includes('30')) record.total_standardized_30_day_fills = safeNum(row[h]);
    if (hl.includes('total') && hl.includes('spending') && !hl.includes('out') && !hl.includes('subsidy') && !hl.includes('reinsurance')) record.total_spending = safeNum(row[h]);
    if (hl.includes('out') && hl.includes('pocket')) record.out_of_pocket_costs = safeNum(row[h]);
    if (hl.includes('low income') && hl.includes('subsidy')) record.low_income_subsidy_spending = safeNum(row[h]);
    if (hl.includes('reinsurance')) record.reinsurance_spending = safeNum(row[h]);
    if (hl.includes('gap') && hl.includes('discount')) record.gap_discount_spending = safeNum(row[h]);
    if (hl.includes('drug cost') || (hl.includes('total') && hl.includes('cost') && !hl.includes('share'))) record.total_drug_cost = safeNum(row[h]);
    if (hl.includes('beneficiary') && hl.includes('cost') && hl.includes('share')) record.beneficiary_cost_share = safeNum(row[h]);
    if (hl.includes('brand') && hl.includes('claim')) record.brand_claims = safeNum(row[h]);
    if (hl.includes('generic') && hl.includes('claim')) record.generic_claims = safeNum(row[h]);
  }
  if (!record.category && headers.length > 0) record.category = String(row[headers[0]] || '').trim();
  if (tableName === 'PD3') { const cat = record.category || ''; if (cat.length === 2 && cat === cat.toUpperCase()) record.state = cat; }
  return clampNumericFields(record);
}

function validateRecord(record, rowIndex, sheetName) {
  const errors = [], warnings = [];
  const hasMetricData = NUMERIC_FIELDS.some(f => record[f] != null);

  if (!hasMetricData) {
    return { valid: false, skip: true, errors: [], warnings: [] };
  }

  if (!record.category || record.category.trim() === '') {
    record.category = `Row ${rowIndex}`;
    warnings.push({ rule: 'missing_category', field: 'category', message: 'Missing category — auto-assigned', row: rowIndex, sheet: sheetName });
  }

  if (record.data_year < 2000 || record.data_year > 2030) {
    errors.push({ rule: 'data_year_range', field: 'data_year', value: record.data_year, message: `data_year ${record.data_year} outside 2000-2030`, row: rowIndex, sheet: sheetName });
  }

  for (const f of NUMERIC_FIELDS) {
    if (record[f] != null && record[f] < 0) {
      errors.push({ rule: 'negative_value', field: f, value: record[f], message: `${f} is negative`, row: rowIndex, sheet: sheetName });
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

async function bulkCreateWithRetry(entity, chunk, label) {
  let consecutiveRateLimits = 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await entity.bulkCreate(chunk);
      return { ok: true };
    } catch (e) {
      const msg = e.message || '';
      const isRetryable = /rate limit|timeout|network|429|503|502|ECONNRESET/i.test(msg);
      const isRateLimit = /rate limit|429/i.test(msg);
      if (isRateLimit) consecutiveRateLimits++;
      if (consecutiveRateLimits >= 3) return { ok: false, error: msg, rateLimitBreaker: true };
      if (isRetryable && attempt < 4) {
        const wait = jitteredBackoff(attempt);
        console.warn(`[${label}] Retry ${attempt + 1}/5 after ${Math.round(wait)}ms: ${msg}`);
        await delay(wait);
      } else {
        return { ok: false, error: msg };
      }
    }
  }
  return { ok: false, error: 'Max retries exceeded' };
}

Deno.serve(async (req) => {
  execStart = Date.now();
  const base44 = createClientFromRequest(req);

  let user = null;
  try { user = await base44.auth.me(); } catch (e) {}
  const isService = user && user.email && user.email.includes('service+');
  if (user && user.role !== 'admin' && !isService) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const payload = await req.json().catch(() => ({}));
  const { action = 'import', dry_run = false, custom_url, sheet_filter, row_offset = 0, row_limit } = payload;
  const requestedYear = parseInt(payload.year || LATEST_AVAILABLE_YEAR);
  const year = CMS_PARTD_URLS[requestedYear] ? requestedYear : LATEST_AVAILABLE_YEAR;
  if (requestedYear !== year) console.log(`Year ${requestedYear} unavailable for Part D, falling back to ${year}`);

  if (action === 'list_years') return Response.json({ available_years: Object.keys(CMS_PARTD_URLS).map(Number).sort((a, b) => b - a), source: 'CMS Program Statistics - Medicare Part D' });

  let downloadUrl = custom_url || CMS_PARTD_URLS[year];
  try {
    const config = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ import_type: 'medicare_part_d_stats' });
    if (config.length > 0 && config[0].api_url) {
      if (year === LATEST_AVAILABLE_YEAR || config[0].api_url.includes(String(year))) {
        downloadUrl = config[0].api_url;
        console.log(`Using configured URL for Part D ${year}: ${downloadUrl}`);
      }
    }
  } catch (e) { console.warn('Config lookup failed', e); }

  if (!downloadUrl) return Response.json({ error: `No URL for year ${year}`, hint: `Latest available: ${LATEST_AVAILABLE_YEAR}` }, { status: 400 });

  let batch;
  if (action === 'resume' && payload.batch_id) {
    batch = await base44.asServiceRole.entities.ImportBatch.get(payload.batch_id);
    if (!batch) return Response.json({ error: 'Batch not found' }, { status: 404 });
    await base44.asServiceRole.entities.ImportBatch.update(batch.id, { status: 'processing', cancel_reason: "", paused_at: "" });
  } else {
    const existingActive = await base44.asServiceRole.entities.ImportBatch.filter({
      import_type: 'medicare_part_d_stats',
      status: { $in: ['processing', 'validating'] }
    });
    if (existingActive.length > 0) {
      batch = existingActive[0];
      console.log(`Using existing active batch: ${batch.id}`);
    } else {
      batch = await base44.asServiceRole.entities.ImportBatch.create({
        import_type: 'medicare_part_d_stats', file_name: `medicare_part_d_${year}`, file_url: downloadUrl,
        status: 'processing', dry_run, data_year: year,
        retry_params: (sheet_filter || row_offset || row_limit) ? { sheet_filter, row_offset, row_limit } : undefined,
      });
    }
  }

  const errorSamples = [];
  const addError = (phase, detail, ctx) => {
    const entry = { phase, detail: String(detail).substring(0, 500), timestamp: new Date().toISOString(), ...ctx };
    if (errorSamples.length < 100) errorSamples.push(entry);
  };

  try {
    const workbook = await downloadAndParseZip(downloadUrl);
    const targetSheets = sheet_filter
      ? workbook.SheetNames.filter(s => { const t = classifyPartDTable(s); return t && sheet_filter.includes(t); })
      : workbook.SheetNames;

    const allRecords = [], sheetSummaries = [];
    let totalInvalid = 0, totalWarnings = 0;
    const ruleSummary = {};

    for (const sheetName of targetSheets) {
      const tableName = classifyPartDTable(sheetName);
      if (!tableName) continue;
      let rows;
      try { rows = parseSheet(workbook, sheetName); } catch (e) { addError('parse', `Sheet "${sheetName}": ${e.message}`, { sheet: sheetName }); continue; }
      let sv = 0, si = 0, sheetSkipped = 0;
      for (const row of rows) {
        const record = mapPartDRow(row, tableName, year);
        const v = validateRecord(record, row._rowIndex, sheetName);
        if (v.skip) { sheetSkipped++; continue; }
        for (const e of v.errors) {
          ruleSummary[e.rule] = (ruleSummary[e.rule] || 0) + 1;
          addError('validation', `[${e.rule}] ${e.message}`, { sheet: sheetName, row: e.row, field: e.field, value: e.value, rule: e.rule });
        }
        for (const w of v.warnings) { ruleSummary[w.rule] = (ruleSummary[w.rule] || 0) + 1; totalWarnings++; }
        if (v.valid) { allRecords.push(record); sv++; } else { totalInvalid++; si++; }
      }
      sheetSummaries.push({ sheet: sheetName, table: tableName, rows: rows.length, valid: sv, invalid: si, skipped_spacers: sheetSkipped });
    }

    let recordsToProcess = allRecords;
    const effectiveOffset = row_offset || 0;
    if (effectiveOffset > 0 || row_limit) {
      const end = row_limit ? effectiveOffset + row_limit : allRecords.length;
      recordsToProcess = allRecords.slice(effectiveOffset, end);
    }

    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      total_rows: allRecords.length + totalInvalid, valid_rows: allRecords.length, invalid_rows: totalInvalid,
      column_mapping: { sheets: sheetSummaries },
      error_samples: errorSamples.length > 0 ? errorSamples : [],
      dedup_summary: { validation_rule_summary: ruleSummary, validation_warnings: totalWarnings },
    });

    let imported = 0, chunkErrors = 0;
    let consecutiveRateLimitChunks = 0;
    if (!dry_run && recordsToProcess.length > 0) {
      if (effectiveOffset === 0) {
        const existing = await base44.asServiceRole.entities.MedicarePartDStats.filter({ data_year: year }, '-created_date', 1);
        if (existing.length > 0) {
          console.log(`Clearing existing ${year} records...`);
          while (true) {
            if (isTimeUp()) break;
            const batchRecs = await base44.asServiceRole.entities.MedicarePartDStats.filter({ data_year: year }, '-created_date', 500);
            if (batchRecs.length === 0) break;
            for (let i = 0; i < batchRecs.length; i += 50) {
              const chunk = batchRecs.slice(i, i + 50);
              await Promise.all(chunk.map(async (rec) => {
                try { await base44.asServiceRole.entities.MedicarePartDStats.delete(rec.id); } catch (e) {
                  if (e.message?.includes('Rate limit') || e.message?.includes('429')) {
                    await delay(3000);
                    try { await base44.asServiceRole.entities.MedicarePartDStats.delete(rec.id); } catch (e2) {}
                  }
                }
              }));
              await delay(100);
            }
          }
        }
      }

      for (let i = 0; i < recordsToProcess.length; i += CHUNK) {
        if (isTimeUp()) break;
        if (consecutiveRateLimitChunks >= 3) {
          console.warn(`Circuit breaker: 3 consecutive rate-limited chunks. Pausing import.`);
          break;
        }
        const chunk = recordsToProcess.slice(i, i + CHUNK);
        const result = await bulkCreateWithRetry(base44.asServiceRole.entities.MedicarePartDStats, chunk, `chunk-${i}`);
        if (result.ok) {
          imported += chunk.length;
          consecutiveRateLimitChunks = 0;
        } else {
          chunkErrors++;
          addError('import', `Chunk ${i} failed: ${result.error}`, { chunk_start: i + effectiveOffset });
          if (result.rateLimitBreaker || /rate limit|429/i.test(result.error)) {
            consecutiveRateLimitChunks++;
            await delay(5000);
          }
        }
        if (i + CHUNK < recordsToProcess.length) await delay(1200);
      }
    }

    const timedOut = !dry_run && imported < recordsToProcess.length && (isTimeUp() || consecutiveRateLimitChunks >= 3);
    const finalStatus = dry_run ? 'completed' : timedOut ? 'paused' : chunkErrors > 0 && imported === 0 ? 'failed' : 'completed';
    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      status: finalStatus, imported_rows: (batch.imported_rows || 0) + imported, skipped_rows: (batch.skipped_rows || 0) + (chunkErrors * CHUNK), completed_at: new Date().toISOString(),
      error_samples: errorSamples.length > 0 ? errorSamples : [],
      ...(timedOut ? { paused_at: new Date().toISOString(), cancel_reason: `Time/rate limit. Resume offset=${effectiveOffset + imported}`, retry_params: { row_offset: effectiveOffset + imported } } : { cancel_reason: "", paused_at: "" }),
    });

    try { const configs = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ import_type: 'medicare_part_d_stats' }); if (configs.length > 0) await base44.asServiceRole.entities.ImportScheduleConfig.update(configs[0].id, { last_run_at: new Date().toISOString(), last_run_status: finalStatus === 'failed' ? 'failed' : finalStatus === 'paused' ? 'partial' : 'success', last_run_summary: `${imported} records, ${sheetSummaries.length} sheets, year ${year}` }); } catch (_) {}
    await base44.asServiceRole.entities.AuditEvent.create({ event_type: 'import', user_email: user?.email || 'system', details: { action: 'Medicare Part D Import', entity: 'MedicarePartDStats', year, imported_count: imported, status: finalStatus }, timestamp: new Date().toISOString() });

    if (timedOut && !dry_run) {
      base44.asServiceRole.functions.invoke('importMedicarePartD', {
        action: 'resume', batch_id: batch.id, year: requestedYear, custom_url: downloadUrl,
        sheet_filter, row_limit, row_offset: effectiveOffset + imported
      }).catch(e => console.error(`[importMedicarePartD] Auto-resume invoke error:`, e));
    }

    return Response.json({
      success: true, batch_id: batch.id, year, dry_run, status: finalStatus, sheets_parsed: sheetSummaries,
      total_records: allRecords.length + totalInvalid, records_validated: allRecords.length, records_rejected: totalInvalid,
      records_in_range: recordsToProcess.length, imported, chunk_errors: chunkErrors, validation_warnings: totalWarnings,
      validation_rule_summary: ruleSummary, elapsed_ms: elapsed(),
      ...(timedOut ? { timed_out: true, resume_offset: effectiveOffset + imported, remaining: recordsToProcess.length - imported } : {}),
      ...(errorSamples.length > 0 ? { error_samples: errorSamples.slice(0, 10) } : {}),
    });
  } catch (error) {
    const errorMsg = error.message || String(error);
    const isRetryable = errorMsg.includes('download') || errorMsg.includes('timeout') || errorMsg.includes('too small') || errorMsg.includes('not a valid ZIP') || errorMsg.includes('Failed to download');
    const errorCategory = errorMsg.includes('too small') || errorMsg.includes('not a valid ZIP') ? 'api_downtime' : errorMsg.includes('timeout') ? 'network_error' : 'unknown';

    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      status: isRetryable ? 'paused' : 'failed',
      error_samples: [...errorSamples, { phase: 'fatal', detail: errorMsg }],
      ...(isRetryable ? { paused_at: new Date().toISOString() } : {}),
    });

    await base44.asServiceRole.entities.ErrorReport.create({
      error_type: 'import_failure', error_category: errorCategory, severity: isRetryable ? 'medium' : 'high',
      source: batch.id, title: `Medicare Part D Import Failed: ${year}`, description: errorMsg, status: 'new',
      context: { import_type: 'medicare_part_d_stats', year, url: downloadUrl }
    });

    return Response.json({ error: errorMsg, retryable: isRetryable, batch_id: batch.id }, { status: 500 });
  }
});
