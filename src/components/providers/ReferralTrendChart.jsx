import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { GitBranch } from 'lucide-react';

const COLORS = {
  home_health_referrals: '#3b82f6',
  hospice_referrals: '#8b5cf6',
  snf_referrals: '#f59e0b',
  dme_referrals: '#10b981',
  imaging_referrals: '#ec4899',
};

const LABELS = {
  home_health_referrals: 'Home Health',
  hospice_referrals: 'Hospice',
  snf_referrals: 'SNF',
  dme_referrals: 'DME',
  imaging_referrals: 'Imaging',
};

export default function ReferralTrendChart({ referrals = [] }) {
  const chartData = useMemo(() => {
    if (!referrals.length) return [];
    return [...referrals]
      .sort((a, b) => (a.year || 0) - (b.year || 0))
      .map(r => ({
        year: r.year,
        home_health_referrals: r.home_health_referrals || 0,
        hospice_referrals: r.hospice_referrals || 0,
        snf_referrals: r.snf_referrals || 0,
        dme_referrals: r.dme_referrals || 0,
        imaging_referrals: r.imaging_referrals || 0,
      }));
  }, [referrals]);

  if (chartData.length < 1) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-violet-600" />
          Referral Breakdown by Year
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {Object.keys(COLORS).map(key => (
              <Bar key={key} dataKey={key} fill={COLORS[key]} name={LABELS[key]} stackId="a" />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}