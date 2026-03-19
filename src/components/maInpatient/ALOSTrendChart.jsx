import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function ALOSTrendChart({ data }) {
  const chartData = useMemo(() => {
    const byYear = {};
    data.forEach(r => {
      if (!r.data_year) return;
      if (!byYear[r.data_year]) byYear[r.data_year] = { year: r.data_year, totalALOS: 0, countALOS: 0, totalDPK: 0, countDPK: 0 };
      if (r.avg_length_of_stay > 0) {
        byYear[r.data_year].totalALOS += r.avg_length_of_stay;
        byYear[r.data_year].countALOS++;
      }
      if (r.discharges_per_1000 > 0) {
        byYear[r.data_year].totalDPK += r.discharges_per_1000;
        byYear[r.data_year].countDPK++;
      }
    });
    return Object.values(byYear)
      .map(y => ({
        year: y.year,
        avg_los: y.countALOS > 0 ? +(y.totalALOS / y.countALOS).toFixed(2) : null,
        discharges_per_1000: y.countDPK > 0 ? +(y.totalDPK / y.countDPK).toFixed(1) : null,
      }))
      .sort((a, b) => a.year - b.year);
  }, [data]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Length of Stay Trends</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-slate-400 text-center py-8">No length of stay data available</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Avg Length of Stay & Discharge Rate</CardTitle>
        <CardDescription>Mean ALOS (days) and discharges per 1,000 enrollees</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="year" tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#64748b' }} label={{ value: 'Days', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#94a3b8' } }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: '#64748b' }} label={{ value: 'Per 1,000', angle: 90, position: 'insideRight', style: { fontSize: 11, fill: '#94a3b8' } }} />
            <Tooltip
              formatter={(value, name) => [
                value?.toLocaleString(),
                name === 'avg_los' ? 'Avg LOS (days)' : 'Discharges/1,000'
              ]}
              labelFormatter={l => `Year ${l}`}
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Legend formatter={v => v === 'avg_los' ? 'Avg LOS (days)' : 'Discharges/1,000'} />
            <Line yAxisId="left" type="monotone" dataKey="avg_los" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 4 }} />
            <Line yAxisId="right" type="monotone" dataKey="discharges_per_1000" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}