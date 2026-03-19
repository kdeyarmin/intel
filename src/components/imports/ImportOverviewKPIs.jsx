import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  CheckCircle2, XCircle, Loader2, Clock, TrendingUp, TrendingDown, Database
} from 'lucide-react';

function KPICard({ label, value, icon: Icon, iconColor, trend, trendLabel, onClick, highlight }) {
  return (
    <Card
      className={`bg-[#141d30] border-slate-700/50 cursor-pointer hover:border-cyan-500/30 transition-all ${highlight ? 'ring-1 ring-red-500/40' : ''}`}
      onClick={onClick}
    >
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
            {trend !== undefined && (
              <div className="flex items-center gap-1 mt-1">
                {trend >= 0 ? (
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-red-400" />
                )}
                <span className={`text-[10px] ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {trend > 0 ? '+' : ''}{trend}% {trendLabel || ''}
                </span>
              </div>
            )}
          </div>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconColor || 'bg-slate-800'}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ImportOverviewKPIs({ batches, onFilterChange }) {
  const stats = useMemo(() => {
    const now = new Date();
    const last24h = new Date(now - 24 * 60 * 60 * 1000);
    const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const prev7d = new Date(now - 14 * 24 * 60 * 60 * 1000);

    const active = batches.filter(b => b.status === 'processing' || b.status === 'validating');
    const completed = batches.filter(b => b.status === 'completed');
    const failed = batches.filter(b => b.status === 'failed');

    const recent24h = batches.filter(b => new Date(b.created_date) >= last24h);
    const recentCompleted24h = recent24h.filter(b => b.status === 'completed');
    const recentFailed24h = recent24h.filter(b => b.status === 'failed');

    // 7-day success rate vs previous 7 days
    const last7dBatches = batches.filter(b => new Date(b.created_date) >= last7d);
    const prev7dBatches = batches.filter(b => new Date(b.created_date) >= prev7d && new Date(b.created_date) < last7d);
    
    const terminalStatuses = ['completed', 'failed', 'cancelled'];
    const last7dCompleted = last7dBatches.filter(b => b.status === 'completed').length;
    const last7dTotal = last7dBatches.filter(b => terminalStatuses.includes(b.status)).length;
    const prev7dCompleted = prev7dBatches.filter(b => b.status === 'completed').length;
    const prev7dTotal = prev7dBatches.filter(b => terminalStatuses.includes(b.status)).length;
    
    const successRate7d = last7dTotal > 0 ? Math.round((last7dCompleted / last7dTotal) * 100) : 0;
    const prevSuccessRate = prev7dTotal > 0 ? Math.round((prev7dCompleted / prev7dTotal) * 100) : 0;
    const successTrend = prev7dTotal > 0 ? successRate7d - prevSuccessRate : undefined;

    // Total records imported
    const totalImported = batches.reduce((sum, b) => sum + (b.imported_rows || 0) + (b.updated_rows || 0), 0);

    // Average processing time for completed batches
    const completedWithTime = completed.filter(b => b.completed_at && b.created_date);
    let avgTime = 0;
    if (completedWithTime.length > 0) {
      const totalMs = completedWithTime.reduce((sum, b) => 
        sum + (new Date(b.completed_at) - new Date(b.created_date)), 0);
      avgTime = Math.round(totalMs / completedWithTime.length / 1000);
    }

    return {
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: batches.length,
      recent24h: recent24h.length,
      recentCompleted24h: recentCompleted24h.length,
      recentFailed24h: recentFailed24h.length,
      successRate7d,
      successTrend,
      totalImported,
      avgTime,
      criticalFailures: recentFailed24h.length,
    };
  }, [batches]);

  const _formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <KPICard
        label="Active Now"
        value={stats.active}
        icon={stats.active > 0 ? Loader2 : Clock}
        iconColor={stats.active > 0 ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-500'}
        onClick={() => onFilterChange?.('active')}
      />
      <KPICard
        label="Last 24h"
        value={stats.recent24h}
        icon={Database}
        iconColor="bg-cyan-500/20 text-cyan-400"
        onClick={() => onFilterChange?.('all')}
      />
      <KPICard
        label="Successful"
        value={stats.completed}
        icon={CheckCircle2}
        iconColor="bg-emerald-500/20 text-emerald-400"
        onClick={() => onFilterChange?.('completed')}
      />
      <KPICard
        label="Failed"
        value={stats.failed}
        icon={XCircle}
        iconColor="bg-red-500/20 text-red-400"
        highlight={stats.criticalFailures > 0}
        onClick={() => onFilterChange?.('failed')}
      />
      <KPICard
        label="7d Success Rate"
        value={`${stats.successRate7d}%`}
        icon={TrendingUp}
        iconColor="bg-violet-500/20 text-violet-400"
        trend={stats.successTrend}
        trendLabel="vs prev 7d"
      />
      <KPICard
        label="Records Imported"
        value={stats.totalImported >= 1000000 ? `${(stats.totalImported / 1000000).toFixed(1)}M` : stats.totalImported >= 1000 ? `${(stats.totalImported / 1000).toFixed(1)}K` : stats.totalImported}
        icon={Database}
        iconColor="bg-amber-500/20 text-amber-400"
      />
    </div>
  );
}