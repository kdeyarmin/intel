import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

import DatabaseOverview from '../components/dashboard/DatabaseOverview';
import SystemHealthStrip from '../components/dashboard/SystemHealthStrip';
import EmailHealthBar from '../components/dashboard/EmailHealthBar';
import TopStatesCard from '../components/dashboard/TopStatesCard';
import RecentActivityCard from '../components/dashboard/RecentActivityCard';
import ProactiveAlerts from '../components/dashboard/ProactiveAlerts';
import QuickActions from '../components/shared/QuickActions';
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

  // Small samples for proactive alerts only
  const { data: providersSample = [] } = useQuery({
    queryKey: ['providersSample'],
    queryFn: () => base44.entities.Provider.list('-created_date', 200),
    staleTime: 120000,
  });
  const { data: utilizationSample = [] } = useQuery({
    queryKey: ['utilizationSample'],
    queryFn: () => base44.entities.CMSUtilization.list('-created_date', 200),
    staleTime: 120000,
  });
  const { data: referralsSample = [] } = useQuery({
    queryKey: ['referralsSample'],
    queryFn: () => base44.entities.CMSReferral.list('-created_date', 200),
    staleTime: 120000,
  });
  const { data: locationsSample = [] } = useQuery({
    queryKey: ['locationsSample'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 200),
    staleTime: 120000,
  });

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="CareMetric Provider Intelligence — all your data at a glance"
        icon={LayoutDashboard}
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

      {/* Proactive Insights + Recent Activity side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProactiveAlerts
          providers={providersSample}
          utilizations={utilizationSample}
          referrals={referralsSample}
          locations={locationsSample}
        />
        <RecentActivityCard events={auditEvents} />
      </div>

    </div>
  );
}