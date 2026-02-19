import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Pause, StopCircle, RefreshCw, Loader2, SkipForward } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function BatchActionButtons({ batch, onAction, onRetryClick }) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [skipReason, setSkipReason] = useState('');
  const [isActing, setIsActing] = useState(false);

  const isActive = batch.status === 'processing' || batch.status === 'validating';
  const isPaused = batch.status === 'paused';
  const canRetry = batch.status === 'failed' || batch.status === 'cancelled';
  const canSkip = batch.status === 'failed';

  const handlePause = async () => {
    setIsActing(true);
    await base44.entities.ImportBatch.update(batch.id, {
      status: 'paused',
      paused_at: new Date().toISOString(),
    });
    setIsActing(false);
    onAction?.();
  };

  const handleResume = async () => {
    setIsActing(true);
    await base44.entities.ImportBatch.update(batch.id, {
      status: 'processing',
      paused_at: null,
    });
    await base44.functions.invoke('triggerImport', {
      import_type: batch.import_type,
      file_url: batch.file_url,
    });
    setIsActing(false);
    onAction?.();
  };

  const handleCancel = async () => {
    setIsActing(true);
    await base44.entities.ImportBatch.update(batch.id, {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: cancelReason || 'Manually cancelled by user',
    });
    setIsActing(false);
    setCancelDialogOpen(false);
    setCancelReason('');
    onAction?.();
  };

  const handleSkip = async () => {
    setIsActing(true);
    const existingTags = batch.tags || [];
    await base44.entities.ImportBatch.update(batch.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      tags: [...new Set([...existingTags, 'skipped'])],
      error_samples: [
        ...(batch.error_samples || []),
        { message: `Marked as skipped: ${skipReason || 'Minor issues bypassed by user'}` },
      ],
    });
    setIsActing(false);
    setSkipDialogOpen(false);
    setSkipReason('');
    onAction?.();
  };

  if (isActing) {
    return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />;
  }

  return (
    <div className="flex items-center gap-1">
      {isActive && (
        <>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handlePause}>
            <Pause className="w-3 h-3" /> Pause
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setCancelDialogOpen(true)}>
            <StopCircle className="w-3 h-3" /> Cancel
          </Button>
        </>
      )}

      {isPaused && (
        <>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-blue-600" onClick={handleResume}>
            <RefreshCw className="w-3 h-3" /> Resume
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => setCancelDialogOpen(true)}>
            <StopCircle className="w-3 h-3" /> Cancel
          </Button>
        </>
      )}

      {canRetry && (
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-blue-600" onClick={onRetryClick}>
          <RefreshCw className="w-3 h-3" /> Retry
        </Button>
      )}

      {canSkip && (
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-gray-500" onClick={() => setSkipDialogOpen(true)}>
          <SkipForward className="w-3 h-3" /> Skip
        </Button>
      )}

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel Import Job</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            This will stop the import for <span className="font-medium">{batch.import_type}</span>. Already imported data will not be removed.
          </p>
          <Textarea
            placeholder="Reason for cancellation (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="h-20"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Keep Running</Button>
            <Button variant="destructive" onClick={handleCancel}>Cancel Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Skipped Dialog */}
      <Dialog open={skipDialogOpen} onOpenChange={setSkipDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SkipForward className="w-5 h-5" />
              Mark as Skipped
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            This will mark the batch as completed with a "skipped" tag. Use this for batches with minor issues that don't need to be retried.
          </p>
          <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-700 space-y-1">
            <p className="font-medium">Batch Summary:</p>
            <p>Total: {batch.total_rows?.toLocaleString() || 0} · Valid: {batch.valid_rows?.toLocaleString() || 0} · Imported: {batch.imported_rows?.toLocaleString() || 0}</p>
            {batch.invalid_rows > 0 && <p className="text-red-600">{batch.invalid_rows} invalid rows will be ignored</p>}
          </div>
          <Textarea
            placeholder="Reason for skipping (optional)"
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            className="h-16"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSkip} className="bg-gray-600 hover:bg-gray-700">
              <SkipForward className="w-4 h-4 mr-1" /> Mark as Skipped
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}