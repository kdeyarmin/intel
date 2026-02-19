import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Clock, AlertTriangle, FileText, ArrowUpDown } from 'lucide-react';

const statusConfig = {
  completed: { icon: CheckCircle, color: 'text-green-600', badge: 'default' },
  failed: { icon: XCircle, color: 'text-red-600', badge: 'destructive' },
  processing: { icon: Clock, color: 'text-blue-600', badge: 'outline' },
  validating: { icon: Clock, color: 'text-yellow-600', badge: 'outline' },
};

function StatBox({ label, value, color = 'text-gray-900' }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
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
            <span className="text-sm text-gray-500">{new Date(batch.created_date).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} ET</span>
          </div>

          <div className="space-y-1 text-sm">
            <p><span className="font-medium text-gray-700">Import Type:</span> {batch.import_type}</p>
            <p><span className="font-medium text-gray-700">File:</span> {batch.file_name}</p>
            {batch.dry_run && <Badge variant="outline" className="mt-1">Dry Run</Badge>}
            {batch.completed_at && (
              <p><span className="font-medium text-gray-700">Completed:</span> {new Date(batch.completed_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} ET</p>
            )}
          </div>

          {/* Row Stats */}
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
              <ArrowUpDown className="w-4 h-4" /> Row Statistics
            </h4>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <StatBox label="Total" value={batch.total_rows} />
              <StatBox label="Valid" value={batch.valid_rows} color="text-green-600" />
              <StatBox label="Invalid" value={batch.invalid_rows} color="text-red-600" />
              <StatBox label="Duplicates" value={batch.duplicate_rows} color="text-yellow-600" />
              <StatBox label="Imported" value={batch.imported_rows} color="text-blue-600" />
            </div>
            {batch.updated_rows > 0 && (
              <p className="text-xs text-gray-500 mt-2">Updated {batch.updated_rows} existing records</p>
            )}
          </div>

          {/* Column Mapping */}
          {batch.column_mapping && Object.keys(batch.column_mapping).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Column Mapping</h4>
              <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                <div className="grid grid-cols-2 gap-1 text-xs">
                  {Object.entries(batch.column_mapping).map(([key, val]) => (
                    <div key={key} className="flex justify-between py-0.5 border-b border-gray-100">
                      <span className="font-medium text-gray-700">{key}</span>
                      <span className="text-gray-500">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Error Samples */}
          {batch.error_samples && batch.error_samples.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1 text-red-700">
                <AlertTriangle className="w-4 h-4" /> Errors ({batch.error_samples.length})
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {batch.error_samples.map((err, idx) => (
                  <div key={idx} className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                    {err.row && <p className="text-xs text-red-500 mb-1">Row {err.row}</p>}
                    {err.npi && <p className="text-xs text-gray-600">NPI: {err.npi}</p>}
                    <p className="text-red-700">{err.message}</p>
                    {err.stack && (
                      <pre className="text-xs text-red-500 mt-1 whitespace-pre-wrap break-all">{err.stack}</pre>
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