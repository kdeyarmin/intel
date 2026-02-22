import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp } from 'lucide-react';

const TOOLTIP_STYLE = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#e2e8f0' };

export default function SuccessRateTrendChart({ batches = [] }) {
  const data = useMemo(() => {
    const byDay = {};
    for (const b of batches) {
      if (!b.created_date) continue;
      const d = new Date(b.created_date);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      if (!byDay[key]) byDay[key] = { day: key, total: 0, completed: 0 };
      byDay[key].total++;
      if (b.status === 'completed') byDay[key].completed++;
    }
    return Object.values(byDay)
      .slice(-30)
      .map(d => ({
        day: d.day,
        'Success Rate': d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0,
      }));
  }, [batches]);

  if (data.length === 0) return null;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          Success Rate Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`${v}%`, 'Success Rate']} />
              <Line type="monotone" dataKey="Success Rate" stroke="#34d399" strokeWidth={2} dot={{ fill: '#34d399', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}