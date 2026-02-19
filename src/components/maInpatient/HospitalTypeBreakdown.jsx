import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16'];

export default function HospitalTypeBreakdown({ data }) {
  const chartData = useMemo(() => {
    const byType = {};
    data.forEach(r => {
      const type = r.hospital_type || r.category || 'Unknown';
      if (!byType[type]) byType[type] = { name: type, discharges: 0 };
      byType[type].discharges += r.total_discharges || 0;
    });
    return Object.values(byType)
      .filter(t => t.discharges > 0)
      .sort((a, b) => b.discharges - a.discharges)
      .slice(0, 8);
  }, [data]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Discharge Distribution</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-slate-400 text-center py-8">No data</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Discharges by Category</CardTitle>
        <CardDescription>Top categories by total discharge volume</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              dataKey="discharges"
              nameKey="name"
              paddingAngle={2}
            >
              {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip
              formatter={(value) => [value.toLocaleString(), 'Discharges']}
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0' }}
            />
            <Legend
              layout="vertical"
              align="right"
              verticalAlign="middle"
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value) => value.length > 25 ? value.slice(0, 25) + '…' : value}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}