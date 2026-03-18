import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];

export default function ComparativeAnalysisPanel({ providers = [], utilization = [], referrals = [], taxonomies = [], locations = [] }) {
  const [compareBy, setCompareBy] = useState('entity_type');
  const [metric, setMetric] = useState('total_medicare_payment');
  const [viewMode, setViewMode] = useState('bar');

  // Build NPI lookup maps
  const providerMap = useMemo(() => {
    const m = {};
    providers.forEach(p => { m[p.npi] = p; });
    return m;
  }, [providers]);

  const npiState = useMemo(() => {
    const m = {};
    locations.forEach(l => { if (l.is_primary && l.state) m[l.npi] = l.state; });
    return m;
  }, [locations]);

  const npiTaxonomy = useMemo(() => {
    const m = {};
    taxonomies.forEach(t => { if (t.primary_flag && t.taxonomy_description) m[t.npi] = t.taxonomy_description; });
    return m;
  }, [taxonomies]);

  // Group utilization by compare dimension
  const comparisonData = useMemo(() => {
    const groups = {};
    utilization.forEach(u => {
      const prov = providerMap[u.npi];
      let groupKey = 'Unknown';
      if (compareBy === 'entity_type') groupKey = prov?.entity_type || 'Unknown';
      else if (compareBy === 'state') groupKey = npiState[u.npi] || 'Unknown';
      else if (compareBy === 'specialty') groupKey = npiTaxonomy[u.npi] || 'Unknown';
      else if (compareBy === 'credential') groupKey = prov?.credential || 'Unknown';

      if (!groups[groupKey]) groups[groupKey] = { name: groupKey, total_medicare_payment: 0, total_services: 0, total_medicare_beneficiaries: 0, total_submitted_charges: 0, drug_services: 0, count: 0 };
      groups[groupKey].total_medicare_payment += u.total_medicare_payment || 0;
      groups[groupKey].total_services += u.total_services || 0;
      groups[groupKey].total_medicare_beneficiaries += u.total_medicare_beneficiaries || 0;
      groups[groupKey].total_submitted_charges += u.total_submitted_charges || 0;
      groups[groupKey].drug_services += u.drug_services || 0;
      groups[groupKey].count += 1;
    });
    return Object.values(groups)
      .filter(g => g.name !== 'Unknown')
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, 15);
  }, [utilization, providerMap, npiState, npiTaxonomy, compareBy, metric]);

  // Radar data - normalize for top groups
  const radarData = useMemo(() => {
    if (comparisonData.length < 2) return [];
    const top = comparisonData.slice(0, 5);
    const metrics = ['total_medicare_payment', 'total_services', 'total_medicare_beneficiaries', 'total_submitted_charges', 'drug_services'];
    const maxVals = {};
    metrics.forEach(m => { maxVals[m] = Math.max(...top.map(t => t[m] || 1)); });
    return metrics.map(m => {
      const row = { metric: m.replace('total_', '').replace(/_/g, ' ') };
      top.forEach(t => { row[t.name] = Math.round((t[m] / maxVals[m]) * 100); });
      return row;
    });
  }, [comparisonData]);

  const formatVal = (v) => {
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v?.toLocaleString();
  };

  const METRICS = [
    { key: 'total_medicare_payment', label: 'Medicare Payments' },
    { key: 'total_services', label: 'Total Services' },
    { key: 'total_medicare_beneficiaries', label: 'Beneficiaries' },
    { key: 'total_submitted_charges', label: 'Submitted Charges' },
    { key: 'drug_services', label: 'Drug Services' },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base">Comparative Analysis</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <Select value={compareBy} onValueChange={setCompareBy}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="entity_type">Provider Type</SelectItem>
                <SelectItem value="state">State</SelectItem>
                <SelectItem value="specialty">Specialty</SelectItem>
                <SelectItem value="credential">Credential</SelectItem>
              </SelectContent>
            </Select>
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {METRICS.map(m => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={viewMode} onValueChange={setViewMode}>
              <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">Bar</SelectItem>
                <SelectItem value="radar">Radar</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {comparisonData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">No data to compare</div>
        ) : viewMode === 'bar' ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={comparisonData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" tickFormatter={formatVal} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
              <Tooltip formatter={formatVal} />
              <Bar dataKey={metric} fill={COLORS[0]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <RadarChart data={radarData} outerRadius="70%">
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10 }} />
              <PolarRadiusAxis tick={{ fontSize: 9 }} />
              {comparisonData.slice(0, 5).map((g, i) => (
                <Radar key={g.name} name={g.name} dataKey={g.name} stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.15} />
              ))}
              <Legend />
              <Tooltip />
            </RadarChart>
          </ResponsiveContainer>
        )}

        {/* Summary table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 text-slate-500 font-medium">Group</th>
                <th className="text-right py-2 text-slate-500 font-medium">Providers</th>
                <th className="text-right py-2 text-slate-500 font-medium">Payments</th>
                <th className="text-right py-2 text-slate-500 font-medium">Services</th>
                <th className="text-right py-2 text-slate-500 font-medium">Avg $/Provider</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.slice(0, 10).map((g, i) => (
                <tr key={g.name} className="border-b border-slate-50">
                  <td className="py-1.5 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="font-medium text-slate-700 truncate max-w-[150px]">{g.name}</span>
                  </td>
                  <td className="text-right text-slate-600">{g.count}</td>
                  <td className="text-right text-slate-600">{formatVal(g.total_medicare_payment)}</td>
                  <td className="text-right text-slate-600">{formatVal(g.total_services)}</td>
                  <td className="text-right text-slate-600">{formatVal(g.count > 0 ? g.total_medicare_payment / g.count : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}