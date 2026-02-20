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
      
      // Call backend to resume
      await base44.functions.invoke('triggerImport', {
        import_type: batch.import_type,
        file_url: batch.file_url,
        year: batch.data_year || 2023, // Fallback if year not stored directly, usually in file_name or separate field
        resume_offset: offset,
        batch_id: batch.id,
        dry_run: batch.dry_run
      });

      toast.success(`Resuming import from row ${offset.toLocaleString()}`);
      if (onResumed) onResumed();
    } catch (error) {
      console.error('Resume failed:', error);
      toast.error('Failed to resume import: ' + error.message);
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