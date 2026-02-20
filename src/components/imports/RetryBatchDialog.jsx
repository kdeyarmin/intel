import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, AlertCircle, Filter, Rows3 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function RetryBatchDialog({ batch, open, onOpenChange, onRetryStarted }) {
  const [retryMode, setRetryMode] = useState('full');
  const [rowOffset, setRowOffset] = useState('');
  const [rowLimit, setRowLimit] = useState('');
  const [npiFilter, setNpiFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [skipValidation, setSkipValidation] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Reset state when batch changes
  React.useEffect(() => {
    if (batch) {
      setRetryMode('full');
      setRowOffset(batch.imported_rows ? String(batch.imported_rows) : '');
      setRowLimit('');
      setNpiFilter('');
      setStateFilter('');
      setDryRun(false);
      setSkipValidation(false);
    }
  }, [batch?.id]);

  if (!batch) return null;

  const hasValidatedRows = batch.valid_rows > 0 && !batch.imported_rows;
  const hasInvalidRows = batch.invalid_rows > 0;

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const retryParams = {
        mode: retryMode,
        skip_validation: skipValidation,
      };

      if (retryMode === 'row_range') {
        retryParams.row_offset = rowOffset ? Number(rowOffset) : 0;
        retryParams.row_limit = rowLimit ? Number(rowLimit) : undefined;
      } else if (retryMode === 'failed_only') {
        retryParams.failed_rows_only = true;
      } else if (retryMode === 'criteria') {
        retryParams.npi_filter = npiFilter || undefined;
        retryParams.state_filter = stateFilter || undefined;
      } else if (retryMode === 'resume') {
        retryParams.row_offset = batch.imported_rows || 0;
        retryParams.resume_from = batch.imported_rows || 0;
      }

      await base44.entities.ImportBatch.create({
        import_type: batch.import_type,
        file_name: batch.file_name,
        file_url: batch.file_url,
        status: 'validating',
        dry_run: dryRun,
        retry_of: batch.id,
        retry_count: (batch.retry_count || 0) + 1,
        retry_params: retryParams,
        tags: [...(batch.tags || []), 'retry'],
        category: batch.category,
      });

      try {
        const invokeParams = {
          import_type: batch.import_type,
          file_url: batch.file_url,
          dry_run: dryRun,
        };
        // Pass range params for ZIP-based imports (Medicare MA, HHA, Part D, SNF)
        if (retryMode === 'row_range') {
          invokeParams.row_offset = rowOffset ? Number(rowOffset) : 0;
          invokeParams.row_limit = rowLimit ? Number(rowLimit) : undefined;
        } else if (retryMode === 'resume') {
          invokeParams.row_offset = batch.imported_rows || 0;
        }
        await base44.functions.invoke('triggerImport', invokeParams);
      } catch (e) {
        console.warn('triggerImport call failed, batch was still created:', e.message);
      }

      onRetryStarted?.();
    } finally {
      setIsRetrying(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-[#141d30] border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-200">
            <RefreshCw className="w-5 h-5 text-cyan-400" />
            Retry Import
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Batch info summary */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-sm space-y-1">
            <p><span className="font-medium text-slate-500">Type:</span> <span className="text-slate-200">{batch.import_type}</span></p>
            <p><span className="font-medium text-slate-500">File:</span> <span className="text-slate-200">{batch.file_name}</span></p>
            <div className="flex gap-4 mt-1 text-xs text-slate-500">
              {batch.total_rows > 0 && <span>Total: {batch.total_rows?.toLocaleString()}</span>}
              {batch.valid_rows > 0 && <span className="text-emerald-400">Valid: {batch.valid_rows?.toLocaleString()}</span>}
              {batch.imported_rows > 0 && <span className="text-blue-400">Imported: {batch.imported_rows?.toLocaleString()}</span>}
              {batch.invalid_rows > 0 && <span className="text-red-400">Invalid: {batch.invalid_rows?.toLocaleString()}</span>}
            </div>
            {batch.retry_count > 0 && (
              <p className="text-amber-400 text-xs mt-1">Previously retried {batch.retry_count} time(s)</p>
            )}
          </div>

          {/* Retry mode tabs */}
          <Tabs value={retryMode} onValueChange={setRetryMode}>
            <TabsList className="grid grid-cols-4 h-8 bg-slate-800/50">
              <TabsTrigger value="full" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-slate-200">Full</TabsTrigger>
              <TabsTrigger value="row_range" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-slate-200">Row Range</TabsTrigger>
              <TabsTrigger value="failed_only" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-slate-200">Failed Only</TabsTrigger>
              <TabsTrigger value="resume" className="text-xs data-[state=active]:bg-slate-700 data-[state=active]:text-slate-200" disabled={!batch.imported_rows}>Resume</TabsTrigger>
            </TabsList>

            <TabsContent value="full" className="mt-3">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-400 flex items-start gap-2">
                <RefreshCw className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>Re-process all {batch.total_rows?.toLocaleString() || 0} rows from scratch. Use this when the original error has been fixed.</span>
              </div>
            </TabsContent>

            <TabsContent value="row_range" className="mt-3 space-y-3">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-400 flex items-start gap-2">
                <Rows3 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>Process a specific range of rows. Useful for large datasets that timed out — break them into smaller chunks.</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Start from row</Label>
                  <Input
                    type="number"
                    value={rowOffset}
                    onChange={(e) => setRowOffset(e.target.value)}
                    min={0}
                    max={batch.total_rows || undefined}
                    placeholder="0"
                    className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-300"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Number of rows</Label>
                  <Input
                    type="number"
                    value={rowLimit}
                    onChange={(e) => setRowLimit(e.target.value)}
                    min={1}
                    placeholder="All remaining"
                    className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-300"
                  />
                </div>
              </div>
              {hasValidatedRows && (
                <p className="text-xs text-amber-400">
                  Tip: This batch validated {batch.valid_rows?.toLocaleString()} rows but imported 0. Try chunks of 5,000 rows to avoid timeouts.
                </p>
              )}
            </TabsContent>

            <TabsContent value="failed_only" className="mt-3 space-y-3">
              {hasInvalidRows ? (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-400 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>Will attempt to re-process {batch.invalid_rows?.toLocaleString()} rows that previously failed validation.</span>
                </div>
              ) : (
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-xs text-slate-400 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>No individual row failures recorded for this batch. The failure was likely at the batch level (timeout, network, etc.). Try "Full" or "Row Range" instead.</span>
                </div>
              )}
            </TabsContent>

            <TabsContent value="resume" className="mt-3">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-400 flex items-start gap-2">
                <RefreshCw className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  Resume from where the batch stopped — row {(batch.imported_rows || 0).toLocaleString()}.
                  {batch.total_rows > 0 && ` Approximately ${(batch.total_rows - (batch.imported_rows || 0)).toLocaleString()} rows remaining.`}
                </span>
              </div>
            </TabsContent>
          </Tabs>

          {/* NPI/State criteria filter (shown for all modes) */}
          <div className="space-y-2">
            <button 
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300"
              onClick={() => setNpiFilter(prev => prev === null ? '' : prev === '' ? null : '')}
            >
              <Filter className="w-3 h-3" /> 
              {npiFilter !== null && npiFilter !== undefined ? 'Hide' : 'Show'} NPI/State filter (optional)
            </button>
            {npiFilter !== null && npiFilter !== undefined && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Filter by NPIs (comma-separated)</Label>
                  <Input
                    value={npiFilter || ''}
                    onChange={(e) => setNpiFilter(e.target.value)}
                    placeholder="1234567890, 0987654321"
                    className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">Filter by state</Label>
                  <Input
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value.toUpperCase())}
                    placeholder="AK"
                    maxLength={2}
                    className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-300"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Options */}
          <div className="space-y-2 border-t border-slate-700/50 pt-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-slate-300">Dry run (validate only)</Label>
              <Switch checked={dryRun} onCheckedChange={setDryRun} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm text-slate-300">Skip validation</Label>
                <p className="text-xs text-slate-500">Import directly without re-validating rows</p>
              </div>
              <Switch checked={skipValidation} onCheckedChange={setSkipValidation} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</Button>
          <Button onClick={handleRetry} disabled={isRetrying} className="bg-cyan-600 hover:bg-cyan-700 text-white">
            {isRetrying ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {isRetrying ? 'Starting...' : retryMode === 'resume' ? 'Resume Import' : 'Start Retry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}