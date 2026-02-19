import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Users, Activity, MapPin, Calendar, TrendingUp, Database } from 'lucide-react';
import KPICard from '../components/dashboard/KPICard';
import TopStatesCard from '../components/dashboard/TopStatesCard';
import RecentActivityCard from '../components/dashboard/RecentActivityCard';
import DataQualityWidget from '../components/dashboard/DataQualityWidget';
import DQQuickStatus from '../components/dashboard/DQQuickStatus';
import AIAnalysisPanel from '../components/dashboard/AIAnalysisPanel';
import ProactiveAlerts from '../components/dashboard/ProactiveAlerts';
import EmailCoverageWidget from '../components/dashboard/EmailCoverageWidget';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

export default function Dashboard() {
  const { data: providers = [], isLoading: loadingProviders } = useQuery({
    queryKey: ['dashProviders'],
    queryFn: () => base44.entities.Provider.list(),
    staleTime: 60000,
  });

  const { data: utilization = [], isLoading: loadingUtil } = useQuery({
    queryKey: ['dashUtilization'],
    queryFn: () => base44.entities.CMSUtilization.list(),
    staleTime: 60000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['dashLocations'],
    queryFn: () => base44.entities.ProviderLocation.list(),
    staleTime: 60000,
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ['dashReferrals'],
    queryFn: () => base44.entities.CMSReferral.list(),
    staleTime: 60000,
  });

  const { data: auditEvents = [] } = useQuery({
    queryKey: ['auditEvents'],
    queryFn: () => base44.entities.AuditEvent.list('-created_date', 5),
    staleTime: 60000,
  });

  const loading = loadingProviders || loadingUtil;

  const totalProviders = providers.length;
  const activeMedicare = utilization.filter(u => u.total_medicare_beneficiaries > 0).length;
  const totalReferrals = referrals.reduce((sum, r) => sum + (r.total_referrals || 0), 0);
  const totalLocations = locations.length;

  const topStates = useMemo(() => {
    const stateCount = {};
    locations.forEach(loc => {
      if (loc.state) stateCount[loc.state] = (stateCount[loc.state] || 0) + 1;
    });
    return Object.entries(stateCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [locations]);

  const lastRefresh = auditEvents[0]?.created_date
    ? new Date(auditEvents[0].created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Never';

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">CareMetric Provider Intelligence Overview</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <KPICard
          title="Total Providers"
          value={totalProviders.toLocaleString()}
          icon={Users}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
          loading={loading}
        />
        <KPICard
          title="Active Medicare"
          value={activeMedicare.toLocaleString()}
          icon={Activity}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
          loading={loading}
        />
        <KPICard
          title="Total Referrals"
          value={totalReferrals.toLocaleString()}
          icon={TrendingUp}
          iconColor="text-violet-600"
          iconBg="bg-violet-50"
          loading={loading}
        />
        <KPICard
          title="Locations"
          value={totalLocations.toLocaleString()}
          icon={MapPin}
          iconColor="text-sky-600"
          iconBg="bg-sky-50"
          loading={loading}
        />
        <KPICard
          title="Last Refresh"
          value={lastRefresh}
          icon={Calendar}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          loading={loading}
        />
      </div>

      {/* Middle Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <TopStatesCard topStates={topStates} loading={loadingProviders} />
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

      {/* AI Analysis */}
      <div className="mb-6">
        <AIAnalysisPanel />
      </div>

      <DataSourcesFooter />
    </div>
  );
}