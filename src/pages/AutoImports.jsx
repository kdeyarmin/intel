import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, Calendar, CheckCircle2, XCircle, Clock, AlertTriangle, PauseCircle, RefreshCw } from 'lucide-react';
import ValidationReport from '../components/imports/ValidationReport';

export default function AutoImports() {
  const [importType, setImportType] = useState('cms_order_referring');
  const [fileUrl, setFileUrl] = useState('');
  const [year, setYear] = useState('2023');
  const [dryRun, setDryRun] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [lastError, setLastError] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const queryClient = useQueryClient();

  const { data: automations = [] } = useQuery({
    queryKey: ['automations'],
    queryFn: async () => {
      const response = await fetch('/.well-known/base44/automations');
      return response.json();
    },
  });

  const { data: recentBatches = [] } = useQuery({
    queryKey: ['recentImports'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 20),
  });

  const handleImport = async () => {
    const zipTypes = ['medicare_hha_stats', 'medicare_ma_inpatient', 'medicare_part_d_stats', 'medicare_snf_stats'];
    const isZip = zipTypes.includes(importType);
    
    // Only require URL for non-zip, non-default types
    if (!isZip && !fileUrl) {
      alert('Please provide a file URL');
      return;
    }

    setProcessing(true);
    setLastError(null);
    setLastResult(null);
    try {
      const res = await base44.functions.invoke('triggerImport', {
        import_type: importType,
        file_url: fileUrl || undefined,
        year: parseInt(year),
        dry_run: dryRun,
      });
      const result = res.data?.result || res.data;

      // Check if result contains error info passed through from sub-function
      if (result?.error) {
        setLastError(result);
        queryClient.invalidateQueries(['recentImports']);
        return;
      }

      setLastResult(result);
      setFileUrl('');
      queryClient.invalidateQueries(['recentImports']);
    } catch (error) {
      // Extract detailed error from the response
      const errorData = error.response?.data || {};
      setLastError({
        error: errorData.error || error.message || 'Unknown error',
        error_phase: errorData.error_phase || 'unknown',
        retryable: errorData.retryable || false,
        batch_id: errorData.batch_id,
        error_samples: errorData.error_samples,
        hint: errorData.hint,
        import_type: importType,
      });
      queryClient.invalidateQueries(['recentImports']);
    } finally {
      setProcessing(false);
    }
  };

  const cmsAutomations = automations.filter(a => 
    a.function_name === 'autoImportCMSData'
  );

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Automated CMS Imports</h1>
        <p className="text-gray-600 mt-1">Schedule and manage automated data imports from CMS datasets</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Manual Import</CardTitle>
            <CardDescription>Import CMS data from a file URL</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Import Type</Label>
              <Select value={importType} onValueChange={setImportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cms_order_referring">CMS Order/Referring</SelectItem>
                  <SelectItem value="home_health_enrollments">Home Health Enrollments</SelectItem>
                  <SelectItem value="hospice_enrollments">Hospice Enrollments</SelectItem>
                  <SelectItem value="provider_service_utilization">Provider Service Utilization</SelectItem>
                  <SelectItem value="medicare_hha_stats">Medicare HHA Use & Payments</SelectItem>
                  <SelectItem value="medicare_ma_inpatient">Medicare Advantage Inpatient Hospital</SelectItem>
                  <SelectItem value="medicare_part_d_stats">Medicare Part D Use & Payments</SelectItem>
                  <SelectItem value="medicare_snf_stats">Medicare SNF Use & Payments</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>File URL {['medicare_hha_stats','medicare_ma_inpatient','medicare_part_d_stats','medicare_snf_stats','cms_order_referring','opt_out_physicians','home_health_enrollments','hospice_enrollments','provider_service_utilization'].includes(importType) ? '(optional — auto-detected)' : ''}</Label>
              <Input
                placeholder="Leave blank to use CMS default URL"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Data Year</Label>
              <Input
                type="number"
                placeholder="2023"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Dry Run Mode</Label>
                <p className="text-sm text-gray-600">Validate only, don't import</p>
              </div>
              <Switch checked={dryRun} onCheckedChange={setDryRun} />
            </div>

            <Button
              onClick={handleImport}
              disabled={processing}
              className="w-full bg-teal-600 hover:bg-teal-700"
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

            {/* Success result */}
            {lastResult && !lastError && (
              <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4 text-sm space-y-2">
                <div className="flex items-center gap-2 text-green-700 font-medium">
                  <CheckCircle2 className="w-4 h-4" />
                  {lastResult.status === 'paused' ? 'Partial Import (Timed Out)' : dryRun ? 'Validation Complete' : 'Import Complete'}
                </div>
                <div className="text-green-600 space-y-1">
                  {lastResult.total_records != null && <p>Total records: {lastResult.total_records?.toLocaleString()}</p>}
                  {lastResult.imported != null && <p>Imported: {lastResult.imported?.toLocaleString()}</p>}
                  {lastResult.records_in_range != null && lastResult.records_in_range !== lastResult.total_records && (
                    <p>Records in range: {lastResult.records_in_range?.toLocaleString()}</p>
                  )}
                  {lastResult.sheets_parsed?.length > 0 && (
                    <p>Sheets: {lastResult.sheets_parsed.map(s => `${s.table} (${s.rows} rows${s.errors ? `, ${s.errors} errors` : ''})`).join(', ')}</p>
                  )}
                  {lastResult.chunk_errors > 0 && (
                    <p className="text-amber-600">Chunk errors: {lastResult.chunk_errors} (some data may not have imported)</p>
                  )}
                  {lastResult.timed_out && (
                    <p className="text-amber-600 font-medium">
                      Timed out — resume from offset {lastResult.resume_offset} ({lastResult.remaining?.toLocaleString()} rows remaining)
                    </p>
                  )}
                </div>
                {lastResult.batch_id && <p className="text-xs text-green-500">Batch: {lastResult.batch_id}</p>}

                {/* Validation report */}
                <ValidationReport result={lastResult} />
              </div>
            )}

            {/* Error result */}
            {lastError && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm space-y-3">
                <div className="flex items-center gap-2 text-red-700 font-medium">
                  {lastError.retryable ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <XCircle className="w-4 h-4" />}
                  Import Failed {lastError.error_phase && lastError.error_phase !== 'unknown' ? `(${lastError.error_phase} phase)` : ''}
                </div>
                <p className="text-red-600">{lastError.error}</p>
                {lastError.hint && (
                  <p className="text-gray-600 bg-white rounded p-2 text-xs">{lastError.hint}</p>
                )}
                {lastError.retryable && (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300">Retryable</Badge>
                    <Button size="sm" variant="outline" onClick={handleImport} disabled={processing}>
                      <RefreshCw className="w-3 h-3 mr-1" /> Retry Now
                    </Button>
                  </div>
                )}
                {lastError.error_samples?.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-red-500 hover:text-red-700">
                      Error details ({lastError.error_samples.length} sample{lastError.error_samples.length > 1 ? 's' : ''})
                    </summary>
                    <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                      {lastError.error_samples.map((s, i) => (
                        <div key={i} className="bg-white rounded p-2 border border-red-100">
                          <span className="font-medium text-red-600">[{s.phase}]</span> {s.detail}
                          {s.chunk_start != null && <span className="text-gray-400 ml-1">(rows {s.chunk_start}-{s.chunk_start + (s.chunk_size || 50)})</span>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
                {lastError.batch_id && <p className="text-xs text-red-400">Batch: {lastError.batch_id}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scheduled Imports</CardTitle>
            <CardDescription>Automated import schedules</CardDescription>
          </CardHeader>
          <CardContent>
            {cmsAutomations.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No scheduled imports configured</p>
                <p className="text-sm mt-1">Configure schedules in Settings → Automations</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cmsAutomations.map((auto) => (
                  <div key={auto.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium">{auto.name}</p>
                      <p className="text-sm text-gray-600">{auto.description}</p>
                    </div>
                    <Badge variant={auto.is_active ? 'default' : 'outline'}>
                      {auto.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Imports</CardTitle>
        </CardHeader>
        <CardContent>
          {recentBatches.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No import history yet
            </div>
          ) : (
            <div className="space-y-2">
              {recentBatches.slice(0, 10).map((batch) => (
                <div key={batch.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {batch.status === 'completed' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : batch.status === 'failed' ? (
                      <XCircle className="w-5 h-5 text-red-600" />
                    ) : batch.status === 'paused' ? (
                      <PauseCircle className="w-5 h-5 text-amber-500" />
                    ) : (
                      <Clock className="w-5 h-5 text-yellow-600" />
                    )}
                    <div>
                      <p className="font-medium">{batch.file_name}</p>
                      <p className="text-sm text-gray-600">
                        {batch.import_type?.replace(/_/g, ' ')} • 
                        {batch.valid_rows} valid rows
                        {batch.imported_rows > 0 && ` • ${batch.imported_rows} new`}
                        {batch.updated_rows > 0 && ` • ${batch.updated_rows} updated`}
                        {batch.skipped_rows > 0 && ` • ${batch.skipped_rows} skipped`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">
                      {new Date(batch.created_date).toLocaleString()}
                    </p>
                    {batch.dry_run && (
                      <Badge variant="outline" className="text-xs">Dry Run</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}