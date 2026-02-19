import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend } from 'recharts';
import { format } from 'date-fns';

export default function ErrorRateTrend({ nppesImports, loading }) {
  // Group imports by date, calculate success/failure counts
  const trendData = useMemo(() => {
    const byDate = {};
    nppesImports.forEach(b => {
      if (!b.created_date) return;
      const day = b.created_date.substring(0, 10);
      if (!byDate[day]) byDate[day] = { date: day, success: 0, failed: 0, totalRows: 0, errors: 0 };
      if (b.status === 'completed') {
        byDate[day].success += 1;
        byDate[day].totalRows += b.imported_rows || 0;
      } else if (b.status === 'failed') {
        byDate[day].failed += 1;
      }
      byDate[day].errors += b.invalid_rows || 0;
    });

    return Object.values(byDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30)
      .map(d => ({
        ...d,
        label: format(new Date(d.date + 'T12:00:00'), 'MMM d'),
        errorRate: (d.success + d.failed) > 0 ? Math.round((d.failed / (d.success + d.failed)) * 100) : 0,
      }));
  }, [nppesImports]);

  // Summary stats
  const totalFailed = nppesImports.filter(b => b.status === 'failed').length;
  const totalSuccess = nppesImports.filter(b => b.status === 'completed').length;
  const overallErrorRate = (totalSuccess + totalFailed) > 0
    ? ((totalFailed / (totalSuccess + totalFailed)) * 100).toFixed(1)
    : '0';

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Error Rate & Trends</CardTitle>
            <CardDescription>Crawl success vs failure over time</CardDescription>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900">{overallErrorRate}%</p>
            <p className="text-[10px] text-slate-500">Overall error rate</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {trendData.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-12">No crawl data to chart</p>
        ) : (
          <div className="space-y-4">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={trendData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" fontSize={10} tick={{ fill: '#94a3b8' }} />
                <YAxis fontSize={10} tick={{ fill: '#94a3b8' }} />
                <Tooltip />
                <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="success" fill="#10b981" name="Success" radius={[2,2,0,0]} stackId="a" />
                <Bar dataKey="failed" fill="#ef4444" name="Failed" radius={[2,2,0,0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>

            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" fontSize={10} tick={{ fill: '#94a3b8' }} />
                <YAxis fontSize={10} tick={{ fill: '#94a3b8' }} unit="%" />
                <Tooltip formatter={v => `${v}%`} />
                <Area type="monotone" dataKey="errorRate" stroke="#ef4444" fill="#fecaca" strokeWidth={2} name="Error Rate" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}