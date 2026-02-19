import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { format } from 'date-fns';

export default function ImportActivityChart({ metrics }) {
  const chartData = metrics
    .sort((a, b) => new Date(a.snapshot_date) - new Date(b.snapshot_date))
    .map(m => ({
      date: format(new Date(m.snapshot_date), 'MMM d'),
      successful: (m.imports_today || 0) - (m.imports_failed_today || 0),
      failed: m.imports_failed_today || 0,
      rows: m.rows_imported_today || 0,
    }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Import Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length < 2 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            Import activity is tracked daily. Data will appear as imports run.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="successful" name="Successful" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="failed" name="Failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}