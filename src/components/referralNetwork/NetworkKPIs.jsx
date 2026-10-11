import React from 'react';
import { Users, GitBranch, Crown, ArrowRightLeft } from 'lucide-react';

export const formatVolume = (v) => {
  const n = Number(v) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
};

/** Whole-network numbers (not just the providers drawn). */
export default function NetworkKPIs({ summary, hubCount = 0, avgPartners = 0 }) {
  const kpis = [
    { label: 'Providers in network', value: (summary?.network_nodes ?? 0).toLocaleString(), icon: Users, color: 'bg-blue-900/30 text-blue-400' },
    { label: 'Shared-patient volume', value: formatVolume(summary?.total_volume), icon: GitBranch, color: 'bg-violet-900/30 text-violet-400' },
    { label: 'Hubs shown', value: hubCount, icon: Crown, color: 'bg-amber-900/30 text-amber-400' },
    { label: 'Avg partners (shown)', value: avgPartners.toFixed(1), icon: ArrowRightLeft, color: 'bg-cyan-900/30 text-cyan-400' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map(k => {
        const Icon = k.icon;
        return (
          <div key={k.label} className={`rounded-xl p-4 ${k.color} border border-slate-700/30`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span className="text-[10px] font-medium uppercase tracking-wide">{k.label}</span>
            </div>
            <p className="text-2xl font-bold">{k.value}</p>
          </div>
        );
      })}
    </div>
  );
}
