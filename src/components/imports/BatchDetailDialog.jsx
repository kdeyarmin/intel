import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, AlertTriangle, FileText, ArrowUpDown } from 'lucide-react';

const statusConfig = {
  completed: { icon: CheckCircle, color: 'text-emerald-400', badge: 'default' },
  failed: { icon: XCircle, color: 'text-red-400', badge: 'destructive' },
  processing: { icon: Clock, color: 'text-blue-400', badge: 'outline' },
  validating: { icon: Clock, color: 'text-yellow-400', badge: 'outline' },
};

function StatBox({ label, value, color = 'text-slate-200' }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-center">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value ?? '—'}</p>
    </div>
  );
}

export default function BatchDetailDialog({ batch, open, onOpenChange }) {
  if (!batch) return null;

  const config = statusConfig[batch.status] || statusConfig.validating;
  const StatusIcon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-[#141d30] border-slate-700">
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2 text-slate-200">
             <FileText className="w-5 h-5" />
             Import Batch Details
           </DialogTitle>
         </DialogHeader>

         <div className="space-y-5 mt-2">
           {/* Status & Meta */}
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
               <StatusIcon className={`w-5 h-5 ${config.color}`} />
               <Badge variant={config.badge} className="text-sm">{batch.status}</Badge>
             </div>
             <span className="text-sm text-slate-400">{new Date(batch.created_date).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} ET</span>
           </div>

           <div className="space-y-1 text-sm">
             <p><span className="font-medium text-slate-300">Import Type:</span> <span className="text-slate-400">{batch.import_type}</span></p>
             <p><span className="font-medium text-slate-300">File:</span> <span className="text-slate-400">{batch.file_name}</span></p>
             {batch.dry_run && <Badge variant="outline" className="mt-1 bg-violet-500/15 text-violet-400 border-violet-500/20">Dry Run</Badge>}
             {batch.completed_at && (
               <p><span className="font-medium text-slate-300">Completed:</span> <span className="text-slate-400">{new Date(batch.completed_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} ET</span></p>
             )}
           </div>

          {/* Row Stats */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1 text-slate-300">
              <ArrowUpDown className="w-4 h-4 text-cyan-400" /> Row Statistics
            </h4>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
              <StatBox label="Total" value={batch.total_rows?.toLocaleString() || 0} />
              <StatBox label="Valid" value={batch.valid_rows?.toLocaleString() || 0} color="text-emerald-400" />
              <StatBox label="Invalid" value={batch.invalid_rows?.toLocaleString() || 0} color="text-red-400" />
              <StatBox label="Duplicates" value={batch.duplicate_rows?.toLocaleString() || 0} color="text-amber-400" />
              <StatBox label="Imported" value={batch.imported_rows?.toLocaleString() || 0} color="text-blue-400" />
              <StatBox label="Updated" value={batch.updated_rows?.toLocaleString() || 0} color="text-violet-400" />
              <StatBox label="Skipped" value={batch.skipped_rows?.toLocaleString() || 0} color="text-slate-400" />
            </div>
          </div>

          {/* Column Mapping */}
          {batch.column_mapping && Object.keys(batch.column_mapping).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 text-slate-300">Column Mapping</h4>
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 max-h-40 overflow-y-auto">
                {Array.isArray(batch.column_mapping) ? (
                  <div className="flex flex-wrap gap-1.5">
                    {batch.column_mapping.map((f, i) => (
                      <Badge key={i} className="bg-slate-700/50 text-slate-300 text-[10px] font-mono">{f}</Badge>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {Object.entries(batch.column_mapping).map(([key, val]) => (
                      <div key={key} className="flex justify-between py-0.5 border-b border-slate-700/30">
                        <span className="font-medium text-slate-300">{key}</span>
                        <span className="text-slate-500">{typeof val === 'object' ? JSON.stringify(val) : String(val)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Samples */}
          {batch.error_samples && batch.error_samples.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1 text-red-400">
                <AlertTriangle className="w-4 h-4" /> Errors ({batch.error_samples.length})
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {batch.error_samples.map((err, idx) => (
                  <div key={idx} className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm">
                    {err.row && <p className="text-xs text-red-400 mb-1">Row {err.row}</p>}
                    {err.npi && <p className="text-xs text-slate-400">NPI: {err.npi}</p>}
                    <p className="text-red-400">{err.message}</p>
                    {err.stack && (
                      <pre className="text-xs text-red-400 mt-1 whitespace-pre-wrap break-all">{err.stack}</pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}