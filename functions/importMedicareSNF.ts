import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';
import JSZip from 'npm:jszip@3.10.1';

const CMS_SNF_URLS = {
  2023: 'https://data.cms.gov/sites/default/files/2026-01/CPS%20MDCR%20SNF%202023.zip',
  2022: 'https://data.cms.gov/sites/default/files/2024-10/CPS%20MDCR%20SNF%202022.zip',
  2021: 'https://data.cms.gov/sites/default/files/2023-02/CPS%20MDCR%20SNF%202021.zip',
  2020: 'https://data.cms.gov/sites/default/files/2023-02/CPS%20MDCR%20SNF%202020.zip',
  2019: 'https://data.cms.gov/sites/default/files/2023-02/CPS%20MDCR%20SNF%202019.zip',
  2018: 'https://data.cms.gov/sites/default/files/2023-02/CPS%20MDCR%20SNF%202018.zip',
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

function classifySNFTable(sheetName) {
  const name = sheetName.toUpperCase().replace(/\s+/g, ' ');
  for (let i = 6; i >= 1; i--) {
    if (name.includes(`SNF ${i}`) || name.includes(`SNF${i}`) || name.includes(`TABLE ${i}`)) return `SNF${i}`;
  }
  return null;
}

function mapSNFRow(row, tableName, dataYear) {
  const headers = Object.keys(row);
  const record = { table_name: tableName, data_year: dataYear, raw_data: row };

  for (const h of headers) {
    const hl = h.toLowerCase();
    if (!record.category && (hl.includes('entitlement') || hl.includes('demographic') ||
        hl.includes('state') || hl.includes('area') || hl.includes('facility') ||
        hl.includes('bedsize') || hl.includes('bed size') || hl.includes('days of care') ||
        hl.includes('sex') || hl.includes('race') || hl.includes('age') ||
        hl === headers[0].toLowerCase())) {
      record.category = String(row[h] || '').trim();
    }
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
  if (tableName === 'SNF3') {
    const cat = record.category || '';
    if (cat.length === 2 && cat === cat.toUpperCase()) record.state = cat;
  }
  if (tableName === 'SNF4') record.service_level = record.category;
  if (tableName === 'SNF5') {
    record.facility_type = record.category;
    const cat = record.category || '';
    if (/\d/.test(cat) && (cat.toLowerCase().includes('bed') || cat.includes('-'))) record.bedsize_category = cat;
  }

  return record;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  
  let userEmail = 'system@service';
  try {
    const u = await base44.auth.me();
    if (u) {
      userEmail = u.email || userEmail;
      const isService = (u.email || '').includes('service+') || (u.email || '').includes('@no-reply.base44.com');
      if (!isService && u.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
  } catch (e) { /* service role call */ }
  const user = { email: userEmail };

  const payload = await req.json().catch(() => ({}));
  const { action = 'import', year = 2021, dry_run = false, custom_url } = payload;

  if (action === 'list_years') {
    return Response.json({
      available_years: Object.keys(CMS_SNF_URLS).map(Number).sort((a, b) => b - a),
      source: 'CMS Program Statistics - Medicare Skilled Nursing Facility',
    });
  }

  const downloadUrl = custom_url || CMS_SNF_URLS[year];
  if (!downloadUrl) return Response.json({ error: `No URL for year ${year}. Available: ${Object.keys(CMS_SNF_URLS).join(', ')}` }, { status: 400 });

  const batch = await base44.asServiceRole.entities.ImportBatch.create({
    import_type: 'medicare_snf_stats',
    file_name: `medicare_snf_${year}`,
    file_url: downloadUrl,
    status: 'validating',
    dry_run,
  });

  try {
    const workbook = await downloadAndParseZip(downloadUrl);
    const allRecords = [];
    const sheetSummaries = [];

    for (const sheetName of workbook.SheetNames) {
      const tableName = classifySNFTable(sheetName);
      if (!tableName) { console.log(`Skipping sheet: ${sheetName}`); continue; }
      const rows = parseSheet(workbook, sheetName);
      console.log(`Sheet "${sheetName}" -> ${tableName}: ${rows.length} rows`);
      for (const row of rows) {
        const record = mapSNFRow(row, tableName, year);
        if (!record.category || record.category === '') continue;
        allRecords.push(record);
      }
      sheetSummaries.push({ sheet: sheetName, table: tableName, rows: rows.length });
    }

    console.log(`Total SNF records: ${allRecords.length}`);
    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      total_rows: allRecords.length, valid_rows: allRecords.length, invalid_rows: 0,
      status: dry_run ? 'completed' : 'processing', column_mapping: { sheets: sheetSummaries },
    });

    let imported = 0;
    if (!dry_run && allRecords.length > 0) {
      const existing = await base44.asServiceRole.entities.MedicareSNFStats.filter({ data_year: year }, '-created_date', 1);
      if (existing.length > 0) {
        console.log(`Clearing existing ${year} SNF records...`);
        const allExisting = await base44.asServiceRole.entities.MedicareSNFStats.filter({ data_year: year }, '-created_date', 500);
        for (const rec of allExisting) await base44.asServiceRole.entities.MedicareSNFStats.delete(rec.id);
      }
      const CHUNK = 50;
      for (let i = 0; i < allRecords.length; i += CHUNK) {
        const chunk = allRecords.slice(i, i + CHUNK);
        await base44.asServiceRole.entities.MedicareSNFStats.bulkCreate(chunk);
        imported += chunk.length;
      }
    }

    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      status: 'completed', imported_rows: imported, completed_at: new Date().toISOString(),
    });

    try {
      const configs = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ import_type: 'medicare_snf_stats' });
      if (configs.length > 0) {
        await base44.asServiceRole.entities.ImportScheduleConfig.update(configs[0].id, {
          last_run_at: new Date().toISOString(), last_run_status: 'success',
          last_run_summary: `Imported ${imported} records from ${sheetSummaries.length} sheets for year ${year}`,
        });
      }
    } catch (e) { console.warn('Could not update schedule config:', e.message); }

    await base44.asServiceRole.entities.AuditEvent.create({
      event_type: 'import', user_email: user.email,
      details: { action: 'Medicare SNF Import', entity: 'MedicareSNFStats', year, sheets: sheetSummaries, row_count: allRecords.length, imported_count: imported, message: dry_run ? 'Dry run' : 'Import completed' },
      timestamp: new Date().toISOString(),
    });

    return Response.json({ success: true, batch_id: batch.id, year, dry_run, sheets_parsed: sheetSummaries, total_records: allRecords.length, imported, sample: allRecords.slice(0, 3) });
  } catch (error) {
    console.error('SNF import error:', error.message);
    await base44.asServiceRole.entities.ImportBatch.update(batch.id, { status: 'failed', error_samples: [{ message: error.message }] });
    return Response.json({ error: error.message, batch_id: batch.id }, { status: 500 });
  }
});