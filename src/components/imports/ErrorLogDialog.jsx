import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, FileWarning, Copy, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function ErrorLogDialog({ batch, open, onOpenChange }) {
  if (!batch) return null;

  const errors = batch.error_samples || [];
  const hasErrors = errors.length > 0;

  const copyToClipboard = () => {
    const text = JSON.stringify(errors, null, 2);
    navigator.clipboard.writeText(text);
    toast.success('Error log copied to clipboard');
  };

  const downloadLog = () => {
    const text = JSON.stringify(errors, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-errors-${batch.id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] bg-[#141d30] border-slate-700 text-slate-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="w-5 h-5" />
            Import Error Log
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Viewing errors for batch <span className="font-mono text-slate-300">{batch.file_name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 py-2 border-b border-slate-700/50">
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-slate-500">Failed Rows:</span>
              <span className="ml-1 font-medium text-red-400">{batch.invalid_rows?.toLocaleString() || 0}</span>
            </div>
            <div>
              <span className="text-slate-500">Total Errors:</span>
              <span className="ml-1 font-medium text-slate-200">{errors.length}{errors.length >= 50 ? '+' : ''}</span>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={copyToClipboard} className="h-7 text-xs text-slate-400 hover:text-white">
              <Copy className="w-3 h-3 mr-1" /> Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={downloadLog} className="h-7 text-xs text-slate-400 hover:text-white">
              <Download className="w-3 h-3 mr-1" /> Download
            </Button>
          </div>
        </div>

        <ScrollArea className="h-[400px] w-full rounded-md border border-slate-700/50 bg-slate-900/50 p-4">
          {hasErrors ? (
            <div className="space-y-3">
              {errors.map((error, index) => (
                <div key={index} className="flex gap-3 items-start p-3 rounded bg-red-500/5 border border-red-500/10 text-sm">
                  <FileWarning className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {error.row !== undefined && (
                        <Badge variant="outline" className="border-red-500/20 text-red-400 bg-red-500/10 text-[10px] h-5">
                          Row {error.row}
                        </Badge>
                      )}
                      {error.sheet && (
                        <Badge variant="outline" className="border-slate-600 text-slate-400 text-[10px] h-5">
                          Sheet: {error.sheet}
                        </Badge>
                      )}
                      {error.field && (
                        <Badge variant="outline" className="border-slate-600 text-slate-400 text-[10px] h-5">
                          Field: {error.field}
                        </Badge>
                      )}
                      {error.phase && (
                        <Badge variant="outline" className="border-slate-600 text-slate-400 text-[10px] h-5 capitalize">
                          {error.phase}
                        </Badge>
                      )}
                      {error.timestamp && (
                        <span className="text-xs text-slate-500 ml-auto">
                          {new Date(error.timestamp).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-300 font-mono text-xs break-all whitespace-pre-wrap">
                      {error.message || error.detail || JSON.stringify(error)}
                    </p>
                    {error.retryable && (
                      <p className="text-[10px] text-emerald-400 italic">
                        Retryable error (transient)
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-3">
                <AlertTriangle className="w-6 h-6 opacity-50" />
              </div>
              <p>No detailed error logs available for this batch.</p>
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700 text-slate-300 hover:bg-slate-800">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}