import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Upload, ArrowLeft, Loader2 } from 'lucide-react';
import ImportTypeSelector, { importTypes } from '../components/imports/ImportTypeSelector';
import ColumnMapper from '../components/imports/ColumnMapper';
import ValidationResults from '../components/imports/ValidationResults';
import FileParser from '../components/imports/FileParser';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

// Simple CSV line parser that handles quoted fields with commas
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export default function DataImports() {
  const [step, setStep] = useState('select');
  const [selectedType, setSelectedType] = useState(null);
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [parseMode, setParsedMode] = useState(null);
  const [csvColumns, setCsvColumns] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [dryRun, setDryRun] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');

  const queryClient = useQueryClient();

  const { data: batches = [] } = useQuery({
    queryKey: ['dataImportsBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 20),
  });

  const validateNPI = (npi) => {
    if (!npi) return false;
    const cleaned = String(npi).replace(/\D/g, '');
    return cleaned.length === 10;
  };

  const handleFileParsed = ({ headers, file: parsedFile, file_url, parseMode }) => {
    setFile(parsedFile);
    setFileUrl(file_url);
    setParsedMode(parseMode);
    setCsvColumns(headers);

    const autoMapping = {};
    const normalizedHeaders = headers.map((h) => ({ original: h, normalized: h.toLowerCase().trim() }));

    selectedType.requiredColumns.forEach(requiredCol => {
      const match = normalizedHeaders.find(h => h.normalized === requiredCol.toLowerCase().trim());
      if (match) {
        autoMapping[requiredCol] = match.original;
      }
    });

    setColumnMapping(autoMapping);
    setStep('map');
  };

  // Get NPI value from a row using the column mapping
  const getNPIFromRow = (row) => {
    // Check mapped NPI column first
    const npiRequiredCol = selectedType.requiredColumns.find(c => c.toUpperCase() === 'NPI' || c === 'Rndrng_NPI');
    if (npiRequiredCol && columnMapping[npiRequiredCol]) {
      const val = row[columnMapping[npiRequiredCol]];
      if (val) return String(val).trim();
    }
    // Fallback: try common NPI column names directly
    for (const key of ['NPI', 'npi', 'Npi', 'Rndrng_NPI', 'rndrng_npi']) {
      if (row[key]) return String(row[key]).trim();
    }
    return null;
  };

  // Helper: get a mapped column value from a row
  const getMappedValue = (row, requiredColName, fallbackColName) => {
    const csvCol = columnMapping[requiredColName];
    if (csvCol && row[csvCol] !== undefined) return row[csvCol];
    if (fallbackColName && row[fallbackColName] !== undefined) return row[fallbackColName];
    return '';
  };

  const handleValidate = async () => {
    if (!file) return;

    setProcessing(true);
    setProcessingStatus('Uploading file...');
    try {
      const user = await base44.auth.me();
      
      // Use already-uploaded URL from FileParser, or upload now
      let uploadedUrl = fileUrl;
      if (!uploadedUrl) {
        const uploadResult = await base44.integrations.Core.UploadFile({ file });
        uploadedUrl = uploadResult.file_url;
      }
      
      setProcessingStatus('Creating import batch...');
      
      const batch = await base44.entities.ImportBatch.create({
        import_type: selectedType.id,
        file_name: file.name,
        file_url: uploadedUrl,
        status: 'validating',
        dry_run: dryRun,
        column_mapping: columnMapping,
      });

      setProcessingStatus('Downloading file for parsing...');
      const response = await fetch(uploadedUrl);
      const text = await response.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        await base44.entities.ImportBatch.update(batch.id, { status: 'failed', error_samples: [{ message: 'File has no data rows' }] });
        setCurrentBatch({ ...batch, status: 'failed', error_samples: [{ message: 'File has no data rows' }] });
        setStep('complete');
        return;
      }
      
      const headers = parseCSVLine(lines[0]);
      const totalDataRows = lines.length - 1;
      
      setProcessingStatus(`Validating ${totalDataRows} rows...`);
      
      let validRows = 0;
      let invalidRows = 0;
      let duplicateRows = 0;
      const errorSamples = [];
      const validData = [];
      const seenNPIs = new Set();

      const npiBasedTypes = ['nppes_monthly', 'cms_utilization', 'cms_part_d', 'cms_order_referring', 'pa_home_health', 'hospice_providers', 'provider_service_utilization'];
      const requiresNPI = npiBasedTypes.includes(selectedType.id);

      // Parse ALL rows (no 10k cap)
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 2) continue; // skip blank/malformed lines
        
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

        const npi = getNPIFromRow(row);

        if (requiresNPI && !validateNPI(npi)) {
          invalidRows++;
          if (errorSamples.length < 10) {
            errorSamples.push({ row: i + 1, npi: npi || 'missing', message: 'Invalid NPI format (must be 10 digits)' });
          }
        } else if (requiresNPI && seenNPIs.has(npi)) {
          // Duplicate within THIS file — skip
          duplicateRows++;
        } else {
          if (npi) seenNPIs.add(npi);
          validRows++;
          validData.push({ ...row, _npi: npi }); // store full row + extracted NPI
        }
      }

      await base44.entities.ImportBatch.update(batch.id, {
        status: dryRun ? 'completed' : 'processing',
        total_rows: totalDataRows,
        valid_rows: validRows,
        invalid_rows: invalidRows,
        duplicate_rows: duplicateRows,
        error_samples: errorSamples,
      });

      if (!dryRun && validData.length > 0) {
        setProcessingStatus(`Importing ${validData.length} records...`);
        await importData(selectedType.id, validData, batch.id);
      } else if (dryRun) {
        await base44.entities.ImportBatch.update(batch.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
      }

      const updatedBatches = await base44.entities.ImportBatch.filter({ id: batch.id });
      setCurrentBatch(updatedBatches[0] || batch);

      await base44.entities.AuditEvent.create({
        event_type: 'import',
        user_email: user.email,
        details: {
          action: dryRun ? 'Dry Run Validation' : 'Data Import',
          entity: selectedType.id,
          row_count: validRows,
          file_name: file.name,
        },
        timestamp: new Date().toISOString(),
      });

      setStep('complete');
      queryClient.invalidateQueries();
    } catch (error) {
      console.error('Import failed:', error);
      alert('Import failed: ' + error.message);
    } finally {
      setProcessing(false);
      setProcessingStatus('');
    }
  };

  const importData = async (importType, data, batchId) => {
    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const CHUNK_SIZE = 25; // Smaller chunks for reliability

    if (importType === 'nppes_monthly') {
      // Build provider records from raw CSV rows
      const providerRecords = data.map(row => {
        const npi = row._npi;
        const entityCode = getMappedValue(row, 'Entity Type Code', 'Entity Type Code');
        const isIndividual = entityCode === '1';
        const deactivationDate = (row[columnMapping['NPI Deactivation Date']] || row['NPI Deactivation Date'] || '').trim();
        
        const record = {
          npi,
          entity_type: isIndividual ? 'Individual' : 'Organization',
          first_name: getMappedValue(row, 'Provider First Name', 'Provider First Name').trim(),
          last_name: getMappedValue(row, 'Provider Last Name (Legal Name)', 'Provider Last Name (Legal Name)').trim(),
          middle_name: (row[columnMapping['Provider Middle Name']] || row['Provider Middle Name'] || '').trim(),
          credential: (row[columnMapping['Provider Credential Text']] || row['Provider Credential Text'] || '').trim(),
          gender: (row[columnMapping['Provider Gender Code']] || row['Provider Gender Code'] || '').trim(),
          organization_name: isIndividual ? '' : (row[columnMapping['Provider Organization Name (Legal Business Name)']] || row['Provider Organization Name (Legal Business Name)'] || '').trim(),
          enumeration_date: (row[columnMapping['Provider Enumeration Date']] || row['Provider Enumeration Date'] || '').trim(),
          last_update_date: (row[columnMapping['Last Update Date']] || row['Last Update Date'] || '').trim(),
          status: deactivationDate ? 'Deactivated' : 'Active',
          needs_nppes_enrichment: false,
        };
        
        // Normalize gender to match schema enum
        if (record.gender !== 'M' && record.gender !== 'F') record.gender = '';
        
        return record;
      });

      // Process in chunks: for each chunk, look up existing NPIs first, then create/update
      for (let i = 0; i < providerRecords.length; i += CHUNK_SIZE) {
        const chunk = providerRecords.slice(i, i + CHUNK_SIZE);
        setProcessingStatus(`Processing providers ${i + 1}-${Math.min(i + CHUNK_SIZE, providerRecords.length)} of ${providerRecords.length}...`);
        
        // Separate into new vs existing by trying to look up each NPI
        const toCreate = [];
        const toUpdate = [];
        
        for (const record of chunk) {
          const existing = await base44.entities.Provider.filter({ npi: record.npi });
          if (existing.length === 0) {
            toCreate.push(record);
          } else {
            // Update existing record
            toUpdate.push({ id: existing[0].id, data: record });
          }
        }
        
        // Bulk create new records
        if (toCreate.length > 0) {
          try {
            await base44.entities.Provider.bulkCreate(toCreate);
            importedCount += toCreate.length;
          } catch (bulkErr) {
            console.error('Bulk create failed, trying one-by-one:', bulkErr.message);
            for (const record of toCreate) {
              try {
                await base44.entities.Provider.create(record);
                importedCount++;
              } catch (e) {
                console.error('Individual create failed for NPI:', record.npi, e.message);
              }
            }
          }
        }
        
        // Update existing records one by one
        for (const { id, data: updateData } of toUpdate) {
          try {
            await base44.entities.Provider.update(id, updateData);
            updatedCount++;
          } catch (e) {
            console.error('Update failed for provider:', updateData.npi, e.message);
          }
        }
      }

    } else if (importType === 'cms_utilization') {
      const utilRecords = data.map(row => ({
        npi: row.npi,
        year: parseInt(row[columnMapping['Year'] || 'Year'] || new Date().getFullYear()),
        total_services: parseFloat(row[columnMapping['Total Services'] || 'Total Services'] || 0),
        total_medicare_beneficiaries: parseFloat(row[columnMapping['Total Medicare Beneficiaries'] || 'Total Medicare Beneficiaries'] || 0),
        total_medicare_payment: parseFloat(row[columnMapping['Total Medicare Payment Amount'] || 'Total Medicare Payment Amount'] || 0),
      }));

      // Also create placeholder providers for any NPIs not yet in system
      const uniqueNPIs = [...new Set(utilRecords.map(r => r.npi))];
      const providerPlaceholders = uniqueNPIs.map(npi => ({
        npi,
        status: 'Active',
        needs_nppes_enrichment: true,
      }));

      // Create providers first (ignore failures for duplicates)
      for (let i = 0; i < providerPlaceholders.length; i += CHUNK_SIZE) {
        try {
          await base44.entities.Provider.bulkCreate(providerPlaceholders.slice(i, i + CHUNK_SIZE));
        } catch (e) { /* ignore duplicate errors */ }
      }

      for (let i = 0; i < utilRecords.length; i += CHUNK_SIZE) {
        const chunk = utilRecords.slice(i, i + CHUNK_SIZE);
        setProcessingStatus(`Importing utilization ${i + 1}-${Math.min(i + CHUNK_SIZE, utilRecords.length)} of ${utilRecords.length}...`);
        try {
          await base44.entities.CMSUtilization.bulkCreate(chunk);
          importedCount += chunk.length;
        } catch (error) {
          console.error('Bulk create utilization failed:', error.message);
          for (const record of chunk) {
            try {
              await base44.entities.CMSUtilization.create(record);
              importedCount++;
            } catch (e) {
              console.error('Individual utilization create failed:', e.message);
            }
          }
        }
      }

    } else if (importType === 'cms_order_referring') {
      const refRecords = data.map(row => ({
        npi: row.npi,
        year: parseInt(row[columnMapping['Year'] || 'Year'] || new Date().getFullYear()),
        total_referrals: parseFloat(row[columnMapping['Total Referrals'] || 'Total Referrals'] || 0),
        home_health_referrals: parseFloat(row[columnMapping['HHA'] || 'HHA'] || 0),
        hospice_referrals: parseFloat(row[columnMapping['HOSPICE'] || 'HOSPICE'] || 0),
        dme_referrals: parseFloat(row[columnMapping['DME'] || 'DME'] || 0),
      }));

      const uniqueNPIs = [...new Set(refRecords.map(r => r.npi))];
      for (let i = 0; i < uniqueNPIs.length; i += CHUNK_SIZE) {
        try {
          await base44.entities.Provider.bulkCreate(uniqueNPIs.slice(i, i + CHUNK_SIZE).map(npi => ({
            npi, status: 'Active', needs_nppes_enrichment: true,
          })));
        } catch (e) { /* ignore */ }
      }

      for (let i = 0; i < refRecords.length; i += CHUNK_SIZE) {
        const chunk = refRecords.slice(i, i + CHUNK_SIZE);
        setProcessingStatus(`Importing referrals ${i + 1}-${Math.min(i + CHUNK_SIZE, refRecords.length)} of ${refRecords.length}...`);
        try {
          await base44.entities.CMSReferral.bulkCreate(chunk);
          importedCount += chunk.length;
        } catch (error) {
          for (const record of chunk) {
            try {
              await base44.entities.CMSReferral.create(record);
              importedCount++;
            } catch (e) {
              console.error('Individual referral create failed:', e.message);
            }
          }
        }
      }

    } else if (importType === 'cms_part_d') {
      const providerRecords = data.map(row => ({
        npi: row.npi,
        status: 'Active',
        needs_nppes_enrichment: true,
      }));

      for (let i = 0; i < providerRecords.length; i += CHUNK_SIZE) {
        const chunk = providerRecords.slice(i, i + CHUNK_SIZE);
        setProcessingStatus(`Importing Part D providers ${i + 1}-${Math.min(i + CHUNK_SIZE, providerRecords.length)} of ${providerRecords.length}...`);
        try {
          await base44.entities.Provider.bulkCreate(chunk);
          importedCount += chunk.length;
        } catch (e) {
          for (const record of chunk) {
            try {
              await base44.entities.Provider.create(record);
              importedCount++;
            } catch (e2) { /* duplicate, skip */ }
          }
        }
      }

    } else if (importType === 'pa_home_health' || importType === 'hospice_providers') {
      const providerRecords = data.map(row => ({
        npi: row.npi,
        entity_type: 'Organization',
        organization_name: (row[columnMapping['Agency Name'] || 'Agency Name'] || row[columnMapping['Provider Name'] || 'Provider Name'] || '').trim(),
        status: 'Active',
        last_update_date: new Date().toISOString(),
      }));

      for (let i = 0; i < providerRecords.length; i += CHUNK_SIZE) {
        const chunk = providerRecords.slice(i, i + CHUNK_SIZE);
        setProcessingStatus(`Importing providers ${i + 1}-${Math.min(i + CHUNK_SIZE, providerRecords.length)} of ${providerRecords.length}...`);
        try {
          await base44.entities.Provider.bulkCreate(chunk);
          importedCount += chunk.length;
        } catch (error) {
          for (const record of chunk) {
            try {
              await base44.entities.Provider.create(record);
              importedCount++;
            } catch (e) {
              try {
                const existing = await base44.entities.Provider.filter({ npi: record.npi });
                if (existing.length > 0) {
                  await base44.entities.Provider.update(existing[0].id, record);
                  updatedCount++;
                }
              } catch (e2) { console.error('Failed provider:', record.npi); }
            }
          }
        }
      }

      // Also create locations
      const locationRecords = data
        .filter(row => row[columnMapping['City'] || 'City'] && row[columnMapping['State'] || 'State'])
        .map(row => ({
          npi: row.npi,
          location_type: 'Practice',
          is_primary: true,
          city: (row[columnMapping['City'] || 'City'] || '').trim(),
          state: (row[columnMapping['State'] || 'State'] || '').toUpperCase().trim(),
          address_1: (row[columnMapping['Address'] || 'Address'] || '').trim(),
        }));

      for (let i = 0; i < locationRecords.length; i += CHUNK_SIZE) {
        try {
          await base44.entities.ProviderLocation.bulkCreate(locationRecords.slice(i, i + CHUNK_SIZE));
        } catch (e) {
          console.error('Location bulk create failed:', e.message);
        }
      }

    } else if (importType === 'nursing_home_chains') {
      const chainRecords = data.map(row => ({
        chain_name: (row[columnMapping['Chain'] || 'Chain'] || '').trim(),
        chain_id: (row[columnMapping['Chain ID'] || 'Chain ID'] || '').trim(),
        number_of_facilities: parseFloat(row[columnMapping['Number of facilities'] || 'Number of facilities'] || 0),
        avg_overall_rating: parseFloat(row[columnMapping['Average overall 5-star rating'] || 'Average overall 5-star rating'] || 0),
      }));

      for (let i = 0; i < chainRecords.length; i += CHUNK_SIZE) {
        try {
          await base44.entities.NursingHomeChain.bulkCreate(chainRecords.slice(i, i + CHUNK_SIZE));
          importedCount += chainRecords.slice(i, i + CHUNK_SIZE).length;
        } catch (e) {
          console.error('Chain bulk create failed:', e.message);
        }
      }

    } else if (importType === 'hospice_enrollments') {
      const records = data.map(row => ({
        enrollment_id: (row[columnMapping['ENROLLMENT ID'] || 'ENROLLMENT ID'] || '').trim(),
        npi: row.npi || '',
        ccn: (row[columnMapping['CCN'] || 'CCN'] || '').trim(),
        organization_name: (row[columnMapping['ORGANIZATION NAME'] || 'ORGANIZATION NAME'] || '').trim(),
      }));

      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        try {
          await base44.entities.HospiceEnrollment.bulkCreate(records.slice(i, i + CHUNK_SIZE));
          importedCount += records.slice(i, i + CHUNK_SIZE).length;
        } catch (e) {
          console.error('Hospice enrollment bulk create failed:', e.message);
        }
      }

    } else if (importType === 'home_health_enrollments') {
      const records = data.map(row => ({
        enrollment_id: (row[columnMapping['ENROLLMENT ID'] || 'ENROLLMENT ID'] || '').trim(),
        npi: row.npi || '',
        ccn: (row[columnMapping['CCN'] || 'CCN'] || '').trim(),
        organization_name: (row[columnMapping['ORGANIZATION NAME'] || 'ORGANIZATION NAME'] || '').trim(),
      }));

      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        try {
          await base44.entities.HomeHealthEnrollment.bulkCreate(records.slice(i, i + CHUNK_SIZE));
          importedCount += records.slice(i, i + CHUNK_SIZE).length;
        } catch (e) {
          console.error('HH enrollment bulk create failed:', e.message);
        }
      }

    } else if (importType === 'home_health_cost_reports') {
      const records = data.map(row => ({
        rpt_rec_num: (row[columnMapping['rpt_rec_num'] || 'rpt_rec_num'] || '').trim(),
        ccn: (row[columnMapping['Provider CCN'] || 'Provider CCN'] || '').trim(),
        hha_name: (row[columnMapping['HHA Name'] || 'HHA Name'] || '').trim(),
        total_cost: parseFloat(row[columnMapping['Total Cost'] || 'Total Cost'] || 0),
      }));

      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        try {
          await base44.entities.HomeHealthCostReport.bulkCreate(records.slice(i, i + CHUNK_SIZE));
          importedCount += records.slice(i, i + CHUNK_SIZE).length;
        } catch (e) {
          console.error('Cost report bulk create failed:', e.message);
        }
      }

    } else if (importType === 'provider_service_utilization') {
      const records = data.map(row => ({
        npi: row.npi,
        hcpcs_code: (row[columnMapping['HCPCS_Cd'] || 'HCPCS_Cd'] || '').trim(),
        hcpcs_description: (row[columnMapping['HCPCS_Desc'] || 'HCPCS_Desc'] || '').trim(),
        total_beneficiaries: parseFloat(row[columnMapping['Tot_Benes'] || 'Tot_Benes'] || 0),
        total_services: parseFloat(row[columnMapping['Tot_Srvcs'] || 'Tot_Srvcs'] || 0),
        data_year: new Date().getFullYear(),
      }));

      for (let i = 0; i < records.length; i += CHUNK_SIZE) {
        try {
          await base44.entities.ProviderServiceUtilization.bulkCreate(records.slice(i, i + CHUNK_SIZE));
          importedCount += records.slice(i, i + CHUNK_SIZE).length;
        } catch (e) {
          console.error('Service util bulk create failed:', e.message);
        }
      }
    }

    await base44.entities.ImportBatch.update(batchId, {
      status: 'completed',
      imported_rows: importedCount,
      updated_rows: updatedCount,
      completed_at: new Date().toISOString(),
    });
  };

  const handleReset = () => {
    setStep('select');
    setSelectedType(null);
    setFile(null);
    setFileUrl(null);
    setParsedMode(null);
    setCsvColumns([]);
    setColumnMapping({});
    setCurrentBatch(null);
    setDryRun(false);
  };

  const isMappingComplete = selectedType?.requiredColumns.every(col => columnMapping[col]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Data Imports</h1>
          <p className="text-slate-500 mt-1">Upload and validate NPPES and CMS datasets</p>
        </div>
        {step !== 'select' && (
          <Button variant="outline" onClick={handleReset} className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Start New Import
          </Button>
        )}
      </div>

      {step === 'select' && (
        <div className="space-y-6">
          <ImportTypeSelector onSelect={(type) => {
            setSelectedType(type);
            setStep('upload');
          }} />

          {batches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Imports</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {batches.slice(0, 5).map(batch => (
                    <div key={batch.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                      <div>
                        <p className="font-medium text-slate-200">{batch.file_name}</p>
                        <p className="text-sm text-slate-400">
                          {batch.import_type?.replace(/_/g, ' ')} • {batch.valid_rows} valid rows
                          {batch.imported_rows > 0 && ` • ${batch.imported_rows} imported`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-slate-500">
                          {new Date(batch.created_date).toLocaleDateString()}
                        </p>
                        {batch.dry_run && (
                          <span className="text-xs bg-blue-900/50 text-blue-300 px-2 py-1 rounded">Dry Run</span>
                        )}
                        {batch.status === 'completed' && !batch.dry_run && (
                          <span className="text-xs bg-green-900/50 text-green-300 px-2 py-1 rounded">Imported</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {step === 'upload' && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>{selectedType?.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <FileParser onParsed={handleFileParsed} selectedType={selectedType} />
          </CardContent>
        </Card>
      )}

      {step === 'map' && (
        <div className="max-w-3xl space-y-6">
          <ColumnMapper
            csvColumns={csvColumns}
            requiredColumns={selectedType?.requiredColumns || []}
            mapping={columnMapping}
            onChange={setColumnMapping}
          />

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Dry Run Mode</Label>
                  <p className="text-sm text-slate-400">Validate only, don't import data</p>
                </div>
                <Switch checked={dryRun} onCheckedChange={setDryRun} />
              </div>

              {processing && processingStatus && (
                <div className="space-y-2 p-4 bg-cyan-900/30 rounded-lg border border-cyan-700/50">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                    <span className="text-sm font-medium text-cyan-200">{processingStatus}</span>
                  </div>
                  <Progress value={45} className="h-2" />
                  <p className="text-xs text-cyan-400/70">This may take several minutes for large files...</p>
                </div>
              )}

              <Button
                onClick={handleValidate}
                disabled={!isMappingComplete || processing}
                className="w-full bg-cyan-600 hover:bg-cyan-700"
              >
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    {dryRun ? 'Validate Data' : 'Import Data'}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 'complete' && currentBatch && (
        <div className="max-w-3xl">
          <ValidationResults batch={currentBatch} />
        </div>
      )}

      <DataSourcesFooter />
    </div>
  );
}