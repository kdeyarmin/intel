import React, { useState, useMemo, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings, Activity, History, CheckCircle2, AlertCircle, Loader2, Plus } from 'lucide-react';
import ImportTypeSelector from '../components/imports/ImportTypeSelector';
import FileParser from '../components/imports/FileParser';
import ColumnMapper from '../components/imports/ColumnMapper';
import ValidationResults from '../components/imports/ValidationResults';
import LiveProgressCard from '../components/imports/LiveProgressCard';
import SystemStatusPanel from '../components/imports/SystemStatusPanel';
import NewImportDialog from '../components/imports/NewImportDialog';
import { generateAIMapping, saveLearnedMapping, OPTIONAL_COLUMNS } from '../components/imports/columnMappingAI';

// CSV Parser (copied from DataImports for consistency)
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

export default function ImportHub() {
  const [activeTab, setActiveTab] = useState('workflow');
  const [workflowStep, setWorkflowStep] = useState('select'); // select -> upload -> map -> validate -> complete
  const [selectedType, setSelectedType] = useState(null);
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [csvColumns, setCsvColumns] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [dryRun, setDryRun] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [mappingConfidence, setMappingConfidence] = useState({});
  const [optionalColumns, setOptionalColumns] = useState([]);
  const [aiMappingLoading, setAiMappingLoading] = useState(false);

  const queryClient = useQueryClient();

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['importHubBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 50),
    refetchInterval: 10000,
  });

  // Live subscription
  useEffect(() => {
    const unsubscribe = base44.entities.ImportBatch.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['importHubBatches'] });
    });
    return unsubscribe;
  }, [queryClient]);

  const stats = useMemo(() => ({
    active: batches.filter(b => b.status === 'processing' || b.status === 'validating').length,
    completed: batches.filter(b => b.status === 'completed').length,
    failed: batches.filter(b => b.status === 'failed').length,
  }), [batches]);

  const handleFileParsed = async ({ headers, file: parsedFile, file_url, parseMode }) => {
    setFile(parsedFile);
    setFileUrl(file_url);
    setCsvColumns(headers);
    setWorkflowStep('map');

    setAiMappingLoading(true);
    try {
      const { mapping: aiMapping, confidence, optionalColumns: optCols } = await generateAIMapping(
        headers,
        selectedType.requiredColumns,
        selectedType.id,
        selectedType.name
      );
      setColumnMapping(aiMapping);
      setMappingConfidence(confidence);
      setOptionalColumns(optCols);
    } catch (err) {
      console.error('AI mapping failed:', err);
      const autoMapping = {};
      const normalizedHeaders = headers.map((h) => ({ original: h, normalized: h.toLowerCase().trim() }));
      selectedType.requiredColumns.forEach(requiredCol => {
        const match = normalizedHeaders.find(h => h.normalized === requiredCol.toLowerCase().trim());
        if (match) autoMapping[requiredCol] = match.original;
      });
      setColumnMapping(autoMapping);
      setOptionalColumns(OPTIONAL_COLUMNS[selectedType.id] || []);
    } finally {
      setAiMappingLoading(false);
    }
  };

  const getNPIFromRow = (row) => {
    const npiRequiredCol = selectedType.requiredColumns.find(c => c.toUpperCase() === 'NPI' || c === 'Rndrng_NPI');
    if (npiRequiredCol && columnMapping[npiRequiredCol]) {
      const val = row[columnMapping[npiRequiredCol]];
      if (val) return String(val).trim();
    }
    for (const key of ['NPI', 'npi', 'Npi', 'Rndrng_NPI', 'rndrng_npi']) {
      if (row[key]) return String(row[key]).trim();
    }
    return null;
  };

  const validateNPI = (npi) => {
    if (!npi) return false;
    const cleaned = String(npi).replace(/\D/g, '');
    return cleaned.length === 10;
  };

  const handleValidate = async () => {
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
        dry_run: dryRun,
        column_mapping: columnMapping,
      });

      setProcessingStatus('Downloading and parsing file...');
      const response = await fetch(fileUrl);
      const text = await response.text();
      const lines = text.split('\n').filter(l => l.trim());

      if (lines.length < 2) {
        await base44.entities.ImportBatch.update(batch.id, { status: 'failed' });
        setCurrentBatch(batch);
        setWorkflowStep('complete');
        return;
      }

      const headers = parseCSVLine(lines[0]);
      let validRows = 0, invalidRows = 0, duplicateRows = 0;
      const errorSamples = [];
      const npiBasedTypes = ['nppes_monthly', 'cms_utilization', 'cms_part_d', 'cms_order_referring', 'pa_home_health', 'hospice_providers', 'provider_service_utilization'];
      const requiresNPI = npiBasedTypes.includes(selectedType.id);
      const seenNPIs = new Set();

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 2) continue;

        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx] || ''; });

        const npi = getNPIFromRow(row);
        if (requiresNPI && !validateNPI(npi)) {
          invalidRows++;
          if (errorSamples.length < 10) {
            errorSamples.push({ row: i + 1, npi: npi || 'missing', message: 'Invalid NPI' });
          }
        } else if (requiresNPI && seenNPIs.has(npi)) {
          duplicateRows++;
        } else {
          if (npi) seenNPIs.add(npi);
          validRows++;
        }
      }

      await base44.entities.ImportBatch.update(batch.id, {
        status: dryRun ? 'completed' : 'processing',
        total_rows: lines.length - 1,
        valid_rows: validRows,
        invalid_rows: invalidRows,
        duplicate_rows: duplicateRows,
        error_samples: errorSamples,
      });

      if (!dryRun && validRows > 0) {
        setProcessingStatus(`Processing ${validRows} records...`);
        await base44.functions.invoke('triggerImport', {
          import_type: selectedType.id,
          file_url: fileUrl,
          dry_run: false,
        });
      }

      await base44.entities.AuditEvent.create({
        event_type: 'import',
        user_email: user.email,
        details: { action: dryRun ? 'Dry Run' : 'Import', entity: selectedType.id, row_count: validRows, file_name: file.name },
      });

      const updated = await base44.entities.ImportBatch.get(batch.id);
      setCurrentBatch(updated);
      setWorkflowStep('complete');
      queryClient.invalidateQueries();
    } catch (error) {
      console.error('Import failed:', error);
      alert('Import failed: ' + error.message);
    } finally {
      setProcessing(false);
      setProcessingStatus('');
    }
  };

  const resetWorkflow = () => {
    setWorkflowStep('select');
    setSelectedType(null);
    setFile(null);
    setFileUrl(null);
    setCsvColumns([]);
    setColumnMapping({});
    setCurrentBatch(null);
    setDryRun(false);
    setMappingConfidence({});
    setOptionalColumns([]);
  };

  const isMappingComplete = selectedType?.requiredColumns.every(col => columnMapping[col]);

  const runningBatches = batches.filter(b => b.status === 'processing' || b.status === 'validating');
  const recentBatches = batches.slice(0, 10);

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Data Import Hub</h1>
          <p className="text-slate-400 mt-1">Upload, validate, and import data in one unified workflow</p>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Active</p>
                <p className="text-2xl font-bold text-blue-400">{stats.active}</p>
              </div>
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Completed</p>
                <p className="text-2xl font-bold text-green-400">{stats.completed}</p>
              </div>
              <CheckCircle2 className="w-6 h-6 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">Failed</p>
                <p className="text-2xl font-bold text-red-400">{stats.failed}</p>
              </div>
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800/50">
          <TabsTrigger value="workflow" className="gap-2">
            <Upload className="w-4 h-4" />
            Import Workflow
          </TabsTrigger>
          <TabsTrigger value="monitor" className="gap-2">
            <Activity className="w-4 h-4" />
            Monitor
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="w-4 h-4" />
            History
          </TabsTrigger>
        </TabsList>

        {/* Workflow Tab */}
        <TabsContent value="workflow" className="space-y-4">
          {workflowStep === 'select' && (
            <div className="space-y-4">
              <ImportTypeSelector onSelect={(type) => {
                setSelectedType(type);
                setWorkflowStep('upload');
              }} />
            </div>
          )}

          {workflowStep === 'upload' && (
            <Card>
              <CardHeader>
                <CardTitle>{selectedType?.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <FileParser onParsed={handleFileParsed} selectedType={selectedType} />
              </CardContent>
            </Card>
          )}

          {workflowStep === 'map' && (
            <div className="space-y-4">
              <ColumnMapper
                csvColumns={csvColumns}
                requiredColumns={selectedType?.requiredColumns || []}
                optionalColumns={optionalColumns}
                mapping={columnMapping}
                confidence={mappingConfidence}
                onChange={setColumnMapping}
                onFieldCorrected={(field, col) => {
                  if (selectedType) saveLearnedMapping(selectedType.id, field, col);
                }}
                aiLoading={aiMappingLoading}
              />

              <Card>
                <CardContent className="pt-6 space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dryRun}
                      onChange={(e) => setDryRun(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-600"
                    />
                    <div>
                      <p className="font-medium text-slate-200">Dry Run Mode</p>
                      <p className="text-sm text-slate-400">Validate only, don't import data</p>
                    </div>
                  </label>

                  {processing && (
                    <div className="p-4 bg-cyan-900/30 rounded border border-cyan-700/50">
                      <div className="flex items-center gap-2 text-cyan-200">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">{processingStatus}</span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button
                      onClick={() => setWorkflowStep('select')}
                      variant="outline"
                      disabled={processing}
                      className="bg-transparent border-slate-700"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleValidate}
                      disabled={!isMappingComplete || processing}
                      className="flex-1 bg-cyan-600 hover:bg-cyan-700"
                    >
                      {processing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                      {dryRun ? 'Validate Data' : 'Import Data'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {workflowStep === 'complete' && currentBatch && (
            <div className="space-y-4">
              <ValidationResults batch={currentBatch} />
              <Button onClick={resetWorkflow} className="w-full">Start New Import</Button>
            </div>
          )}
        </TabsContent>

        {/* Monitor Tab */}
        <TabsContent value="monitor" className="space-y-4">
          <SystemStatusPanel batches={batches} />
          {runningBatches.length > 0 && <LiveProgressCard activeBatches={runningBatches} />}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Recent Imports</CardTitle>
            </CardHeader>
            <CardContent>
              {recentBatches.length === 0 ? (
                <p className="text-slate-400 text-center py-8">No import history yet</p>
              ) : (
                <div className="space-y-2">
                  {recentBatches.map(batch => (
                    <div key={batch.id} className="flex items-center justify-between p-3 border border-slate-700/50 rounded-lg hover:bg-slate-800/30">
                      <div>
                        <p className="font-medium text-slate-200">{batch.file_name}</p>
                        <p className="text-sm text-slate-400">{batch.import_type?.replace(/_/g, ' ')}</p>
                      </div>
                      <Badge variant={batch.status === 'completed' ? 'default' : batch.status === 'failed' ? 'destructive' : 'outline'}>
                        {batch.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}