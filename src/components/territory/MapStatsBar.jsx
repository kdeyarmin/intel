import React from 'react';
import { MapPin, Users, TrendingUp, Building2, CircleOff } from 'lucide-react';

function StatBox({ icon: Icon, iconColor, label, value }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-800/60 rounded-lg border border-slate-700/50">
      <div className={`p-2 rounded-lg ${iconColor}`}>
        <Icon className="w-4 h-4" aria-hidden="true" />
      </div>
      <div>
        <div className="text-lg font-bold text-white">{value}</div>
        <div className="text-[11px] text-slate-400">{label}</div>
      </div>
    </div>
  );
}

/** Totals for the providers shown. Averages only count scored providers. */
export default function MapStatsBar({ providers }) {
  const total = providers.length;
  const scored = providers.filter((p) => p.score != null);
  const avgScore = scored.length ? Math.round(scored.reduce((sum, p) => sum + p.score, 0) / scored.length) : null;
  const highScoreCount = scored.filter((p) => p.score >= 70).length;
  const orgCount = providers.filter((p) => p.provider?.entity_type === 'Organization').length;
  const counties = new Set(providers.map((p) => p.countyFips).filter(Boolean)).size;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <StatBox icon={Users} iconColor="bg-blue-900/30 text-blue-400" label="Providers shown" value={total.toLocaleString()} />
      <StatBox icon={TrendingUp} iconColor="bg-teal-900/30 text-teal-400" label="Avg score (scored)" value={avgScore ?? '—'} />
      <StatBox icon={CircleOff} iconColor="bg-slate-700/50 text-slate-300" label="Unscored" value={(total - scored.length).toLocaleString()} />
      <StatBox icon={Building2} iconColor="bg-violet-900/30 text-violet-400" label="Organizations" value={orgCount.toLocaleString()} />
      <StatBox icon={MapPin} iconColor="bg-amber-900/30 text-amber-400" label="Counties" value={counties.toLocaleString()} />
    </div>
  );
}
