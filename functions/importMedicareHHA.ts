import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import * as XLSX from 'npm:xlsx@0.18.5';
import JSZip from 'npm:jszip@3.10.1';

const CMS_HHA_URLS = {
  2023: 'https://data.cms.gov/sites/default/files/2026-01/MDCR%20HHA_CPS_07UHH_2023.zip',
  2022: 'https://data.cms.gov/sites/default/files/2026-01/MDCR%20HHA_CPS_07UHH_2022.zip',
  2021: 'https://data.cms.gov/sites/default/files/2023-02/CPS%20MDCR%20HHA%202021.zip',
  2020: 'https://data.cms.gov/sites/default/files/2022-02/CPS%20MDCR%20HHA%202020.zip',
};

const LATEST_AVAILABLE_YEAR = Math.max(...Object.keys(CMS_HHA_URLS).map(Number));

// Download ZIP, extract XLSX, parse sheets
async function downloadAndParseZip(url) {
  console.log(`Downloading ZIP from: ${url}`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to download: ${resp.status} ${resp.statusText}`);
  
  const contentType = resp.headers.get('content-type') || '';
  const arrayBuffer = await resp.arrayBuffer();
  
  // Check if the response is actually a ZIP file (magic bytes: PK = 0x50 0x4B)
  const header = new Uint8Array(arrayBuffer.slice(0, 4));
  const isZip = header[0] === 0x50 && header[1] === 0x4B;
  
  if (!isZip) {
    // Maybe it's a direct XLSX file (which is also a ZIP internally) - try parsing directly
    try {
      const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
      if (workbook.SheetNames.length > 0) {
        console.log('Response was a direct XLSX file, not a ZIP archive');
        return workbook;
      }
    } catch (_) {
      // Not an XLSX either
    }
    throw new Error(`Downloaded file is not a valid ZIP/XLSX archive (content-type: ${contentType}). The URL may have changed or CMS may not have published this data yet.`);
  }
  
  // Extract XLSX from the ZIP archive
  const zip = await JSZip.loadAsync(arrayBuffer);
  const fileNames = Object.keys(zip.files);
  console.log(`ZIP contains files: ${fileNames.join(', ')}`);
  
  // Find the xlsx file inside the zip
  const xlsxFileName = fileNames.find(f => f.toLowerCase().endsWith('.xlsx') || f.toLowerCase().endsWith('.xls'));
  if (!xlsxFileName) {
    throw new Error(`No XLSX/XLS file found in ZIP. Files: ${fileNames.join(', ')}`);
  }
  
  console.log(`Extracting: ${xlsxFileName}`);
  const xlsxData = await zip.files[xlsxFileName].async('uint8array');
  
  const workbook = XLSX.read(xlsxData, { type: 'array' });
  console.log(`Parsed workbook with sheets: ${workbook.SheetNames.join(', ')}`);
  
  return workbook;
}

function parseSheet(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  
  // Convert to JSON - header row detection
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rawData.length < 2) return [];
  
  // Find the header row (first row with multiple non-empty cells)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rawData.length, 10); i++) {
    const nonEmpty = rawData[i].filter(c => c !== '' && c !== null && c !== undefined).length;
    if (nonEmpty >= 3) {
      headerIdx = i;
      break;
    }
  }
  
  const headers = rawData[headerIdx].map(h => String(h || '').trim());
  const rows = [];
  
  for (let i = headerIdx + 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.every(c => c === '' || c === null || c === undefined)) continue;
    
    const obj = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = row[idx] !== undefined ? row[idx] : '';
    });
    rows.push(obj);
  }
  
  return rows;
}

function classifyTable(sheetName) {
  const name = sheetName.toUpperCase();
  if (name.includes('HHA1') || name.includes('HHA 1') || name.includes('TABLE 1')) return 'HHA1';
  if (name.includes('HHA2') || name.includes('HHA 2') || name.includes('TABLE 2')) return 'HHA2';
  if (name.includes('HHA3') || name.includes('HHA 3') || name.includes('TABLE 3')) return 'HHA3';
  if (name.includes('HHA4') || name.includes('HHA 4') || name.includes('TABLE 4')) return 'HHA4';
  if (name.includes('HHA5') || name.includes('HHA 5') || name.includes('TABLE 5')) return 'HHA5';
  if (name.includes('HHA6') || name.includes('HHA 6') || name.includes('TABLE 6')) return 'HHA6';
  return null;
}

function safeNum(val) {
  if (val === '' || val === null || val === undefined || val === '*' || val === '—' || val === '-') return null;
  const cleaned = String(val).replace(/[,$%\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function mapRowToRecord(row, tableName, dataYear) {
  const headers = Object.keys(row);
  const record = {
    table_name: tableName,
    data_year: dataYear,
    raw_data: row,
  };

  // Try to identify common fields by header patterns
  for (const h of headers) {
    const hl = h.toLowerCase();
    
    // Category / first column identification
    if (hl.includes('type of entitlement') || hl.includes('category') || hl.includes('demographic') || 
        hl.includes('state') || hl.includes('area') || hl.includes('type of agency') || 
        hl.includes('type of control') || hl.includes('number of') || hl === headers[0].toLowerCase()) {
      if (!record.category) record.category = String(row[h] || '').trim();
    }
    
    if (hl.includes('persons') && (hl.includes('served') || hl.includes('use'))) {
      record.persons_served = safeNum(row[h]);
    }
    if (hl.includes('total') && hl.includes('visit')) {
      record.total_visits = safeNum(row[h]);
    }
    if (hl.includes('episode')) {
      record.total_episodes = safeNum(row[h]);
    }
    if (hl.includes('charge')) {
      record.total_charges = safeNum(row[h]);
    }
    if (hl.includes('program payment') || (hl.includes('payment') && !hl.includes('per'))) {
      record.program_payments = safeNum(row[h]);
    }
    if (hl.includes('payment') && hl.includes('per')) {
      record.payment_per_person = safeNum(row[h]);
    }
    if (hl.includes('visit') && hl.includes('per')) {
      record.visits_per_person = safeNum(row[h]);
    }
    if (hl.includes('skilled nursing')) {
      record.skilled_nursing_visits = safeNum(row[h]);
    }
    if (hl.includes('physical therapy') || (hl.includes('pt') && hl.includes('visit'))) {
      record.pt_visits = safeNum(row[h]);
    }
    if (hl.includes('occupational therapy') || (hl.includes('ot') && hl.includes('visit'))) {
      record.ot_visits = safeNum(row[h]);
    }
    if (hl.includes('speech')) {
      record.speech_therapy_visits = safeNum(row[h]);
    }
    if (hl.includes('home health aide')) {
      record.home_health_aide_visits = safeNum(row[h]);
    }
    if (hl.includes('medical social')) {
      record.medical_social_service_visits = safeNum(row[h]);
    }
  }

  // Set category from first column if not yet set
  if (!record.category && headers.length > 0) {
    record.category = String(row[headers[0]] || '').trim();
  }

  // Table-specific classification
  if (tableName === 'HHA3') {
    // Geographic/state data
    const cat = record.category || '';
    if (cat.length === 2 && cat === cat.toUpperCase()) {
      record.state = cat;
    }
  }
  if (tableName === 'HHA4' || tableName === 'HHA5') {
    // Agency type / control type data
    if (tableName === 'HHA4') record.agency_type = record.category;
    if (tableName === 'HHA5') record.control_type = record.category;
  }

  return record;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const payload = await req.json().catch(() => ({}));
  const { action = 'import', dry_run = false, custom_url } = payload;
  // If requested year has no data, fall back to the latest available year
  const requestedYear = parseInt(payload.year || LATEST_AVAILABLE_YEAR);
  const year = CMS_HHA_URLS[requestedYear] ? requestedYear : LATEST_AVAILABLE_YEAR;
  if (requestedYear !== year) {
    console.log(`Year ${requestedYear} not available for HHA stats, falling back to ${year}`);
  }

  // --- LIST available years ---
  if (action === 'list_years') {
    return Response.json({
      available_years: Object.keys(CMS_HHA_URLS).map(Number).sort((a, b) => b - a),
      source: 'CMS Program Statistics - Medicare Home Health Agency',
      url: 'https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-medicaid-service-type-reports/cms-program-statistics-medicare-home-health-agency',
    });
  }

  // --- IMPORT ---
  const downloadUrl = custom_url || CMS_HHA_URLS[year];
  if (!downloadUrl) {
    return Response.json({ 
      error: `No download URL for year ${year}. Available: ${Object.keys(CMS_HHA_URLS).join(', ')}`,
      hint: `The latest available year is ${LATEST_AVAILABLE_YEAR}. CMS has not published data for ${requestedYear} yet.`,
    }, { status: 400 });
  }

  // Create import batch
  const batch = await base44.asServiceRole.entities.ImportBatch.create({
    import_type: 'medicare_hha_stats',
    file_name: `medicare_hha_stats_${year}`,
    file_url: downloadUrl,
    status: 'validating',
    dry_run,
  });

  try {
    // Download and parse
    const workbook = await downloadAndParseZip(downloadUrl);
    
    const allRecords = [];
    const sheetSummaries = [];

    for (const sheetName of workbook.SheetNames) {
      const tableName = classifyTable(sheetName);
      if (!tableName) {
        console.log(`Skipping unrecognized sheet: ${sheetName}`);
        continue;
      }

      const rows = parseSheet(workbook, sheetName);
      console.log(`Sheet "${sheetName}" -> ${tableName}: ${rows.length} rows`);

      for (const row of rows) {
        const record = mapRowToRecord(row, tableName, year);
        // Skip empty/header rows
        if (!record.category || record.category === '') continue;
        allRecords.push(record);
      }

      sheetSummaries.push({ sheet: sheetName, table: tableName, rows: rows.length });
    }

    console.log(`Total records to import: ${allRecords.length}`);

    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      total_rows: allRecords.length,
      valid_rows: allRecords.length,
      invalid_rows: 0,
      status: dry_run ? 'completed' : 'processing',
      column_mapping: { sheets: sheetSummaries },
    });

    let imported = 0;
    if (!dry_run && allRecords.length > 0) {
      // Delete existing records for this year to avoid duplicates
      const existing = await base44.asServiceRole.entities.MedicareHHAStats.filter({ data_year: year }, '-created_date', 1);
      if (existing.length > 0) {
        console.log(`Clearing existing ${year} records before re-import...`);
        const allExisting = await base44.asServiceRole.entities.MedicareHHAStats.filter({ data_year: year }, '-created_date', 500);
        for (const rec of allExisting) {
          await base44.asServiceRole.entities.MedicareHHAStats.delete(rec.id);
        }
      }

      // Bulk create in chunks
      const CHUNK = 50;
      for (let i = 0; i < allRecords.length; i += CHUNK) {
        const chunk = allRecords.slice(i, i + CHUNK);
        await base44.asServiceRole.entities.MedicareHHAStats.bulkCreate(chunk);
        imported += chunk.length;
        if (i % 200 === 0) {
          console.log(`Imported ${imported}/${allRecords.length}`);
        }
      }
    }

    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      status: 'completed',
      imported_rows: imported,
      completed_at: new Date().toISOString(),
    });

    // Update schedule config last run
    try {
      const configs = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ import_type: 'medicare_hha_stats' });
      if (configs.length > 0) {
        await base44.asServiceRole.entities.ImportScheduleConfig.update(configs[0].id, {
          last_run_at: new Date().toISOString(),
          last_run_status: 'success',
          last_run_summary: `Imported ${imported} records from ${sheetSummaries.length} sheets for year ${year}`,
        });
      }
    } catch (e) {
      console.warn('Could not update schedule config:', e.message);
    }

    // Audit
    await base44.asServiceRole.entities.AuditEvent.create({
      event_type: 'import',
      user_email: user.email,
      details: {
        action: 'Medicare HHA Stats Import',
        entity: 'MedicareHHAStats',
        year,
        sheets: sheetSummaries,
        row_count: allRecords.length,
        imported_count: imported,
        message: dry_run ? 'Dry run completed' : 'Import completed',
      },
      timestamp: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      batch_id: batch.id,
      year,
      dry_run,
      sheets_parsed: sheetSummaries,
      total_records: allRecords.length,
      imported: imported,
      sample: allRecords.slice(0, 3),
    });

  } catch (error) {
    console.error('Import error:', error.message);
    await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
      status: 'failed',
      error_samples: [{ message: error.message }],
    });
    return Response.json({ error: error.message, batch_id: batch.id }, { status: 500 });
  }
});