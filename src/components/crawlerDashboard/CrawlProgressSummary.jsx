import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle, Clock, Users, Zap, BarChart3 } from 'lucide-react';

function KPI({ title, value, icon: Icon, color, bgColor, loading, badge }) {
  if (loading) return <Card><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>;
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${bgColor}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500 font-medium">{title}</p>
          <div className="flex items-center gap-2">
            <p className="text-lg font-bold text-slate-900">{value}</p>
            {badge}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CrawlProgressSummary({ crawlStatus, nppesImports, totalStates, loading }) {
  const completed = crawlStatus?.completed || 0;
  const failed = crawlStatus?.failed || 0;
  const pending = crawlStatus?.pending ?? Math.max(0, totalStates - completed - failed);
  const isActive = crawlStatus?.auto_chain_active;

  const totalProviders = nppesImports
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => sum + (b.imported_rows || 0), 0);

  const successRate = (completed + failed) > 0
    ? Math.round((completed / (completed + failed)) * 100)
    : 0;

  const avgDuration = (() => {
    const withDuration = nppesImports.filter(b => b.completed_at && b.created_date);
    if (withDuration.length === 0) return '—';
    const totalMs = withDuration.reduce((sum, b) => {
      return sum + (new Date(b.completed_at) - new Date(b.created_date));
    }, 0);
    const avgSec = Math.round(totalMs / withDuration.length / 1000);
    if (avgSec < 60) return `${avgSec}s`;
    return `${Math.round(avgSec / 60)}m`;
  })();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <KPI
        title="States Completed"
        value={completed}
        icon={CheckCircle2}
        color="text-emerald-600"
        bgColor="bg-emerald-50"
        loading={loading}
      />
      <KPI
        title="States Pending"
        value={pending}
        icon={Clock}
        color="text-amber-600"
        bgColor="bg-amber-50"
        loading={loading}
      />
      <KPI
        title="States Failed"
        value={failed}
        icon={XCircle}
        color="text-red-600"
        bgColor="bg-red-50"
        loading={loading}
      />
      <KPI
        title="Providers Imported"
        value={totalProviders.toLocaleString()}
        icon={Users}
        color="text-blue-600"
        bgColor="bg-blue-50"
        loading={loading}
      />
      <KPI
        title="Success Rate"
        value={`${successRate}%`}
        icon={BarChart3}
        color="text-violet-600"
        bgColor="bg-violet-50"
        loading={loading}
      />
      <KPI
        title="Avg Duration"
        value={avgDuration}
        icon={Zap}
        color="text-sky-600"
        bgColor="bg-sky-50"
        loading={loading}
        badge={isActive ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Live</Badge> : null}
      />
    </div>
  );
}