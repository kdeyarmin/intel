import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const FIELDS = [
  { key: 'npi', label: 'NPI' },
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'credential', label: 'Credential' },
  { key: 'gender', label: 'Gender' },
  { key: 'email', label: 'Email' },
  { key: 'enumeration_date', label: 'Enum Date' },
  { key: 'entity_type', label: 'Entity Type' },
];

function getBarColor(pct) {
  if (pct >= 90) return '#22d3ee';
  if (pct >= 70) return '#22c55e';
  if (pct >= 50) return '#eab308';
  return '#ef4444';
}

export default function ProfileCompletenessChart({ providers = [] }) {
  const data = useMemo(() => {
    if (providers.length === 0) return [];
    const total = providers.length;
    return FIELDS.map(f => {
      const filled = providers.filter(p => p[f.key] && String(p[f.key]).trim() !== '').length;
      const pct = Math.round((filled / total) * 100);
      return { field: f.label, pct, filled, total };
    }).sort((a, b) => a.pct - b.pct);
  }, [providers]);

  if (data.length === 0) return null;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-300">Profile Field Completeness</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 80, right: 30 }}>
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="field" tick={{ fontSize: 11, fill: '#94a3b8' }} width={75} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12, color: '#e2e8f0' }}
                formatter={(v, name, props) => [`${v}% (${props.payload.filled.toLocaleString()} / ${props.payload.total.toLocaleString()})`, 'Completeness']}
              />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={18}>
                {data.map((d, i) => <Cell key={i} fill={getBarColor(d.pct)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}