import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import { BarChart3, PieChart as PieIcon } from 'lucide-react';

export default function SuccessVsFailureChart({ batches }) {
  const [period, setPeriod] = useState('14d');

  const { barData, pieData } = useMemo(() => {
    const now = new Date();
    const daysBack = period === '7d' ? 7 : period === '14d' ? 14 : 30;
    const cutoff = new Date(now - daysBack * 24 * 60 * 60 * 1000);
    
    const filtered = batches.filter(b => new Date(b.created_date) >= cutoff);

    // Group by day
    const byDay = {};
    for (let i = 0; i < daysBack; i++) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      byDay[key] = { day: key, Completed: 0, Failed: 0, Active: 0 };
    }

    for (const b of filtered) {
      const d = new Date(b.created_date);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      if (!byDay[key]) continue;
      if (b.status === 'completed') byDay[key].Completed++;
      else if (b.status === 'failed') byDay[key].Failed++;
      else byDay[key].Active++;
    }

    const barData = Object.values(byDay).reverse();

    // Pie data
    const completed = filtered.filter(b => b.status === 'completed').length;
    const failed = filtered.filter(b => b.status === 'failed').length;
    const active = filtered.filter(b => b.status === 'processing' || b.status === 'validating').length;
    const paused = filtered.filter(b => b.status === 'paused').length;
    const pieData = [
      { name: 'Completed', value: completed, color: '#10b981' },
      { name: 'Failed', value: failed, color: '#ef4444' },
      { name: 'Active', value: active, color: '#3b82f6' },
      { name: 'Paused', value: paused, color: '#f59e0b' },
    ].filter(d => d.value > 0);

    return { barData, pieData };
  }, [batches, period]);

  const tooltipStyle = { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#e2e8f0' };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="bg-[#141d30] border-slate-700/50 lg:col-span-2">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Import Activity
            </CardTitle>
            <div className="flex gap-1">
              {['7d', '14d', '30d'].map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    period === p ? 'bg-cyan-500/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="Completed" fill="#10b981" radius={[2, 2, 0, 0]} stackId="a" />
                <Bar dataKey="Failed" fill="#ef4444" radius={[2, 2, 0, 0]} stackId="a" />
                <Bar dataKey="Active" fill="#3b82f6" radius={[2, 2, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <PieIcon className="w-4 h-4 text-cyan-400" />
            Status Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-52">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value) => <span className="text-slate-400">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                No data for this period
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}