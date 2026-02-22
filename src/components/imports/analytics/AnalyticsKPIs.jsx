import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, XCircle, Clock, Database, TrendingUp, FileText } from 'lucide-react';

export default function AnalyticsKPIs({ batches = [] }) {
  const stats = useMemo(() => {
    const total = batches.length;
    const completed = batches.filter(b => b.status === 'completed').length;
    const failed = batches.filter(b => b.status === 'failed').length;
    const successRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const totalRows = batches.reduce((s, b) => s + (b.imported_rows || 0), 0);
    const totalErrors = batches.reduce((s, b) => s + (b.error_samples?.length || 0), 0);

    const durations = batches
      .filter(b => b.completed_at && b.created_date)
      .map(b => (new Date(b.completed_at) - new Date(b.created_date)) / 1000)
      .filter(d => d > 0 && d < 86400);
    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)
      : 0;

    return { total, completed, failed, successRate, totalRows, totalErrors, avgDuration };
  }, [batches]);

  const kpis = [
    { label: 'Total Imports', value: stats.total, icon: FileText, color: 'text-slate-200', iconColor: 'text-slate-400' },
    { label: 'Completed', value: stats.completed, icon: CheckCircle2, color: 'text-emerald-400', iconColor: 'text-emerald-400' },
    { label: 'Failed', value: stats.failed, icon: XCircle, color: 'text-red-400', iconColor: 'text-red-400' },
    { label: 'Success Rate', value: `${stats.successRate}%`, icon: TrendingUp, color: stats.successRate >= 80 ? 'text-emerald-400' : stats.successRate >= 50 ? 'text-amber-400' : 'text-red-400', iconColor: 'text-cyan-400' },
    { label: 'Rows Imported', value: stats.totalRows.toLocaleString(), icon: Database, color: 'text-blue-400', iconColor: 'text-blue-400' },
    { label: 'Avg Duration', value: stats.avgDuration > 60 ? `${Math.round(stats.avgDuration / 60)}m` : `${stats.avgDuration}s`, icon: Clock, color: 'text-amber-400', iconColor: 'text-amber-400' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {kpis.map(kpi => {
        const Icon = kpi.icon;
        return (
          <Card key={kpi.label} className="bg-[#141d30] border-slate-700/50">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${kpi.iconColor}`} />
                <span className="text-[10px] text-slate-500 uppercase tracking-wide">{kpi.label}</span>
              </div>
              <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}