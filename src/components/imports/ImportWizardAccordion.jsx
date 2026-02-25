import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  ChevronDown, ChevronUp, CheckCircle2, Circle, Upload, Loader2,
  FileText, AlertCircle, XCircle, RotateCcw, Sparkles
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import FileParser from './FileParser';
import ColumnMapper from './ColumnMapper';
import { generateAIMapping, saveLearnedMapping, OPTIONAL_COLUMNS } from './columnMappingAI';
import AIBatchCategorizer from './AIBatchCategorizer';
import AICleaningSuggestions from './AICleaningSuggestions';
import NPPESFlatFileHelper from './NPPESFlatFileHelper';

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

// Step states
const STEP_PENDING = 'pending';
const STEP_ACTIVE = 'active';
const STEP_DONE = 'done';
const STEP_ERROR = 'error';

function StepHeader({ number, title, subtitle, status, expanded, onClick, badge }) {
  const icons = {
    [STEP_PENDING]: <Circle className="w-5 h-5 text-slate-500" />,
    [STEP_ACTIVE]: <div className="w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center text-[10px] font-bold text-white">{number}</div>,
    [STEP_DONE]: <CheckCircle2 className="w-5 h-5 text-emerald-400" />,
    [STEP_ERROR]: <XCircle className="w-5 h-5 text-red-400" />,
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between p-4 text-left transition-colors rounded-t-lg ${
        expanded ? 'bg-slate-800/60' : 'hover:bg-slate-800/30'
      } ${status === STEP_PENDING ? 'opacity-50' : ''}`}
      disabled={status === STEP_PENDING}
    >
      <div className="flex items-center gap-3">
        {icons[status]}
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-200">{title}</span>
            {badge}
          </div>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {status !== STEP_PENDING && (
        expanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />
      )}
    </button>
  );
}

export default function ImportWizardAccordion({ selectedType, onReset, onComplete, compact = false }) {
  // Step tracking
  const [fileStep, setFileStep] = useState(STEP_ACTIVE);
  const [mapStep, setMapStep] = useState(STEP_PENDING);
  const [importStep, setImportStep] = useState(STEP_PENDING);

  // Expanded sections
  const [fileExpanded, setFileExpanded] = useState(true);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [importExpanded, setImportExpanded] = useState(false);

  // File state
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [csvColumns, setCsvColumns] = useState([]);

  // Mapping state
  const [columnMapping, setColumnMapping] = useState({});
  const [mappingConfidence, setMappingConfidence] = useState({});
  const [mappingScores, setMappingScores] = useState({});
  const [optionalColumns, setOptionalColumns] = useState([]);
  const [aiMappingLoading, setAiMappingLoading] = useState(false);

  // AI categorization
  const [aiCategory, setAiCategory] = useState(null);

  // Import state
  const [dryRun, setDryRun] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [result, setResult] = useState(null);

  const queryClient = useQueryClient();

  const isMappingComplete = selectedType?.requiredColumns?.every(col => columnMapping[col]);

  // When file is parsed, auto-expand mapping and run AI
  const handleFileParsed = async ({ headers, file: parsedFile, file_url }) => {
    setFile(parsedFile);
    setFileUrl(file_url);
    setCsvColumns(headers);

    setFileStep(STEP_DONE);
    setMapStep(STEP_ACTIVE);
    setFileExpanded(false);
    setMapExpanded(true);

    // Run AI mapping
    setAiMappingLoading(true);
    try {
      const { mapping, confidence, scores, optionalColumns: optCols } = await generateAIMapping(
        headers, selectedType.requiredColumns, selectedType.id, selectedType.name
      );
      setColumnMapping(mapping);
      setMappingConfidence(confidence);
      setMappingScores(scores || {});
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

  // Auto-transition when mapping completes
  useEffect(() => {
    if (isMappingComplete && mapStep === STEP_ACTIVE && !aiMappingLoading) {
      setImportStep(STEP_ACTIVE);
    }
  }, [isMappingComplete, mapStep, aiMappingLoading]);

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

  // Track live batch for real-time updates
  const [liveBatchId, setLiveBatchId] = useState(null);
  const [liveStatus, setLiveStatus] = useState(null);

  // Subscribe to batch updates for real-time progress
  useEffect(() => {
    if (!liveBatchId) return;
    const unsub = base44.entities.ImportBatch.subscribe((event) => {
      if (event.id === liveBatchId && event.data) {
        setLiveStatus(event.data);
        if (event.data.status === 'completed' || event.data.status === 'failed') {
          const d = event.data;
          const success = d.status === 'completed';
          setResult({
            success,
            totalRows: d.total_rows || 0,
            validRows: d.valid_rows || 0,
            invalidRows: d.invalid_rows || 0,
            duplicateRows: d.duplicate_rows || 0,
            importedRows: d.imported_rows || 0,
            updatedRows: d.updated_rows || 0,
            skippedRows: d.skipped_rows || 0,
            batchId: liveBatchId,
            dryRun: d.dry_run,
            errorSamples: d.error_samples || [],
            error: success ? null : (d.error_samples?.[0]?.message || 'Import failed'),
          });
          setImportStep(success ? STEP_DONE : STEP_ERROR);
          setProcessing(false);
          setProcessingStatus('');
          if (success) toast.success(`Imported ${(d.imported_rows || 0).toLocaleString()} records`);
          queryClient.invalidateQueries();
          if (success && onComplete) onComplete();
        }
      }
    });
    return unsub;
  }, [liveBatchId]);

  const handleImport = async () => {
    if (!file || !fileUrl) return;
    setProcessing(true);
    setImportStep(STEP_ACTIVE);
    setMapStep(STEP_DONE);
    setMapExpanded(false);
    setImportExpanded(true);
    setProcessingStatus('Creating batch...');

    try {
      const user = await base44.auth.me();
      const batch = await base44.entities.ImportBatch.create({
        import_type: selectedType.id,
        file_name: file.name,
        file_url: fileUrl,
        status: 'validating',
        dry_run: dryRun,
        column_mapping: columnMapping,
        ...(aiCategory ? { category: aiCategory.category } : {}),
      });

      setLiveBatchId(batch.id);
      setProcessingStatus('Validating file in background...');

      // Fire validation + import in background — don't await
      base44.functions.invoke('triggerImport', {
        import_type: selectedType.id,
        file_url: fileUrl,
        dry_run: dryRun,
        batch_id: batch.id,
      }).catch((err) => {
        // If the background call itself fails, show error
        setResult({ success: false, error: err.message });
        setImportStep(STEP_ERROR);
        setProcessing(false);
        setProcessingStatus('');
        toast.error('Import failed: ' + err.message);
      });

      await base44.entities.AuditEvent.create({
        event_type: 'import',
        user_email: user.email,
        details: { action: dryRun ? 'Dry Run' : 'Import', entity: selectedType.id, file_name: file.name },
      });

      setProcessingStatus('Processing in background — you can navigate away');
    } catch (error) {
      setResult({ success: false, error: error.message });
      setImportStep(STEP_ERROR);
      setProcessing(false);
      setProcessingStatus('');
      toast.error('Import failed: ' + error.message);
    }
  };

  const mappedCount = Object.keys(columnMapping).length;
  const requiredMapped = selectedType?.requiredColumns?.filter(c => columnMapping[c]).length || 0;
  const requiredTotal = selectedType?.requiredColumns?.length || 0;
  const downloadUrl = selectedType?.downloadUrl;

  return (
    <div className="space-y-2">
      {selectedType?.id === 'nppes_monthly' && (
        <NPPESFlatFileHelper />
      )}
      {/* STEP 1: File Upload */}
      <Card className="border-slate-700/50 overflow-hidden">
        <StepHeader
          number={1}
          title="Upload File"
          subtitle={
            fileStep === STEP_DONE 
              ? file?.name 
              : downloadUrl ? (
                <span className="flex items-center gap-1 text-slate-500">
                  Upload CSV, Excel, or JSON file. <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline" onClick={e => e.stopPropagation()}>Download source data here.</a>
                </span>
              ) : 'Upload CSV, Excel, or JSON file'
          }
          status={fileStep}
          expanded={fileExpanded}
          onClick={() => fileStep !== STEP_PENDING && setFileExpanded(!fileExpanded)}
          badge={fileStep === STEP_DONE && (
            <Badge variant="outline" className="text-[10px] bg-emerald-900/30 text-emerald-300 border-emerald-700">
              {csvColumns.length} columns detected
            </Badge>
          )}
        />
        {fileExpanded && (
          <CardContent className="pt-0 pb-4 px-4">
            <div className="pl-8 space-y-3">
              <FileParser onParsed={handleFileParsed} selectedType={selectedType} />
              {file && csvColumns.length > 0 && (
                <AIBatchCategorizer
                  fileName={file.name}
                  fileHeaders={csvColumns}
                  onSuggestionApplied={(suggestion) => setAiCategory(suggestion)}
                />
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* STEP 2: Column Mapping */}
      <Card className="border-slate-700/50 overflow-hidden">
        <StepHeader
          number={2}
          title="Column Mapping"
          subtitle={mapStep === STEP_PENDING ? 'Upload a file first' : `${requiredMapped}/${requiredTotal} required fields mapped`}
          status={mapStep}
          expanded={mapExpanded}
          onClick={() => mapStep !== STEP_PENDING && setMapExpanded(!mapExpanded)}
          badge={
            mapStep !== STEP_PENDING && !aiMappingLoading && isMappingComplete ? (
              <Badge variant="outline" className="text-[10px] bg-emerald-900/30 text-emerald-300 border-emerald-700">
                <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Ready
              </Badge>
            ) : aiMappingLoading ? (
              <Badge variant="outline" className="text-[10px] bg-cyan-900/30 text-cyan-300 border-cyan-700 animate-pulse">
                <Sparkles className="w-2.5 h-2.5 mr-1" /> AI mapping...
              </Badge>
            ) : null
          }
        />
        {mapExpanded && mapStep !== STEP_PENDING && (
          <CardContent className="pt-0 pb-4 px-4">
            <ColumnMapper
              csvColumns={csvColumns}
              requiredColumns={selectedType?.requiredColumns || []}
              optionalColumns={optionalColumns}
              mapping={columnMapping}
              confidence={mappingConfidence}
              scores={mappingScores}
              onChange={setColumnMapping}
              onFieldCorrected={(field, col) => {
                if (selectedType) saveLearnedMapping(selectedType.id, field, col);
              }}
              aiLoading={aiMappingLoading}
            />
          </CardContent>
        )}
      </Card>

      {/* STEP 3: Import */}
      <Card className="border-slate-700/50 overflow-hidden">
        <StepHeader
          number={3}
          title="Validate & Import"
          subtitle={
            importStep === STEP_PENDING
              ? 'Complete column mapping first'
              : importStep === STEP_DONE
              ? (result?.success ? `${result.validRows?.toLocaleString()} records processed` : 'Import failed')
              : 'Ready to import'
          }
          status={importStep}
          expanded={importExpanded}
          onClick={() => importStep !== STEP_PENDING && setImportExpanded(!importExpanded)}
          badge={result?.success && (
            <Badge variant="outline" className="text-[10px] bg-emerald-900/30 text-emerald-300 border-emerald-700">
              <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Complete
            </Badge>
          )}
        />
        {importExpanded && importStep !== STEP_PENDING && (
          <CardContent className="pt-0 pb-4 px-4">
            <div className="pl-8 space-y-4">
              {/* Import options — show before import starts */}
              {!result && (
                <>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
                    <div>
                      <Label className="text-sm">Dry Run Mode</Label>
                      <p className="text-xs text-slate-500">Validate only — don't write data</p>
                    </div>
                    <Switch checked={dryRun} onCheckedChange={setDryRun} disabled={processing} />
                  </div>

                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
                      <p className="text-lg font-bold text-slate-200">{csvColumns.length}</p>
                      <p className="text-[11px] text-slate-500">Columns</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
                      <p className="text-lg font-bold text-cyan-400">{mappedCount}</p>
                      <p className="text-[11px] text-slate-500">Mapped</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
                      <p className="text-lg font-bold text-emerald-400">{requiredMapped}/{requiredTotal}</p>
                      <p className="text-[11px] text-slate-500">Required</p>
                    </div>
                  </div>

                  {processing && (
                    <div className="p-3 bg-cyan-900/20 rounded-lg border border-cyan-700/30 space-y-2">
                      <div className="flex items-center gap-2 text-cyan-300 text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {processingStatus}
                      </div>
                      {liveStatus ? (
                        <>
                          <Progress
                            value={
                              liveStatus.total_rows > 0
                                ? Math.round(((liveStatus.imported_rows || 0) + (liveStatus.updated_rows || 0) + (liveStatus.skipped_rows || 0)) / liveStatus.total_rows * 100)
                                : liveStatus.status === 'validating' ? 20 : 50
                            }
                            className="h-1.5"
                          />
                          <div className="flex gap-4 text-[10px] text-slate-400">
                            {liveStatus.total_rows > 0 && <span>Total: {liveStatus.total_rows.toLocaleString()}</span>}
                            {liveStatus.valid_rows > 0 && <span className="text-emerald-400">Valid: {liveStatus.valid_rows.toLocaleString()}</span>}
                            {liveStatus.imported_rows > 0 && <span className="text-blue-400">Imported: {liveStatus.imported_rows.toLocaleString()}</span>}
                            {liveStatus.invalid_rows > 0 && <span className="text-red-400">Invalid: {liveStatus.invalid_rows.toLocaleString()}</span>}
                          </div>
                        </>
                      ) : (
                        <Progress value={15} className="h-1.5" />
                      )}
                      <p className="text-[10px] text-slate-500">Processing runs in the background — feel free to navigate away</p>
                    </div>
                  )}

                  <Button
                    onClick={handleImport}
                    disabled={!isMappingComplete || processing}
                    className="w-full bg-cyan-600 hover:bg-cyan-700"
                  >
                    {processing ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</>
                    ) : (
                      <><Upload className="w-4 h-4 mr-2" /> {dryRun ? 'Validate Data' : 'Import Data'}</>
                    )}
                  </Button>
                </>
              )}

              {/* Results */}
              {result && (
                <div className="space-y-4">
                  {result.success ? (
                    <>
                      <div className="flex items-center gap-3 p-3 bg-emerald-900/20 border border-emerald-700/30 rounded-lg">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-emerald-300">
                            {result.dryRun ? 'Validation Complete' : 'Import Complete'}
                          </p>
                          <p className="text-xs text-emerald-400/70 mt-0.5">
                            {result.validRows?.toLocaleString()} valid records
                            {result.invalidRows > 0 && `, ${result.invalidRows} invalid`}
                            {result.duplicateRows > 0 && `, ${result.duplicateRows} duplicates`}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <Stat label="Total" value={result.totalRows} color="text-slate-200" bg="bg-slate-800/40" />
                        <Stat label="Valid" value={result.validRows} color="text-emerald-400" bg="bg-emerald-900/20" />
                        <Stat label="Duplicates" value={result.duplicateRows || 0} color="text-yellow-400" bg="bg-yellow-900/20" />
                        <Stat label="Invalid" value={result.invalidRows || 0} color="text-red-400" bg="bg-red-900/20" />
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-3 p-3 bg-red-900/20 border border-red-700/30 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-red-300">Import Failed</p>
                        <p className="text-xs text-red-400/70 mt-0.5">{result.error}</p>
                      </div>
                    </div>
                  )}

                  {/* AI Cleaning Suggestions */}
                  <AICleaningSuggestions
                    importType={selectedType?.id}
                    fileName={file?.name}
                    invalidRows={result.invalidRows || 0}
                    duplicateRows={result.duplicateRows || 0}
                    totalRows={result.totalRows || 0}
                    errorSamples={result.errorSamples || []}
                  />

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={onReset} className="flex-1 bg-transparent border-slate-700 text-slate-300">
                      <RotateCcw className="w-4 h-4 mr-2" /> New Import
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, color, bg }) {
  return (
    <div className={`text-center p-2.5 rounded-lg border border-slate-700/30 ${bg}`}>
      <p className={`text-lg font-bold ${color}`}>{(value || 0).toLocaleString()}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}