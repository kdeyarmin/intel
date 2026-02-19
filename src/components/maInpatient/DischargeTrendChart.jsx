import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function DischargeTrendChart({ data }) {
  const chartData = useMemo(() => {
    const byYear = {};
    data.forEach(r => {
      if (!r.data_year || !r.total_discharges) return;
      if (!byYear[r.data_year]) byYear[r.data_year] = { year: r.data_year, discharges: 0, persons: 0, count: 0 };
      byYear[r.data_year].discharges += r.total_discharges;
      byYear[r.data_year].persons += r.persons_served || 0;
      byYear[r.data_year].count++;
    });
    return Object.values(byYear).sort((a, b) => a.year - b.year);
  }, [data]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Discharge Trends</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-slate-400 text-center py-8">No discharge data available for current filters</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Total Discharges by Year</CardTitle>
        <CardDescription>Aggregate discharges across filtered records</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} tick={{ fontSize: 12, fill: '#64748b' }} />
            <Tooltip
              formatter={(value, name) => [value.toLocaleString(), name === 'discharges' ? 'Discharges' : 'Persons Served']}
              labelFormatter={l => `Year ${l}`}
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Legend />
            <Bar dataKey="discharges" name="Discharges" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="persons" name="Persons Served" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}