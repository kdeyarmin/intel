import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const COLORS = ['#3b82f6', '#6366f1', '#14b8a6', '#f59e0b', '#ef4444'];

export default function LocationTypeBreakdown({ practiceCount, mailingCount, primaryCount }) {
  const data = [
    { name: 'Practice', value: practiceCount },
    { name: 'Mailing', value: mailingCount },
  ];

  return (
    <Card className="bg-gray-100">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Location Type Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="text-center mt-2">
          <span className="text-xs text-gray-500">{primaryCount} designated as primary locations</span>
        </div>
      </CardContent>
    </Card>
  );
}