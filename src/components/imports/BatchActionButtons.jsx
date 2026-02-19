import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Pause, StopCircle, RefreshCw, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function BatchActionButtons({ batch, onAction, onRetryClick }) {
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isActing, setIsActing] = useState(false);

  const isActive = batch.status === 'processing' || batch.status === 'validating';
  const isPaused = batch.status === 'paused';
  const canRetry = batch.status === 'failed' || batch.status === 'cancelled';

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
    // Trigger re-processing
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
    </div>
  );
}