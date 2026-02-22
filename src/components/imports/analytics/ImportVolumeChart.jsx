import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { BarChart3 } from 'lucide-react';

const TOOLTIP_STYLE = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#e2e8f0' };

export default function ImportVolumeChart({ batches = [] }) {
  const data = useMemo(() => {
    const byDay = {};
    for (const b of batches) {
      if (!b.created_date) continue;
      const d = new Date(b.created_date);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      if (!byDay[key]) byDay[key] = { day: key, completed: 0, failed: 0, other: 0, total: 0 };
      byDay[key].total++;
      if (b.status === 'completed') byDay[key].completed++;
      else if (b.status === 'failed') byDay[key].failed++;
      else byDay[key].other++;
    }
    return Object.values(byDay).slice(-30);
  }, [batches]);

  if (data.length === 0) return null;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-cyan-400" />
          Import Volume by Day
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="completed" stackId="a" fill="#34d399" name="Completed" radius={[0, 0, 0, 0]} />
              <Bar dataKey="failed" stackId="a" fill="#f87171" name="Failed" radius={[0, 0, 0, 0]} />
              <Bar dataKey="other" stackId="a" fill="#94a3b8" name="Other" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}