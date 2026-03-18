import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
  AreaChart, Area
} from 'recharts';

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899'];

const METRIC_OPTIONS = {
  utilization: [
    { key: 'total_services', label: 'Total Services' },
    { key: 'total_medicare_beneficiaries', label: 'Beneficiaries' },
    { key: 'total_medicare_payment', label: 'Medicare Payments ($)' },
    { key: 'total_submitted_charges', label: 'Submitted Charges ($)' },
    { key: 'drug_services', label: 'Drug Services' },
  ],
  referrals: [
    { key: 'total_referrals', label: 'Total Referrals' },
    { key: 'home_health_referrals', label: 'Home Health' },
    { key: 'hospice_referrals', label: 'Hospice' },
    { key: 'snf_referrals', label: 'SNF' },
    { key: 'dme_referrals', label: 'DME' },
    { key: 'imaging_referrals', label: 'Imaging' },
  ],
};

export default function TrendAnalysisPanel({ utilization = [], referrals = [] }) {
  const [dataset, setDataset] = useState('utilization');
  const [selectedMetrics, setSelectedMetrics] = useState(['total_services', 'total_medicare_payment']);
  const [chartStyle, setChartStyle] = useState('line');

  const metrics = METRIC_OPTIONS[dataset] || [];

  const toggleMetric = (key) => {
    setSelectedMetrics(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key].slice(0, 4)
    );
  };

  const trendData = useMemo(() => {
    const source = dataset === 'utilization' ? utilization : referrals;
    const yearField = dataset === 'utilization' ? 'year' : 'year';
    const byYear = {};
    source.forEach(r => {
      const yr = r[yearField];
      if (!yr) return;
      if (!byYear[yr]) byYear[yr] = { year: yr };
      selectedMetrics.forEach(m => {
        byYear[yr][m] = (byYear[yr][m] || 0) + (r[m] || 0);
      });
    });
    return Object.values(byYear).sort((a, b) => a.year - b.year);
  }, [dataset, utilization, referrals, selectedMetrics]);

  // Calculate YoY growth
  const growthStats = useMemo(() => {
    if (trendData.length < 2) return [];
    const latest = trendData[trendData.length - 1];
    const prev = trendData[trendData.length - 2];
    return selectedMetrics.map(m => {
      const curr = latest[m] || 0;
      const old = prev[m] || 1;
      const pct = ((curr - old) / old * 100).toFixed(1);
      return { key: m, label: metrics.find(x => x.key === m)?.label || m, pct: parseFloat(pct) };
    });
  }, [trendData, selectedMetrics, metrics]);

  const formatVal = (v) => {
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v?.toLocaleString();
  };

  const ChartComponent = chartStyle === 'area' ? AreaChart : LineChart;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base">Multi-Year Trend Analysis</CardTitle>
          <div className="flex gap-2">
            <Select value={dataset} onValueChange={(v) => { setDataset(v); setSelectedMetrics(METRIC_OPTIONS[v].slice(0, 2).map(m => m.key)); }}>
              <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="utilization">Utilization</SelectItem>
                <SelectItem value="referrals">Referrals</SelectItem>
              </SelectContent>
            </Select>
            <Select value={chartStyle} onValueChange={setChartStyle}>
              <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="line">Line</SelectItem>
                <SelectItem value="area">Area</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {metrics.map((m, i) => (
            <button
              key={m.key}
              onClick={() => toggleMetric(m.key)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                selectedMetrics.includes(m.key)
                  ? 'text-white border-transparent'
                  : 'text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
              style={selectedMetrics.includes(m.key) ? { backgroundColor: COLORS[selectedMetrics.indexOf(m.key)] } : {}}
            >
              {m.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {/* YoY Growth indicators */}
        {growthStats.length > 0 && (
          <div className="flex gap-3 mb-4 flex-wrap">
            {growthStats.map(g => (
              <div key={g.key} className="flex items-center gap-1.5 text-xs bg-slate-50 rounded-lg px-3 py-1.5">
                {g.pct > 0 ? <TrendingUp className="w-3.5 h-3.5 text-green-500" /> : g.pct < 0 ? <TrendingDown className="w-3.5 h-3.5 text-red-500" /> : <Minus className="w-3.5 h-3.5 text-slate-400" />}
                <span className="text-slate-600">{g.label}:</span>
                <span className={g.pct > 0 ? 'text-green-600 font-semibold' : g.pct < 0 ? 'text-red-600 font-semibold' : 'text-slate-500'}>
                  {g.pct > 0 ? '+' : ''}{g.pct}% YoY
                </span>
              </div>
            ))}
          </div>
        )}

        {trendData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">No data available for selected metrics</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ChartComponent data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={formatVal} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => formatVal(v)} />
              <Legend />
              {selectedMetrics.map((m, i) =>
                chartStyle === 'area' ? (
                  <Area key={m} type="monotone" dataKey={m} name={metrics.find(x => x.key === m)?.label || m} stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.15} strokeWidth={2} />
                ) : (
                  <Line key={m} type="monotone" dataKey={m} name={metrics.find(x => x.key === m)?.label || m} stroke={COLORS[i]} strokeWidth={2} dot={{ r: 3 }} />
                )
              )}
            </ChartComponent>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}