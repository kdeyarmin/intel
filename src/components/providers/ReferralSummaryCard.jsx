import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitBranch, TrendingUp, TrendingDown } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ec4899', '#06b6d4'];

const TYPES = [
  { key: 'home_health_referrals', label: 'Home Health', short: 'HH' },
  { key: 'hospice_referrals', label: 'Hospice', short: 'Hosp' },
  { key: 'snf_referrals', label: 'SNF', short: 'SNF' },
  { key: 'dme_referrals', label: 'DME', short: 'DME' },
  { key: 'imaging_referrals', label: 'Imaging', short: 'Img' },
];

export default function ReferralSummaryCard({ referrals = [] }) {
  const summary = useMemo(() => {
    if (!referrals.length) return null;
    const sorted = [...referrals].sort((a, b) => (a.year || 0) - (b.year || 0));
    const latest = sorted[sorted.length - 1];
    const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;

    const yoy = prev && prev.total_referrals > 0
      ? ((latest.total_referrals - prev.total_referrals) / prev.total_referrals * 100).toFixed(1)
      : null;

    const breakdown = TYPES.map(t => ({
      name: t.label,
      value: latest[t.key] || 0,
    })).filter(b => b.value > 0);

    const dominant = breakdown.length > 0
      ? breakdown.reduce((a, b) => a.value > b.value ? a : b).name
      : null;

    return { latest, yearSpan: sorted.length, yoy, breakdown, dominant };
  }, [referrals]);

  if (!summary) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-violet-500" />
          Referral Summary
          <Badge variant="outline" className="text-[10px] ml-auto">{summary.latest?.year}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-3xl font-bold text-slate-900">{(summary.latest?.total_referrals || 0).toLocaleString()}</p>
            <p className="text-xs text-slate-500">total referrals</p>
            {summary.yoy && (
              <div className="flex items-center gap-1 mt-1">
                {parseFloat(summary.yoy) >= 0
                  ? <TrendingUp className="w-3 h-3 text-green-500" />
                  : <TrendingDown className="w-3 h-3 text-red-500" />}
                <span className={`text-xs font-medium ${parseFloat(summary.yoy) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {summary.yoy > 0 ? '+' : ''}{summary.yoy}% YoY
                </span>
              </div>
            )}
            {summary.dominant && (
              <p className="text-[10px] text-slate-400 mt-2">Primary channel: <span className="font-medium text-slate-600">{summary.dominant}</span></p>
            )}
          </div>
          {summary.breakdown.length > 0 && (
            <div className="w-28 h-28">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={summary.breakdown} dataKey="value" cx="50%" cy="50%" innerRadius={25} outerRadius={45} paddingAngle={2}>
                    {summary.breakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => v.toLocaleString()} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {summary.breakdown.map((b, i) => (
            <div key={b.name} className="flex items-center gap-1.5 text-[10px]">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-slate-600">{b.name}: {b.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}