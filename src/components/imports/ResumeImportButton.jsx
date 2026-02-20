import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Play } from 'lucide-react';

export default function ResumeImportButton({ batch, onResumed }) {
  const [resuming, setResuming] = useState(false);

  if (batch.status !== 'paused') return null;

  const resumeOffset = batch.retry_params?.resume_offset || 0;

  const handleResume = async (e) => {
    e.stopPropagation();
    setResuming(true);
    try {
      await base44.functions.invoke('triggerImport', {
        import_type: batch.import_type,
        file_url: batch.file_url || undefined,
        year: batch.data_year || (batch.file_name.match(/_(\d{4})/) ? parseInt(batch.file_name.match(/_(\d{4})/)[1]) : new Date().getFullYear()),
        dry_run: false,
        resume_offset: resumeOffset,
        batch_id: batch.id,
      });
      onResumed?.();
    } catch (err) {
      console.error('Resume failed:', err.message);
    } finally {
      setResuming(false);
    }
  };

  return (
    <Button
      size="sm"
      onClick={handleResume}
      disabled={resuming}
      className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white gap-1"
    >
      {resuming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
      Resume{resumeOffset > 0 ? ` (offset ${resumeOffset.toLocaleString()})` : ''}
    </Button>
  );
}