import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const CATEGORY_COLORS = {
  completeness: '#22d3ee',
  accuracy: '#8b5cf6',
  timeliness: '#f59e0b',
  consistency: '#14b8a6',
  duplicate: '#ec4899',
};

export default function AlertTrendChart({ alerts = [] }) {
  const data = useMemo(() => {
    const counts = {};
    for (const a of alerts) {
      const cat = a.category || 'other';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return Object.entries(counts).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
  }, [alerts]);

  if (data.length === 0) return null;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-300">Alerts by Category</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: '#94a3b8' }} width={75} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#e2e8f0' }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                {data.map((d, i) => (
                  <Cell key={i} fill={CATEGORY_COLORS[d.category] || '#64748b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}