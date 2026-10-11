import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin } from 'lucide-react';
import { createPageUrl } from '@/utils';

/**
 * Practice locations per county across the whole state (from the ZIP
 * rollup), with how many of the providers shown are in each.
 */
export default function CountyDensityMap({ counties = [], providers = [], state }) {
  const shownByCounty = new Map();
  for (const p of providers) if (p.countyFips) shownByCounty.set(p.countyFips, (shownByCounty.get(p.countyFips) || 0) + 1);
  const total = counties.reduce((s, c) => s + c.practice_locations, 0);
  const max = Math.max(1, ...counties.map((c) => c.practice_locations));
  const top = counties.filter((c) => c.practice_locations > 0).slice(0, 20);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-5 w-5 text-teal-400" aria-hidden="true" />
          Provider density by county{state ? ` in ${state}` : ''}
        </CardTitle>
        <p className="text-xs text-slate-400">
          Practice locations per county across the whole state. Open a county for its providers, facilities and referrals.
        </p>
      </CardHeader>
      <CardContent>
        {top.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">
            {state ? 'County density isn’t computed yet. It refreshes in the background once a day.' : 'Pick a state to see density by county.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {top.map((c) => (
              <li key={c.fips}>
                <Link
                  to={createPageUrl(`CountyIntelligence?state=${state}&county=${c.fips}`)}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/60"
                >
                  <span className="w-40 shrink-0 truncate text-sm text-slate-200">{c.name}</span>
                  <span className="flex-1 h-3 rounded bg-slate-800">
                    <span className="block h-3 rounded bg-teal-500" style={{ width: `${(c.practice_locations / max) * 100}%` }} />
                  </span>
                  <span className="w-28 shrink-0 text-right text-xs text-slate-300">
                    {c.practice_locations.toLocaleString()} <span className="text-slate-400">({total ? Math.round((c.practice_locations / total) * 100) : 0}%)</span>
                  </span>
                  <span className="w-20 shrink-0 text-right text-[11px] text-slate-400">{shownByCounty.get(c.fips) || 0} shown</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
