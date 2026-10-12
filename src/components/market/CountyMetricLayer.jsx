import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, BarChart3 } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { formatMetric } from '@/lib/marketFormat';
import MarketFreshness from './MarketFreshness';
import ComplianceDisclaimer from '../compliance/ComplianceDisclaimer';

const INITIAL_COUNTIES = 30;

/** One county metric across a state, as ranked bars linking to each county's market tab. */
export default function CountyMetricLayer({ layer, state, loading = false, error = null, onRetry }) {
  const [showAll, setShowAll] = useState(false);
  const counties = (layer?.counties || []).filter((c) => c.value != null).sort((a, b) => b.value - a.value);
  const shown = showAll ? counties : counties.slice(0, INITIAL_COUNTIES);
  const max = Math.max(1e-9, ...counties.map((c) => c.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-5 w-5 text-teal-400" aria-hidden="true" />
          {layer?.label || 'County metric'}{state ? ` by county in ${state}` : ''}
        </CardTitle>
        <p className="text-xs text-slate-400">{layer?.vintage ? `Data ${String(layer.vintage).replace(/ to .*$/, '')}. ` : ''}Open a county for its full market profile.</p>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-900/30 p-4 text-center space-y-2" role="alert">
            <AlertTriangle className="mx-auto h-6 w-6 text-red-400" aria-hidden="true" />
            <p className="text-sm text-red-400">Couldn't load this county layer: {error?.message || 'try again'}</p>
            {onRetry && <Button variant="outline" size="sm" onClick={onRetry} className="border-red-500/30 text-red-400">Try again</Button>}
          </div>
        ) : loading ? (
          <div className="space-y-2" aria-label="Loading counties">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : counties.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No county profiles for {state || 'this state'} yet. They need the Medicare enrollment, saturation and variation files imported and the market rollups computed.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {shown.map((c) => (
                <li key={c.fips}>
                  <Link to={createPageUrl(`CountyIntelligence?state=${state}&county=${c.fips}&tab=market`)} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/60">
                    <span className="w-40 shrink-0 truncate text-sm text-slate-200">{c.name}</span>
                    <span className="flex-1 h-3 rounded bg-slate-800"><span className="block h-3 rounded bg-teal-500" style={{ width: `${(c.value / max) * 100}%` }} /></span>
                    <span className="w-28 shrink-0 text-right text-xs text-slate-300">{formatMetric(c.value, layer?.format)}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {counties.length > INITIAL_COUNTIES && (
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-400">
                <span>{showAll ? `All ${counties.length} counties` : `Top ${INITIAL_COUNTIES} of ${counties.length} counties`}</span>
                <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)} className="text-cyan-400">{showAll ? 'Show fewer' : 'Show all counties'}</Button>
              </div>
            )}
          </>
        )}
        <div className="mt-3 space-y-2">
          <MarketFreshness rollups={layer?.rollups} jobs={['county_market_profile']} />
          <ComplianceDisclaimer variant="market" />
        </div>
      </CardContent>
    </Card>
  );
}
