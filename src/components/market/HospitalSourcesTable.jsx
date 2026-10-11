import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Hospital } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { fmtCount, fmtPct, fmtShare } from '@/lib/marketFormat';
import MarketFreshness from './MarketFreshness';

/** The hospitals whose Medicare inpatients live in a county, with each one's post-discharge mix. */
export default function HospitalSourcesTable({ sources, rollups, countyName }) {
  const rows = sources?.rows || [];
  const max = Math.max(1, ...rows.map((r) => r.share ?? 0));
  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
          <Hospital className="w-4 h-4 text-blue-400" aria-hidden="true" /> Hospitals discharging {countyName || 'this county'}'s residents
        </CardTitle>
        <p className="text-[11px] text-slate-400">
          Medicare inpatient cases of residents by hospital (Hospital Service Area{sources?.data_year ? ` ${sources.data_year}` : ''}) and, where CMS publishes it, each hospital's post-discharge spend to skilled nursing, home health and hospice.
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">No Hospital Service Area data for this county yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">Hospitals by share of the county's Medicare inpatient cases</caption>
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700/60">
                  <th scope="col" className="py-1.5 pr-2">#</th>
                  <th scope="col" className="py-1.5 pr-2">Hospital</th>
                  <th scope="col" className="py-1.5 pr-2 text-right">Cases</th>
                  <th scope="col" className="py-1.5 pr-2">Share of county</th>
                  <th scope="col" className="py-1.5 pr-2 text-right">SNF</th>
                  <th scope="col" className="py-1.5 pr-2 text-right">Home health</th>
                  <th scope="col" className="py-1.5 text-right">Hospice</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.ccn} className="border-b border-slate-800/60">
                    <td className="py-1.5 pr-2 text-slate-400">{r.rank}</td>
                    <td className="py-1.5 pr-2">
                      <Link to={createPageUrl(`FacilityDetail?id=${encodeURIComponent(r.ccn)}&group=hospital`)} className="text-cyan-400 hover:underline">{r.name || r.ccn}</Link>
                      <span className="block text-[10px] text-slate-400">{[r.city, r.state].filter(Boolean).join(', ') || `CCN ${r.ccn}`}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right text-slate-200">{fmtCount(r.cases)}</td>
                    <td className="py-1.5 pr-2 min-w-[8rem]">
                      <span className="flex items-center gap-2">
                        <span className="flex-1 h-2 rounded bg-slate-900"><span className="block h-2 rounded bg-blue-500" style={{ width: `${((r.share ?? 0) / max) * 100}%` }} /></span>
                        <span className="w-10 text-right text-slate-200">{fmtShare(r.share)}</span>
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-right text-slate-300">{r.discharge_mix ? fmtPct(r.discharge_mix.pct_snf) : '—'}</td>
                    <td className="py-1.5 pr-2 text-right text-slate-300">{r.discharge_mix ? fmtPct(r.discharge_mix.pct_hha) : '—'}</td>
                    <td className="py-1.5 text-right text-slate-300">{r.discharge_mix ? fmtPct(r.discharge_mix.pct_hospice) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sources?.total > rows.length ? <p className="text-[11px] text-slate-400 mt-1">Showing the top {rows.length} of {sources.total} hospitals; shares are of all of the county's cases, so these rows add up to less than 100%.</p> : null}
          </div>
        )}
        <div className="mt-3"><MarketFreshness rollups={rollups} jobs={['county_hospital_sources', 'hospital_discharge_mix']} /></div>
      </CardContent>
    </Card>
  );
}
