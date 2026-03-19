import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

import DatabaseOverview from '../components/dashboard/DatabaseOverview';
import SystemHealthStrip from '../components/dashboard/SystemHealthStrip';
import EmailHealthBar from '../components/dashboard/EmailHealthBar';
import TopStatesCard from '../components/dashboard/TopStatesCard';
import RecentActivityCard from '../components/dashboard/RecentActivityCard';
import ProactiveAlerts from '../components/dashboard/ProactiveAlerts';
import DataHealthAlerts from '../components/dashboard/DataHealthAlerts';
import QuickActions from '../components/shared/QuickActions';
import EmailTrendChart from '../components/dashboard/EmailTrendChart';
import DashboardGeospatialMap from '../components/dashboard/DashboardGeospatialMap';
import { LayoutDashboard } from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';

export default function Dashboard() {
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getDashboardStats');
      return res.data;
    },
    staleTime: 60000,
    refetchInterval: 300000,
  });

  const { data: auditEvents = [] } = useQuery({
    queryKey: ['auditEvents'],
    queryFn: () => base44.entities.AuditEvent.list('-created_date', 5),
    staleTime: 60000,
  });

  // Extract samples from dashboard stats
  const providersSample = stats?.samples?.providers || [];
  const utilizationSample = stats?.samples?.utilizations || [];
  const referralsSample = stats?.samples?.referrals || [];
  const locationsSample = stats?.samples?.locations || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 sm:space-y-6 w-full overflow-hidden">
      <PageHeader
        title="Dashboard"
        subtitle="CareMetric Provider Intelligence — all your data at a glance"
        icon={LayoutDashboard}
        breadcrumbs={[{ label: 'Dashboard' }]}
      />

      {/* Quick Actions */}
      <QuickActions />

      {/* System Health Strip — last refresh, imports, quality score, alerts */}
      <SystemHealthStrip stats={stats} loading={loadingStats} />

      {/* Database Record Counts — single source of truth, clickable to navigate */}
      <DatabaseOverview stats={stats} loading={loadingStats} />

      {/* Email Health + Top States side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EmailHealthBar emailStats={stats?.emailStats} totalProviders={stats?.totalProviders || 0} />
        <TopStatesCard topStates={stats?.topStates || []} loading={loadingStats} />
      </div>

      {/* Email Discovery Trend Chart */}
      <EmailTrendChart data={stats?.emailStats?.trend} loading={loadingStats} />

      {/* Data Health & Proactive Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DataHealthAlerts />
        <ProactiveAlerts
          providers={providersSample}
          utilizations={utilizationSample}
          referrals={referralsSample}
          locations={locationsSample}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 gap-6">
        <RecentActivityCard events={auditEvents} />
      </div>

    </div>
  );
}