import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export default function HospitalUtilizationChart({ data, loading }) {
  const chartData = useMemo(() => {
    // Group DRG data by state, show top states by discharges
    const byState = {};
    data.forEach(r => {
      const st = r.state;
      if (!st || st.length !== 2) return;
      if (!byState[st]) byState[st] = { name: st, discharges: 0, avgPayment: 0, count: 0 };
      byState[st].discharges += r.total_discharges || 0;
      byState[st].avgPayment += r.avg_medicare_payment || 0;
      byState[st].count += 1;
    });

    return Object.values(byState)
      .map(d => ({ ...d, avgPayment: d.count > 0 ? Math.round(d.avgPayment / d.count) : 0 }))
      .sort((a, b) => b.discharges - a.discharges)
      .slice(0, 15);
  }, [data]);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-80 w-full" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <div className="w-2 h-2 bg-amber-500 rounded-full" />
          Inpatient DRG by State
        </CardTitle>
        <CardDescription>Top states by total discharges</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No Inpatient DRG data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" fontSize={11} tick={{ fill: '#64748b' }} />
              <YAxis fontSize={11} tick={{ fill: '#64748b' }} tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v} />
              <Tooltip formatter={(v, name) => [name === 'avgPayment' ? `$${v.toLocaleString()}` : v.toLocaleString(), name === 'avgPayment' ? 'Avg Medicare Payment' : 'Total Discharges']} />
              <Legend />
              <Bar dataKey="discharges" fill="#f59e0b" name="Total Discharges" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}