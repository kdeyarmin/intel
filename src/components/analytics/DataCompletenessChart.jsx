import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { format } from 'date-fns';

export default function DataCompletenessChart({ metrics }) {
  const chartData = metrics
    .sort((a, b) => new Date(a.snapshot_date) - new Date(b.snapshot_date))
    .map(m => ({
      date: format(new Date(m.snapshot_date), 'MMM d'),
      completeness: m.completeness_score || 0,
      accuracy: m.accuracy_score || 0,
    }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Quality Scores Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length < 2 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            Quality scores are captured daily. Trends will appear after multiple snapshots.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="completeness" name="Completeness" stroke="#0d9488" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="accuracy" name="Accuracy" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}