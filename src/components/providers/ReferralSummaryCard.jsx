import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitBranch, TrendingUp, TrendingDown, Check } from 'lucide-react';

// cms_referrals can hold either real provider-to-provider referral counts
// (total_referrals / referred_to_npi populated) or, as produced by this
// codebase's importer, CMS "Order & Referring" eligibility rows (Y/N service
// flags in raw_data, null counts). Adapt to whichever is present.
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

const yearOf = (r) => r.data_year || r.year;

export default function ReferralSummaryCard({ referrals = [] }) {
  const data = useMemo(() => {
    if (!referrals.length) return null;

    // Real referral-volume path
    const totalsByYear = {};
    const benesByYear = {};
    referrals.forEach(r => {
      const y = yearOf(r);
      if (!y) return;
      totalsByYear[y] = (totalsByYear[y] || 0) + (Number(r.total_referrals) || 0);
      benesByYear[y] = (benesByYear[y] || 0) + (Number(r.total_beneficiaries) || 0);
    });
    const years = Object.keys(totalsByYear).sort((a, b) => (Number(a) || 0) - (Number(b) || 0));
    const latestYear = years[years.length - 1];
    const latestTotal = latestYear ? totalsByYear[latestYear] : 0;
    const hasVolume = Object.values(totalsByYear).some(v => v > 0);

    if (hasVolume) {
      const prevYear = years.length > 1 ? years[years.length - 2] : null;
      const prevTotal = prevYear ? totalsByYear[prevYear] : 0;
      const yoy = prevYear && prevTotal > 0 ? ((latestTotal - prevTotal) / prevTotal * 100).toFixed(1) : null;
      const partners = new Set(
        referrals.filter(r => yearOf(r) === latestYear).map(r => r.referred_to_npi).filter(Boolean)
      ).size;
      return { mode: 'volume', year: latestYear, total: latestTotal, yoy, partners, benes: benesByYear[latestYear] || 0 };
    }

    // Eligibility path (Order & Referring designations)
    const latest = [...referrals].sort((a, b) => (Number(yearOf(b)) || 0) - (Number(yearOf(a)) || 0))[0];
    const rd = latest?.raw_data || {};
    if (FLAGS.some(f => rd[f.key] != null)) {
      return {
        mode: 'eligibility',
        year: yearOf(latest),
        flags: FLAGS.map(f => ({ ...f, eligible: isYes(rd[f.key]) })),
      };
    }
    return null;
  }, [referrals]);

  if (!data) return null;

  if (data.mode === 'volume') {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-violet-500" />
            Referral Summary
            {data.year && <Badge variant="outline" className="text-[10px] ml-auto">{data.year}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-6">
            <div>
              <p className="text-3xl font-bold text-white">{data.total.toLocaleString()}</p>
              <p className="text-xs text-slate-500">total referrals</p>
              {data.yoy && (
                <div className="flex items-center gap-1 mt-1">
                  {parseFloat(data.yoy) >= 0
                    ? <TrendingUp className="w-3 h-3 text-green-500" />
                    : <TrendingDown className="w-3 h-3 text-red-500" />}
                  <span className={`text-xs font-medium ${parseFloat(data.yoy) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {data.yoy > 0 ? '+' : ''}{data.yoy}% YoY
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div>
                <p className="text-lg font-bold text-slate-200">{data.partners.toLocaleString()}</p>
                <p className="text-[10px] text-slate-500">referral partners</p>
              </div>
              <div>
                <p className="text-lg font-bold text-slate-200">{data.benes.toLocaleString()}</p>
                <p className="text-[10px] text-slate-500">beneficiaries</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // eligibility mode
  const eligibleCount = data.flags.filter(f => f.eligible).length;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-violet-500" />
          Ordering &amp; Referring Eligibility
          {data.year && <Badge variant="outline" className="text-[10px] ml-auto">{data.year}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-slate-500 mb-3">
          Medicare services this provider is approved to order or refer ({eligibleCount} of {data.flags.length})
        </p>
        <div className="flex flex-wrap gap-2">
          {data.flags.map(f => (
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
      </CardContent>
    </Card>
  );
}
