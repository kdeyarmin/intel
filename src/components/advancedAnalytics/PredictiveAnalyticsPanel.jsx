import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, TrendingUp, AlertTriangle, ArrowUpRight } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ReferenceLine
} from 'recharts';

const COLORS = { actual: '#3b82f6', predicted: '#f59e0b' };

function linearRegression(data) {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  data.forEach(d => { sumX += d.x; sumY += d.y; sumXY += d.x * d.y; sumXX += d.x * d.x; });
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export default function PredictiveAnalyticsPanel({ utilization = [], referrals = [] }) {
  const [dataset, setDataset] = useState('utilization');
  const [metric, setMetric] = useState('total_medicare_payment');
  const [forecastYears, setForecastYears] = useState(3);

  const metricOptions = dataset === 'utilization'
    ? [
        { key: 'total_medicare_payment', label: 'Medicare Payments' },
        { key: 'total_services', label: 'Total Services' },
        { key: 'total_medicare_beneficiaries', label: 'Beneficiaries' },
      ]
    : [
        { key: 'total_referrals', label: 'Total Referrals' },
        { key: 'home_health_referrals', label: 'Home Health' },
        { key: 'hospice_referrals', label: 'Hospice' },
        { key: 'snf_referrals', label: 'SNF' },
      ];

  const { chartData, insights, lastActualYear } = useMemo(() => {
    const source = dataset === 'utilization' ? utilization : referrals;
    // Aggregate by year
    const byYear = {};
    source.forEach(r => {
      const yr = r.year;
      if (!yr) return;
      if (!byYear[yr]) byYear[yr] = 0;
      byYear[yr] += r[metric] || 0;
    });
    const years = Object.keys(byYear).map(Number).sort();
    if (years.length < 2) return { chartData: [], insights: [], lastActualYear: 0 };

    const points = years.map(y => ({ x: y, y: byYear[y] }));
    const { slope, intercept } = linearRegression(points);

    // Build chart data
    const data = years.map(y => ({ year: y, actual: byYear[y], predicted: null }));
    const lastYear = years[years.length - 1];

    // Forecast
    for (let i = 1; i <= forecastYears; i++) {
      const yr = lastYear + i;
      const pred = Math.max(0, Math.round(slope * yr + intercept));
      data.push({ year: yr, actual: null, predicted: pred });
    }
    // Add predicted line on last actual year for continuity
    data.find(d => d.year === lastYear).predicted = byYear[lastYear];

    // Insights
    const ins = [];
    const cagr = years.length >= 2
      ? ((byYear[years[years.length - 1]] / byYear[years[0]]) ** (1 / (years.length - 1)) - 1) * 100
      : 0;
    ins.push({ type: 'trend', text: `${cagr.toFixed(1)}% CAGR over ${years.length} years`, value: cagr });

    const forecastEnd = Math.max(0, Math.round(slope * (lastYear + forecastYears) + intercept));
    const pctChange = byYear[lastYear] > 0
      ? ((forecastEnd - byYear[lastYear]) / byYear[lastYear] * 100).toFixed(1)
      : 0;
    ins.push({ type: 'forecast', text: `Projected ${pctChange > 0 ? '+' : ''}${pctChange}% by ${lastYear + forecastYears}`, value: parseFloat(pctChange) });

    // Detect anomalies (years with >2 stddev from trend)
    const residuals = points.map(p => p.y - (slope * p.x + intercept));
    const mean = residuals.reduce((s, v) => s + v, 0) / residuals.length;
    const std = Math.sqrt(residuals.reduce((s, v) => s + (v - mean) ** 2, 0) / residuals.length);
    const anomalies = points.filter((p, i) => Math.abs(residuals[i] - mean) > 2 * std);
    if (anomalies.length > 0) {
      ins.push({ type: 'anomaly', text: `${anomalies.length} anomalous year(s): ${anomalies.map(a => a.x).join(', ')}` });
    }

    return { chartData: data, insights: ins, lastActualYear: lastYear };
  }, [dataset, metric, utilization, referrals, forecastYears]);

  const formatVal = (v) => {
    if (v == null) return '';
    if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v?.toLocaleString();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <CardTitle className="text-base">Predictive Analytics</CardTitle>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={dataset} onValueChange={(v) => { setDataset(v); setMetric(v === 'utilization' ? 'total_medicare_payment' : 'total_referrals'); }}>
              <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="utilization">Utilization</SelectItem>
                <SelectItem value="referrals">Referrals</SelectItem>
              </SelectContent>
            </Select>
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {metricOptions.map(m => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={String(forecastYears)} onValueChange={(v) => setForecastYears(Number(v))}>
              <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">+1 Year</SelectItem>
                <SelectItem value="2">+2 Years</SelectItem>
                <SelectItem value="3">+3 Years</SelectItem>
                <SelectItem value="5">+5 Years</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Insight cards */}
        {insights.length > 0 && (
          <div className="flex gap-3 mb-4 flex-wrap">
            {insights.map((ins, i) => (
              <div key={i} className={`flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 ${
                ins.type === 'anomaly' ? 'bg-red-50 text-red-700' : ins.type === 'forecast' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'
              }`}>
                {ins.type === 'trend' && <TrendingUp className="w-3.5 h-3.5" />}
                {ins.type === 'forecast' && <ArrowUpRight className="w-3.5 h-3.5" />}
                {ins.type === 'anomaly' && <AlertTriangle className="w-3.5 h-3.5" />}
                <span className="font-medium">{ins.text}</span>
              </div>
            ))}
          </div>
        )}

        {chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-slate-400">
            Need at least 2 years of data for predictions
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={formatVal} tick={{ fontSize: 11 }} />
              <Tooltip formatter={formatVal} />
              <Legend />
              {lastActualYear > 0 && <ReferenceLine x={lastActualYear} stroke="#94a3b8" strokeDasharray="3 3" label={{ value: 'Forecast →', position: 'top', fontSize: 10, fill: '#94a3b8' }} />}
              <Line type="monotone" dataKey="actual" name="Actual" stroke={COLORS.actual} strokeWidth={2.5} dot={{ r: 4 }} connectNulls={false} />
              <Line type="monotone" dataKey="predicted" name="Predicted" stroke={COLORS.predicted} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        )}

        <p className="text-[10px] text-slate-400 mt-3 text-center">
          Predictions use linear regression on historical data. Actual results may vary.
        </p>
      </CardContent>
    </Card>
  );
}