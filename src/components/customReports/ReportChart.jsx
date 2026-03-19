import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { DATASET_CONFIG, CHART_COLORS } from './reportConfig';

function aggregateData(rawData, config) {
  const dsConfig = DATASET_CONFIG[config.dataset];
  if (!dsConfig || !rawData.length) return [];

  const groupKey = config.group_by;
  const metrics = config.metrics || [];

  // Apply filters
  let filtered = [...rawData];
  const filters = config.filters || {};
  const yearField = dsConfig.yearField;
  if (filters.year && yearField) filtered = filtered.filter(r => r[yearField] === filters.year);
  if (filters.state) filtered = filtered.filter(r => r.state === filters.state);
  if (filters.hospital_type) filtered = filtered.filter(r => (r.hospital_type || '').toLowerCase().includes(filters.hospital_type.toLowerCase()));
  if (filters.table_name) filtered = filtered.filter(r => r.table_name === filters.table_name);

  if (!groupKey) {
    // No grouping — single total row
    const totals = { group: 'Total' };
    metrics.forEach(m => { totals[m] = filtered.reduce((s, r) => s + (Number(r[m]) || 0), 0); });
    return [totals];
  }

  // Group by
  const groups = {};
  for (const row of filtered) {
    const gv = String(row[groupKey] || 'Unknown').substring(0, 30);
    if (!gv || gv === 'Unknown' || gv === '' || gv === 'undefined') continue;
    if (!groups[gv]) {
      groups[gv] = { group: gv };
      metrics.forEach(m => { groups[gv][m] = 0; });
    }
    metrics.forEach(m => { groups[gv][m] += Number(row[m]) || 0; });
  }

  return Object.values(groups)
    .sort((a, b) => {
      const firstMetric = metrics[0];
      return (b[firstMetric] || 0) - (a[firstMetric] || 0);
    })
    .slice(0, 25);
}

function fmt(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export default function ReportChart({ rawData, config, loading }) {
  const chartData = useMemo(() => aggregateData(rawData, config), [rawData, config]);
  const dsConfig = DATASET_CONFIG[config.dataset];
  const metricLabels = {};
  (dsConfig?.metrics || []).forEach(m => { metricLabels[m.key] = m.label; });

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-72 w-full" /></CardContent></Card>;

  if (!chartData.length) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
            No data matches your filters. Try adjusting year, state, or table name.
          </div>
        </CardContent>
      </Card>
    );
  }

  const metrics = config.metrics || [];
  const chartType = config.chart_type || 'bar';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-700">
          {config.name || 'Report Results'} — {chartData.length} groups
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={340}>
          {chartType === 'bar' ? (
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="group" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} />
              <Tooltip formatter={(v, name) => [fmt(v), metricLabels[name] || name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={name => metricLabels[name] || name} />
              {metrics.map((m, i) => (
                <Bar key={m} dataKey={m} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[3, 3, 0, 0]} />
              ))}
            </BarChart>
          ) : chartType === 'line' ? (
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="group" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={fmt} />
              <Tooltip formatter={(v, name) => [fmt(v), metricLabels[name] || name]} />
              <Legend wrapperStyle={{ fontSize: 11 }} formatter={name => metricLabels[name] || name} />
              {metrics.map((m, i) => (
                <Line key={m} type="monotone" dataKey={m} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          ) : (
            <PieChart>
              <Pie
                data={chartData}
                dataKey={metrics[0]}
                nameKey="group"
                cx="50%"
                cy="50%"
                outerRadius={120}
                label={({ group, value }) => `${group}: ${fmt(value)}`}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export { aggregateData };