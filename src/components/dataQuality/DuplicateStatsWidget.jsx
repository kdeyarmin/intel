import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, CheckCircle2, GitMerge, TrendingDown } from 'lucide-react';

export default function DuplicateStatsWidget({ batches = [] }) {
  const stats = useMemo(() => {
    const recentBatches = batches
      .filter(b => b.status === 'completed' && b.dedup_summary)
      .slice(0, 20);

    let totalCreated = 0, totalUpdated = 0, totalSkipped = 0;
    for (const b of recentBatches) {
      const ds = b.dedup_summary;
      for (const entity of ['providers', 'locations', 'taxonomies']) {
        if (ds[entity]) {
          totalCreated += ds[entity].created || 0;
          totalUpdated += ds[entity].updated || 0;
          totalSkipped += ds[entity].skipped || 0;
        }
      }
    }
    const totalProcessed = totalCreated + totalUpdated + totalSkipped;
    const deduplicationRate = totalProcessed > 0 ? Math.round(((totalUpdated + totalSkipped) / totalProcessed) * 100) : 0;
    const mergeRate = totalProcessed > 0 ? Math.round((totalUpdated / totalProcessed) * 100) : 0;

    return { totalCreated, totalUpdated, totalSkipped, totalProcessed, deduplicationRate, mergeRate, batchCount: recentBatches.length };
  }, [batches]);

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Copy className="w-4 h-4 text-cyan-400" />
          Deduplication Stats
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800/40 rounded-lg p-3 text-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-emerald-400">{stats.totalCreated.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">New Records</p>
          </div>
          <div className="bg-slate-800/40 rounded-lg p-3 text-center">
            <GitMerge className="w-4 h-4 text-violet-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-violet-400">{stats.totalUpdated.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">Merged / Updated</p>
          </div>
          <div className="bg-slate-800/40 rounded-lg p-3 text-center">
            <TrendingDown className="w-4 h-4 text-slate-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-slate-300">{stats.totalSkipped.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">Duplicates Skipped</p>
          </div>
          <div className="bg-slate-800/40 rounded-lg p-3 text-center">
            <Copy className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-cyan-400">{stats.deduplicationRate}%</p>
            <p className="text-[10px] text-slate-500">Dedup Rate</p>
          </div>
        </div>
        <div className="text-[10px] text-slate-500 text-center">
          Based on last {stats.batchCount} completed imports · {stats.totalProcessed.toLocaleString()} records processed
        </div>
      </CardContent>
    </Card>
  );
}