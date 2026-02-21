import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Users, Activity, MapPin, Calendar, GitBranch, Database } from 'lucide-react';
import KPICard from '../components/dashboard/KPICard';
import TopStatesCard from '../components/dashboard/TopStatesCard';
import RecentActivityCard from '../components/dashboard/RecentActivityCard';
import DataQualityWidget from '../components/dashboard/DataQualityWidget';
import DQQuickStatus from '../components/dashboard/DQQuickStatus';
import ProactiveAlerts from '../components/dashboard/ProactiveAlerts';
import EmailCoverageWidget from '../components/dashboard/EmailCoverageWidget';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';
import { formatDateET } from '../components/utils/dateUtils';

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

  // Keep fetching providers for the widgets that need detailed data (e.g. EmailCoverageWidget)
  // But reduce limit to save bandwidth as widgets usually only need a sample or recent data
  const { data: providers = [] } = useQuery({
    queryKey: ['providers'],
    queryFn: () => base44.entities.Provider.list('-created_date', 1000), 
    staleTime: 60000,
  });

  const { data: utilization = [] } = useQuery({
    queryKey: ['utilization'],
    queryFn: () => base44.entities.CMSUtilization.list('-created_date', 1000),
    staleTime: 60000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 1000),
    staleTime: 60000,
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ['referrals'],
    queryFn: () => base44.entities.CMSReferral.list('-created_date', 1000),
    staleTime: 60000,
  });

  const { data: auditEvents = [] } = useQuery({
    queryKey: ['auditEvents'],
    queryFn: () => base44.entities.AuditEvent.list('-created_date', 5),
    staleTime: 60000,
    refetchInterval: 300000,
  });

  const loading = loadingStats;

  // Fallback to providers list length if stats are missing/zero (e.g. historic batches missing)
  const totalProviders = (stats?.totalProviders > providers.length) ? stats.totalProviders : providers.length;
  // If we hit the limit (1000), append '+' to indicate more
  const displayTotalProviders = (providers.length === 1000 && totalProviders === 1000) ? '1000+' : totalProviders.toLocaleString();

  const totalLocations = stats?.totalLocations || 0;
  const activeMedicare = stats?.activeMedicareProviders || 0;
  const totalReferrals = stats?.totalReferrals || 0;
  const topStates = stats?.topStates || [];
  
  const lastRefresh = stats?.lastRefresh 
    ? formatDateET(stats.lastRefresh)
    : (auditEvents[0]?.created_date ? formatDateET(auditEvents[0].created_date) : 'Never');

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-base text-slate-300 mt-0.5">CareMetric Provider Intelligence Overview</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <KPICard
          title="Total Providers"
          value={displayTotalProviders}
          icon={Users}
          iconColor="text-cyan-400"
          loading={loading}
        />
        <KPICard
          title="Medicare Providers"
          value={activeMedicare.toLocaleString()}
          subtitle={`of ${totalProviders} total`}
          icon={Activity}
          iconColor="text-emerald-400"
          loading={loading}
        />
        <KPICard
          title="Total Referrals"
          value={totalReferrals.toLocaleString()}
          subtitle="Latest year per provider"
          icon={GitBranch}
          iconColor="text-violet-400"
          loading={loading}
        />
        <KPICard
          title="Locations"
          value={totalLocations.toLocaleString()}
          icon={MapPin}
          iconColor="text-sky-400"
          loading={loading}
        />
        <KPICard
          title="Last Refresh"
          value={lastRefresh}
          icon={Calendar}
          iconColor="text-amber-400"
          loading={loading}
        />
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <TopStatesCard topStates={topStates} loading={loading} />
        <RecentActivityCard events={auditEvents} />
      </div>

      {/* Email Coverage + Data Quality */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <EmailCoverageWidget providers={providers} />
        <DataQualityWidget />
        <DQQuickStatus />
      </div>

      {/* Proactive Insights */}
      <div className="mb-6">
        <ProactiveAlerts
          providers={providers}
          utilizations={utilization}
          referrals={referrals}
          locations={locations}
        />
      </div>

      <DataSourcesFooter />
    </div>
  );
}