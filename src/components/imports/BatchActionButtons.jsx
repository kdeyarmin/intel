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
    try {
      const offset = batch.retry_params?.resume_offset || batch.imported_rows || 0;
      
      // Update status first
      await base44.entities.ImportBatch.update(batch.id, {
        status: 'processing',
        paused_at: null,
      });

      // Trigger resumption
      await base44.functions.invoke('triggerImport', {
        import_type: batch.import_type,
        file_url: batch.file_url,
        batch_id: batch.id,
        resume_offset: offset,
        year: batch.data_year // Ensure year is passed if available
      });
      
      onAction?.();
    } catch (error) {
      console.error('Resume failed:', error);
    } finally {
      setIsActing(false);
    }
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
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400" onClick={handlePause}>
            <Pause className="w-3 h-3" /> Pause
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-transparent text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={() => setCancelDialogOpen(true)}>
            <StopCircle className="w-3 h-3" /> Cancel
          </Button>
        </>
      )}

      {isPaused && (
        <>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-transparent text-blue-400 border-blue-500/30 hover:bg-blue-500/10" onClick={handleResume}>
            <RefreshCw className="w-3 h-3" /> Resume
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-transparent text-red-400 border-red-500/30 hover:bg-red-500/10" onClick={() => setCancelDialogOpen(true)}>
            <StopCircle className="w-3 h-3" /> Cancel
          </Button>
        </>
      )}

      {canRetry && (
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-transparent text-blue-400 border-blue-500/30 hover:bg-blue-500/10" onClick={onRetryClick}>
          <RefreshCw className="w-3 h-3" /> Retry
        </Button>
      )}

      {canSkip && (
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-transparent text-slate-400 border-slate-700 hover:bg-slate-800" onClick={() => setSkipDialogOpen(true)}>
          <SkipForward className="w-3 h-3" /> Skip
        </Button>
      )}

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-sm bg-[#141d30] border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-200">Cancel Import Job</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-400">
            This will stop the import for <span className="font-medium text-slate-200">{batch.import_type}</span>. Already imported data will not be removed.
          </p>
          <Textarea
            placeholder="Reason for cancellation (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="h-20 bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600"
          />
          <DialogFooter>
            <Button variant="outline" className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800" onClick={() => setCancelDialogOpen(false)}>Keep Running</Button>
            <Button variant="destructive" onClick={handleCancel}>Cancel Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Skipped Dialog */}
      <Dialog open={skipDialogOpen} onOpenChange={setSkipDialogOpen}>
        <DialogContent className="max-w-sm bg-[#141d30] border-slate-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-200">
              <SkipForward className="w-5 h-5" />
              Mark as Skipped
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-400">
            This will mark the batch as completed with a "skipped" tag. Use this for batches with minor issues that don't need to be retried.
          </p>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-400 space-y-1">
            <p className="font-medium">Batch Summary:</p>
            <p>Total: {batch.total_rows?.toLocaleString() || 0} · Valid: {batch.valid_rows?.toLocaleString() || 0} · Imported: {batch.imported_rows?.toLocaleString() || 0}</p>
            {batch.invalid_rows > 0 && <p className="text-red-400">{batch.invalid_rows} invalid rows will be ignored</p>}
          </div>
          <Textarea
            placeholder="Reason for skipping (optional)"
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            className="h-16 bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-600"
          />
          <DialogFooter>
            <Button variant="outline" className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800" onClick={() => setSkipDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSkip} className="bg-slate-600 hover:bg-slate-700 text-white">
              <SkipForward className="w-4 h-4 mr-1" /> Mark as Skipped
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}