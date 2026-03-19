import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';

function formatDuration(start, end) {
  if (!start || !end) return '—';
  const ms = new Date(end) - new Date(start);
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getStateFromFileName(fileName) {
  if (!fileName) return '??';
  // patterns: nppes_XX, _XX_, state=XX etc
  const match = fileName.match(/[_]([A-Z]{2})(?:[_.]|$)/i) || fileName.match(/^([A-Z]{2})$/i);
  return match ? match[1].toUpperCase() : fileName.slice(0, 20);
}

export default function RecentCrawlActivity({ nppesImports, auditEvents, loading }) {
  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>;

  const recentBatches = nppesImports.slice(0, 15);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recent Crawl Activity</CardTitle>
        <CardDescription>Last {recentBatches.length} state crawl operations</CardDescription>
      </CardHeader>
      <CardContent>
        {recentBatches.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-8">No crawl activity yet</p>
        ) : (
          <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
            {recentBatches.map(batch => {
              const state = getStateFromFileName(batch.file_name);
              const duration = formatDuration(batch.created_date, batch.completed_at);
              const isProcessing = batch.status === 'processing' || batch.status === 'validating';

              return (
                <div key={batch.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                  {batch.status === 'completed' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  ) : batch.status === 'failed' ? (
                    <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-700">{state}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                        batch.status === 'completed' ? 'border-emerald-200 text-emerald-700' :
                        batch.status === 'failed' ? 'border-red-200 text-red-700' :
                        'border-blue-200 text-blue-700'
                      }`}>
                        {isProcessing ? 'processing' : batch.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 truncate">
                      {batch.imported_rows ? `${batch.imported_rows.toLocaleString()} rows` : ''}
                      {batch.imported_rows && batch.valid_rows ? ' • ' : ''}
                      {batch.valid_rows ? `${batch.valid_rows.toLocaleString()} valid` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="w-3 h-3" />
                      {duration}
                    </div>
                    <p className="text-[10px] text-slate-400">{formatTime(batch.created_date)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}