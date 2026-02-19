import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function SNFStatsChart({ data = [], loading }) {
  const chartData = useMemo(() => {
    if (!data.length) return [];
    // Use SNF3 (geographic) or SNF1 (entitlement trend) for chart
    const geoData = data.filter(r => r.table_name === 'SNF3' && r.state);
    if (geoData.length > 0) {
      const byState = {};
      for (const r of geoData) {
        const st = r.state;
        if (!st || st.length !== 2) continue;
        if (!byState[st]) byState[st] = { state: st, stays: 0, payments: 0, days: 0 };
        if (r.total_stays) byState[st].stays += r.total_stays;
        if (r.program_payments) byState[st].payments += r.program_payments;
        if (r.total_covered_days) byState[st].days += r.total_covered_days;
      }
      return Object.values(byState)
        .sort((a, b) => b.payments - a.payments)
        .slice(0, 15)
        .map(d => ({ ...d, payments: Math.round(d.payments / 1e6) }));
    }
    // Fallback: SNF1 entitlement data
    const snf1 = data.filter(r => r.table_name === 'SNF1');
    return snf1
      .filter(r => r.category && r.total_stays)
      .map(r => ({
        category: (r.category || '').substring(0, 25),
        stays: r.total_stays || 0,
        payments: Math.round((r.program_payments || 0) / 1e6),
      }))
      .slice(0, 10);
  }, [data]);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>;

  const isGeo = chartData[0]?.state;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">
          Medicare SNF — {isGeo ? 'Top States by Payments' : 'Utilization by Entitlement'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">No SNF data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey={isGeo ? "state" : "category"} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(val, name) => name === 'Payments ($M)' ? `$${val}M` : val.toLocaleString()} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="payments" name="Payments ($M)" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              <Bar dataKey="stays" name="Stays" fill="#10b981" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}