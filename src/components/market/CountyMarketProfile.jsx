import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, Percent, Building2, Activity, DollarSign, Hospital, HeartPulse } from 'lucide-react';
import { fmtCount, fmtMoney, fmtPct, fmtShare, fmtRate } from '@/lib/marketFormat';
import MarketFreshness from './MarketFreshness';

function Kpi({ icon: Icon, color, label, value, sub }) {
  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={`w-4 h-4 ${color}`} aria-hidden="true" />
          <span className="text-xs text-slate-400">{label}</span>
        </div>
        <p className="text-2xl font-bold text-slate-100">{value}</p>
        {sub ? <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

/** The one-row county market card: demand, Medicare Advantage, post-acute use and supply, hospital sources. */
export default function CountyMarketProfile({ profile, vintages, rollups, countyName }) {
  if (!profile?.available) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-400">No market profile for {countyName || 'this county'} yet. It needs the Medicare enrollment, market saturation and geographic variation files imported and the market rollups computed.</p>
        <MarketFreshness rollups={rollups} jobs={['county_market_profile']} />
      </div>
    );
  }
  const p = profile;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi icon={Users} color="text-cyan-400" label="Medicare beneficiaries" value={fmtCount(p.benes)} sub={p.enrollment_period ? `Enrollment ${p.enrollment_period}` : null} />
        <Kpi icon={Percent} color="text-violet-400" label="Medicare Advantage share" value={fmtShare(p.ma_penetration)} sub={`${fmtCount(p.original_medicare)} in Original Medicare`} />
        <Kpi icon={HeartPulse} color="text-rose-400" label="Aged 85 and over" value={fmtCount(p.benes_85_plus)} sub={`${fmtCount(p.dual)} dual-eligible`} />
        <Kpi icon={Hospital} color="text-blue-400" label="Hospitals serving residents" value={fmtCount(p.hospitals_serving)} sub={p.top_hospital_share != null ? `Top hospital takes ${fmtShare(p.top_hospital_share)} of cases (${p.hsa_year})` : null} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { key: 'hha', label: 'Home health', providers: p.hha_providers, users: p.hha_users, pct: p.hha_users_pct, spend: p.std_per_capita_hha, agencies: p.hha_agencies, color: 'text-green-400' },
          { key: 'hospice', label: 'Hospice', providers: p.hospice_providers, users: p.hospice_users, pct: p.hospice_users_pct, spend: p.std_per_capita_hospice, agencies: p.hospice_agencies, color: 'text-purple-400' },
          { key: 'snf', label: 'Skilled nursing', providers: p.snf_providers, users: p.snf_users, pct: p.snf_users_pct, spend: p.std_per_capita_snf, agencies: p.snf_facilities, color: 'text-amber-400' },
        ].map((s) => (
          <Card key={s.key} className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center gap-2 mb-1">
                <Building2 className={`w-4 h-4 ${s.color}`} aria-hidden="true" />
                <span className="text-sm font-medium text-slate-200">{s.label}</span>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-400">Users (share of FFS)</dt><dd className="text-slate-200">{fmtCount(s.users)} ({fmtPct(s.pct)})</dd>
                <dt className="text-slate-400">Providers billing here</dt><dd className="text-slate-200">{fmtCount(s.providers)}</dd>
                <dt className="text-slate-400">Located in county</dt><dd className="text-slate-200">{fmtCount(s.agencies)}</dd>
                <dt className="text-slate-400">Spend per beneficiary</dt><dd className="text-slate-200">{fmtMoney(s.spend)}</dd>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
      {(p.pop_65_plus != null || p.licensed_homes != null) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi icon={Users} color="text-teal-400" label="Residents aged 65+" value={fmtCount(p.pop_65_plus)} sub={p.pop_total != null && p.pop_65_plus != null ? `${fmtShare(p.pop_65_plus / p.pop_total)} of ${fmtCount(p.pop_total)} residents (ACS)` : 'Census ACS'} />
          <Kpi icon={HeartPulse} color="text-teal-400" label="Residents aged 85+" value={fmtCount(p.pop_85_plus)} sub={p.living_alone_65_plus != null ? `${fmtCount(p.living_alone_65_plus)} people 65+ live alone` : null} />
          <Kpi icon={DollarSign} color="text-teal-400" label="Median household income" value={fmtMoney(p.median_income)} sub={p.median_home_value != null ? `Median home ${fmtMoney(p.median_home_value)}` : null} />
          <Kpi icon={Building2} color="text-pink-400" label="Licensed personal care / assisted living" value={p.licensed_homes != null ? `${fmtCount(p.licensed_homes)} homes` : 'Not loaded'} sub={p.licensed_beds != null ? `${fmtCount(p.licensed_beds)} licensed beds` : 'Import a state licensing export'} />
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi icon={DollarSign} color="text-emerald-400" label="Standardized spend per beneficiary" value={fmtMoney(p.std_per_capita_total)} sub={p.variation_year ? `Geographic variation ${p.variation_year}` : null} />
        <Kpi icon={Activity} color="text-amber-400" label="Hospital readmission rate" value={fmtShare(p.readmission_rate, 1)} />
        <Kpi icon={Activity} color="text-orange-400" label="ER visits per 1,000" value={fmtRate(p.er_visits_per_1000, 0)} />
        <Kpi icon={Activity} color="text-sky-400" label="Average HCC risk score" value={fmtRate(p.avg_hcc_score, 2)} />
      </div>
      <MarketFreshness rollups={rollups} jobs={['county_market_profile']} vintages={vintages} />
    </div>
  );
}
