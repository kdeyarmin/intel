import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';
import JSZip from 'npm:jszip@3.10.1';

const MAX_EXEC_MS = 50000;
let execStart = Date.now();
function isTimeUp() { return (Date.now() - execStart) < 5000 ? false : (Date.now() - execStart) > MAX_EXEC_MS; }

const CMS_MA_INPT_URLS = {
  2021: 'https://data.cms.gov/sites/default/files/2024-05/CPS%20MDCR%20INPT%20MA%202021%20FINAL_0.zip',
  2020: 'https://data.cms.gov/sites/default/files/2024-05/CPS%20MDCR%20INPT%20MA%202020%20FINAL_0.zip',
  2019: 'https://data.cms.gov/sites/default/files/2023-06/CPS%20MDCR%20INPT%20MA%202019.zip',
  2018: 'https://data.cms.gov/sites/default/files/2023-06/CPS%20MDCR%20INPT%20MA%202018.zip',
  2017: 'https://data.cms.gov/sites/default/files/2023-06/CPS%20MDCR%20INPT%20MA%202017.zip',
  2016: 'https://data.cms.gov/sites/default/files/2023-06/CPS%20MDCR%20INPT%20MA%202016.zip',
};

async function downloadAndParseZip(url) {
  console.log(`Downloading ZIP from: ${url}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  const resp = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  if (!resp.ok) throw new Error(`Failed to download: ${resp.status} ${resp.statusText}`);
  const arrayBuffer = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const fileNames = Object.keys(zip.files);
  const xlsxFileName = fileNames.find(f => f.toLowerCase().endsWith('.xlsx') || f.toLowerCase().endsWith('.xls'));
  if (!xlsxFileName) throw new Error(`No XLSX file in ZIP. Files: ${fileNames.join(', ')}`);
  console.log(`Extracting: ${xlsxFileName}`);
  const xlsxData = await zip.files[xlsxFileName].async('uint8array');
  return XLSX.read(xlsxData, { type: 'array' });
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
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = row[idx] !== undefined ? row[idx] : ''; });
    rows.push(obj);
  }
  return rows;
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

function mapRowToRecord(row, tableName, dataYear) {
  const headers = Object.keys(row);
  const record = { table_name: tableName, data_year: dataYear, raw_data: row };
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
  return record;
}

Deno.serve(async (req) => {
  execStart = Date.now();
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

  const payload = await req.json().catch(() => ({}));
  const { action = 'import', year = 2021, dry_run = false, custom_url } = payload;

  if (action === 'list_years') {
    return Response.json({
      available_years: Object.keys(CMS_MA_INPT_URLS).map(Number).sort((a, b) => b - a),
      source: 'CMS Program Statistics - Medicare Advantage Inpatient Hospital',
    });
  }

  const downloadUrl = custom_url || CMS_MA_INPT_URLS[year];
  if (!downloadUrl) return Response.json({ error: `No URL for year ${year}` }, { status: 400 });

  const batch = await base44.asServiceRole.entities.ImportBatch.create({
    import_type: 'medicare_ma_inpatient',
    file_name: `medicare_ma_inpatient_${year}`,
    file_url: downloadUrl,
    status: 'validating',
    dry_run,
  });

  try {
    const workbook = await downloadAndParseZip(downloadUrl);
    const allRecords = [];
    const sheetSummaries = [];

    for (const sheetName of workbook.SheetNames) {
      const tableName = classifyTable(sheetName);
      if (!tableName) continue;
      const rows = parseSheet(workbook, sheetName);
      console.log(`Sheet "${sheetName}" -> ${tableName}: ${rows.length} rows`);
      for (const row of rows) {
        const record = mapRowToRecord(row, tableName, year);
        if (record.category) allRecords.push(record);
      }
      sheetSummaries.push({ sheet: sheetName, table: tableName, rows: rows.length });
    }

    console.log(`Total records: ${allRecords.length}`);

    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      total_rows: allRecords.length, valid_rows: allRecords.length, invalid_rows: 0,
      status: dry_run ? 'completed' : 'processing',
      column_mapping: { sheets: sheetSummaries },
    });

    let imported = 0;
    if (!dry_run && allRecords.length > 0) {
      // Bulk create in chunks — skip slow delete-all, just add (dedup by table_name+year+category if needed later)
      const CHUNK = 50;
      for (let i = 0; i < allRecords.length; i += CHUNK) {
        if (isTimeUp()) {
          console.warn(`Time limit approaching at ${imported}/${allRecords.length}, saving progress`);
          break;
        }
        const chunk = allRecords.slice(i, i + CHUNK);
        await base44.asServiceRole.entities.MedicareMAInpatient.bulkCreate(chunk);
        imported += chunk.length;
      }
    }

    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      status: 'completed', imported_rows: imported, completed_at: new Date().toISOString(),
    });

    try {
      const configs = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ import_type: 'medicare_ma_inpatient' });
      if (configs.length > 0) {
        await base44.asServiceRole.entities.ImportScheduleConfig.update(configs[0].id, {
          last_run_at: new Date().toISOString(), last_run_status: 'success',
          last_run_summary: `Imported ${imported} records from ${sheetSummaries.length} sheets for year ${year}`,
        });
      }
    } catch (e) {}

    await base44.asServiceRole.entities.AuditEvent.create({
      event_type: 'import', user_email: user.email,
      details: { action: 'Medicare MA Inpatient Import', entity: 'MedicareMAInpatient', year, sheets: sheetSummaries, row_count: allRecords.length, imported_count: imported, message: dry_run ? 'Dry run' : 'Import completed' },
      timestamp: new Date().toISOString(),
    });

    return Response.json({
      success: true, batch_id: batch.id, year, dry_run, sheets_parsed: sheetSummaries,
      total_records: allRecords.length, imported, elapsed_ms: Date.now() - execStart,
    });

  } catch (error) {
    console.error('Import error:', error.message);
    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      status: 'failed', error_samples: [{ message: error.message }],
    });

    // Update schedule config with failure
    try {
      const configs = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ import_type: 'medicare_ma_inpatient' });
      if (configs.length > 0) {
        await base44.asServiceRole.entities.ImportScheduleConfig.update(configs[0].id, {
          last_run_at: new Date().toISOString(), last_run_status: 'failed',
          last_run_summary: `Failed: ${error.message}`,
        });
      }
    } catch (e) {}

    return Response.json({ error: error.message, batch_id: batch.id }, { status: 500 });
  }
});