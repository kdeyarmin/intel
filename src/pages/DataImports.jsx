import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Upload, ArrowLeft } from 'lucide-react';
import ImportTypeSelector, { importTypes } from '../components/imports/ImportTypeSelector';
import ColumnMapper from '../components/imports/ColumnMapper';
import ValidationResults from '../components/imports/ValidationResults';

export default function DataImports() {
  const [step, setStep] = useState('select'); // select, upload, map, validate, complete
  const [selectedType, setSelectedType] = useState(null);
  const [file, setFile] = useState(null);
  const [csvColumns, setCsvColumns] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [dryRun, setDryRun] = useState(true);
  const [currentBatch, setCurrentBatch] = useState(null);
  const [processing, setProcessing] = useState(false);

  const queryClient = useQueryClient();

  const { data: batches = [] } = useQuery({
    queryKey: ['importBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 20),
  });

  const validateNPI = (npi) => {
    if (!npi) return false;
    const cleaned = String(npi).replace(/\D/g, '');
    return cleaned.length === 10;
  };

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    
    // Parse CSV to get columns
    const text = await selectedFile.text();
    const lines = text.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    setCsvColumns(headers);
    setStep('map');
  };

  const handleValidate = async () => {
    if (!file) return;

    setProcessing(true);
    try {
      const user = await base44.auth.me();
      
      // Upload file
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      // Create batch record
      const batch = await base44.entities.ImportBatch.create({
        import_type: selectedType.id,
        file_name: file.name,
        file_url,
        status: 'validating',
        dry_run: dryRun,
        column_mapping: columnMapping,
      });

      // Parse and validate CSV
      const response = await fetch(file_url);
      const text = await response.text();
      const lines = text.split('\n').filter(l => l.trim());
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      let validRows = 0;
      let invalidRows = 0;
      let duplicateRows = 0;
      const errorSamples = [];
      const validData = [];
      const seenNPIs = new Set();

      // Get existing NPIs for deduplication check
      const existingProviders = await base44.entities.Provider.list();
      const existingNPIs = new Set(existingProviders.map(p => p.npi));

      for (let i = 1; i < lines.length && i < 10001; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx]; });

        // Get mapped values
        const mappedData = {};
        Object.entries(columnMapping).forEach(([requiredCol, csvCol]) => {
          mappedData[requiredCol] = row[csvCol];
        });

        // Validate NPI
        const npiCol = columnMapping['NPI'] || columnMapping['Npi'] || 'NPI';
        const npi = row[npiCol];
        
        if (!validateNPI(npi)) {
          invalidRows++;
          if (errorSamples.length < 10) {
            errorSamples.push({
              row: i + 1,
              npi: npi || 'missing',
              message: 'Invalid NPI format (must be 10 digits)',
            });
          }
        } else if (seenNPIs.has(npi)) {
          duplicateRows++;
        } else {
          seenNPIs.add(npi);
          validRows++;
          validData.push({ 
            ...mappedData, 
            npi,
            isDuplicate: existingNPIs.has(npi)
          });
        }
      }

      // Update batch with results
      await base44.entities.ImportBatch.update(batch.id, {
        status: dryRun ? 'completed' : 'processing',
        total_rows: lines.length - 1,
        valid_rows: validRows,
        invalid_rows: invalidRows,
        duplicate_rows: duplicateRows,
        error_samples: errorSamples,
      });

      // If not dry run, import data
      if (!dryRun && validData.length > 0) {
        await importData(selectedType.id, validData, batch.id);
      } else {
        await base44.entities.ImportBatch.update(batch.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
      }

      // Reload batch
      const updatedBatch = await base44.entities.ImportBatch.filter({ id: batch.id });
      setCurrentBatch(updatedBatch[0]);

      // Log audit
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
      alert('Import failed: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const importData = async (importType, data, batchId) => {
    let importedCount = 0;
    let updatedCount = 0;

    if (importType === 'nppes_monthly') {
      for (const row of data) {
        try {
          const existing = await base44.entities.Provider.filter({ npi: row.npi });
          
          const providerData = {
            npi: row.npi,
            entity_type: row['Entity Type Code'] === '1' ? 'Individual' : 'Organization',
            first_name: row['Provider First Name'],
            last_name: row['Provider Last Name (Legal Name)'],
            credential: row['Provider Credential Text'],
            status: 'Active',
            last_update_date: new Date().toISOString(),
            needs_nppes_enrichment: false,
          };

          if (existing.length === 0) {
            await base44.entities.Provider.create(providerData);
            importedCount++;
          } else {
            // Dedupe: keep latest
            const current = existing[0];
            const currentDate = current.last_update_date ? new Date(current.last_update_date) : new Date(0);
            const newDate = new Date(providerData.last_update_date);
            
            if (newDate > currentDate) {
              await base44.entities.Provider.update(current.id, providerData);
              updatedCount++;
            }
          }
        } catch (error) {
          console.error('Failed to import provider', error);
        }
      }
    } else if (importType === 'cms_utilization') {
      for (const row of data) {
        try {
          // Check if provider exists, create placeholder if not
          const existingProvider = await base44.entities.Provider.filter({ npi: row.npi });
          if (existingProvider.length === 0) {
            await base44.entities.Provider.create({
              npi: row.npi,
              status: 'Active',
              needs_nppes_enrichment: true,
            });
          }

          // Dedupe utilization by NPI + year
          const existingUtil = await base44.entities.CMSUtilization.filter({ 
            npi: row.npi, 
            year: parseInt(row['Year'] || '2023') 
          });

          const utilData = {
            npi: row.npi,
            year: parseInt(row['Year'] || '2023'),
            total_services: parseFloat(row['Total Services'] || 0),
            total_medicare_beneficiaries: parseFloat(row['Medicare Beneficiaries'] || 0),
            total_medicare_payment: parseFloat(row['Medicare Payment Amount'] || 0),
          };

          if (existingUtil.length === 0) {
            await base44.entities.CMSUtilization.create(utilData);
            importedCount++;
          } else {
            await base44.entities.CMSUtilization.update(existingUtil[0].id, utilData);
            updatedCount++;
          }
        } catch (error) {
          console.error('Failed to import utilization', error);
        }
      }
    } else if (importType === 'cms_order_referring') {
      for (const row of data) {
        try {
          // Check if provider exists, create placeholder if not
          const existingProvider = await base44.entities.Provider.filter({ npi: row.npi });
          if (existingProvider.length === 0) {
            await base44.entities.Provider.create({
              npi: row.npi,
              status: 'Active',
              needs_nppes_enrichment: true,
            });
          }

          // Dedupe referrals by NPI + year
          const existingRef = await base44.entities.CMSReferral.filter({ 
            npi: row.npi, 
            year: parseInt(row['Year'] || '2023') 
          });

          const refData = {
            npi: row.npi,
            year: parseInt(row['Year'] || '2023'),
            total_referrals: parseFloat(row['Total Referrals'] || 0),
            home_health_referrals: parseFloat(row['Home Health Referrals'] || 0),
            hospice_referrals: parseFloat(row['Hospice Referrals'] || 0),
          };

          if (existingRef.length === 0) {
            await base44.entities.CMSReferral.create(refData);
            importedCount++;
          } else {
            await base44.entities.CMSReferral.update(existingRef[0].id, refData);
            updatedCount++;
          }
        } catch (error) {
          console.error('Failed to import referral', error);
        }
      }
    } else if (importType === 'cms_part_d') {
      for (const row of data) {
        try {
          const existingProvider = await base44.entities.Provider.filter({ npi: row.npi });
          if (existingProvider.length === 0) {
            await base44.entities.Provider.create({
              npi: row.npi,
              status: 'Active',
              needs_nppes_enrichment: true,
            });
          }
          importedCount++;
        } catch (error) {
          console.error('Failed to import Part D data', error);
        }
      }
    } else if (importType === 'pa_home_health' || importType === 'hospice_providers') {
      for (const row of data) {
        try {
          const existing = await base44.entities.Provider.filter({ npi: row.npi });
          const providerData = {
            npi: row.npi,
            entity_type: 'Organization',
            organization_name: row['Agency Name'] || row['Provider Name'],
            status: 'Active',
            last_update_date: new Date().toISOString(),
          };

          if (existing.length === 0) {
            await base44.entities.Provider.create(providerData);
            importedCount++;
          } else {
            await base44.entities.Provider.update(existing[0].id, providerData);
            updatedCount++;
          }

          // Add location if available
          if (row['City'] && row['State']) {
            const existingLoc = await base44.entities.ProviderLocation.filter({ npi: row.npi });
            const locationData = {
              npi: row.npi,
              location_type: 'Practice',
              is_primary: true,
              city: row['City'],
              state: row['State'],
            };

            if (existingLoc.length === 0) {
              await base44.entities.ProviderLocation.create(locationData);
            }
          }
        } catch (error) {
          console.error('Failed to import provider', error);
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
    setCsvColumns([]);
    setColumnMapping({});
    setCurrentBatch(null);
    setDryRun(true);
  };

  const isMappingComplete = selectedType?.requiredColumns.every(col => columnMapping[col]);

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Data Imports</h1>
          <p className="text-gray-600 mt-1">Upload and validate NPPES and CMS datasets</p>
        </div>
        {step !== 'select' && (
          <Button variant="outline" onClick={handleReset}>
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
                    <div key={batch.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">{batch.file_name}</p>
                        <p className="text-sm text-gray-600">
                          {batch.import_type?.replace(/_/g, ' ')} • {batch.valid_rows} valid rows
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">
                          {new Date(batch.created_date).toLocaleDateString()}
                        </p>
                        {batch.dry_run && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Dry Run</span>
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
            <div className="space-y-2">
              <Label>Upload CSV File</Label>
              <Input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
              />
            </div>
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
                  <p className="text-sm text-gray-600">Validate only, don't import data</p>
                </div>
                <Switch checked={dryRun} onCheckedChange={setDryRun} />
              </div>

              <Button
                onClick={handleValidate}
                disabled={!isMappingComplete || processing}
                className="w-full bg-teal-600 hover:bg-teal-700"
              >
                <Upload className="w-4 h-4 mr-2" />
                {processing ? 'Processing...' : dryRun ? 'Validate Data' : 'Import Data'}
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
    </div>
  );
}