import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, UserCheck, Phone, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const STATUS_COLORS = {
  'New': '#3b82f6',
  'Contacted': '#eab308',
  'Qualified': '#22c55e',
  'Not a fit': '#6b7280',
};

export default function LeadListAnalytics({ leads }) {
  const stats = useMemo(() => {
    const total = leads.length;
    const statusCounts = { 'New': 0, 'Contacted': 0, 'Qualified': 0, 'Not a fit': 0 };
    leads.forEach(l => {
      const s = l.member?.status || 'New';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    const contacted = statusCounts['Contacted'] + statusCounts['Qualified'] + statusCounts['Not a fit'];
    const qualified = statusCounts['Qualified'];
    const contactRate = total > 0 ? ((contacted / total) * 100).toFixed(1) : 0;
    const conversionRate = contacted > 0 ? ((qualified / contacted) * 100).toFixed(1) : 0;
    const qualificationRate = total > 0 ? ((qualified / total) * 100).toFixed(1) : 0;

    const pieData = Object.entries(statusCounts)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));

    const avgScore = leads.reduce((sum, l) => sum + (l.score?.score || 0), 0) / (total || 1);

    return { total, statusCounts, contacted, qualified, contactRate, conversionRate, qualificationRate, pieData, avgScore };
  }, [leads]);

  if (leads.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-3 text-center">
            <Users className="w-4 h-4 mx-auto text-blue-400 mb-1" />
            <div className="text-lg font-bold text-slate-100">{stats.total}</div>
            <div className="text-[10px] text-slate-400">Total Leads</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-3 text-center">
            <Phone className="w-4 h-4 mx-auto text-yellow-400 mb-1" />
            <div className="text-lg font-bold text-slate-100">{stats.contactRate}%</div>
            <div className="text-[10px] text-slate-400">Contact Rate</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-3 text-center">
            <UserCheck className="w-4 h-4 mx-auto text-green-400 mb-1" />
            <div className="text-lg font-bold text-slate-100">{stats.conversionRate}%</div>
            <div className="text-[10px] text-slate-400">Conversion Rate</div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-3 text-center">
            <TrendingUp className="w-4 h-4 mx-auto text-cyan-400 mb-1" />
            <div className="text-lg font-bold text-slate-100">{stats.avgScore.toFixed(0)}</div>
            <div className="text-[10px] text-slate-400">Avg Score</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-3">
            <div className="text-xs text-slate-400 mb-2">Status Distribution</div>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={stats.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} innerRadius={30}>
                  {stats.pieData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || '#6b7280'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center mt-1">
              {stats.pieData.map(d => (
                <div key={d.name} className="flex items-center gap-1 text-[10px] text-slate-300">
                  <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[d.name] }} />
                  {d.name} ({d.value})
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-3">
            <div className="text-xs text-slate-400 mb-2">Funnel</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={[
                  { stage: 'Total', count: stats.total },
                  { stage: 'Contacted', count: stats.contacted },
                  { stage: 'Qualified', count: stats.qualified },
                ]}
                layout="vertical"
              >
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis dataKey="stage" type="category" tick={{ fontSize: 10, fill: '#94a3b8' }} width={70} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}