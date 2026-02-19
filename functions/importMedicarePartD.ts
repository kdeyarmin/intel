import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';
import JSZip from 'npm:jszip@3.10.1';

const CMS_PART_D_URLS = {
  2023: 'https://data.cms.gov/sites/default/files/2025-09/CPS%20MDCR%20UTLZN%20D%202023.zip',
  2022: 'https://data.cms.gov/sites/default/files/2024-10/CPS%20MDCR%20UTLZN%20D%202022.zip',
  2021: 'https://data.cms.gov/sites/default/files/2023-02/CPS%20MDCR%20UTLZN%20D%202021.zip',
  2020: 'https://data.cms.gov/sites/default/files/2023-02/CPS%20MDCR%20UTLZN%20D%202020.zip',
  2019: 'https://data.cms.gov/sites/default/files/2023-02/CPS%20MDCR%20UTLZN%20D%202019.zip',
  2018: 'https://data.cms.gov/sites/default/files/2023-02/CPS%20MDCR%20UTLZN%20D%202018.zip',
};

async function downloadAndParseZip(url) {
  console.log(`Downloading ZIP from: ${url}`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to download: ${resp.status} ${resp.statusText}`);
  const arrayBuffer = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const fileNames = Object.keys(zip.files);
  console.log(`ZIP contains: ${fileNames.join(', ')}`);
  const xlsxFile = fileNames.find(f => /\.(xlsx|xls|csv)$/i.test(f));
  if (!xlsxFile) throw new Error(`No data file found in ZIP. Files: ${fileNames.join(', ')}`);
  console.log(`Extracting: ${xlsxFile}`);
  const data = await zip.files[xlsxFile].async('uint8array');
  if (/\.csv$/i.test(xlsxFile)) {
    const text = new TextDecoder().decode(data);
    return XLSX.read(text, { type: 'string' });
  }
  return XLSX.read(data, { type: 'array' });
}

function parseSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rawData.length < 2) return [];
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rawData.length, 15); i++) {
    const nonEmpty = rawData[i].filter(c => c !== '' && c !== null && c !== undefined).length;
    if (nonEmpty >= 3) { headerIdx = i; break; }
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

function safeNum(val) {
  if (val === '' || val === null || val === undefined || val === '*' || val === '—' || val === '-' || val === 'N/A') return null;
  const cleaned = String(val).replace(/[,$%\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function classifyPartDTable(sheetName) {
  const name = sheetName.toUpperCase().replace(/\s+/g, ' ');
  for (let i = 11; i >= 1; i--) {
    if (name.includes(`D ${i}`) || name.includes(`D${i}`) || name.includes(`TABLE ${i}`)) return `D${i}`;
  }
  return null;
}

function mapPartDRow(row, tableName, dataYear) {
  const headers = Object.keys(row);
  const record = { table_name: tableName, data_year: dataYear, raw_data: row };

  for (const h of headers) {
    const hl = h.toLowerCase();
    if (!record.category && (hl.includes('plan') || hl.includes('lis') || hl.includes('demographic') ||
        hl.includes('state') || hl.includes('area') || hl.includes('phase') || hl.includes('age') ||
        hl.includes('sex') || hl.includes('race') || hl === headers[0].toLowerCase())) {
      record.category = String(row[h] || '').trim();
    }
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

  // Geographic tables
  if (['D6', 'D7', 'D11'].includes(tableName)) {
    const cat = record.category || '';
    if (cat.length === 2 && cat === cat.toUpperCase()) record.state = cat;
  }
  // Demographic tables
  if (['D4', 'D5', 'D10'].includes(tableName)) {
    record.demographic_group = record.category;
  }

  return record;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

  const payload = await req.json().catch(() => ({}));
  const { action = 'import', year = 2021, dry_run = false, custom_url } = payload;

  if (action === 'list_years') {
    return Response.json({
      available_years: Object.keys(CMS_PART_D_URLS).map(Number).sort((a, b) => b - a),
      source: 'CMS Program Statistics - Medicare Part D',
    });
  }

  const downloadUrl = custom_url || CMS_PART_D_URLS[year];
  if (!downloadUrl) return Response.json({ error: `No URL for year ${year}. Available: ${Object.keys(CMS_PART_D_URLS).join(', ')}` }, { status: 400 });

  const batch = await base44.asServiceRole.entities.ImportBatch.create({
    import_type: 'medicare_part_d_stats',
    file_name: `medicare_part_d_${year}`,
    file_url: downloadUrl,
    status: 'validating',
    dry_run,
  });

  try {
    const workbook = await downloadAndParseZip(downloadUrl);
    const allRecords = [];
    const sheetSummaries = [];

    for (const sheetName of workbook.SheetNames) {
      const tableName = classifyPartDTable(sheetName);
      if (!tableName) { console.log(`Skipping sheet: ${sheetName}`); continue; }
      const rows = parseSheet(workbook, sheetName);
      console.log(`Sheet "${sheetName}" -> ${tableName}: ${rows.length} rows`);
      for (const row of rows) {
        const record = mapPartDRow(row, tableName, year);
        if (!record.category || record.category === '') continue;
        allRecords.push(record);
      }
      sheetSummaries.push({ sheet: sheetName, table: tableName, rows: rows.length });
    }

    console.log(`Total Part D records: ${allRecords.length}`);
    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      total_rows: allRecords.length, valid_rows: allRecords.length, invalid_rows: 0,
      status: dry_run ? 'completed' : 'processing', column_mapping: { sheets: sheetSummaries },
    });

    let imported = 0;
    if (!dry_run && allRecords.length > 0) {
      const existing = await base44.asServiceRole.entities.MedicarePartDStats.filter({ data_year: year }, '-created_date', 1);
      if (existing.length > 0) {
        console.log(`Clearing existing ${year} Part D records...`);
        const allExisting = await base44.asServiceRole.entities.MedicarePartDStats.filter({ data_year: year }, '-created_date', 500);
        for (const rec of allExisting) await base44.asServiceRole.entities.MedicarePartDStats.delete(rec.id);
      }
      const CHUNK = 50;
      for (let i = 0; i < allRecords.length; i += CHUNK) {
        const chunk = allRecords.slice(i, i + CHUNK);
        await base44.asServiceRole.entities.MedicarePartDStats.bulkCreate(chunk);
        imported += chunk.length;
      }
    }

    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      status: 'completed', imported_rows: imported, completed_at: new Date().toISOString(),
    });

    try {
      const configs = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ import_type: 'medicare_part_d_stats' });
      if (configs.length > 0) {
        await base44.asServiceRole.entities.ImportScheduleConfig.update(configs[0].id, {
          last_run_at: new Date().toISOString(), last_run_status: 'success',
          last_run_summary: `Imported ${imported} records from ${sheetSummaries.length} sheets for year ${year}`,
        });
      }
    } catch (e) { console.warn('Could not update schedule config:', e.message); }

    await base44.asServiceRole.entities.AuditEvent.create({
      event_type: 'import', user_email: user.email,
      details: { action: 'Medicare Part D Import', entity: 'MedicarePartDStats', year, sheets: sheetSummaries, row_count: allRecords.length, imported_count: imported, message: dry_run ? 'Dry run' : 'Import completed' },
      timestamp: new Date().toISOString(),
    });

    return Response.json({ success: true, batch_id: batch.id, year, dry_run, sheets_parsed: sheetSummaries, total_records: allRecords.length, imported, sample: allRecords.slice(0, 3) });
  } catch (error) {
    console.error('Part D import error:', error.message);
    await base44.asServiceRole.entities.ImportBatch.update(batch.id, { status: 'failed', error_samples: [{ message: error.message }] });
    return Response.json({ error: error.message, batch_id: batch.id }, { status: 500 });
  }
});