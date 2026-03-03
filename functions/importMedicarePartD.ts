import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';
import JSZip from 'npm:jszip@3.10.1';

const MAX_EXEC_MS = 50_000;
const CHUNK = 30;
let execStart = Date.now();
function isTimeUp() { return (Date.now() - execStart) > MAX_EXEC_MS; }
function elapsed() { return Date.now() - execStart; }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitteredBackoff(attempt) { return Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 10000); }

// URLs are now managed via ImportScheduleConfig entity.
const FALLBACK_PART_D_URL = 'https://data.cms.gov/sites/default/files/2025-09/CPS%20MDCR%20UTLZN%20D%202023.zip';
const NUMERIC_FIELDS = ['total_enrollees','total_utilizers','avg_annual_fills','avg_annual_gross_cost','generic_dispensing_rate','brand_cost','generic_cost','total_drug_cost'];

async function downloadAndParseZip(url) {
  console.log(`Downloading from: ${url}`);
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
      throw new Error(`Downloaded file is too small (${arrayBuffer.byteLength} bytes) and likely invalid. Content preview: ${text.substring(0, 200)}`);
  }

  const header = new Uint8Array(arrayBuffer.slice(0, 4));
  if (!(header[0] === 0x50 && header[1] === 0x4B)) {
    try { const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' }); if (wb.SheetNames.length > 0) return wb; } catch (_) {}
    // Preview the content to help debug
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
  for (let i = 0; i < Math.min(rawData.length, 15); i++) { if (rawData[i].filter(c => c !== '' && c !== null && c !== undefined).length >= 3) { headerIdx = i; break; } }
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

function safeNum(val) {
  if (val === '' || val === null || val === undefined || val === '*' || val === '—' || val === '-' || val === 'N/A') return null;
  const num = parseFloat(String(val).replace(/[,$%\s]/g, ''));
  return isNaN(num) ? null : num;
}

function classifyPartDTable(sheetName) {
  const name = sheetName.toUpperCase().replace(/\s+/g, ' ');
  for (let i = 11; i >= 1; i--) { if (name.includes(`D ${i}`) || name.includes(`D${i}`) || name.includes(`TABLE ${i}`)) return `D${i}`; }
  return null;
}

function mapPartDRow(row, tableName, dataYear) {
  const headers = Object.keys(row).filter(h => h !== '_rowIndex');
  const record = { table_name: tableName, data_year: dataYear, raw_data: {} };
  headers.forEach(h => { record.raw_data[h] = row[h]; });
  for (const h of headers) {
    const hl = h.toLowerCase();
    if (!record.category && (hl.includes('plan') || hl.includes('lis') || hl.includes('demographic') || hl.includes('state') || hl.includes('area') || hl.includes('phase') || hl.includes('age') || hl.includes('sex') || hl.includes('race') || hl === headers[0].toLowerCase())) record.category = String(row[h] || '').trim();
    if (hl.includes('plan type') || hl.includes('type of plan')) record.plan_type = String(row[h] || '').trim();
    if (hl.includes('lis') && hl.includes('elig')) record.lis_eligibility = String(row[h] || '').trim();
    if (hl.includes('enrollee') && !hl.includes('per') && !hl.includes('cost')) record.total_enrollees = safeNum(row[h]);
    if (hl.includes('utilizer') && !hl.includes('per') && !hl.includes('cost')) record.total_utilizers = safeNum(row[h]);
    if (hl.includes('fill') && (hl.includes('average') || hl.includes('avg'))) record.avg_annual_fills = safeNum(row[h]);
    if (hl.includes('gross') && hl.includes('cost') && (hl.includes('average') || hl.includes('avg') || hl.includes('per'))) record.avg_annual_gross_cost = safeNum(row[h]);
    if (hl.includes('generic') && hl.includes('dispensing') && hl.includes('rate')) record.generic_dispensing_rate = safeNum(row[h]);
    if (hl.includes('brand') && hl.includes('cost')) record.brand_cost = safeNum(row[h]);
    if (hl.includes('generic') && hl.includes('cost')) record.generic_cost = safeNum(row[h]);
    if (hl.includes('total') && hl.includes('drug') && hl.includes('cost') && !hl.includes('per')) record.total_drug_cost = safeNum(row[h]);
    if (hl.includes('phase') || hl.includes('coverage')) record.coverage_phase = String(row[h] || '').trim();
  }
  if (!record.category && headers.length > 0) record.category = String(row[headers[0]] || '').trim();
  if (['D6', 'D7', 'D11'].includes(tableName)) { const cat = record.category || ''; if (cat.length === 2 && cat === cat.toUpperCase()) record.state = cat; }
  if (['D4', 'D5', 'D10'].includes(tableName)) record.demographic_group = record.category;
  return record;
}

function validateRecord(record, rowIndex, sheetName) {
  const errors = [], warnings = [];
  if (!record.category || record.category.trim() === '') errors.push({ rule: 'missing_category', field: 'category', message: 'Missing category', row: rowIndex, sheet: sheetName });
  if (record.data_year < 2000 || record.data_year > 2030) errors.push({ rule: 'data_year_range', message: `data_year ${record.data_year} outside range`, row: rowIndex, sheet: sheetName });
  if (!NUMERIC_FIELDS.some(f => record[f] != null)) warnings.push({ rule: 'no_metrics', message: 'No numeric values', row: rowIndex, sheet: sheetName });
  for (const f of NUMERIC_FIELDS) { if (record[f] != null && record[f] < 0) errors.push({ rule: 'negative_value', field: f, message: `${f} is negative`, row: rowIndex, sheet: sheetName }); }
  if (record.generic_dispensing_rate != null && (record.generic_dispensing_rate < 0 || record.generic_dispensing_rate > 100)) warnings.push({ rule: 'gdr_range', message: `GDR ${record.generic_dispensing_rate} outside 0-100%`, row: rowIndex, sheet: sheetName });
  return { valid: errors.length === 0, errors, warnings };
}

async function bulkCreateWithRetry(entity, chunk, label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await entity.bulkCreate(chunk); return { ok: true }; } catch (e) {
      if ((e.message?.includes('Rate limit') || e.message?.includes('timeout')) && attempt < 2) { await delay(jitteredBackoff(attempt)); } else { return { ok: false, error: e.message }; }
    }
  }
  return { ok: false, error: 'Max retries' };
}

Deno.serve(async (req) => {
  execStart = Date.now();
  const base44 = createClientFromRequest(req);
  
  // Allow service role calls (from triggerImport, cancelStalledImports) or admin users
  let user = null;
  try { user = await base44.auth.me(); } catch (e) { /* service role call */ }
  const isService = user && user.email && user.email.includes('service+');
  if (user && user.role !== 'admin' && !isService) return Response.json({ error: 'Forbidden' }, { status: 403 });

  const payload = await req.json().catch(() => ({}));
  const { action = 'import', dry_run = false, custom_url, sheet_filter, row_offset = 0, row_limit } = payload;

  const LATEST_YEAR = 2023; // force reload
  const requestedYear = parseInt(payload.year || LATEST_YEAR);
  const year = requestedYear;

  if (action === 'list_years') return Response.json({ available_years: [2023, 2022, 2021, 2020, 2019, 2018] });

  let downloadUrl = custom_url;
  if (!downloadUrl) {
    const configs = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ import_type: 'medicare_part_d_stats' });
    if (configs.length > 0) {
      downloadUrl = configs[0].api_url;
    } else {
      downloadUrl = FALLBACK_PART_D_URL;
    }
  }
  if (!downloadUrl) return Response.json({ error: `No URL for Medicare Part D Stats` }, { status: 400 });

  const batch = await base44.asServiceRole.entities.ImportBatch.create({
    import_type: 'medicare_part_d_stats', file_name: `medicare_part_d_${year}`, file_url: downloadUrl,
    status: 'processing', dry_run, data_year: year,
    retry_params: (sheet_filter || row_offset || row_limit) ? { sheet_filter, row_offset, row_limit } : undefined,
  });
  const errorSamples = [];
  const addError = (phase, detail, ctx) => { if (errorSamples.length < 50) errorSamples.push({ phase, detail: String(detail).substring(0, 500), timestamp: new Date().toISOString(), ...ctx }); };

  try {
    const workbook = await downloadAndParseZip(downloadUrl);
    const targetSheets = sheet_filter ? workbook.SheetNames.filter(s => { const t = classifyPartDTable(s); return t && sheet_filter.includes(t); }) : workbook.SheetNames;
    const allRecords = [], sheetSummaries = [];
    let totalInvalid = 0, totalWarnings = 0;
    const ruleSummary = {};

    for (const sheetName of targetSheets) {
      const tableName = classifyPartDTable(sheetName);
      if (!tableName) continue;
      let rows;
      try { rows = parseSheet(workbook, sheetName); } catch (e) { addError('parse', e.message, { sheet: sheetName }); continue; }
      let sv = 0, si = 0;
      for (const row of rows) {
        const record = mapPartDRow(row, tableName, year);
        const v = validateRecord(record, row._rowIndex, sheetName);
        for (const e of v.errors) { ruleSummary[e.rule] = (ruleSummary[e.rule] || 0) + 1; addError('validation', `[${e.rule}] ${e.message}`, { sheet: sheetName, row: e.row, field: e.field }); }
        for (const w of v.warnings) { ruleSummary[w.rule] = (ruleSummary[w.rule] || 0) + 1; totalWarnings++; }
        if (v.valid) { allRecords.push(record); sv++; } else { totalInvalid++; si++; }
      }
      sheetSummaries.push({ sheet: sheetName, table: tableName, rows: rows.length, valid: sv, invalid: si });
    }

    let recordsToProcess = allRecords;
    const effectiveOffset = row_offset || 0;
    if (effectiveOffset > 0 || row_limit) { recordsToProcess = allRecords.slice(effectiveOffset, row_limit ? effectiveOffset + row_limit : allRecords.length); }

    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      total_rows: allRecords.length + totalInvalid, valid_rows: allRecords.length, invalid_rows: totalInvalid,
      column_mapping: { sheets: sheetSummaries },
      error_samples: errorSamples.length > 0 ? errorSamples : undefined,
      dedup_summary: { validation_rule_summary: ruleSummary, validation_warnings: totalWarnings },
    });

    let imported = 0, chunkErrors = 0;
    if (!dry_run && recordsToProcess.length > 0) {
      if (effectiveOffset === 0) {
        const existing = await base44.asServiceRole.entities.MedicarePartDStats.filter({ data_year: year }, '-created_date', 1);
        if (existing.length > 0) {
            console.log(`Clearing existing ${year} records...`);
            while (true) {
                const batch = await base44.asServiceRole.entities.MedicarePartDStats.filter({ data_year: year }, '-created_date', 500);
                if (batch.length === 0) break;
                for (const rec of batch) {
                    await base44.asServiceRole.entities.MedicarePartDStats.delete(rec.id);
                    await delay(100);
                }
            }
        }
      }
      for (let i = 0; i < recordsToProcess.length; i += CHUNK) {
        if (isTimeUp()) break;
        const chunk = recordsToProcess.slice(i, i + CHUNK);
        const result = await bulkCreateWithRetry(base44.asServiceRole.entities.MedicarePartDStats, chunk, `chunk-${i}`);
        if (result.ok) imported += chunk.length; else { chunkErrors++; addError('import', `Chunk ${i} failed: ${result.error}`, { chunk_start: i + effectiveOffset }); }
        if (i + CHUNK < recordsToProcess.length) await delay(350);
      }
    }

    const timedOut = !dry_run && imported < recordsToProcess.length && isTimeUp();
    const finalStatus = dry_run ? 'completed' : timedOut ? 'paused' : chunkErrors > 0 && imported === 0 ? 'failed' : 'completed';
    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      status: finalStatus, imported_rows: imported, skipped_rows: chunkErrors * CHUNK, completed_at: new Date().toISOString(),
      error_samples: errorSamples.length > 0 ? errorSamples : undefined,
      ...(timedOut ? { paused_at: new Date().toISOString(), cancel_reason: `Time limit. Resume offset=${effectiveOffset + imported}`, retry_params: { row_offset: effectiveOffset + imported } } : {}),
    });

    try { const configs = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ import_type: 'medicare_part_d_stats' }); if (configs.length > 0) await base44.asServiceRole.entities.ImportScheduleConfig.update(configs[0].id, { last_run_at: new Date().toISOString(), last_run_status: finalStatus === 'failed' ? 'failed' : finalStatus === 'paused' ? 'partial' : 'success', last_run_summary: `${imported} records, ${sheetSummaries.length} sheets, year ${year}` }); } catch (_) {}
    await base44.asServiceRole.entities.AuditEvent.create({ event_type: 'import', user_email: user?.email || 'system', details: { action: 'Medicare Part D Import', entity: 'MedicarePartDStats', year, imported_count: imported, status: finalStatus }, timestamp: new Date().toISOString() });

    return Response.json({
      success: true, batch_id: batch.id, year, dry_run, status: finalStatus, sheets_parsed: sheetSummaries,
      total_records: allRecords.length + totalInvalid, records_validated: allRecords.length, records_rejected: totalInvalid,
      records_in_range: recordsToProcess.length, imported, chunk_errors: chunkErrors, validation_warnings: totalWarnings,
      validation_rule_summary: ruleSummary, elapsed_ms: elapsed(),
      ...(timedOut ? { timed_out: true, resume_offset: effectiveOffset + imported, remaining: recordsToProcess.length - imported } : {}),
      ...(errorSamples.length > 0 ? { error_samples: errorSamples.slice(0, 10) } : {}),
    });
  } catch (error) {
    const isRetryable = error.message?.includes('download') || error.message?.includes('timeout');
    await base44.asServiceRole.entities.ImportBatch.update(batch.id, { status: isRetryable ? 'paused' : 'failed', error_samples: [...errorSamples, { phase: 'fatal', detail: error.message }] });
    return Response.json({ error: error.message, retryable: isRetryable, batch_id: batch.id }, { status: 500 });
  }
});