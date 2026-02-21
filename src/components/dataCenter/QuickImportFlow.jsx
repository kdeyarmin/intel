import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Upload, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import FileParser from '../imports/FileParser';
import ColumnMapper from '../imports/ColumnMapper';
import { generateAIMapping, saveLearnedMapping, OPTIONAL_COLUMNS } from '../imports/columnMappingAI';

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else current += ch;
  }
  result.push(current.trim());
  return result;
}

export default function QuickImportFlow({ category, onClose, onComplete }) {
  const [selectedType, setSelectedType] = useState(category.types.length === 1 ? category.types[0] : null);
  const [step, setStep] = useState(category.types.length === 1 ? 'upload' : 'pickType');
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [csvColumns, setCsvColumns] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [mappingConfidence, setMappingConfidence] = useState({});
  const [optionalColumns, setOptionalColumns] = useState([]);
  const [aiMappingLoading, setAiMappingLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [result, setResult] = useState(null);

  const queryClient = useQueryClient();

  const handleSelectType = (type) => {
    setSelectedType(type);
    if (type.id === 'nppes_registry') {
      // Redirect to NPPES search page
      window.location.href = '/NPPESImport';
      return;
    }
    if (type.requiredColumns.length === 0) {
      // Auto-import types (medicare stats) — use triggerImport directly
      setStep('autoImport');
    } else {
      setStep('upload');
    }
  };

  const handleFileParsed = async ({ headers, file: parsedFile, file_url }) => {
    setFile(parsedFile);
    setFileUrl(file_url);
    setCsvColumns(headers);
    setStep('map');

    setAiMappingLoading(true);
    try {
      const { mapping, confidence, optionalColumns: optCols } = await generateAIMapping(
        headers, selectedType.requiredColumns, selectedType.id, selectedType.name
      );
      setColumnMapping(mapping);
      setMappingConfidence(confidence);
      setOptionalColumns(optCols);
    } catch {
      const autoMapping = {};
      const normalizedHeaders = headers.map(h => ({ original: h, normalized: h.toLowerCase().trim() }));
      selectedType.requiredColumns.forEach(col => {
        const match = normalizedHeaders.find(h => h.normalized === col.toLowerCase().trim());
        if (match) autoMapping[col] = match.original;
      });
      setColumnMapping(autoMapping);
      setOptionalColumns(OPTIONAL_COLUMNS[selectedType.id] || []);
    } finally {
      setAiMappingLoading(false);
    }
  };

  const handleAutoImport = async () => {
    setProcessing(true);
    setProcessingStatus('Starting import...');
    try {
      const res = await base44.functions.invoke('triggerImport', {
        import_type: selectedType.id,
        dry_run: false,
      });
      setResult({ success: true, data: res.data });
      setStep('done');
      toast.success('Import started successfully');
      queryClient.invalidateQueries();
    } catch (err) {
      setResult({ success: false, error: err.message });
      setStep('done');
      toast.error('Import failed');
    } finally {
      setProcessing(false);
    }
  };

  const getNPIFromRow = (row) => {
    const npiCol = selectedType.requiredColumns.find(c => c.toUpperCase() === 'NPI' || c === 'Rndrng_NPI');
    if (npiCol && columnMapping[npiCol]) {
      const val = row[columnMapping[npiCol]];
      if (val) return String(val).trim();
    }
    for (const key of ['NPI', 'npi', 'Npi', 'Rndrng_NPI']) {
      if (row[key]) return String(row[key]).trim();
    }
    return null;
  };

  const handleImport = async () => {
    if (!file || !fileUrl) return;
    setProcessing(true);
    setProcessingStatus('Creating batch...');

    try {
      const user = await base44.auth.me();
      const batch = await base44.entities.ImportBatch.create({
        import_type: selectedType.id,
        file_name: file.name,
        file_url: fileUrl,
        status: 'validating',
        column_mapping: columnMapping,
      });

      setProcessingStatus('Parsing file...');
      const response = await fetch(fileUrl);
      const text = await response.text();
      const lines = text.split('\n').filter(l => l.trim());

      if (lines.length < 2) {
        await base44.entities.ImportBatch.update(batch.id, { status: 'failed' });
        setResult({ success: false, error: 'File has no data rows' });
        setStep('done');
        return;
      }

      const headers = parseCSVLine(lines[0]);
      let validRows = 0, invalidRows = 0, duplicateRows = 0;
      const npiTypes = ['nppes_monthly', 'cms_utilization', 'cms_part_d', 'cms_order_referring', 'pa_home_health', 'hospice_providers', 'provider_service_utilization'];
      const requiresNPI = npiTypes.includes(selectedType.id);
      const seenNPIs = new Set();

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 2) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
        const npi = getNPIFromRow(row);
        if (requiresNPI && (!npi || String(npi).replace(/\D/g, '').length !== 10)) {
          invalidRows++;
        } else if (requiresNPI && seenNPIs.has(npi)) {
          duplicateRows++;
        } else {
          if (npi) seenNPIs.add(npi);
          validRows++;
        }
      }

      await base44.entities.ImportBatch.update(batch.id, {
        status: 'processing',
        total_rows: lines.length - 1,
        valid_rows: validRows,
        invalid_rows: invalidRows,
        duplicate_rows: duplicateRows,
      });

      setProcessingStatus(`Importing ${validRows} records...`);
      await base44.functions.invoke('triggerImport', {
        import_type: selectedType.id,
        file_url: fileUrl,
        dry_run: false,
      });

      await base44.entities.AuditEvent.create({
        event_type: 'import',
        user_email: user.email,
        details: { action: 'Import', entity: selectedType.id, row_count: validRows, file_name: file.name },
      });

      setResult({ success: true, totalRows: lines.length - 1, validRows, invalidRows, duplicateRows, batchId: batch.id });
      setStep('done');
      toast.success(`Imported ${validRows} records`);
      queryClient.invalidateQueries();
    } catch (error) {
      setResult({ success: false, error: error.message });
      setStep('done');
      toast.error('Import failed: ' + error.message);
    } finally {
      setProcessing(false);
      setProcessingStatus('');
    }
  };

  const isMappingComplete = selectedType?.requiredColumns?.every(col => columnMapping[col]);

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {step !== 'pickType' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  if (step === 'upload') setStep(category.types.length === 1 ? 'pickType' : 'pickType');
                  else if (step === 'map') setStep('upload');
                  else onClose();
                }}
                className="h-8 w-8 text-slate-400 hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <CardTitle className="text-lg text-slate-200">
              {step === 'pickType' ? `Import ${category.label}` : selectedType?.name || 'Import'}
            </CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-slate-500 hover:text-white">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Pick Type */}
        {step === 'pickType' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {category.types.map(type => (
              <button
                key={type.id}
                onClick={() => handleSelectType(type)}
                className="text-left p-3 rounded-lg border border-slate-700/40 hover:border-cyan-500/30 hover:bg-slate-800/30 transition-all"
              >
                <p className="text-sm font-medium text-slate-200">{type.name}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{type.description}</p>
              </button>
            ))}
          </div>
        )}

        {/* Upload */}
        {step === 'upload' && (
          <FileParser onParsed={handleFileParsed} selectedType={selectedType} />
        )}

        {/* Auto Import (Medicare Stats) */}
        {step === 'autoImport' && (
          <div className="text-center py-8 space-y-4">
            <p className="text-sm text-slate-400">
              This dataset will be imported automatically from CMS.
            </p>
            <Button
              onClick={handleAutoImport}
              disabled={processing}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              {processing ? processingStatus : 'Start Import'}
            </Button>
          </div>
        )}

        {/* Column Mapping */}
        {step === 'map' && (
          <div className="space-y-4">
            <ColumnMapper
              csvColumns={csvColumns}
              requiredColumns={selectedType?.requiredColumns || []}
              optionalColumns={optionalColumns}
              mapping={columnMapping}
              confidence={mappingConfidence}
              onChange={setColumnMapping}
              onFieldCorrected={(field, col) => { if (selectedType) saveLearnedMapping(selectedType.id, field, col); }}
              aiLoading={aiMappingLoading}
            />

            {processing && (
              <div className="p-3 bg-cyan-900/20 rounded-lg border border-cyan-700/30">
                <div className="flex items-center gap-2 text-cyan-300 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {processingStatus}
                </div>
              </div>
            )}

            <Button
              onClick={handleImport}
              disabled={!isMappingComplete || processing}
              className="w-full bg-cyan-600 hover:bg-cyan-700"
            >
              {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Import Data
            </Button>
          </div>
        )}

        {/* Done */}
        {step === 'done' && result && (
          <div className="text-center py-6 space-y-4">
            {result.success ? (
              <>
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <div>
                  <h3 className="text-lg font-semibold text-emerald-400">Import Complete</h3>
                  {result.validRows != null && (
                    <div className="flex justify-center gap-4 mt-3 text-sm">
                      <span className="text-slate-400">Total: <span className="text-white font-medium">{result.totalRows?.toLocaleString()}</span></span>
                      <span className="text-emerald-400">Valid: {result.validRows?.toLocaleString()}</span>
                      {result.invalidRows > 0 && <span className="text-red-400">Invalid: {result.invalidRows}</span>}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
                <div>
                  <h3 className="text-lg font-semibold text-red-400">Import Failed</h3>
                  <p className="text-sm text-slate-400 mt-1">{result.error}</p>
                </div>
              </>
            )}
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={onClose} className="bg-transparent border-slate-700 text-slate-300">
                Done
              </Button>
              <Button onClick={() => { setStep('pickType'); setSelectedType(null); setResult(null); setFile(null); }} className="bg-cyan-600 hover:bg-cyan-700">
                Import Another
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}