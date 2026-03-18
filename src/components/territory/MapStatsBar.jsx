import React from 'react';
import { MapPin, Users, TrendingUp, Building2 } from 'lucide-react';

function StatBox({ icon: Icon, iconColor, label, value }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border">
      <div className={`p-2 rounded-lg ${iconColor}`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <div className="text-lg font-bold text-slate-900">{value}</div>
        <div className="text-[11px] text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export default function MapStatsBar({ providers, countyStats }) {
  const totalProviders = providers.length;
  const avgScore = totalProviders > 0
    ? Math.round(providers.reduce((sum, p) => sum + (p.score || 0), 0) / totalProviders)
    : 0;
  const highScoreCount = providers.filter(p => p.score >= 70).length;
  const orgCount = providers.filter(p => p.provider.entity_type === 'Organization').length;
  const citiesCount = countyStats.length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <StatBox icon={Users} iconColor="bg-blue-500" label="Total Providers" value={totalProviders.toLocaleString()} />
      <StatBox icon={TrendingUp} iconColor="bg-teal-500" label="Avg Score" value={avgScore} />
      <StatBox icon={TrendingUp} iconColor="bg-green-500" label="Score 70+" value={highScoreCount} />
      <StatBox icon={Building2} iconColor="bg-violet-500" label="Organizations" value={orgCount} />
      <StatBox icon={MapPin} iconColor="bg-amber-500" label="Cities" value={citiesCount} />
    </div>
  );
}