import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Database, Clock, Activity, Server, ArrowUp, ArrowDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function CrawlerKPIs({ nppesImports, loading }) {
  const metrics = useMemo(() => {
    if (!nppesImports || nppesImports.length === 0) return null;

    const totalProcessed = nppesImports.reduce((acc, curr) => acc + (curr.total_rows || 0), 0);
    const totalImported = nppesImports.reduce((acc, curr) => acc + (curr.imported_rows || 0), 0);
    
    // Calculate average time per state (only for completed batches)
    const completedBatches = nppesImports.filter(b => b.status === 'completed' && b.completed_at && b.created_date);
    const totalTimeMs = completedBatches.reduce((acc, curr) => {
      return acc + (new Date(curr.completed_at) - new Date(curr.created_date));
    }, 0);
    const avgTimePerStateMs = completedBatches.length > 0 ? totalTimeMs / completedBatches.length : 0;
    const avgTimePerStateSec = Math.round(avgTimePerStateMs / 1000);

    const totalBatches = nppesImports.length;
    const failedBatches = nppesImports.filter(b => b.status === 'failed').length;
    const terminalBatches = completedBatches.length + failedBatches;
    const successRate = terminalBatches > 0
      ? Math.round((completedBatches.length / terminalBatches) * 100)
      : 0;

    return {
      totalProcessed,
      totalImported,
      avgTimePerStateSec,
      successRate,
      totalBatches,
      completedCount: completedBatches.length
    };
  }, [nppesImports]);

  if (loading) {
    return <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
    </div>;
  }

  if (!metrics) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <KPICard
        title="Total Providers Processed"
        value={metrics.totalProcessed.toLocaleString()}
        icon={Database}
        trend={`${metrics.totalBatches} batches processed`}
        color="text-blue-600"
        bgColor="bg-blue-50"
      />
      <KPICard
        title="Avg Processing Time"
        value={`${metrics.avgTimePerStateSec}s`}
        subValue="per state"
        icon={Clock}
        trend={`${metrics.completedCount} completed batches`}
        color="text-amber-600"
        bgColor="bg-amber-50"
      />
      <KPICard 
        title="Success Rate" 
        value={`${metrics.successRate}%`} 
        icon={Activity}
        trend={`${metrics.totalBatches} total batches`}
        color="text-emerald-600"
        bgColor="bg-emerald-50"
      />
      <KPICard 
        title="Newly Imported" 
        value={metrics.totalImported.toLocaleString()} 
        icon={Server}
        trend="New records added"
        color="text-purple-600"
        bgColor="bg-purple-50"
      />
    </div>
  );
}

function KPICard({ title, value, subValue, icon: Icon, trend, trendUp, color, bgColor }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-y-0 pb-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className={`p-2 rounded-full ${bgColor}`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
        </div>
        <div className="flex items-baseline gap-1">
          <div className="text-2xl font-bold">{value}</div>
          {subValue && <div className="text-xs text-muted-foreground">{subValue}</div>}
        </div>
        {trend && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center">
            {trendUp === true && <ArrowUp className="w-3 h-3 text-emerald-500 mr-1" />}
            {trendUp === false && <ArrowDown className="w-3 h-3 text-red-500 mr-1" />}
            {trend}
          </p>
        )}
      </CardContent>
    </Card>
  );
}