import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Loader2, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function ResumeImportButton({ batch, onResumed }) {
  const [loading, setLoading] = useState(false);

  // Can resume if paused or failed, and has resume params or progress
  const canResume = (batch.status === 'paused' || batch.status === 'failed') && 
                    (batch.retry_params?.resume_offset > 0 || batch.imported_rows > 0);

  if (!canResume) return null;

  const handleResume = async (e) => {
    e.stopPropagation();
    setLoading(true);
    try {
      // Determine offset
      const offset = batch.retry_params?.resume_offset || batch.imported_rows || 0;

      // Update status first
      if (batch.status === 'failed' || batch.status === 'paused') {
        try {
          await base44.entities.ImportBatch.update(batch.id, {
            status: 'processing',
            paused_at: null,
            cancel_reason: "",
          });
        } catch (_) { /* best-effort */ }
      }
      
      // Call backend to resume
      await base44.functions.invoke('triggerImport', {
        import_type: batch.import_type,
        file_url: batch.file_url,
        year: batch.data_year || 2023,
        resume_offset: offset,
        dry_run: batch.dry_run,
        batch_id: batch.id, // Reuse the same batch
      });

      toast.success(`Resuming import from row ${offset.toLocaleString()}`);
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
      className="h-7 text-xs gap-1 bg-transparent text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
      onClick={handleResume}
      disabled={loading}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
      Resume
    </Button>
  );
}