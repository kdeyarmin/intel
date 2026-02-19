import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

export default function MAEnrollmentChart({ data, loading }) {
  const chartData = useMemo(() => {
    // Group by hospital type from MA4 table
    const byType = {};
    data.filter(r => r.table_name === 'MA4' && r.category && !r.category.includes('BLANK'))
      .forEach(r => {
        const type = r.hospital_type || r.category || 'Unknown';
        if (type.length > 40 || type === 'Unknown') return;
        if (!byType[type]) byType[type] = { name: type, discharges: 0, coveredDays: 0, personsServed: 0 };
        byType[type].discharges += r.total_discharges || 0;
        byType[type].coveredDays += r.total_covered_days || 0;
        byType[type].personsServed += r.persons_served || 0;
      });

    return Object.values(byType)
      .filter(d => d.discharges > 0)
      .sort((a, b) => b.discharges - a.discharges)
      .slice(0, 8)
      .map(d => ({
        ...d,
        name: d.name.length > 25 ? d.name.substring(0, 22) + '...' : d.name,
      }));
  }, [data]);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-80 w-full" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full" />
          MA Inpatient Hospital Utilization
        </CardTitle>
        <CardDescription>Discharges by hospital type</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No MA Inpatient data available</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" angle={-35} textAnchor="end" fontSize={11} tick={{ fill: '#64748b' }} interval={0} />
              <YAxis fontSize={11} tick={{ fill: '#64748b' }} tickFormatter={v => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}K` : v} />
              <Tooltip formatter={(v) => v.toLocaleString()} />
              <Legend />
              <Bar dataKey="discharges" fill="#3b82f6" name="Discharges" radius={[4,4,0,0]} />
              <Bar dataKey="personsServed" fill="#93c5fd" name="Persons Served" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}