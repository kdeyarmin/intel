import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function RetryBatchDialog({ batch, open, onOpenChange, onRetryStarted }) {
  const [retryMode, setRetryMode] = useState('full');
  const [rowOffset, setRowOffset] = useState(batch?.imported_rows || 0);
  const [rowLimit, setRowLimit] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  if (!batch) return null;

  const handleRetry = async () => {
    setIsRetrying(true);
    const retryParams = {
      mode: retryMode,
      ...(retryMode === 'subset' && { row_offset: Number(rowOffset), row_limit: rowLimit ? Number(rowLimit) : undefined }),
      ...(retryMode === 'failed_only' && { failed_rows_only: true }),
    };

    // Create a new batch record as retry
    await base44.entities.ImportBatch.create({
      import_type: batch.import_type,
      file_name: batch.file_name,
      file_url: batch.file_url,
      status: 'validating',
      dry_run: dryRun,
      retry_of: batch.id,
      retry_count: (batch.retry_count || 0) + 1,
      retry_params: retryParams,
      tags: batch.tags || [],
      category: batch.category,
    });

    // Trigger the actual import
    await base44.functions.invoke('triggerImport', {
      import_type: batch.import_type,
      file_url: batch.file_url,
      dry_run: dryRun,
    });

    setIsRetrying(false);
    onOpenChange(false);
    onRetryStarted?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Retry Import
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
            <p><span className="font-medium">Type:</span> {batch.import_type}</p>
            <p><span className="font-medium">File:</span> {batch.file_name}</p>
            {batch.retry_count > 0 && (
              <p className="text-amber-600 text-xs">Previously retried {batch.retry_count} time(s)</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Retry Mode</Label>
            <Select value={retryMode} onValueChange={setRetryMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full Re-import</SelectItem>
                <SelectItem value="subset">Subset (specify range)</SelectItem>
                <SelectItem value="failed_only">Failed Rows Only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {retryMode === 'subset' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start from row</Label>
                <Input
                  type="number"
                  value={rowOffset}
                  onChange={(e) => setRowOffset(e.target.value)}
                  min={0}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max rows (blank = all)</Label>
                <Input
                  type="number"
                  value={rowLimit}
                  onChange={(e) => setRowLimit(e.target.value)}
                  min={1}
                  placeholder="All"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          )}

          {retryMode === 'failed_only' && batch.invalid_rows > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 rounded-lg p-3 text-xs text-amber-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Will attempt to re-process {batch.invalid_rows} rows that previously failed validation.</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label className="text-sm">Dry run (validate only)</Label>
            <Switch checked={dryRun} onCheckedChange={setDryRun} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleRetry} disabled={isRetrying}>
            {isRetrying ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {isRetrying ? 'Retrying...' : 'Start Retry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}