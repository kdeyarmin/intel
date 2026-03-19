import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Progress } from '@/components/ui/progress';

const COLORS = { completed: '#10b981', failed: '#ef4444', pending: '#f59e0b', processing: '#3b82f6' };

export default function CrawlProgressChart({ crawlStatus, totalStates, loading }) {
  const completed = crawlStatus?.completed || 0;
  const failed = crawlStatus?.failed || 0;
  const processing = crawlStatus?.processing || 0;
  const pending = Math.max(0, totalStates - completed - failed - processing);
  const progressPct = totalStates > 0 ? Math.round(((completed + failed) / totalStates) * 100) : 0;

  const pieData = useMemo(() => [
    { name: 'Completed', value: completed, fill: COLORS.completed },
    { name: 'Failed', value: failed, fill: COLORS.failed },
    { name: 'Processing', value: processing, fill: COLORS.processing },
    { name: 'Pending', value: pending, fill: COLORS.pending },
  ].filter(d => d.value > 0), [completed, failed, processing, pending]);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Overall Crawl Progress</CardTitle>
        <CardDescription>{completed + failed} of {totalStates} states processed ({progressPct}%)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={progressPct} className="h-3" />

        <div className="flex gap-4 text-xs">
          {[
            { label: 'Completed', count: completed, color: 'bg-emerald-500' },
            { label: 'Failed', count: failed, color: 'bg-red-500' },
            { label: 'Processing', count: processing, color: 'bg-blue-500' },
            { label: 'Pending', count: pending, color: 'bg-amber-400' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5">
              <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
              <span className="text-slate-600">{s.label}: <strong>{s.count}</strong></span>
            </div>
          ))}
        </div>

        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} innerRadius={45} dataKey="value" paddingAngle={2} strokeWidth={0}>
              {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
            </Pie>
            <Tooltip formatter={(v, name) => [`${v} states`, name]} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}