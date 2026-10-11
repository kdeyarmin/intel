import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target } from 'lucide-react';
import { fmtCount, fmtRate, fmtShare, ordinal } from '@/lib/marketFormat';

/**
 * A clinician's standing as a post-acute referral source: the referral
 * index and the published figures behind it (rollup_referral_sources).
 */
export default function ReferralPotentialCard({ potential }) {
  if (!potential) return null;
  const p = potential;
  const chronic = [
    ['Alzheimer’s / dementia', p.cc_alzheimer_pct], ['Heart failure', p.cc_chf_pct], ['COPD', p.cc_copd_pct], ['Chronic kidney disease', p.cc_ckd_pct], ['Diabetes', p.cc_diabetes_pct],
  ].filter(([, v]) => v != null);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="w-4 h-4 text-cyan-400" aria-hidden="true" />
          Referral Potential
          <Badge variant="outline" className="text-[10px] ml-auto">data year {p.data_year}</Badge>
        </CardTitle>
        <p className="text-[11px] text-slate-400">Medicare volume, patient risk and ordering eligibility from CMS files; the index ranks clinicians in the county (not confirmed referrals).</p>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-6">
          <div>
            <p className="text-3xl font-bold text-white">{p.referral_index ?? '—'}</p>
            <p className="text-xs text-slate-400">referral index (0–100)</p>
            {p.rank_in_county != null ? <p className="text-xs text-slate-300 mt-1">{ordinal(p.rank_in_county)} in {p.county_name || 'the county'}</p> : null}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-slate-400">Medicare patients</dt><dd className="text-slate-200">{fmtCount(p.benes)}</dd>
            <dt className="text-slate-400">Services</dt><dd className="text-slate-200">{fmtCount(p.services)}</dd>
            <dt className="text-slate-400">Average risk score</dt><dd className="text-slate-200">{fmtRate(p.avg_risk_score, 2)}</dd>
            <dt className="text-slate-400">Dual-eligible</dt><dd className="text-slate-200">{fmtShare(p.dual_pct)}</dd>
            <dt className="text-slate-400">Hospital affiliations</dt><dd className="text-slate-200">{p.hospital_ccns?.length || 0}</dd>
            <dt className="text-slate-400">DME patients</dt><dd className="text-slate-200">{fmtCount(p.dme_benes)}</dd>
          </dl>
        </div>
        <div className="flex flex-wrap gap-1 mt-3">
          <Badge variant="outline" className={`text-[10px] ${p.hha_eligible ? 'bg-green-900/30 text-green-400 border-green-500/30' : 'text-slate-400'}`}>Home health {p.hha_eligible ? 'eligible' : 'not eligible'}</Badge>
          <Badge variant="outline" className={`text-[10px] ${p.hospice_eligible ? 'bg-purple-900/30 text-purple-400 border-purple-500/30' : 'text-slate-400'}`}>Hospice {p.hospice_eligible ? 'eligible' : 'not eligible'}</Badge>
          <Badge variant="outline" className={`text-[10px] ${p.dme_eligible ? 'bg-cyan-900/30 text-cyan-400 border-cyan-500/30' : 'text-slate-400'}`}>DME {p.dme_eligible ? 'eligible' : 'not eligible'}</Badge>
        </div>
        {chronic.length > 0 && (
          <ul className="mt-3 space-y-1">
            {chronic.map(([label, v]) => (
              <li key={label} className="flex items-center gap-2 text-xs">
                <span className="w-44 text-slate-300">{label}</span>
                <span className="flex-1 h-2 rounded bg-slate-900"><span className="block h-2 rounded bg-cyan-500" style={{ width: `${Math.min(100, Number(v) * 100)}%` }} /></span>
                <span className="w-10 text-right text-slate-200">{fmtShare(v)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
