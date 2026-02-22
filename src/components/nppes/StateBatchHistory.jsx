import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle, RotateCcw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

const statusConfig = {
  completed:  { icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-950/30 border-green-900/30', badge: 'bg-green-500/20 text-green-400' },
  failed:     { icon: XCircle, color: 'text-red-500', bg: 'bg-red-950/30 border-red-900/30', badge: 'bg-red-500/20 text-red-400' },
  processing: { icon: Loader2, color: 'text-amber-500', bg: 'bg-amber-950/30 border-amber-900/30', badge: 'bg-amber-500/20 text-amber-400', spin: true },
  validating: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-950/30 border-blue-900/30', badge: 'bg-blue-500/20 text-blue-400', spin: true },
  cancelled:  { icon: XCircle, color: 'text-slate-500', bg: 'bg-slate-800/30 border-slate-700/30', badge: 'bg-slate-500/20 text-slate-400' },
  paused:     { icon: Clock, color: 'text-slate-500', bg: 'bg-slate-800/30 border-slate-700/30', badge: 'bg-slate-500/20 text-slate-400' },
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function formatDuration(start, end) {
  if (!start) return '';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const mins = Math.round((e - s) / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function StateBatchHistory({ stateCode }) {
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['stateBatchHistory', stateCode],
    queryFn: async () => {
      if (!stateCode) return [];
      const all = await base44.entities.ImportBatch.filter(
        { import_type: 'nppes_registry' },
        '-created_date',
        200
      );
      return all.filter(b => b.file_url?.includes(`- ${stateCode}`) || b.file_name?.includes(`crawler_${stateCode}_`));
    },
    enabled: !!stateCode,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
      </div>
    );
  }

  if (batches.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 bg-slate-800/30 rounded-lg border border-dashed border-slate-700">
        <Clock className="w-6 h-6 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No crawl history for {stateCode}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[400px]">
      <div className="space-y-3">
        {batches.map((batch, i) => {
          const cfg = statusConfig[batch.status] || statusConfig.paused;
          const Icon = cfg.icon;
          
          return (
            <div key={batch.id} className={`p-3 rounded-lg border ${cfg.bg} space-y-2`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${cfg.color} ${cfg.spin ? 'animate-spin' : ''}`} />
                  <span className="text-sm font-medium capitalize">{batch.status}</span>
                  {i === 0 && <Badge className="text-[10px] h-4 bg-teal-500/20 text-teal-400">Latest</Badge>}
                  {batch.retry_count > 0 && (
                    <Badge variant="outline" className="text-[10px] h-4 gap-0.5">
                      <RotateCcw className="w-2.5 h-2.5" />
                      Retry #{batch.retry_count}
                    </Badge>
                  )}
                </div>
                <span className="text-[10px] text-slate-500">
                  {formatDuration(batch.created_date, batch.completed_at || batch.cancelled_at)}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-slate-300">{batch.valid_rows?.toLocaleString() || '—'}</div>
                  <div className="text-[10px] text-slate-500">Fetched</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-green-400">{batch.imported_rows?.toLocaleString() || '—'}</div>
                  <div className="text-[10px] text-slate-500">Imported</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-blue-400">{batch.updated_rows?.toLocaleString() || '—'}</div>
                  <div className="text-[10px] text-slate-500">Updated</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-slate-400">{batch.skipped_rows?.toLocaleString() || '—'}</div>
                  <div className="text-[10px] text-slate-500">Skipped</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-700/50">
                <span>{formatDate(batch.created_date)}</span>
                {batch.api_requests_count > 0 && (
                  <span>{batch.api_requests_count} API calls</span>
                )}
                {batch.cancel_reason && (
                  <span className="text-red-400 truncate max-w-[200px]" title={batch.cancel_reason}>
                    {batch.cancel_reason}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}