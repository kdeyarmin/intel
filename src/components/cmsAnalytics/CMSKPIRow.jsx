import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2, Heart, Users, TrendingUp, Activity, DollarSign } from 'lucide-react';

function KPI({ title, value, icon: Icon, color, bgColor, loading }) {
  if (loading) return <Card><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>;
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${bgColor}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
        <div>
          <p className="text-xs text-slate-500 font-medium">{title}</p>
          <p className="text-lg font-bold text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CMSKPIRow({ maInpatient, hhaStats, inpatientDRG, utilization, referrals, loading }) {
  const totalMADischarges = maInpatient
    .filter(r => r.table_name === 'MA4' && r.category?.includes('Total All'))
    .reduce((sum, r) => sum + (r.total_discharges || 0), 0);

  const totalHHAPersons = hhaStats
    .filter(r => r.table_name === 'HHA1')
    .reduce((sum, r) => sum + (r.persons_served || 0), 0);

  const totalDRGDischarges = inpatientDRG
    .reduce((sum, r) => sum + (r.total_discharges || 0), 0);

  const totalBeneficiaries = utilization
    .reduce((sum, r) => sum + (r.total_medicare_beneficiaries || 0), 0);

  const totalReferrals = referrals
    .reduce((sum, r) => sum + (r.total_referrals || 0), 0);

  const totalPayments = utilization
    .reduce((sum, r) => sum + (r.total_medicare_payment || 0), 0);

  const fmt = (n) => {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toLocaleString();
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <KPI title="MA Discharges" value={fmt(totalMADischarges)} icon={Building2} color="text-blue-600" bgColor="bg-blue-50" loading={loading} />
      <KPI title="HHA Persons Served" value={fmt(totalHHAPersons)} icon={Heart} color="text-rose-600" bgColor="bg-rose-50" loading={loading} />
      <KPI title="DRG Discharges" value={fmt(totalDRGDischarges)} icon={Activity} color="text-amber-600" bgColor="bg-amber-50" loading={loading} />
      <KPI title="Beneficiaries" value={fmt(totalBeneficiaries)} icon={Users} color="text-emerald-600" bgColor="bg-emerald-50" loading={loading} />
      <KPI title="Total Referrals" value={fmt(totalReferrals)} icon={TrendingUp} color="text-violet-600" bgColor="bg-violet-50" loading={loading} />
      <KPI title="Medicare Payments" value={`$${fmt(totalPayments)}`} icon={DollarSign} color="text-sky-600" bgColor="bg-sky-50" loading={loading} />
    </div>
  );
}