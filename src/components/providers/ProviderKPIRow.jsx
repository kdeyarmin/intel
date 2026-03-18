import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, DollarSign, Activity, GitBranch, MapPin, Stethoscope } from 'lucide-react';

function KPI({ title, value, icon: Icon, color, bgColor }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`p-2 rounded-lg ${bgColor}`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <div>
          <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">{title}</p>
          <p className="text-lg font-bold text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProviderKPIRow({ utilizations = [], referrals = [], locations = [], _taxonomies = [], score }) {
  const latestUtil = utilizations.sort((a, b) => (b.year || 0) - (a.year || 0))[0];
  const latestRef = referrals.sort((a, b) => (b.year || 0) - (a.year || 0))[0];

  const fmt = (v) => {
    if (!v) return '—';
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toLocaleString();
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <KPI title="Beneficiaries" value={fmt(latestUtil?.total_medicare_beneficiaries)} icon={Users} color="text-blue-600" bgColor="bg-blue-50" />
      <KPI title="Services" value={fmt(latestUtil?.total_services)} icon={Activity} color="text-teal-600" bgColor="bg-teal-50" />
      <KPI title="Medicare Pay" value={latestUtil?.total_medicare_payment ? `$${fmt(latestUtil.total_medicare_payment)}` : '—'} icon={DollarSign} color="text-emerald-600" bgColor="bg-emerald-50" />
      <KPI title="Total Referrals" value={fmt(latestRef?.total_referrals)} icon={GitBranch} color="text-violet-600" bgColor="bg-violet-50" />
      <KPI title="Locations" value={locations.length} icon={MapPin} color="text-sky-600" bgColor="bg-sky-50" />
      <KPI title="Fit Score" value={score?.score ? `${score.score}/100` : '—'} icon={Stethoscope} color="text-amber-600" bgColor="bg-amber-50" />
    </div>
  );
}