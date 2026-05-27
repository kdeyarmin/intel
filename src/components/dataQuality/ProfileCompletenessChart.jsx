import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const RULE_LABEL_MAP = {
  'missing_name': 'Provider Name',
  'missing_credential': 'Credential',
  'missing_enum_date': 'Enum Date',
  'missing_email': 'Email Address',
  'no_location': 'Location Linked',
  'no_taxonomy': 'Taxonomy Linked',
  'missing_address': 'Address',
  'missing_city': 'City',
};

function getBarColor(pct) {
  if (pct >= 90) return '#22d3ee';
  if (pct >= 70) return '#22c55e';
  if (pct >= 50) return '#eab308';
  return '#ef4444';
}

export default function ProfileCompletenessChart({ ruleResults = [] }) {
  const data = useMemo(() => {
    const completenessRules = ruleResults.filter(r => r.category === 'completeness');
    if (completenessRules.length === 0) return [];
    return completenessRules.map(r => ({
      field: RULE_LABEL_MAP[r.rule_id] || r.rule_name,
      pct: r.pct,
      filled: r.passing,
      total: r.total,
    })).sort((a, b) => a.pct - b.pct);
  }, [ruleResults]);

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
                formatter={(v, name, props) => [`${v}% (${props.payload.filled?.toLocaleString()} / ${props.payload.total?.toLocaleString()})`, 'Completeness']}
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
