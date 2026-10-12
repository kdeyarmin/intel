import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { invokeOrThrow } from '@/api/functionResult';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { fmtCount, fmtShare, ordinal } from '@/lib/marketFormat';
import MarketFreshness from './MarketFreshness';
import ComplianceDisclaimer from '../compliance/ComplianceDisclaimer';

/** A post-acute provider's share and rank in its county and state, the competitors around it, and (for agencies) the counties it serves. */
export default function MarketPositionCard({ ccn, setting }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['facilityMarket', ccn, setting],
    queryFn: () => invokeOrThrow('getFacilityMarket', { ccn, setting }),
    enabled: !!ccn && !!setting,
    staleTime: 10 * 60 * 1000,
  });
  if (!ccn || !setting) return null;
  if (isLoading) return <p className="text-sm text-slate-400">Loading market position…</p>;
  // A failed request is not "this provider isn't in the market data": say so, and let the user retry.
  if (isError) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-red-400" role="alert">
        <span>Couldn't load this provider's market position: {error?.message || 'try again'}</span>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="border-red-500/30 text-red-400">Try again</Button>
      </div>
    );
  }
  if (!data?.found) return null;
  const pos = data.position || {};
  const peers = (data.market || []).slice(0, 10);
  const max = Math.max(1, ...peers.map((r) => r.share ?? 0));
  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-amber-400" aria-hidden="true" /> Market position ({data.label}, {data.data_year})
        </CardTitle>
        <p className="text-[11px] text-slate-400">
          Share of Medicare FFS beneficiaries served by {data.label.toLowerCase()} providers located in {data.county ? <Link to={createPageUrl(`CountyIntelligence?state=${data.county.state}&county=${data.county.fips}&tab=competitors`)} className="text-cyan-400 hover:underline">{data.county.name}</Link> : 'the county'} (post-acute utilization by provider).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data.county && <p className="text-xs text-slate-400">This provider has no county in the post-acute file, so only its state position is shown.</p>}
        <div className={`grid grid-cols-2 gap-3 text-center ${data.county ? 'md:grid-cols-5' : 'md:grid-cols-3'}`}>
          {data.county && <div className="rounded-lg bg-slate-900/40 p-3"><p className="text-xl font-bold text-slate-100">{ordinal(pos.rank)}</p><p className="text-[11px] text-slate-400">of {fmtCount(pos.providers_in_market)} in county</p></div>}
          {data.county && <div className="rounded-lg bg-slate-900/40 p-3"><p className="text-xl font-bold text-slate-100">{fmtShare(pos.share, 1)}</p><p className="text-[11px] text-slate-400">county share</p></div>}
          <div className="rounded-lg bg-slate-900/40 p-3"><p className="text-xl font-bold text-slate-100">{fmtCount(pos.benes)}</p><p className="text-[11px] text-slate-400">beneficiaries · {fmtCount(pos.stays)} stays</p></div>
          <div className="rounded-lg bg-slate-900/40 p-3"><p className="text-xl font-bold text-slate-100">{ordinal(pos.state_rank)}</p><p className="text-[11px] text-slate-400">of {fmtCount(pos.state_providers)} in state</p></div>
          <div className="rounded-lg bg-slate-900/40 p-3"><p className="text-xl font-bold text-slate-100">{fmtShare(pos.state_share, 1)}</p><p className="text-[11px] text-slate-400">state share</p></div>
        </div>
        {peers.length > 0 && (
          <ul className="space-y-1">
            {peers.map((r) => (
              <li key={r.ccn} className={`flex items-center gap-2 text-xs ${r.is_this ? 'font-semibold' : ''}`}>
                <span className="w-5 text-slate-400">{r.rank}</span>
                {r.is_this ? <span className="w-48 truncate text-slate-100">{r.name || r.ccn} (this)</span>
                  : <Link to={createPageUrl(`FacilityDetail?id=${encodeURIComponent(r.ccn)}&group=${r.facility_group || 'snf'}`)} className="w-48 truncate text-cyan-400 hover:underline">{r.name || r.ccn}</Link>}
                <span className="flex-1 h-2 rounded bg-slate-900"><span className={`block h-2 rounded ${r.is_this ? 'bg-cyan-400' : 'bg-amber-500'}`} style={{ width: `${((r.share ?? 0) / max) * 100}%` }} /></span>
                <span className="w-20 text-right text-slate-200">{fmtShare(r.share, 1)}</span>
              </li>
            ))}
          </ul>
        )}
        {data.trend?.length > 1 && (
          <p className="text-xs text-slate-400">
            Trend: {data.trend.map((t) => `${t.data_year} ${fmtShare(t.share, 1)} (${ordinal(t.rank)})`).join(' → ')}
          </p>
        )}
        {data.coverage?.length > 0 && (
          <div>
            <p className="text-xs text-slate-300 mb-1">Counties served (Care Compare service area)</p>
            <ul className="flex flex-wrap gap-1">
              {data.coverage.map((c) => (
                <li key={c.county_fips}>
                  <Link to={createPageUrl(`CountyIntelligence?state=${c.state || ''}&county=${c.county_fips}&tab=competitors`)} className="inline-block rounded bg-slate-900/60 px-2 py-0.5 text-[11px] text-cyan-400 hover:underline">
                    {c.county_name || c.county_fips}{c.state ? `, ${c.state}` : ''} · {fmtShare(c.share_of_county_zips)} of ZIPs
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <MarketFreshness rollups={data.rollups} jobs={['pac_market_share', 'agency_coverage']} />
        <ComplianceDisclaimer variant="market" />
      </CardContent>
    </Card>
  );
}
