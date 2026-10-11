import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { GitBranch } from 'lucide-react';
import { referralTotalsByYear } from '@/lib/referralSummary';

/** Shared Medicare patients and partner providers per data year. */
export default function ReferralTrendChart({ referrals = [] }) {
  const chartData = useMemo(() => referralTotalsByYear(referrals), [referrals]);

  if (chartData.length < 1) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-violet-400" aria-hidden="true" />
          Shared Patients by Year
        </CardTitle>
        <p className="text-[11px] text-slate-400">CMS shared-patient patterns: patients this provider and a partner both saw. Patterns, not confirmed referrals.</p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar yAxisId="left" dataKey="total_referrals" fill="#8b5cf6" name="Shared patients" />
            <Bar yAxisId="right" dataKey="partners" fill="#06b6d4" name="Partner providers" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
