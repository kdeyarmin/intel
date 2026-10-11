import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2 } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { fmtCount, fmtPct, fmtRate, fmtShare, fmtMoney } from '@/lib/marketFormat';
import MarketShareTrendChart from './MarketShareTrendChart';
import MarketFreshness from './MarketFreshness';

const ORDER = ['snf', 'hha', 'hospice', 'irf', 'ltch'];

/** Post-acute providers located in a county, ranked by Medicare beneficiaries served, with agency coverage. */
export default function PacCompetitorsTable({ competitors = {}, trends = {}, coverage = {}, labels = {}, rollups, countyName }) {
  const [setting, setSetting] = useState(ORDER.find((s) => competitors[s]?.rows?.length) || 'snf');
  const current = competitors[setting] || { data_year: null, rows: [] };
  const rows = current.rows || [];
  const max = Math.max(1, ...rows.map((r) => r.share ?? 0));
  const cover = coverage[setting] || [];
  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-amber-400" aria-hidden="true" /> Post-acute providers in {countyName || 'this county'}
        </CardTitle>
        <p className="text-[11px] text-slate-400">
          Share of the Medicare FFS beneficiaries served by providers of each setting located in the county (post-acute utilization{current.data_year ? ` ${current.data_year}` : ''}).
        </p>
        <div className="flex flex-wrap gap-1 pt-1" role="group" aria-label="Setting">
          {ORDER.map((s) => (
            <Button key={s} size="sm" variant={s === setting ? 'default' : 'outline'} aria-pressed={s === setting}
              className={s === setting ? 'bg-cyan-700 hover:bg-cyan-800 text-white h-7 text-xs' : 'border-slate-700 text-slate-300 h-7 text-xs'}
              onClick={() => setSetting(s)}>
              {labels[s] || s}{competitors[s]?.rows?.length ? ` (${competitors[s].rows[0].providers_in_market ?? competitors[s].rows.length})` : ''}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">No {labels[setting] || setting} providers in the post-acute utilization file for this county.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">{labels[setting] || setting} providers by market share</caption>
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700/60">
                  <th scope="col" className="py-1.5 pr-2">#</th>
                  <th scope="col" className="py-1.5 pr-2">Provider</th>
                  <th scope="col" className="py-1.5 pr-2 text-right">Beneficiaries</th>
                  <th scope="col" className="py-1.5 pr-2 text-right">Stays</th>
                  <th scope="col" className="py-1.5 pr-2">Share</th>
                  <th scope="col" className="py-1.5 pr-2 text-right">Payment</th>
                  <th scope="col" className="py-1.5 pr-2 text-right">Dual %</th>
                  <th scope="col" className="py-1.5 text-right">Risk</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ccn} className="border-b border-slate-800/60">
                    <td className="py-1.5 pr-2 text-slate-400">{r.rank}</td>
                    <td className="py-1.5 pr-2">
                      <Link to={createPageUrl(`FacilityDetail?id=${encodeURIComponent(r.ccn)}&group=${r.facility_group || 'snf'}`)} className="text-cyan-400 hover:underline">{r.name || r.ccn}</Link>
                      <span className="block text-[10px] text-slate-400">{[r.city, r.state].filter(Boolean).join(', ') || `CCN ${r.ccn}`}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right text-slate-200">{fmtCount(r.benes)}</td>
                    <td className="py-1.5 pr-2 text-right text-slate-300">{fmtCount(r.stays)}</td>
                    <td className="py-1.5 pr-2 min-w-[7rem]">
                      <span className="flex items-center gap-2">
                        <span className="flex-1 h-2 rounded bg-slate-900"><span className="block h-2 rounded bg-amber-500" style={{ width: `${((r.share ?? 0) / max) * 100}%` }} /></span>
                        <span className="w-10 text-right text-slate-200">{fmtShare(r.share, 1)}</span>
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right text-slate-300">{fmtMoney(r.payment)}</td>
                    <td className="py-1.5 pr-2 text-right text-slate-300">{fmtPct(r.dual_pct, 0)}</td>
                    <td className="py-1.5 text-right text-slate-300">{fmtRate(r.risk_score, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows[0]?.providers_in_market > rows.length ? <p className="text-[11px] text-slate-400 mt-1">Showing the top {rows.length} of {rows[0].providers_in_market} providers.</p> : null}
          </div>
        )}
        <MarketShareTrendChart trend={trends[setting] || []} label={labels[setting] || setting} />
        {(setting === 'hha' || setting === 'hospice') && cover.length > 0 && (
          <div>
            <p className="text-xs text-slate-300 mb-1">{labels[setting]} agencies serving the county's ZIP areas (Care Compare service areas), wherever they are based</p>
            <ul className="space-y-1">
              {cover.map((c) => (
                <li key={c.ccn} className="flex items-center gap-2 text-xs">
                  <Link to={createPageUrl(`FacilityDetail?id=${encodeURIComponent(c.ccn)}&group=${c.facility_group || 'home_health'}`)} className="w-56 truncate text-cyan-400 hover:underline">{c.name || c.ccn}</Link>
                  <span className="flex-1 h-2 rounded bg-slate-900"><span className="block h-2 rounded bg-teal-500" style={{ width: `${(c.share_of_county_zips ?? 0) * 100}%` }} /></span>
                  <span className="w-28 text-right text-slate-300">{c.zips_served} of {c.county_zips} ZIPs ({fmtShare(c.share_of_county_zips)})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <MarketFreshness rollups={rollups} jobs={['pac_market_share', 'agency_coverage']} />
      </CardContent>
    </Card>
  );
}
