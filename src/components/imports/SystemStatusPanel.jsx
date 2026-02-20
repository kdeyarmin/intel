import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Activity, CheckCircle2, XCircle, Clock, Zap,
  Database, ArrowUpDown, TrendingUp, TrendingDown, Server
} from 'lucide-react';

function formatDuration(ms) {
  if (!ms || ms <= 0) return '—';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function SystemStatusPanel({ batches }) {
  const stats = useMemo(() => {
    const now = Date.now();
    const last24h = batches.filter(b => now - new Date(b.created_date).getTime() < 86400000);
    const lastHour = batches.filter(b => now - new Date(b.created_date).getTime() < 3600000);
    const active = batches.filter(b => b.status === 'processing' || b.status === 'validating');
    const completed24h = last24h.filter(b => b.status === 'completed');
    const failed24h = last24h.filter(b => b.status === 'failed');
    
    // Avg duration for completed batches
    const durations = completed24h
      .filter(b => b.completed_at && b.created_date)
      .map(b => new Date(b.completed_at).getTime() - new Date(b.created_date).getTime())
      .filter(d => d > 0);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    // Total rows processed in 24h
    const totalRowsProcessed = last24h.reduce((sum, b) => sum + (b.imported_rows || 0) + (b.updated_rows || 0), 0);
    
    // Success rate
    const finishedCount = completed24h.length + failed24h.length;
    const successRate = finishedCount > 0 ? Math.round((completed24h.length / finishedCount) * 100) : 100;

    // Throughput (rows per minute)
    const throughput = avgDuration > 0 && totalRowsProcessed > 0
      ? Math.round(totalRowsProcessed / (durations.reduce((a, b) => a + b, 0) / 60000))
      : 0;

    return {
      activeCount: active.length,
      last24hCount: last24h.length,
      lastHourCount: lastHour.length,
      completed24h: completed24h.length,
      failed24h: failed24h.length,
      avgDuration,
      totalRowsProcessed,
      successRate,
      throughput,
    };
  }, [batches]);

  const statusColor = stats.activeCount > 0 ? 'text-blue-400' : stats.failed24h > 0 ? 'text-amber-400' : 'text-emerald-400';
  const statusLabel = stats.activeCount > 0 ? 'Processing' : stats.failed24h > 0 ? 'Issues Detected' : 'All Clear';
  const statusBg = stats.activeCount > 0 ? 'bg-blue-500/15 border-blue-500/20' : stats.failed24h > 0 ? 'bg-amber-500/15 border-amber-500/20' : 'bg-emerald-500/15 border-emerald-500/20';

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-slate-200">System Status</span>
          </div>
          <Badge className={`${statusBg} ${statusColor} text-[10px]`}>
            <div className={`w-1.5 h-1.5 rounded-full mr-1 ${
              stats.activeCount > 0 ? 'bg-blue-400 animate-pulse' : stats.failed24h > 0 ? 'bg-amber-400' : 'bg-emerald-400'
            }`} />
            {statusLabel}
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-800/50 border border-slate-700/30 rounded-lg p-2.5 text-center">
            <Zap className="w-3.5 h-3.5 text-blue-400 mx-auto mb-1" />
            <p className="text-[10px] text-slate-500">Active Jobs</p>
            <p className="text-lg font-bold text-blue-400">{stats.activeCount}</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/30 rounded-lg p-2.5 text-center">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-1" />
            <p className="text-[10px] text-slate-500">Success Rate (24h)</p>
            <p className={`text-lg font-bold ${stats.successRate >= 80 ? 'text-emerald-400' : stats.successRate >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {stats.successRate}%
            </p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/30 rounded-lg p-2.5 text-center">
            <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400 mx-auto mb-1" />
            <p className="text-[10px] text-slate-500">Rows Processed (24h)</p>
            <p className="text-lg font-bold text-slate-200">{stats.totalRowsProcessed.toLocaleString()}</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/30 rounded-lg p-2.5 text-center">
            <Clock className="w-3.5 h-3.5 text-slate-400 mx-auto mb-1" />
            <p className="text-[10px] text-slate-500">Avg Duration</p>
            <p className="text-lg font-bold text-slate-200">{formatDuration(stats.avgDuration)}</p>
          </div>
        </div>

        {/* Recent activity summary */}
        <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-500">
          <span>Last hour: <span className="text-slate-300 font-medium">{stats.lastHourCount}</span> jobs</span>
          <span>Last 24h: <span className="text-slate-300 font-medium">{stats.last24hCount}</span> jobs</span>
          {stats.failed24h > 0 && (
            <span className="text-red-400">{stats.failed24h} failed in 24h</span>
          )}
          {stats.throughput > 0 && (
            <span>Throughput: <span className="text-cyan-400 font-medium">~{stats.throughput.toLocaleString()}</span> rows/min</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}