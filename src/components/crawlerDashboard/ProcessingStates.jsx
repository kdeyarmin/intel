import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, MapPin, Timer } from 'lucide-react';

function estimateCompletion(batch, avgDurationMs) {
  if (!batch.created_date || !avgDurationMs) return '—';
  const elapsed = Date.now() - new Date(batch.created_date).getTime();
  const remaining = Math.max(0, avgDurationMs - elapsed);
  if (remaining === 0) return 'any moment';
  const sec = Math.round(remaining / 1000);
  if (sec < 60) return `~${sec}s`;
  return `~${Math.ceil(sec / 60)}m`;
}

function getStateFromFileName(fileName) {
  if (!fileName) return '??';
  const match = fileName.match(/[_]([A-Z]{2})(?:[_.]|$)/i) || fileName.match(/^([A-Z]{2})$/i);
  return match ? match[1].toUpperCase() : fileName.slice(0, 12);
}

export default function ProcessingStates({ crawlStatus, nppesImports, loading }) {
  // Calculate avg duration from completed batches
  const avgDurationMs = useMemo(() => {
    const completed = (nppesImports || []).filter(b => b.status === 'completed' && b.completed_at && b.created_date);
    if (completed.length === 0) return 0;
    const total = completed.reduce((sum, b) => sum + (new Date(b.completed_at) - new Date(b.created_date)), 0);
    return total / completed.length;
  }, [nppesImports]);

  // Currently processing batches
  const processingBatches = (nppesImports || []).filter(b => b.status === 'processing' || b.status === 'validating');

  // States info from crawlStatus - use processing_states array from the status endpoint
  const processingStatesCodes = crawlStatus?.processing_states || [];

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>;

  const activeItems = processingBatches;
  const isActive = crawlStatus?.auto_chain_active || processingBatches.length > 0 || processingStatesCodes.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Currently Processing</CardTitle>
            <CardDescription>States being crawled right now</CardDescription>
          </div>
          {isActive && (
            <Badge className="bg-blue-100 text-blue-700 gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Active
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!isActive && activeItems.length === 0 && processingStatesCodes.length === 0 ? (
          <div className="text-center py-10">
            <MapPin className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No states are being processed right now</p>
            <p className="text-xs text-slate-400 mt-1">Start a crawl from the NPPES Crawler page</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeItems.map(batch => {
              const state = getStateFromFileName(batch.file_name);
              const elapsed = batch.created_date
                ? Math.round((Date.now() - new Date(batch.created_date).getTime()) / 1000)
                : 0;
              const eta = estimateCompletion(batch, avgDurationMs);

              return (
                <div key={batch.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                    <div>
                      <p className="text-sm font-semibold text-slate-700">{state}</p>
                      <p className="text-xs text-slate-500">
                        {batch.total_rows ? `${batch.total_rows.toLocaleString()} rows found` : 'Fetching data...'}
                        {batch.valid_rows ? ` • ${batch.valid_rows.toLocaleString()} valid` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-xs text-blue-600">
                      <Timer className="w-3 h-3" />
                      {elapsed < 60 ? `${elapsed}s elapsed` : `${Math.floor(elapsed / 60)}m elapsed`}
                    </div>
                    <p className="text-[10px] text-slate-500">ETA: {eta}</p>
                  </div>
                </div>
              );
            })}

            {processingStatesCodes.filter(st => !activeItems.some(b => getStateFromFileName(b.file_name) === st)).map(st => (
              <div key={st} className="flex items-center gap-3 p-3 bg-blue-50/50 rounded-lg border border-blue-50">
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-sm font-medium text-slate-600">{st}</span>
                <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-600 ml-auto">queued</Badge>
              </div>
            ))}

            {avgDurationMs > 0 && (
              <p className="text-[10px] text-slate-400 text-center mt-2">
                Average crawl duration: {avgDurationMs < 60000 ? `${Math.round(avgDurationMs / 1000)}s` : `${Math.round(avgDurationMs / 60000)}m`} per state
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}