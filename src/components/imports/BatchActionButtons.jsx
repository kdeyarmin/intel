import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Pause, StopCircle, RefreshCw, Loader2, SkipForward } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function BatchActionButtons({ batch, onAction, onRetryClick }) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [skipDialogOpen, setSkipDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [skipReason, setSkipReason] = useState('');
  const [isActing, setIsActing] = useState(false);
  const [pendingLabel, setPendingLabel] = useState(null);

  const MAX_RETRIES = 5;
  const isActive = batch.status === 'processing' || batch.status === 'validating';
  const isPaused = batch.status === 'paused';
  // A batch stuck in 'pausing' (slow worker) still offers Resume (change of
  // mind — the server resumes it) and Cancel (escalate).
  const isPausing = batch.status === 'pausing';
  const retryLimitReached = (batch.retry_count || 0) >= MAX_RETRIES;
  const canRetry = (batch.status === 'failed' || batch.status === 'cancelled' || batch.status === 'completed_with_errors') && !retryLimitReached;
  const canSkip = batch.status === 'failed';

  // The row on screen can be stale: re-read the batch before acting so a
  // just-finished batch can't be flipped back to paused/cancelled (the
  // server also guards these transitions; this keeps the UI honest).
  const fetchFreshBatch = async () => {
    try {
      return await base44.entities.ImportBatch.get(batch.id);
    } catch {
      return null;
    }
  };

  // Workers acknowledge 'pausing'/'cancelling' at their next checkpoint, which
  // can take a while. Poll until the batch settles or the timeout elapses.
  const waitForStatus = async (targets, { timeoutMs = 120000, intervalMs = 3000 } = {}) => {
    const deadline = Date.now() + timeoutMs;
    let fresh = null;
    for (;;) {
      fresh = await fetchFreshBatch();
      if (fresh && targets.includes(fresh.status)) return fresh;
      if (Date.now() >= deadline) return fresh;
      await new Promise(r => setTimeout(r, intervalMs));
    }
  };

  // The NPPES crawler and flat-file workers check the batch row per task /
  // per chunk (and the crawler prefetch skips paused batches), so a direct
  // flip stops new work immediately. CMS imports only check every 5 pages:
  // those go through an honest 'pausing'/'cancelling' intermediate state.
  const isImmediateStopBatch =
    (batch.import_type === 'nppes_registry' && batch.file_name?.startsWith('crawler_')) ||
    batch.import_type === 'nppes_flat_file' || batch.import_type === 'nppes_registry_file';

  const handlePause = async () => {
    setIsActing(true);
    setPendingLabel('Pausing…');
    try {
      const fresh = await fetchFreshBatch();
      if (!fresh || (fresh.status !== 'processing' && fresh.status !== 'validating')) {
        toast.error(`Can't pause: the batch is ${fresh ? `'${fresh.status}'` : 'no longer available'}.`);
        onAction?.();
        return;
      }
      // paused_by='user' keeps the auto-wake workers away from this batch.
      // expected_status makes the flip atomic: a 409 means the batch changed
      // since our fresh read.
      const pauseUpdate = {
        status: isImmediateStopBatch ? 'paused' : 'pausing',
        paused_at: new Date().toISOString(),
        paused_by: 'user',
        expected_status: fresh.status,
      };
      await base44.entities.ImportBatch.update(batch.id, pauseUpdate);
      if (!isImmediateStopBatch) {
        // Honest intermediate: the worker stops at its next checkpoint and
        // writes 'paused' itself. If it finished first, any terminal state
        // is a good outcome — only warn when still stuck in 'pausing'.
        const settled = await waitForStatus(['paused', 'completed', 'completed_with_errors', 'failed', 'cancelled']);
        if (settled && settled.status === 'pausing') {
          toast.warning('Still pausing — the worker will stop at its next checkpoint.');
        }
      }
      onAction?.();
    } catch (err) {
      if (err?.status === 409) {
        toast.warning('The batch changed while pausing — refreshing.');
        onAction?.();
      } else {
        toast.error(`Pause failed: ${err.message}`);
      }
    } finally {
      setIsActing(false);
      setPendingLabel(null);
    }
  };

  const isFlatFile = batch.import_type === 'nppes_flat_file' || batch.import_type === 'nppes_registry_file';

  const handleResume = async () => {
    setIsActing(true);
    setPendingLabel('Resuming…');
    try {
      if (isFlatFile) {
        // The flat-file worker is synchronous and never flips the batch
        // itself, so flip optimistically — but restore the previous status if
        // the invoke fails, instead of stranding the batch in 'processing'.
        const prevStatus = batch.status;
        await base44.entities.ImportBatch.update(batch.id, {
          status: 'processing',
          paused_at: null,
          paused_by: null,
          expected_status: prevStatus,
        });
        try {
          const rp = batch.retry_params || {};
          await base44.functions.invoke('importNPPESFlatFile', {
            batch_id: batch.id,
            file_url: rp.file_url || batch.file_url || batch.file_name,
            byte_offset: rp.byte_offset || 0,
            headers: rp.headers || null,
            total_rows: rp.total_rows || batch.imported_rows || 0,
          });
        } catch (invokeErr) {
          await base44.entities.ImportBatch.update(batch.id, { status: prevStatus, expected_status: 'processing' }).catch(() => {});
          throw invokeErr;
        }
      } else {
        // triggerImport flips the batch to 'processing' itself only while it
        // still has the status we saw. A stale resume then gets a 409 instead
        // of reviving a batch that already finished.
        const offset = batch.retry_params?.resume_offset || batch.imported_rows || 0;
        await base44.functions.invoke('triggerImport', {
          import_type: batch.import_type,
          file_url: batch.file_url,
          batch_id: batch.id,
          resume_offset: offset,
          year: batch.data_year,
          expected_status: batch.status,
        });
      }

      onAction?.();
    } catch (error) {
      toast.error(`Resume failed: ${error.message}`);
    } finally {
      setIsActing(false);
      setPendingLabel(null);
    }
  };

  const handleCancel = async () => {
    setIsActing(true);
    setPendingLabel('Cancelling…');
    try {
      const fresh = await fetchFreshBatch();
      if (!fresh || !['processing', 'validating', 'paused', 'pausing'].includes(fresh.status)) {
        toast.error(`Can't cancel: the batch is ${fresh ? `'${fresh.status}'` : 'no longer available'}.`);
        onAction?.();
        return;
      }
      // 'cancelling' is honest for CMS imports: the worker stops at its next
      // checkpoint and writes 'cancelled' itself.
      await base44.entities.ImportBatch.update(batch.id, {
        status: isImmediateStopBatch ? 'cancelled' : 'cancelling',
        cancelled_at: new Date().toISOString(),
        cancel_reason: cancelReason || 'Manually cancelled by user',
        expected_status: fresh.status,
      });
      if (!isImmediateStopBatch) {
        const settled = await waitForStatus(['cancelled', 'completed', 'failed']);
        if (settled && settled.status === 'cancelling') {
          toast.warning('Still cancelling — the worker will stop at its next checkpoint.');
        }
      }
      setCancelDialogOpen(false);
      setCancelReason('');
      onAction?.();
    } catch (err) {
      if (err?.status === 409) {
        toast.warning('The batch changed while cancelling — refreshing.');
        onAction?.();
      } else {
        toast.error(`Cancel failed: ${err.message}`);
      }
    } finally {
      setIsActing(false);
      setPendingLabel(null);
    }
  };

  const handleSkip = async () => {
    setIsActing(true);
    try {
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
      setSkipDialogOpen(false);
      setSkipReason('');
      onAction?.();
    } catch (err) {
      toast.error(`Skip failed: ${err.message}`);
    } finally {
      setIsActing(false);
    }
  };

  if (isActing) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        {pendingLabel || 'Working…'}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {isActive && (
        <>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400" onClick={handlePause}>
            <Pause className="w-3 h-3" /> Pause
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-transparent text-red-400 border-red-500/30 hover:bg-red-900/10" onClick={() => setCancelDialogOpen(true)}>
            <StopCircle className="w-3 h-3" /> Cancel
          </Button>
        </>
      )}

      {(isPaused || isPausing) && (
        <>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-transparent text-blue-400 border-blue-500/30 hover:bg-blue-900/10" onClick={handleResume}>
            <RefreshCw className="w-3 h-3" /> Resume
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-transparent text-red-400 border-red-500/30 hover:bg-red-900/10" onClick={() => setCancelDialogOpen(true)}>
            <StopCircle className="w-3 h-3" /> Cancel
          </Button>
        </>
      )}

      {canRetry && (
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-transparent text-blue-400 border-blue-500/30 hover:bg-blue-900/10" onClick={onRetryClick}>
          <RefreshCw className="w-3 h-3" /> Retry{batch.retry_count > 0 ? ` (${batch.retry_count}/${MAX_RETRIES})` : ''}
        </Button>
      )}
      {(batch.status === 'failed' || batch.status === 'cancelled') && retryLimitReached && (
        <span className="text-[10px] text-red-400/70 px-1">Max retries reached</span>
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
            aria-label="Reason for cancellation (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="h-20 bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-400"
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
          <div className="bg-amber-900/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-400 space-y-1">
            <p className="font-medium">Batch Summary:</p>
            <p>Total: {batch.total_rows?.toLocaleString() || 0} · Valid: {batch.valid_rows?.toLocaleString() || 0} · Imported: {batch.imported_rows?.toLocaleString() || 0}</p>
            {batch.invalid_rows > 0 && <p className="text-red-400">{batch.invalid_rows} invalid rows will be ignored</p>}
          </div>
          <Textarea
            placeholder="Reason for skipping (optional)"
            aria-label="Reason for skipping (optional)"
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            className="h-16 bg-slate-800/50 border-slate-700 text-slate-300 placeholder:text-slate-400"
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