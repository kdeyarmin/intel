import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import { utilizationYears, sumUtilizationYear } from './utilizationTotals';

export default function UtilizationSummaryCard({ utilizations = [] }) {
  const summary = useMemo(() => {
    if (!utilizations.length) return null;
    // Rows are per-HCPCS slices: "latest" and YoY compare provider totals
    // (summed across every row of a data year), never single rows.
    const years = utilizationYears(utilizations);
    if (!years.length) return null;
    const latest = sumUtilizationYear(utilizations, years[years.length - 1]);
    const prev = years.length > 1 ? sumUtilizationYear(utilizations, years[years.length - 2]) : null;
    // Distinct data years, not rows: a provider with 340 HCPCS codes does not
    // have "340 yrs of data".
    const yearSpan = years.length;

    const totalPayments = utilizations.reduce((s, u) => s + (u.total_medicare_payment || 0), 0);
    const totalServices = utilizations.reduce((s, u) => s + (u.total_services || 0), 0);

    const yoyPayment = prev && prev.total_medicare_payment > 0
      ? ((latest.total_medicare_payment - prev.total_medicare_payment) / prev.total_medicare_payment * 100).toFixed(1)
      : null;
    const yoyServices = prev && prev.total_services > 0
      ? ((latest.total_services - prev.total_services) / prev.total_services * 100).toFixed(1)
      : null;

    return { latest, yearSpan, totalPayments, totalServices, yoyPayment, yoyServices, years };
  }, [utilizations]);

  if (!summary) return null;

  const fmt = (v) => {
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
    return `$${v.toLocaleString()}`;
  };
  const fmtN = (v) => {
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v.toLocaleString();
  };

  const TrendIcon = ({ val }) => {
    if (!val) return <Minus className="w-3 h-3 text-slate-400" />;
    return parseFloat(val) > 0
      ? <TrendingUp className="w-3 h-3 text-green-500" />
      : <TrendingDown className="w-3 h-3 text-red-500" />;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-500" />
          Utilization Summary
          <Badge variant="outline" className="text-[10px] ml-auto">{summary.yearSpan} yr{summary.yearSpan > 1 ? 's' : ''} of data</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-blue-900/20">
            <p className="text-[10px] text-blue-400 font-medium mb-0.5">Latest Payments ({summary.latest?.year})</p>
            <p className="text-lg font-bold text-blue-400">{fmt(summary.latest?.total_medicare_payment || 0)}</p>
            {summary.yoyPayment && (
              <div className="flex items-center gap-1 mt-1">
                <TrendIcon val={summary.yoyPayment} />
                <span className={`text-[10px] font-medium ${parseFloat(summary.yoyPayment) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {summary.yoyPayment > 0 ? '+' : ''}{summary.yoyPayment}% YoY
                </span>
              </div>
            )}
          </div>
          <div className="p-3 rounded-lg bg-teal-900/20">
            <p className="text-[10px] text-teal-400 font-medium mb-0.5">Latest Services ({summary.latest?.year})</p>
            <p className="text-lg font-bold text-teal-400">{fmtN(summary.latest?.total_services || 0)}</p>
            {summary.yoyServices && (
              <div className="flex items-center gap-1 mt-1">
                <TrendIcon val={summary.yoyServices} />
                <span className={`text-[10px] font-medium ${parseFloat(summary.yoyServices) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {summary.yoyServices > 0 ? '+' : ''}{summary.yoyServices}% YoY
                </span>
              </div>
            )}
          </div>
          <div className="p-3 rounded-lg bg-emerald-900/20">
            <p className="text-[10px] text-emerald-400 font-medium mb-0.5">Cumulative Payments</p>
            <p className="text-lg font-bold text-emerald-400">{fmt(summary.totalPayments)}</p>
          </div>
          <div className="p-3 rounded-lg bg-violet-900/20">
            <p className="text-[10px] text-violet-400 font-medium mb-0.5">Code-level benes ({summary.latest?.year})</p>
            <p className="text-lg font-bold text-violet-400">{fmtN(summary.latest?.code_level_beneficiaries || 0)}</p>
          </div>
        </div>
        <div className="flex gap-1.5 mt-3 flex-wrap">
          <span className="text-[10px] text-slate-400">Years:</span>
          {summary.years.map(y => (
            <Badge key={y} variant="outline" className="text-[10px] h-5">{y}</Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}