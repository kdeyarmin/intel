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

const CMS_SNF_URLS = {
  // URLs are frequently unstable. Users should provide custom_url from data.cms.gov when default URLs fail.
  // Default URLs may return HTML error pages instead of data files.
  2023: 'https://data.cms.gov/sites/default/files/2026-01/CPS%20MDCR%20SNF%202023.zip',
  2022: 'https://data.cms.gov/sites/default/files/2024-10/CPS%20MDCR%20SNF%202022.zip',
  2021: 'https://data.cms.gov/sites/default/files/2023-02/CPS%20MDCR%20SNF%202021.zip',
  2020: 'https://data.cms.gov/sites/default/files/2023-02/CPS%20MDCR%20SNF%202020.zip',
  2019: 'https://data.cms.gov/sites/default/files/2023-02/CPS%20MDCR%20SNF%202019.zip',
  2018: 'https://data.cms.gov/sites/default/files/2023-02/CPS%20MDCR%20SNF%202018.zip',
};
const NUMERIC_FIELDS = ['persons_served','total_stays','total_covered_days','program_payments','beneficiary_payments','payment_per_stay','avg_length_of_stay','covered_days_per_1000','stays_per_1000'];

async function downloadAndParseZip(url) {
  console.log(`Downloading from: ${url}`);
  const resp = await fetch(url);
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

function classifySNFTable(sheetName) {
  const name = sheetName.toUpperCase().replace(/\s+/g, ' ');
  for (let i = 6; i >= 1; i--) {
    if (name.includes(`SNF ${i}`) || name.includes(`SNF${i}`) || name.includes(`TABLE ${i}`)) return `SNF${i}`;
  }
  return null;
}

function safeNum(val) {
  if (val === '' || val === null || val === undefined || val === '*' || val === '—' || val === '-' || val === 'N/A') return null;
  const num = parseFloat(String(val).replace(/[,$%\s]/g, ''));
  return isNaN(num) ? null : num;
}

function mapSNFRow(row, tableName, dataYear) {
  const headers = Object.keys(row).filter(h => h !== '_rowIndex');
  const record = { table_name: tableName, data_year: dataYear, raw_data: {} };
  headers.forEach(h => { record.raw_data[h] = row[h]; });
  for (const h of headers) {
    const hl = h.toLowerCase();
    if (!record.category && (hl.includes('entitlement') || hl.includes('demographic') || hl.includes('state') || hl.includes('area') || hl.includes('facility') || hl.includes('bedsize') || hl.includes('bed size') || hl.includes('sex') || hl.includes('race') || hl.includes('age') || hl === headers[0].toLowerCase())) record.category = String(row[h] || '').trim();
    if (hl.includes('person') && (hl.includes('served') || hl.includes('use') || hl.includes('utilization'))) record.persons_served = safeNum(row[h]);
    if ((hl.includes('stay') || hl.includes('admission')) && !hl.includes('length') && !hl.includes('per') && !hl.includes('average')) record.total_stays = safeNum(row[h]);
    if (hl.includes('covered day') && !hl.includes('per')) record.total_covered_days = safeNum(row[h]);
    if (hl.includes('program') && hl.includes('payment') && !hl.includes('per')) record.program_payments = safeNum(row[h]);
    if ((hl.includes('beneficiary') || hl.includes('cost sharing') || hl.includes('coinsurance')) && hl.includes('payment')) record.beneficiary_payments = safeNum(row[h]);
    if (hl.includes('payment') && hl.includes('per') && hl.includes('stay')) record.payment_per_stay = safeNum(row[h]);
    if (hl.includes('average length') || (hl.includes('avg') && hl.includes('stay') && hl.includes('length'))) record.avg_length_of_stay = safeNum(row[h]);
    if (hl.includes('covered day') && hl.includes('per') && hl.includes('1,000')) record.covered_days_per_1000 = safeNum(row[h]);
    if (hl.includes('stay') && hl.includes('per') && hl.includes('1,000')) record.stays_per_1000 = safeNum(row[h]);
  }
  if (!record.category && headers.length > 0) record.category = String(row[headers[0]] || '').trim();
  if (tableName === 'SNF1') record.entitlement_type = record.category;
  if (tableName === 'SNF2') record.demographic_group = record.category;
  if (tableName === 'SNF3') { const cat = record.category || ''; if (cat.length === 2 && cat === cat.toUpperCase()) record.state = cat; }
  if (tableName === 'SNF4') record.service_level = record.category;
  if (tableName === 'SNF5') { record.facility_type = record.category; const cat = record.category || ''; if (/\d/.test(cat) && (cat.toLowerCase().includes('bed') || cat.includes('-'))) record.bedsize_category = cat; }
  return record;
}

function validateRecord(record, rowIndex, sheetName) {
  const errors = [], warnings = [];
  if (!record.category || record.category.trim() === '') errors.push({ rule: 'missing_category', field: 'category', message: 'Missing category/row label', row: rowIndex, sheet: sheetName });
  if (record.data_year < 2000 || record.data_year > 2030) errors.push({ rule: 'data_year_range', field: 'data_year', message: `data_year ${record.data_year} outside 2000-2030`, row: rowIndex, sheet: sheetName });
  if (!NUMERIC_FIELDS.some(f => record[f] != null)) warnings.push({ rule: 'no_metrics', message: 'No numeric values', row: rowIndex, sheet: sheetName });
  for (const f of NUMERIC_FIELDS) { if (record[f] != null && record[f] < 0) errors.push({ rule: 'negative_value', field: f, message: `${f} is negative`, row: rowIndex, sheet: sheetName }); }
  if (record.avg_length_of_stay != null && (record.avg_length_of_stay <= 0 || record.avg_length_of_stay > 365)) errors.push({ rule: 'avg_los_range', field: 'avg_length_of_stay', message: 'ALOS outside 0-365', row: rowIndex, sheet: sheetName });
  return { valid: errors.length === 0, errors, warnings };
}

async function bulkCreateWithRetry(entity, chunk, label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await entity.bulkCreate(chunk); return { ok: true }; } catch (e) {
      const isRetryable = e.message?.includes('Rate limit') || e.message?.includes('timeout');
      if (isRetryable && attempt < 2) { await delay(jitteredBackoff(attempt)); } else { return { ok: false, error: e.message }; }
    }
  }
  return { ok: false, error: 'Max retries exceeded' };
}

Deno.serve(async (req) => {
  execStart = Date.now();
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

  const payload = await req.json().catch(() => ({}));
  const { action = 'import', dry_run = false, custom_url, sheet_filter, row_offset = 0, row_limit } = payload;
  
  const LATEST_YEAR = Math.max(...Object.keys(CMS_SNF_URLS).map(Number));
  const requestedYear = parseInt(payload.year || LATEST_YEAR);
  // Fallback to latest if requested year not found
  const year = CMS_SNF_URLS[requestedYear] ? requestedYear : LATEST_YEAR;
  if (requestedYear !== year) console.log(`Year ${requestedYear} unavailable for SNF, falling back to ${year}`);

  if (action === 'list_years') return Response.json({ available_years: Object.keys(CMS_SNF_URLS).map(Number).sort((a, b) => b - a) });

  const downloadUrl = custom_url || CMS_SNF_URLS[year];
  if (!downloadUrl) return Response.json({ error: `No URL for year ${year}. Available: ${Object.keys(CMS_SNF_URLS).join(', ')}` }, { status: 400 });

  const batch = await base44.asServiceRole.entities.ImportBatch.create({
    import_type: 'medicare_snf_stats', file_name: `medicare_snf_${year}`, file_url: downloadUrl,
    status: 'validating', dry_run, data_year: year,
    retry_params: (sheet_filter || row_offset || row_limit) ? { sheet_filter, row_offset, row_limit } : undefined,
  });
  const errorSamples = [];
  const addError = (phase, detail, ctx) => { if (errorSamples.length < 50) errorSamples.push({ phase, detail: String(detail).substring(0, 500), timestamp: new Date().toISOString(), ...ctx }); };

  try {
    const workbook = await downloadAndParseZip(downloadUrl);
    const targetSheets = sheet_filter ? workbook.SheetNames.filter(s => { const t = classifySNFTable(s); return t && sheet_filter.includes(t); }) : workbook.SheetNames;
    const allRecords = [], sheetSummaries = [];
    let totalInvalid = 0, totalWarnings = 0;
    const ruleSummary = {};

    for (const sheetName of targetSheets) {
      const tableName = classifySNFTable(sheetName);
      if (!tableName) continue;
      let rows;
      try { rows = parseSheet(workbook, sheetName); } catch (e) { addError('parse', `Sheet "${sheetName}": ${e.message}`, { sheet: sheetName }); continue; }
      let sv = 0, si = 0;
      for (const row of rows) {
        const record = mapSNFRow(row, tableName, year);
        const v = validateRecord(record, row._rowIndex, sheetName);
        for (const e of v.errors) { ruleSummary[e.rule] = (ruleSummary[e.rule] || 0) + 1; addError('validation', `[${e.rule}] ${e.message}`, { sheet: sheetName, row: e.row, field: e.field }); }
        for (const w of v.warnings) { ruleSummary[w.rule] = (ruleSummary[w.rule] || 0) + 1; totalWarnings++; }
        if (v.valid) { allRecords.push(record); sv++; } else { totalInvalid++; si++; }
      }
      sheetSummaries.push({ sheet: sheetName, table: tableName, rows: rows.length, valid: sv, invalid: si });
    }

    let recordsToProcess = allRecords;
    const effectiveOffset = row_offset || 0;
    if (effectiveOffset > 0 || row_limit) {
      const end = row_limit ? effectiveOffset + row_limit : allRecords.length;
      recordsToProcess = allRecords.slice(effectiveOffset, end);
    }

    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      total_rows: allRecords.length + totalInvalid, valid_rows: allRecords.length, invalid_rows: totalInvalid,
      status: dry_run ? 'completed' : 'processing', column_mapping: { sheets: sheetSummaries },
      error_samples: errorSamples.length > 0 ? errorSamples : undefined,
      dedup_summary: { validation_rule_summary: ruleSummary, validation_warnings: totalWarnings },
    });

    let imported = 0, chunkErrors = 0;
    if (!dry_run && recordsToProcess.length > 0) {
      if (effectiveOffset === 0) {
        const existing = await base44.asServiceRole.entities.MedicareSNFStats.filter({ data_year: year }, '-created_date', 1);
        if (existing.length > 0) { const all = await base44.asServiceRole.entities.MedicareSNFStats.filter({ data_year: year }, '-created_date', 500); for (const r of all) await base44.asServiceRole.entities.MedicareSNFStats.delete(r.id); }
      }
      for (let i = 0; i < recordsToProcess.length; i += CHUNK) {
        if (isTimeUp()) break;
        const chunk = recordsToProcess.slice(i, i + CHUNK);
        const result = await bulkCreateWithRetry(base44.asServiceRole.entities.MedicareSNFStats, chunk, `chunk-${i}`);
        if (result.ok) imported += chunk.length; else { chunkErrors++; addError('import', `Chunk ${i} failed: ${result.error}`, { chunk_start: i + effectiveOffset }); }
        if (i + CHUNK < recordsToProcess.length) await delay(150);
      }
    }

    const timedOut = !dry_run && imported < recordsToProcess.length && isTimeUp();
    const finalStatus = dry_run ? 'completed' : timedOut ? 'paused' : chunkErrors > 0 && imported === 0 ? 'failed' : 'completed';
    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      status: finalStatus, imported_rows: imported, skipped_rows: chunkErrors * CHUNK, completed_at: new Date().toISOString(),
      error_samples: errorSamples.length > 0 ? errorSamples : undefined,
      ...(timedOut ? { paused_at: new Date().toISOString(), cancel_reason: `Time limit. Resume offset=${effectiveOffset + imported}`, retry_params: { row_offset: effectiveOffset + imported } } : {}),
    });

    try { const configs = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ import_type: 'medicare_snf_stats' }); if (configs.length > 0) await base44.asServiceRole.entities.ImportScheduleConfig.update(configs[0].id, { last_run_at: new Date().toISOString(), last_run_status: finalStatus === 'failed' ? 'failed' : finalStatus === 'paused' ? 'partial' : 'success', last_run_summary: `${imported} records, ${sheetSummaries.length} sheets, year ${year}` }); } catch (_) {}
    await base44.asServiceRole.entities.AuditEvent.create({ event_type: 'import', user_email: user.email, details: { action: 'Medicare SNF Import', entity: 'MedicareSNFStats', year, imported_count: imported, status: finalStatus }, timestamp: new Date().toISOString() });

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
    const isRetryable = errorMsg.includes('download') || 
                        errorMsg.includes('timeout') || 
                        errorMsg.includes('too small') || 
                        errorMsg.includes('not a valid ZIP') ||
                        errorMsg.includes('Failed to download');
    
    const errorCategory = errorMsg.includes('too small') || errorMsg.includes('not a valid ZIP') ? 'api_downtime' : 
                          errorMsg.includes('timeout') ? 'network_error' : 'unknown';

    await base44.asServiceRole.entities.ImportBatch.update(batch.id, { 
      status: isRetryable ? 'paused' : 'failed', 
      error_samples: [...errorSamples, { phase: 'fatal', detail: errorMsg }], 
      ...(isRetryable ? { paused_at: new Date().toISOString() } : {}) 
    });

    // Create Error Report for tracking and retry logic
    await base44.asServiceRole.entities.ErrorReport.create({
      error_type: 'import_failure',
      error_category: errorCategory,
      severity: isRetryable ? 'medium' : 'high',
      source: batch.id,
      title: `Medicare SNF Import Failed: ${year}`,
      description: errorMsg,
      status: 'new',
      context: { import_type: 'medicare_snf_stats', year, url: downloadUrl }
    });

    return Response.json({ error: errorMsg, retryable: isRetryable, batch_id: batch.id }, { status: 500 });
  }
});