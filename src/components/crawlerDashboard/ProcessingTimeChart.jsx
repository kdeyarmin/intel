import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function ProcessingTimeChart({ nppesImports, loading }) {
  if (loading) return null;

  // Process data: Get last 20 completed batches
  const data = (nppesImports || [])
    .filter(b => b.status === 'completed' && b.completed_at && b.created_date && b.file_name?.includes('crawler_'))
    .slice(0, 20)
    .map(b => {
      const state = (b.file_name.match(/crawler_([A-Z]{2})/) || [null, '??'])[1];
      const durationMs = new Date(b.completed_at) - new Date(b.created_date);
      const durationSec = Math.round(durationMs / 1000);
      return {
        state,
        duration: durationSec,
        rows: b.total_rows || ((b.imported_rows || 0) + (b.updated_rows || 0) + (b.skipped_rows || 0) + (b.invalid_rows || 0))
      };
    })
    .reverse();

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Processing Time per State</CardTitle>
        <CardDescription>Duration in seconds for recent state crawls</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="state" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} label={{ value: 'Seconds', angle: -90, position: 'insideLeft' }} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                cursor={{ fill: 'transparent' }}
              />
              <Bar dataKey="duration" radius={[4, 4, 0, 0]} name="Duration (s)">
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.duration > 60 ? '#f59e0b' : '#10b981'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}