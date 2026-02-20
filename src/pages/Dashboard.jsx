import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Users, Activity, MapPin, Calendar, GitBranch, Database } from 'lucide-react';
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
    queryKey: ['providers'],
    queryFn: () => base44.entities.Provider.list('-created_date', 10000),
    staleTime: 60000,
    refetchInterval: 300000,
  });

  const { data: utilization = [], isLoading: loadingUtil } = useQuery({
    queryKey: ['utilization'],
    queryFn: () => base44.entities.CMSUtilization.list('-created_date', 10000),
    staleTime: 60000,
    refetchInterval: 300000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 10000),
    staleTime: 60000,
    refetchInterval: 300000,
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ['referrals'],
    queryFn: () => base44.entities.CMSReferral.list('-created_date', 10000),
    staleTime: 60000,
    refetchInterval: 300000,
  });

  const { data: auditEvents = [] } = useQuery({
    queryKey: ['auditEvents'],
    queryFn: () => base44.entities.AuditEvent.list('-created_date', 5),
    staleTime: 60000,
    refetchInterval: 300000,
  });

  const loading = loadingProviders || loadingUtil;

  const totalProviders = providers.length;
  const totalLocations = locations.length;

  // Count unique provider NPIs that have Medicare utilization records with beneficiaries
  const activeMedicare = useMemo(() => {
    const npis = new Set();
    utilization.forEach(u => {
      if (u.total_medicare_beneficiaries > 0 && u.npi) npis.add(u.npi);
    });
    return npis.size;
  }, [utilization]);

  // Sum referrals only from the most recent year per provider to avoid double-counting
  const totalReferrals = useMemo(() => {
    const latestByNPI = {};
    referrals.forEach(r => {
      if (!r.npi) return;
      if (!latestByNPI[r.npi] || (r.year || 0) > (latestByNPI[r.npi].year || 0)) {
        latestByNPI[r.npi] = r;
      }
    });
    return Object.values(latestByNPI).reduce((sum, r) => sum + (r.total_referrals || 0), 0);
  }, [referrals]);

  // Count unique provider NPIs per state (not locations)
  const topStates = useMemo(() => {
    const stateNPIs = {};
    locations.forEach(loc => {
      if (loc.state && loc.npi) {
        if (!stateNPIs[loc.state]) stateNPIs[loc.state] = new Set();
        stateNPIs[loc.state].add(loc.npi);
      }
    });
    return Object.entries(stateNPIs)
      .map(([state, npis]) => [state, npis.size])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [locations]);

  const lastRefresh = auditEvents[0]?.created_date
    ? new Date(auditEvents[0].created_date).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric' })
    : 'Never';

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">CareMetric Provider Intelligence Overview</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <KPICard
          title="Total Providers"
          value={totalProviders.toLocaleString()}
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