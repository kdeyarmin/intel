import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function PartDStatsChart({ data = [], loading }) {
  const chartData = useMemo(() => {
    if (!data.length) return [];
    // Group by plan type from D1/D2/D3 tables (trend tables)
    const trendTables = data.filter(r => ['D1', 'D2', 'D3'].includes(r.table_name));
    const byCategory = {};
    for (const r of trendTables) {
      const cat = r.category || 'Unknown';
      if (!cat || cat.length > 40) continue;
      if (!byCategory[cat]) byCategory[cat] = { category: cat, fills: 0, cost: 0, count: 0 };
      if (r.avg_annual_fills) byCategory[cat].fills += r.avg_annual_fills;
      if (r.avg_annual_gross_cost) byCategory[cat].cost += r.avg_annual_gross_cost;
      byCategory[cat].count++;
    }
    return Object.values(byCategory)
      .map(d => ({ ...d, fills: Math.round(d.fills / d.count * 10) / 10, cost: Math.round(d.cost / d.count) }))
      .filter(d => d.fills > 0 || d.cost > 0)
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);
  }, [data]);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">Medicare Part D — Avg Cost & Fills by Category</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">No Part D data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="category" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="fills" name="Avg Fills" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              <Bar yAxisId="right" dataKey="cost" name="Avg Cost ($)" fill="#06b6d4" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}