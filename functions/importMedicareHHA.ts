import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';
import JSZip from 'npm:jszip@3.10.1';

const MAX_EXEC_MS = 50_000;
const CHUNK = 50;
let execStart = Date.now();
function isTimeUp() { return (Date.now() - execStart) > MAX_EXEC_MS; }
function elapsed() { return Date.now() - execStart; }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitteredBackoff(attempt) { return Math.min(1000 * Math.pow(2, attempt) + Math.random() * 500, 10000); }

const CMS_HHA_URLS = {
  2023: 'https://data.cms.gov/sites/default/files/2026-01/MDCR%20HHA_CPS_07UHH_2023.zip',
  2022: 'https://data.cms.gov/sites/default/files/2026-01/MDCR%20HHA_CPS_07UHH_2022.zip',
  2021: 'https://data.cms.gov/sites/default/files/2023-02/CPS%20MDCR%20HHA%202021.zip',
  2020: 'https://data.cms.gov/sites/default/files/2022-02/CPS%20MDCR%20HHA%202020.zip',
};
const LATEST_AVAILABLE_YEAR = Math.max(...Object.keys(CMS_HHA_URLS).map(Number));
const NUMERIC_FIELDS = ['persons_served','total_visits','total_episodes','total_charges','program_payments','payment_per_person','visits_per_person','skilled_nursing_visits','pt_visits','ot_visits','speech_therapy_visits','home_health_aide_visits','medical_social_service_visits'];

async function downloadAndParseZip(url) {
  console.log(`Downloading ZIP from: ${url}`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to download: ${resp.status} ${resp.statusText}`);
  const contentType = resp.headers.get('content-type') || '';
  const arrayBuffer = await resp.arrayBuffer();
  const header = new Uint8Array(arrayBuffer.slice(0, 4));
  const isZip = header[0] === 0x50 && header[1] === 0x4B;
  if (!isZip) {
    try {
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
      if (workbook.SheetNames.length > 0) return workbook;
    } catch (_) {}
    throw new Error(`Downloaded file is not a valid ZIP/XLSX archive (content-type: ${contentType}).`);
  }
  const zip = await JSZip.loadAsync(arrayBuffer);
  const fileNames = Object.keys(zip.files);
  const xlsxFileName = fileNames.find(f => /\.(xlsx|xls|csv)$/i.test(f));
  if (!xlsxFileName) throw new Error(`No XLSX/XLS file found in ZIP. Files: ${fileNames.join(', ')}`);
  const xlsxData = await zip.files[xlsxFileName].async('uint8array');
  if (/\.csv$/i.test(xlsxFileName)) return XLSX.read(new TextDecoder().decode(xlsxData), { type: 'string' });
  return XLSX.read(xlsxData, { type: 'array' });
}

function parseSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rawData.length < 2) return [];
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rawData.length, 10); i++) {
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

function classifyTable(sheetName) {
  const name = sheetName.toUpperCase();
  for (let i = 6; i >= 1; i--) {
    if (name.includes(`HHA${i}`) || name.includes(`HHA ${i}`) || name.includes(`TABLE ${i}`)) return `HHA${i}`;
  }
  return null;
}

function safeNum(val) {
  if (val === '' || val === null || val === undefined || val === '*' || val === '—' || val === '-' || val === 'N/A') return null;
  const cleaned = String(val).replace(/[,$%\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function mapRowToRecord(row, tableName, dataYear) {
  const headers = Object.keys(row).filter(h => h !== '_rowIndex');
  const record = { table_name: tableName, data_year: dataYear, raw_data: {} };
  headers.forEach(h => { record.raw_data[h] = row[h]; });

  for (const h of headers) {
    const hl = h.toLowerCase();
    if (!record.category && (hl.includes('type of entitlement') || hl.includes('category') || hl.includes('demographic') || hl.includes('state') || hl.includes('area') || hl.includes('type of agency') || hl.includes('type of control') || hl.includes('number of') || hl === headers[0].toLowerCase())) {
      record.category = String(row[h] || '').trim();
    }
    if (hl.includes('persons') && (hl.includes('served') || hl.includes('use'))) record.persons_served = safeNum(row[h]);
    if (hl.includes('total') && hl.includes('visit')) record.total_visits = safeNum(row[h]);
    if (hl.includes('episode')) record.total_episodes = safeNum(row[h]);
    if (hl.includes('charge')) record.total_charges = safeNum(row[h]);
    if (hl.includes('program payment') || (hl.includes('payment') && !hl.includes('per'))) record.program_payments = safeNum(row[h]);
    if (hl.includes('payment') && hl.includes('per')) record.payment_per_person = safeNum(row[h]);
    if (hl.includes('visit') && hl.includes('per')) record.visits_per_person = safeNum(row[h]);
    if (hl.includes('skilled nursing')) record.skilled_nursing_visits = safeNum(row[h]);
    if (hl.includes('physical therapy') || (hl.includes('pt') && hl.includes('visit'))) record.pt_visits = safeNum(row[h]);
    if (hl.includes('occupational therapy') || (hl.includes('ot') && hl.includes('visit'))) record.ot_visits = safeNum(row[h]);
    if (hl.includes('speech')) record.speech_therapy_visits = safeNum(row[h]);
    if (hl.includes('home health aide')) record.home_health_aide_visits = safeNum(row[h]);
    if (hl.includes('medical social')) record.medical_social_service_visits = safeNum(row[h]);
  }
  if (!record.category && headers.length > 0) record.category = String(row[headers[0]] || '').trim();
  if (tableName === 'HHA3') { const cat = record.category || ''; if (cat.length === 2 && cat === cat.toUpperCase()) record.state = cat; }
  if (tableName === 'HHA4') record.agency_type = record.category;
  if (tableName === 'HHA5') record.control_type = record.category;
  return record;
}

function validateRecord(record, rowIndex, sheetName) {
  const errors = [];
  const warnings = [];
  if (!record.category || record.category.trim() === '') {
    errors.push({ rule: 'missing_category', field: 'category', message: 'Missing category/row label', row: rowIndex, sheet: sheetName });
  }
  if (record.data_year < 2000 || record.data_year > 2030) {
    errors.push({ rule: 'data_year_range', field: 'data_year', message: `data_year ${record.data_year} outside 2000-2030`, row: rowIndex, sheet: sheetName });
  }
  const hasMetric = NUMERIC_FIELDS.some(f => record[f] != null);
  if (!hasMetric) {
    warnings.push({ rule: 'no_metrics', message: 'Row has no numeric values — may be header/footer', row: rowIndex, sheet: sheetName });
  }
  for (const f of NUMERIC_FIELDS) {
    if (record[f] != null && record[f] < 0) {
      errors.push({ rule: 'negative_value', field: f, message: `${f} is negative (${record[f]})`, row: rowIndex, sheet: sheetName });
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

async function bulkCreateWithRetry(entity, chunk, label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await entity.bulkCreate(chunk);
      return { ok: true };
    } catch (e) {
      const isRetryable = e.message?.includes('Rate limit') || e.message?.includes('timeout') || e.message?.includes('network');
      if (isRetryable && attempt < 2) {
        const wait = jitteredBackoff(attempt);
        console.warn(`[${label}] Retry ${attempt + 1}/3 after ${Math.round(wait)}ms: ${e.message}`);
        await delay(wait);
      } else {
        return { ok: false, error: e.message };
      }
    }
  }
  return { ok: false, error: 'Max retries exceeded' };
}

Deno.serve(async (req) => {
  execStart = Date.now();
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

  const payload = await req.json().catch(() => ({}));
  const { action = 'import', dry_run = false, custom_url, sheet_filter, row_offset = 0, row_limit } = payload;
  const requestedYear = parseInt(payload.year || LATEST_AVAILABLE_YEAR);
  const year = CMS_HHA_URLS[requestedYear] ? requestedYear : LATEST_AVAILABLE_YEAR;
  if (requestedYear !== year) console.log(`Year ${requestedYear} unavailable, using ${year}`);

  if (action === 'list_years') {
    return Response.json({ available_years: Object.keys(CMS_HHA_URLS).map(Number).sort((a, b) => b - a), source: 'CMS Program Statistics - Medicare HHA' });
  }

  const downloadUrl = custom_url || CMS_HHA_URLS[year];
  if (!downloadUrl) return Response.json({ error: `No URL for year ${year}`, hint: `Latest available: ${LATEST_AVAILABLE_YEAR}` }, { status: 400 });

  const batch = await base44.asServiceRole.entities.ImportBatch.create({
    import_type: 'medicare_hha_stats', file_name: `medicare_hha_stats_${year}`, file_url: downloadUrl,
    status: 'validating', dry_run,
    retry_params: (sheet_filter || row_offset || row_limit) ? { sheet_filter, row_offset, row_limit } : undefined,
  });

  const errorSamples = [];
  const addError = (phase, detail, ctx) => {
    const entry = { phase, detail: String(detail).substring(0, 500), timestamp: new Date().toISOString(), ...ctx };
    if (errorSamples.length < 50) errorSamples.push(entry);
  };

  try {
    const workbook = await downloadAndParseZip(downloadUrl);
    const targetSheets = sheet_filter
      ? workbook.SheetNames.filter(s => { const t = classifyTable(s); return t && sheet_filter.includes(t); })
      : workbook.SheetNames;

    const allRecords = [];
    const sheetSummaries = [];
    let totalInvalid = 0;
    let totalWarnings = 0;
    const ruleSummary = {};

    for (const sheetName of targetSheets) {
      const tableName = classifyTable(sheetName);
      if (!tableName) continue;
      let rows;
      try { rows = parseSheet(workbook, sheetName); } catch (e) {
        addError('parse', `Sheet "${sheetName}": ${e.message}`, { sheet: sheetName, table: tableName });
        continue;
      }
      let sheetValid = 0, sheetInvalid = 0;
      for (const row of rows) {
        const record = mapRowToRecord(row, tableName, year);
        const v = validateRecord(record, row._rowIndex, sheetName);
        for (const e of v.errors) { ruleSummary[e.rule] = (ruleSummary[e.rule] || 0) + 1; addError('validation', `[${e.rule}] ${e.message}`, { sheet: sheetName, row: e.row, field: e.field }); }
        for (const w of v.warnings) { ruleSummary[w.rule] = (ruleSummary[w.rule] || 0) + 1; totalWarnings++; }
        if (v.valid) { allRecords.push(record); sheetValid++; } else { totalInvalid++; sheetInvalid++; }
      }
      sheetSummaries.push({ sheet: sheetName, table: tableName, rows: rows.length, valid: sheetValid, invalid: sheetInvalid });
    }

    // Apply offset/limit for resume
    let recordsToProcess = allRecords;
    const effectiveOffset = row_offset || 0;
    if (effectiveOffset > 0 || row_limit) {
      const end = row_limit ? effectiveOffset + row_limit : allRecords.length;
      recordsToProcess = allRecords.slice(effectiveOffset, end);
      console.log(`[range] Processing rows ${effectiveOffset}-${Math.min(end, allRecords.length)} of ${allRecords.length}`);
    }

    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      total_rows: allRecords.length + totalInvalid, valid_rows: allRecords.length, invalid_rows: totalInvalid,
      status: dry_run ? 'completed' : 'processing',
      column_mapping: { sheets: sheetSummaries },
      error_samples: errorSamples.length > 0 ? errorSamples : undefined,
      dedup_summary: { validation_rule_summary: ruleSummary, validation_warnings: totalWarnings },
    });

    let imported = 0, chunkErrors = 0;
    if (!dry_run && recordsToProcess.length > 0) {
      // Only clear existing on fresh import (no offset)
      if (effectiveOffset === 0) {
        const existing = await base44.asServiceRole.entities.MedicareHHAStats.filter({ data_year: year }, '-created_date', 1);
        if (existing.length > 0) {
          console.log(`Clearing existing ${year} records...`);
          const all = await base44.asServiceRole.entities.MedicareHHAStats.filter({ data_year: year }, '-created_date', 500);
          for (const rec of all) await base44.asServiceRole.entities.MedicareHHAStats.delete(rec.id);
        }
      }

      for (let i = 0; i < recordsToProcess.length; i += CHUNK) {
        if (isTimeUp()) { console.warn(`Time limit at ${imported}/${recordsToProcess.length}`); break; }
        const chunk = recordsToProcess.slice(i, i + CHUNK);
        const result = await bulkCreateWithRetry(base44.asServiceRole.entities.MedicareHHAStats, chunk, `chunk-${i}`);
        if (result.ok) { imported += chunk.length; }
        else { chunkErrors++; addError('import', `Chunk ${i}-${i + chunk.length} failed: ${result.error}`, { chunk_start: i + effectiveOffset, chunk_size: chunk.length }); }
        if (i + CHUNK < recordsToProcess.length) await delay(150);
      }
    }

    const timedOut = !dry_run && imported < recordsToProcess.length && isTimeUp();
    const finalStatus = dry_run ? 'completed' : timedOut ? 'paused' : chunkErrors > 0 && imported === 0 ? 'failed' : 'completed';

    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      status: finalStatus, imported_rows: imported, skipped_rows: chunkErrors * CHUNK,
      completed_at: new Date().toISOString(),
      error_samples: errorSamples.length > 0 ? errorSamples : undefined,
      ...(timedOut ? { paused_at: new Date().toISOString(), cancel_reason: `Time limit. Imported ${imported}/${recordsToProcess.length}. Resume offset=${effectiveOffset + imported}`, retry_params: { row_offset: effectiveOffset + imported } } : {}),
    });

    try {
      const configs = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ import_type: 'medicare_hha_stats' });
      if (configs.length > 0) await base44.asServiceRole.entities.ImportScheduleConfig.update(configs[0].id, {
        last_run_at: new Date().toISOString(), last_run_status: finalStatus === 'failed' ? 'failed' : finalStatus === 'paused' ? 'partial' : 'success',
        last_run_summary: `${dry_run ? 'Validated' : 'Imported'} ${dry_run ? recordsToProcess.length : imported} records from ${sheetSummaries.length} sheets for year ${year}`,
      });
    } catch (e) { console.warn('Schedule config update failed:', e.message); }

    await base44.asServiceRole.entities.AuditEvent.create({
      event_type: 'import', user_email: user.email,
      details: { action: 'Medicare HHA Stats Import', entity: 'MedicareHHAStats', year, imported_count: imported, errors: errorSamples.length, status: finalStatus },
      timestamp: new Date().toISOString(),
    });

    return Response.json({
      success: true, batch_id: batch.id, year, dry_run, status: finalStatus,
      sheets_parsed: sheetSummaries, total_records: allRecords.length + totalInvalid,
      records_validated: allRecords.length, records_rejected: totalInvalid, records_in_range: recordsToProcess.length,
      imported, chunk_errors: chunkErrors, validation_warnings: totalWarnings, validation_rule_summary: ruleSummary,
      elapsed_ms: elapsed(),
      ...(timedOut ? { timed_out: true, resume_offset: effectiveOffset + imported, remaining: recordsToProcess.length - imported, hint: `Re-run with row_offset=${effectiveOffset + imported}` } : {}),
      ...(errorSamples.length > 0 ? { error_samples: errorSamples.slice(0, 10) } : {}),
    });

  } catch (error) {
    const errorPhase = error.message?.includes('download') ? 'download' : error.message?.includes('ZIP') ? 'extraction' : error.message?.includes('XLSX') ? 'parsing' : 'unknown';
    const isRetryable = errorPhase === 'download' || error.message?.includes('timeout');
    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      status: isRetryable ? 'paused' : 'failed',
      error_samples: [...errorSamples, { phase: errorPhase, detail: error.message, timestamp: new Date().toISOString(), retryable: isRetryable }],
      ...(isRetryable ? { paused_at: new Date().toISOString(), cancel_reason: `${errorPhase} error: ${error.message}` } : {}),
    });
    return Response.json({ error: error.message, error_phase: errorPhase, retryable: isRetryable, batch_id: batch.id, error_samples: errorSamples.slice(0, 5) }, { status: 500 });
  }
});