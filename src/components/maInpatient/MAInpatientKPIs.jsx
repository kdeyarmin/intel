import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Activity, Clock, Users, Building2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

function KPI({ title, value, subtitle, icon: Icon, color, loading }) {
  if (loading) return <Card><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>;
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <div className={`p-2.5 rounded-lg ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function MAInpatientKPIs({ data, loading }) {
  const totalDischarges = data.reduce((s, r) => s + (r.total_discharges || 0), 0);
  const totalPersons = data.reduce((s, r) => s + (r.persons_served || 0), 0);
  const recordsWithALOS = data.filter(r => r.avg_length_of_stay > 0);
  const avgLOS = recordsWithALOS.length > 0
    ? (recordsWithALOS.reduce((s, r) => s + r.avg_length_of_stay, 0) / recordsWithALOS.length).toFixed(1)
    : '—';
  const uniqueYears = [...new Set(data.map(r => r.data_year).filter(Boolean))].length;
  const uniqueTables = [...new Set(data.map(r => r.table_name).filter(Boolean))].length;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KPI
        title="Total Discharges"
        value={totalDischarges.toLocaleString()}
        subtitle={`Across ${uniqueYears} year(s)`}
        icon={Activity}
        color="bg-blue-50 text-blue-600"
        loading={loading}
      />
      <KPI
        title="Persons Served"
        value={Math.round(totalPersons).toLocaleString()}
        subtitle="Cumulative persons with utilization"
        icon={Users}
        color="bg-emerald-50 text-emerald-600"
        loading={loading}
      />
      <KPI
        title="Avg Length of Stay"
        value={`${avgLOS} days`}
        subtitle="Mean across all records"
        icon={Clock}
        color="bg-violet-50 text-violet-600"
        loading={loading}
      />
      <KPI
        title="Data Tables"
        value={uniqueTables}
        subtitle={`${data.length.toLocaleString()} total records`}
        icon={Building2}
        color="bg-amber-50 text-amber-600"
        loading={loading}
      />
    </div>
  );
}