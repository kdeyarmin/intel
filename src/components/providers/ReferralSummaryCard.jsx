import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitBranch, Check } from 'lucide-react';

// cms_referrals is populated from the CMS "Order & Referring" dataset, whose
// raw_data carries Y/N eligibility flags (not referral counts). Surface those
// real designations rather than the referral-count fields the table never has.
const FLAGS = [
  { key: 'HHA', label: 'Home Health' },
  { key: 'HOSPICE', label: 'Hospice' },
  { key: 'DME', label: 'DME' },
  { key: 'PARTB', label: 'Part B' },
  { key: 'PMD', label: 'Power Mobility' },
];

const isYes = (v) => {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'Y' || s === 'YES' || s === 'TRUE' || s === '1';
};

export default function ReferralSummaryCard({ referrals = [] }) {
  const summary = useMemo(() => {
    if (!referrals.length) return null;
    const sorted = [...referrals].sort(
      (a, b) => (Number(b.data_year || b.year) || 0) - (Number(a.data_year || a.year) || 0)
    );
    const latest = sorted[0];
    const rd = latest?.raw_data || {};
    const flags = FLAGS.map(f => ({ ...f, eligible: isYes(rd[f.key]) }));
    const hasFlagData = FLAGS.some(f => rd[f.key] != null);
    return { year: latest?.data_year || latest?.year, flags, hasFlagData };
  }, [referrals]);

  if (!summary) return null;

  const eligibleCount = summary.flags.filter(f => f.eligible).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-violet-500" />
          Ordering &amp; Referring Eligibility
          {summary.year && <Badge variant="outline" className="text-[10px] ml-auto">{summary.year}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!summary.hasFlagData ? (
          <p className="text-sm text-slate-400">No ordering/referring designations on file.</p>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-3">
              Medicare services this provider is approved to order or refer
              {` (${eligibleCount} of ${summary.flags.length})`}
            </p>
            <div className="flex flex-wrap gap-2">
              {summary.flags.map(f => (
                <Badge
                  key={f.key}
                  className={f.eligible
                    ? 'bg-emerald-900/20 text-emerald-400 border border-emerald-500/30 gap-1'
                    : 'bg-slate-800/50 text-slate-500 border border-slate-700/50'}
                >
                  {f.eligible && <Check className="w-3 h-3" />}
                  {f.label}
                </Badge>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
