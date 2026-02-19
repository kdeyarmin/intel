import React from 'react';
import { Users, GitBranch, Crown, ArrowRightLeft } from 'lucide-react';

export default function NetworkKPIs({ totalProviders, totalReferrals, hubCount, avgConnections }) {
  const kpis = [
    { label: 'Providers in Network', value: totalProviders, icon: Users, color: 'bg-blue-50 text-blue-600' },
    { label: 'Total Referral Volume', value: totalReferrals >= 1e6 ? `${(totalReferrals / 1e6).toFixed(1)}M` : totalReferrals >= 1e3 ? `${(totalReferrals / 1e3).toFixed(1)}K` : totalReferrals, icon: GitBranch, color: 'bg-violet-50 text-violet-600' },
    { label: 'Network Hubs', value: hubCount, icon: Crown, color: 'bg-amber-50 text-amber-600' },
    { label: 'Avg Connections', value: avgConnections.toFixed(1), icon: ArrowRightLeft, color: 'bg-teal-50 text-teal-600' },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map(k => {
        const Icon = k.icon;
        return (
          <div key={k.label} className={`rounded-xl p-4 ${k.color}`}>
            <div className="flex items-center gap-2 mb-1">
              <Icon className="w-4 h-4" />
              <span className="text-[10px] font-medium uppercase tracking-wide">{k.label}</span>
            </div>
            <p className="text-2xl font-bold">{k.value}</p>
          </div>
        );
      })}
    </div>
  );
}