import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ResumeImportButton({ batch, onResumed }) {
  const [loading, setLoading] = useState(false);

  const isNPPES = batch.import_type === 'nppes_registry' && batch.file_name?.startsWith('crawler_');

  const isFlatFile = batch.import_type === 'nppes_flat_file' || batch.import_type === 'nppes_registry_file';
  // completed_with_errors (MAX_PAGES cap) is resumable: the batch saved its
  // resume offset and the error sample says "Resume to continue."
  const canResume = (batch.status === 'paused' || batch.status === 'failed' || batch.status === 'completed_with_errors') &&
                    (isNPPES || isFlatFile || batch.retry_params?.resume_offset > 0 || batch.imported_rows > 0);

  if (!canResume) return null;

  const handleResume = async (e) => {
    e.stopPropagation();
    setLoading(true);
    try {
      if (isNPPES) {
        await base44.functions.invoke('nppesCrawler', {
          action: 'batch_resume',
          batch_id: batch.id,
          dry_run: batch.dry_run || false,
        });
        toast.success('NPPES crawler batch resumed');
      } else if (isFlatFile) {
        // The flat-file worker is synchronous and checks the batch status at
        // each chunk, so the flip must happen before invoking — but a failed
        // invoke restores the previous status instead of stranding the batch
        // in 'processing' with no worker running.
        const prevStatus = batch.status;
        try {
          await base44.entities.ImportBatch.update(batch.id, {
            status: 'processing',
            paused_at: null,
            paused_by: null,
            cancel_reason: "",
            expected_status: prevStatus,
          });
        } catch (updateErr) {
          // The batch changed (often a 409). Do not start the worker.
          throw updateErr;
        }

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

        toast.success(`Resuming flat file import from byte offset ${(batch.retry_params?.byte_offset || 0).toLocaleString()}`);
      } else {
        // triggerImport flips the batch to 'processing' itself on a successful
        // invoke (409 when the batch is no longer resumable). Flipping here
        // first would strand the batch in 'processing' if the invoke fails.
        const offset = batch.retry_params?.resume_offset || batch.imported_rows || 0;

        await base44.functions.invoke('triggerImport', {
          import_type: batch.import_type,
          file_url: batch.retry_params?.file_url || batch.file_url,
          year: batch.data_year || 2023,
          resume_offset: offset,
          dry_run: batch.dry_run,
          batch_id: batch.id,
          expected_status: batch.status,
        });

        toast.success(`Resuming import from row ${offset.toLocaleString()}`);
      }
      if (onResumed) onResumed();
    } catch (error) {
      console.error('Resume failed:', error);
      toast.error('Failed to resume import: ' + (error?.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button 
      size="sm" 
      variant="outline" 
      className="h-7 text-xs gap-1 bg-transparent text-emerald-400 border-emerald-500/30 hover:bg-emerald-900/10"
      onClick={handleResume}
      disabled={loading}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
      Resume
    </Button>
  );
}
