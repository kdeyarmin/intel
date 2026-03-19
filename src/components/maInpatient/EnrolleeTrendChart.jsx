import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function EnrolleeTrendChart({ data }) {
  const chartData = useMemo(() => {
    const byYear = {};
    data.forEach(r => {
      if (!r.data_year || !r.total_enrollees) return;
      if (!byYear[r.data_year]) byYear[r.data_year] = { year: r.data_year, enrollees: 0, count: 0 };
      byYear[r.data_year].enrollees += r.total_enrollees;
      byYear[r.data_year].count++;
    });
    return Object.values(byYear).sort((a, b) => a.year - b.year);
  }, [data]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Enrollee Trends</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-slate-400 text-center py-8">No enrollee data available</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">MA Part A Enrollees by Year</CardTitle>
        <CardDescription>Aggregate enrollee counts across filtered records</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <defs>
              <linearGradient id="enrolleeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} tick={{ fontSize: 12, fill: '#64748b' }} />
            <Tooltip
              formatter={(value) => [value.toLocaleString(), 'Enrollees']}
              labelFormatter={l => `Year ${l}`}
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Area type="monotone" dataKey="enrollees" stroke="#06b6d4" strokeWidth={2.5} fill="url(#enrolleeGradient)" dot={{ r: 4, fill: '#06b6d4' }} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}