import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitBranch, TrendingUp, TrendingDown, Check } from 'lucide-react';
import { ELIGIBILITY_FLAGS, referralTotalsByYear } from '@/lib/referralSummary';

/**
 * Shared-patient volume by year (cms_referrals: CMS shared-patient pairs) and,
 * when known, the Medicare services the provider may order or refer
 * (cms_order_referring). Shows nothing when neither exists.
 */
export default function ReferralSummaryCard({ referrals = [], orderReferring = null }) {
  const volume = useMemo(() => {
    const years = referralTotalsByYear(referrals);
    if (!years.length || !years.some((y) => y.total_referrals > 0)) return null;
    const latest = years[years.length - 1];
    const prev = years.length > 1 ? years[years.length - 2] : null;
    const yoy = prev && prev.total_referrals > 0 ? (((latest.total_referrals - prev.total_referrals) / prev.total_referrals) * 100).toFixed(1) : null;
    return { year: latest.year, total: latest.total_referrals, yoy, partners: latest.partners, benes: latest.total_beneficiaries };
  }, [referrals]);

  const flags = orderReferring ? ELIGIBILITY_FLAGS.map((f) => ({ ...f, eligible: orderReferring[f.key] === true })) : null;

  if (!volume && !flags) return null;

  return (
    <div className="space-y-4">
      {volume && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-violet-500" aria-hidden="true" />
              Shared Patients
              <Badge variant="outline" className="text-[10px] ml-auto">data year {volume.year}</Badge>
            </CardTitle>
            <p className="text-[11px] text-slate-400">CMS shared-patient patterns: patterns, not confirmed referrals.</p>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-6">
              <div>
                <p className="text-3xl font-bold text-white">{volume.total.toLocaleString()}</p>
                <p className="text-xs text-slate-400">shared-patient encounters</p>
                {volume.yoy && (
                  <div className="flex items-center gap-1 mt-1">
                    {parseFloat(volume.yoy) >= 0
                      ? <TrendingUp className="w-3 h-3 text-green-500" aria-hidden="true" />
                      : <TrendingDown className="w-3 h-3 text-red-500" aria-hidden="true" />}
                    <span className={`text-xs font-medium ${parseFloat(volume.yoy) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {volume.yoy > 0 ? '+' : ''}{volume.yoy}% vs prior year
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-lg font-bold text-slate-200">{volume.partners.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-400">partner providers</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-200">{volume.benes.toLocaleString()}</p>
                  <p className="text-[10px] text-slate-400">beneficiaries</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {flags && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-violet-500" aria-hidden="true" />
              Ordering &amp; Referring Eligibility
              {orderReferring.as_of && <Badge variant="outline" className="text-[10px] ml-auto">as of {String(orderReferring.as_of).slice(0, 10)}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-slate-400 mb-3">
              Medicare services this provider is approved to order or refer ({flags.filter((f) => f.eligible).length} of {flags.length}), from the CMS Order &amp; Referring file
            </p>
            <div className="flex flex-wrap gap-2">
              {flags.map((f) => (
                <Badge
                  key={f.key}
                  className={f.eligible
                    ? 'bg-emerald-900/20 text-emerald-400 border border-emerald-500/30 gap-1'
                    : 'bg-slate-800/50 text-slate-400 border border-slate-700/50'}
                >
                  {f.eligible && <Check className="w-3 h-3" aria-hidden="true" />}
                  {f.label}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
