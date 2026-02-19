import React from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';

const BAR_COLORS = {
  high: '#16a34a',
  medium: '#ca8a04',
  low: '#dc2626',
};

function getBarColor(value) {
  if (value >= 80) return BAR_COLORS.high;
  if (value >= 50) return BAR_COLORS.medium;
  return BAR_COLORS.low;
}

export default function CompletenessPanel({ providers, locations, taxonomies }) {
  const total = providers.length || 1;

  const hasNPI = providers.filter(p => p.npi && p.npi.trim() !== '').length;
  const hasName = providers.filter(p => (p.first_name && p.last_name) || p.organization_name).length;
  const hasCredential = providers.filter(p => p.credential && p.credential.trim() !== '').length;
  const hasGender = providers.filter(p => p.gender && p.gender !== '').length;
  const hasStatus = providers.filter(p => p.status).length;

  const locNPIs = new Set(locations.map(l => l.npi));
  const provWithLocation = providers.filter(p => locNPIs.has(p.npi)).length;

  const taxNPIs = new Set((taxonomies || []).map(t => t.npi));
  const provWithTaxonomy = providers.filter(p => taxNPIs.has(p.npi)).length;

  const metrics = [
    { name: 'NPI', pct: Math.round((hasNPI / total) * 100) },
    { name: 'Name', pct: Math.round((hasName / total) * 100) },
    { name: 'Credential', pct: Math.round((hasCredential / total) * 100) },
    { name: 'Gender', pct: Math.round((hasGender / total) * 100) },
    { name: 'Status', pct: Math.round((hasStatus / total) * 100) },
    { name: 'Location', pct: Math.round((provWithLocation / total) * 100) },
    { name: 'Specialty', pct: Math.round((provWithTaxonomy / total) * 100) },
  ];

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-700 mb-2">Record Completeness</h4>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={metrics} layout="vertical" margin={{ left: 55, right: 10, top: 0, bottom: 0 }}>
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={50} />
            <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={12}>
              {metrics.map((m, i) => (
                <Cell key={i} fill={getBarColor(m.pct)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}