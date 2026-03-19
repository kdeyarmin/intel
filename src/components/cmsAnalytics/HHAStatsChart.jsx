import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export default function HHAStatsChart({ data, loading }) {
  // Visit type breakdown from HHA data
  const visitBreakdown = useMemo(() => {
    let sn = 0, pt = 0, ot = 0, sp = 0, hha = 0, mss = 0;
    data.forEach(r => {
      sn += r.skilled_nursing_visits || 0;
      pt += r.pt_visits || 0;
      ot += r.ot_visits || 0;
      sp += r.speech_therapy_visits || 0;
      hha += r.home_health_aide_visits || 0;
      mss += r.medical_social_service_visits || 0;
    });
    return [
      { name: 'Skilled Nursing', value: sn },
      { name: 'Physical Therapy', value: pt },
      { name: 'Occupational Therapy', value: ot },
      { name: 'Speech Therapy', value: sp },
      { name: 'Home Health Aide', value: hha },
      { name: 'Medical Social Svc', value: mss },
    ].filter(d => d.value > 0);
  }, [data]);

  // State-level payments from HHA3
  const stateData = useMemo(() => {
    return data
      .filter(r => r.table_name === 'HHA3' && r.state && r.state.length === 2 && r.program_payments)
      .map(r => ({ name: r.state, payments: r.program_payments }))
      .sort((a, b) => b.payments - a.payments)
      .slice(0, 12);
  }, [data]);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-80 w-full" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <div className="w-2 h-2 bg-rose-500 rounded-full" />
          Home Health Agency Statistics
        </CardTitle>
        <CardDescription>Visit type distribution & state payments</CardDescription>
      </CardHeader>
      <CardContent>
        {visitBreakdown.length === 0 && stateData.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No HHA data available</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visitBreakdown.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2 text-center">Visit Types</p>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={visitBreakdown} cx="50%" cy="50%" outerRadius={80} innerRadius={40} dataKey="value" paddingAngle={2}>
                      {visitBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => v.toLocaleString()} />
                    <Legend fontSize={10} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {stateData.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2 text-center">Top States by Payments</p>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={stateData} layout="vertical" margin={{ left: 30, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis type="number" fontSize={10} tick={{ fill: '#64748b' }} tickFormatter={v => v >= 1e9 ? `$${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `$${(v/1e6).toFixed(0)}M` : `$${v}`} />
                    <YAxis type="category" dataKey="name" fontSize={10} tick={{ fill: '#64748b' }} width={30} />
                    <Tooltip formatter={v => `$${v.toLocaleString()}`} />
                    <Bar dataKey="payments" fill="#f43f5e" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}