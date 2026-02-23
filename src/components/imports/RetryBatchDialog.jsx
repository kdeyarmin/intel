import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, AlertCircle, Filter, Rows3, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function RetryBatchDialog({ batch, open, onOpenChange, onRetryStarted, presets }) {
  const [retryMode, setRetryMode] = useState('full');
  const [rowOffset, setRowOffset] = useState('');
  const [rowLimit, setRowLimit] = useState('');
  const [npiFilter, setNpiFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [sheetFilter, setSheetFilter] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [skipValidation, setSkipValidation] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  // Reset state when batch changes, apply presets if provided
  React.useEffect(() => {
    if (batch) {
      if (presets) {
        setRetryMode(presets.mode || 'full');
        setRowOffset(presets.row_offset ? String(presets.row_offset) : batch.imported_rows ? String(batch.imported_rows) : '');
        setRowLimit(presets.row_limit ? String(presets.row_limit) : '');
        setSheetFilter(presets.sheet_filter || '');
        setDryRun(presets.dry_run_first || false);
        setSkipValidation(presets.skip_validation || false);
      } else {
        setRetryMode('full');
        setRowOffset(batch.imported_rows ? String(batch.imported_rows) : '');
        setRowLimit('');
        setSheetFilter('');
        setDryRun(false);
        setSkipValidation(false);
      }
      setNpiFilter('');
      setStateFilter('');
    }
  }, [batch?.id, presets]);

  if (!batch) return null;

  const MAX_RETRIES = 5;
  const currentRetryCount = batch.retry_count || 0;
  const retryLimitReached = currentRetryCount >= MAX_RETRIES;
  const hasValidatedRows = batch.valid_rows > 0 && !batch.imported_rows;
  const hasInvalidRows = batch.invalid_rows > 0;

  const handleRetry = async () => {
    if (retryLimitReached) return;
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
        retryParams.sheet_filter = sheetFilter || undefined;
      } else if (retryMode === 'resume') {
        retryParams.row_offset = batch.imported_rows || 0;
        retryParams.resume_from = batch.imported_rows || 0;
      }

      // Build invoke params — triggerImport will create the batch, we don't create one here
      const invokeParams = {
        import_type: batch.import_type,
        file_url: batch.file_url || undefined,
        dry_run: dryRun,
        year: batch.data_year || undefined,
        // Retry tracking
        retry_of: batch.id,
        retry_count: currentRetryCount + 1,
        retry_tags: [...new Set([...(batch.tags || []).filter(t => t !== 'retry'), 'retry'])],
        category: batch.category || undefined,
      };

      // Pass range params for ZIP-based or paginated imports
      if (retryMode === 'row_range') {
        invokeParams.row_offset = rowOffset ? Number(rowOffset) : 0;
        invokeParams.row_limit = rowLimit ? Number(rowLimit) : undefined;
      } else if (retryMode === 'resume') {
        invokeParams.resume_offset = batch.imported_rows || 0;
      }
      if (retryMode === 'criteria') {
        if (npiFilter) invokeParams.npi_filter = npiFilter;
        if (stateFilter) invokeParams.state_filter = stateFilter;
      }
      if (sheetFilter) invokeParams.sheet_filter = sheetFilter;
      if (skipValidation) invokeParams.skip_validation = true;

      await base44.functions.invoke('triggerImport', invokeParams);

      // Log the retry as an audit event
      try {
        await base44.entities.AuditEvent.create({
          event_type: 'import',
          user_email: 'user',
          details: {
            action: `Retry import: ${batch.import_type} (attempt ${currentRetryCount + 1}/${MAX_RETRIES})`,
            entity: batch.import_type,
            message: `Retry mode: ${retryMode}`,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (e) { /* audit logging is best-effort */ }

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
            <p><span className="font-medium text-slate-400">Type:</span> <span className="text-slate-100 font-semibold">{batch.import_type}</span></p>
            <p><span className="font-medium text-slate-400">File:</span> <span className="text-slate-100">{batch.file_name}</span></p>
            <div className="flex gap-4 mt-1.5 text-xs">
              {batch.total_rows > 0 && <span className="text-slate-300">Total: <span className="font-semibold">{batch.total_rows?.toLocaleString()}</span></span>}
              {batch.valid_rows > 0 && <span className="text-emerald-400">Valid: <span className="font-semibold">{batch.valid_rows?.toLocaleString()}</span></span>}
              {batch.imported_rows > 0 && <span className="text-blue-400">Imported: <span className="font-semibold">{batch.imported_rows?.toLocaleString()}</span></span>}
              {batch.invalid_rows > 0 && <span className="text-red-400">Invalid: <span className="font-semibold">{batch.invalid_rows?.toLocaleString()}</span></span>}
            </div>
            {currentRetryCount > 0 && (
              <div className={`text-xs mt-2 px-2.5 py-1.5 rounded-md ${retryLimitReached ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-amber-500/10 border border-amber-500/20 text-amber-300'}`}>
                Previously retried {currentRetryCount} time(s){retryLimitReached ? ` — retry limit reached (${MAX_RETRIES} max)` : ` — ${MAX_RETRIES - currentRetryCount} retries remaining`}
              </div>
            )}
          </div>

          {/* AI preset indicator */}
          {presets && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-2.5 text-xs text-purple-400 flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Settings pre-filled by AI analysis: <strong>{presets.explanation || `${presets.mode} mode recommended`}</strong></span>
            </div>
          )}

          {/* Retry mode tabs */}
          <Tabs value={retryMode} onValueChange={setRetryMode}>
            <TabsList className="grid grid-cols-5 h-8 bg-slate-800/80 border border-slate-700/50">
              <TabsTrigger value="full" className="text-xs text-slate-400 data-[state=active]:bg-cyan-600 data-[state=active]:text-white">Full</TabsTrigger>
              <TabsTrigger value="row_range" className="text-xs text-slate-400 data-[state=active]:bg-cyan-600 data-[state=active]:text-white">Row Range</TabsTrigger>
              <TabsTrigger value="criteria" className="text-xs text-slate-400 data-[state=active]:bg-cyan-600 data-[state=active]:text-white">Criteria</TabsTrigger>
              <TabsTrigger value="failed_only" className="text-xs text-slate-400 data-[state=active]:bg-cyan-600 data-[state=active]:text-white">Failed Only</TabsTrigger>
              <TabsTrigger value="resume" className="text-xs text-slate-400 data-[state=active]:bg-cyan-600 data-[state=active]:text-white" disabled={!batch.imported_rows}>Resume</TabsTrigger>
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
                  <Label className="text-xs text-slate-300 font-medium">Start from row</Label>
                  <Input
                    type="number"
                    value={rowOffset}
                    onChange={(e) => setRowOffset(e.target.value)}
                    min={0}
                    max={batch.total_rows || undefined}
                    placeholder="0"
                    className="h-8 text-sm bg-slate-800 border-slate-600 text-slate-100 focus:border-cyan-500"
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

            <TabsContent value="criteria" className="mt-3 space-y-3">
              <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-3 text-xs text-violet-400 flex items-start gap-2">
                <Filter className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>Filter the source data by NPI, state, or sheet before processing. Only matching rows will be imported.</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">NPI Filter (comma-separated)</Label>
                  <Input
                    value={npiFilter}
                    onChange={(e) => setNpiFilter(e.target.value)}
                    placeholder="1234567890, 0987654321"
                    className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-slate-400">State Filter</Label>
                  <Input
                    value={stateFilter}
                    onChange={(e) => setStateFilter(e.target.value.toUpperCase())}
                    placeholder="NY"
                    maxLength={2}
                    className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-300"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-400">Sheet Filter</Label>
                <Input
                  value={sheetFilter}
                  onChange={(e) => setSheetFilter(e.target.value)}
                  placeholder="e.g. MA4, Sheet1"
                  className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300"
                />
                <p className="text-[10px] text-slate-500">For multi-sheet ZIP/Excel imports</p>
              </div>
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

          {/* Sheet filter (visible for all modes) */}
          {retryMode !== 'criteria' && (
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Sheet Filter (optional)</Label>
              <Input
                value={sheetFilter}
                onChange={(e) => setSheetFilter(e.target.value)}
                placeholder="e.g. MA4, Sheet1"
                className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300"
              />
              <p className="text-[10px] text-slate-500">For multi-sheet ZIP/Excel imports — leave blank for all sheets</p>
            </div>
          )}

          {/* Options */}
          <div className="space-y-2 border-t border-slate-700/50 pt-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm text-slate-300">Dry run (validate only)</Label>
              <Switch checked={dryRun} onCheckedChange={setDryRun} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm text-slate-300">Skip validation</Label>
                <p className="text-xs text-slate-400">Import directly without re-validating rows</p>
              </div>
              <Switch checked={skipValidation} onCheckedChange={setSkipValidation} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</Button>
          <Button onClick={handleRetry} disabled={isRetrying || retryLimitReached} className="bg-cyan-600 hover:bg-cyan-700 text-white disabled:opacity-50">
            {isRetrying ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {retryLimitReached ? 'Retry Limit Reached' : isRetrying ? 'Starting...' : retryMode === 'resume' ? 'Resume Import' : `Start Retry (${currentRetryCount + 1}/${MAX_RETRIES})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}