import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ResumeImportButton({ batch, onResumed }) {
  const [loading, setLoading] = useState(false);

  const isNPPES = batch.import_type === 'nppes_registry' && batch.file_name?.startsWith('crawler_');

  const isFlatFile = batch.import_type === 'nppes_flat_file' || batch.import_type === 'nppes_registry_file';
  const canResume = (batch.status === 'paused' || batch.status === 'failed') && 
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
        if (batch.status === 'failed' || batch.status === 'paused') {
          try {
            await base44.entities.ImportBatch.update(batch.id, {
              status: 'processing',
              paused_at: null,
              cancel_reason: "",
            });
          } catch (__) { /* best-effort */ }
        }

        const rp = batch.retry_params || {};
        await base44.functions.invoke('importNPPESFlatFile', {
          batch_id: batch.id,
          file_url: rp.file_url || batch.file_url || batch.file_name,
          byte_offset: rp.byte_offset || 0,
          headers: rp.headers || null,
          total_rows: rp.total_rows || batch.imported_rows || 0,
        });

        toast.success(`Resuming flat file import from byte offset ${(rp.byte_offset || 0).toLocaleString()}`);
      } else {
        const offset = batch.retry_params?.resume_offset || batch.imported_rows || 0;

        if (batch.status === 'failed' || batch.status === 'paused') {
          try {
            await base44.entities.ImportBatch.update(batch.id, {
              status: 'processing',
              paused_at: null,
              cancel_reason: "",
            });
          } catch (__) { /* best-effort */ }
        }
        
        await base44.functions.invoke('triggerImport', {
          import_type: batch.import_type,
          file_url: batch.retry_params?.file_url || batch.file_url,
          year: batch.data_year || 2023,
          resume_offset: offset,
          dry_run: batch.dry_run,
          batch_id: batch.id,
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
