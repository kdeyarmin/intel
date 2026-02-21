import React, { useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Terminal } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

export default function CrawlerLog({ logs }) {
  const bottomRef = useRef(null);

  // Fetch recent NPPES import batches to show server-side activity
  const { data: recentBatches = [] } = useQuery({
    queryKey: ['crawlerLogBatches'],
    queryFn: () => base44.entities.ImportBatch.filter(
      { import_type: 'nppes_monthly' },
      '-created_date',
      30
    ),
    refetchInterval: 15000,
  });

  // Merge in-memory logs with batch-derived logs
  const mergedLogs = useMemo(() => {
    const batchLogs = recentBatches.map(b => {
      const date = new Date(b.created_date);
      const time = date.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
      });
      const dateStr = date.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        month: 'short', day: 'numeric'
      });

      const isToday = new Date().toDateString() === date.toDateString();
      const stamp = isToday ? time : `${dateStr} ${time}`;

      if (b.status === 'completed') {
        return {
          time: stamp,
          type: 'success',
          message: `✓ ${b.file_name || b.import_type}: ${b.valid_rows || 0} valid, ${b.imported_rows || 0} imported`,
          sortKey: date.getTime(),
          source: 'batch',
        };
      } else if (b.status === 'failed') {
        return {
          time: stamp,
          type: 'error',
          message: `✗ ${b.file_name || b.import_type}: Import failed`,
          sortKey: date.getTime(),
          source: 'batch',
        };
      } else if (b.status === 'processing' || b.status === 'validating') {
        return {
          time: stamp,
          type: 'info',
          message: `⏳ ${b.file_name || b.import_type}: ${b.status}... (${b.valid_rows || 0} rows)`,
          sortKey: date.getTime(),
          source: 'batch',
        };
      }
      return null;
    }).filter(Boolean);

    // In-memory logs don't have sortKey, so place them at the end (most recent)
    const memLogs = logs.map((l, i) => ({
      ...l,
      sortKey: Date.now() - (logs.length - i),
      source: 'memory',
    }));

    // Combine and sort by time, most recent last
    return [...batchLogs, ...memLogs].sort((a, b) => a.sortKey - b.sortKey).slice(-100);
  }, [logs, recentBatches]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mergedLogs]);

  const hasActivity = mergedLogs.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Terminal className="w-5 h-5 text-gray-500" />
            Crawler Log
          </CardTitle>
          {hasActivity && (
            <Badge variant="outline" className="text-xs text-slate-400 border-slate-600">
              {mergedLogs.length} entries
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64 rounded-lg bg-gray-900 p-4 font-mono text-xs">
          {!hasActivity ? (
            <p className="text-gray-500">No activity yet. Start the crawler to see logs here.</p>
          ) : (
            mergedLogs.map((log, i) => (
              <div key={i} className="flex gap-2 py-0.5">
                <span className="text-gray-500 shrink-0">[{log.time}]</span>
                <span className={
                  log.type === 'success' ? 'text-green-400' :
                  log.type === 'error' ? 'text-red-400' :
                  'text-gray-300'
                }>
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}