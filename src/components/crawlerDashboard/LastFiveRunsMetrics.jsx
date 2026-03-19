import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Database } from 'lucide-react';

export default function LastFiveRunsMetrics({ nppesImports, loading }) {
  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>;

  // Get last 5 *completed* or *failed* runs (exclude currently processing to show final metrics)
  // Or just last 5 runs period? Let's do last 5 runs of any status to show current progress too.
  const runs = (nppesImports || [])
    .filter(b => b.import_type === 'nppes_registry' && b.file_name?.includes('crawler_'))
    .slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5 text-indigo-500" />
          Last 5 Crawler Runs
        </CardTitle>
        <CardDescription>Detailed performance metrics for recent operations</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>State</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead className="text-right">Rows</TableHead>
              <TableHead className="text-right">Speed</TableHead>
              <TableHead className="text-right">Errors</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center h-24 text-slate-500">
                  No run history available
                </TableCell>
              </TableRow>
            ) : (
              runs.map(run => {
                const state = run.file_name?.split('_')[1] || '??';
                const start = run.created_date ? new Date(run.created_date) : new Date();
                const end = run.completed_at ? new Date(run.completed_at) : (run.status === 'processing' || run.status === 'validating') ? new Date() : null;
                const durationMs = end ? Math.max(0, end - start) : 0;
                const durationSec = durationMs > 0 ? Math.max(1, Math.round(durationMs / 1000)) : 0;
                const rows = run.total_rows || 0;
                const speed = Math.round(rows / durationSec); // rows/sec
                const errorCount = (run.error_samples || []).length + (run.invalid_rows || 0);

                return (
                  <TableRow key={run.id}>
                    <TableCell className="font-medium">{state}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`
                        ${run.status === 'completed' ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 
                          run.status === 'failed' ? 'border-red-200 text-red-700 bg-red-50' : 
                          'border-blue-200 text-blue-700 bg-blue-50'}
                      `}>
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-500 text-xs">
                      {durationSec === 0 ? '—' : durationSec < 60 ? `${durationSec}s` : `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {rows.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-xs font-mono">{speed > 0 ? speed : '-'}</span>
                        <span className="text-[10px] text-slate-400">r/s</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                       {errorCount > 0 ? (
                         <Badge variant="secondary" className="bg-red-50 text-red-600 hover:bg-red-100 border-red-100">
                           {errorCount}
                         </Badge>
                       ) : (
                         <span className="text-slate-300">-</span>
                       )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}