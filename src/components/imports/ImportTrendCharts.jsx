import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, Clock } from 'lucide-react';

export default function ImportTrendCharts({ batches = [] }) {
  const { successRateData, processingTimeData } = useMemo(() => {
    // Group batches by day
    const byDay = {};
    for (const b of batches) {
      if (!b.created_date) continue;
      const d = new Date(b.created_date);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      if (!byDay[key]) byDay[key] = { day: key, total: 0, completed: 0, failed: 0, durations: [] };
      byDay[key].total++;
      if (b.status === 'completed') byDay[key].completed++;
      if (b.status === 'failed') byDay[key].failed++;
      if (b.completed_at && b.created_date) {
        const dur = (new Date(b.completed_at) - new Date(b.created_date)) / 1000;
        if (dur > 0 && dur < 86400) byDay[key].durations.push(dur);
      }
    }

    const days = Object.values(byDay).slice(-14);
    const successRateData = days.map(d => {
      const terminal = d.completed + d.failed;
      return {
        day: d.day,
        'Success Rate': terminal > 0 ? Math.round((d.completed / terminal) * 100) : 0,
        completed: d.completed,
        failed: d.failed,
      };
    });

    const processingTimeData = days
      .filter(d => d.durations.length > 0)
      .map(d => ({
        day: d.day,
        'Avg Time': Math.round(d.durations.reduce((s, v) => s + v, 0) / d.durations.length),
      }));

    return { successRateData, processingTimeData };
  }, [batches]);

  if (successRateData.length === 0) return null;

  const tooltipStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#e2e8f0' };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            Import Success Rate (Last 14 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={successRateData} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, name, props) => [`${v}% (${props.payload.completed}✓ ${props.payload.failed}✗)`, name]} />
                <Bar dataKey="Success Rate" fill="#22d3ee" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {processingTimeData.length > 0 && (
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              Avg Processing Time (Seconds)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={processingTimeData} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={v => `${v}s`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={v => [`${v}s`, 'Avg Time']} />
                  <Line type="monotone" dataKey="Avg Time" stroke="#22d3ee" strokeWidth={2} dot={{ fill: '#22d3ee', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}