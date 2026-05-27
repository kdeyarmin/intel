import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

import DatabaseOverview from '../components/dashboard/DatabaseOverview';
import SalesPipelineCard from '../components/dashboard/SalesPipelineCard';
import SystemHealthStrip from '../components/dashboard/SystemHealthStrip';
import EmailHealthBar from '../components/dashboard/EmailHealthBar';
import TopStatesCard from '../components/dashboard/TopStatesCard';
import RecentActivityCard from '../components/dashboard/RecentActivityCard';
import ProactiveAlerts from '../components/dashboard/ProactiveAlerts';
import DataHealthAlerts from '../components/dashboard/DataHealthAlerts';
import QuickActions from '../components/shared/QuickActions';
import { LayoutDashboard, AlertTriangle, RefreshCw } from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';

export default function Dashboard() {
  const { data: stats, isLoading: loadingStats, error: statsError, refetch: refetchStats, isRefetching: refetchingStats } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getDashboardStats');
      return res.data;
    },
    staleTime: 60000,
    refetchInterval: 300000,
    retry: 1,
  });

  const { data: auditEvents = [], isLoading: loadingEvents, error: eventsError } = useQuery({
    queryKey: ['auditEvents'],
    queryFn: () => base44.entities.AuditEvent.list('-created_date', 5),
    staleTime: 60000,
    retry: 1,
  });

  const proactiveInsights = stats?.proactiveInsights || null;

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

      {(statsError || eventsError) && (
        <div className="flex items-start justify-between gap-3 p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg text-amber-300 text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-amber-200">Some dashboard data failed to load</div>
              <div className="text-xs text-amber-300/80 mt-0.5">
                {statsError?.message || eventsError?.message || 'Please try again in a moment.'}
              </div>
            </div>
          </div>
          <button
            onClick={() => refetchStats()}
            disabled={refetchingStats}
            className="flex items-center gap-1 px-2 py-1 bg-amber-900/40 hover:bg-amber-900/60 rounded text-xs text-amber-200 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${refetchingStats ? 'animate-spin' : ''}`} /> Retry
          </button>
        </div>
      )}

      {/* System Health Strip — last refresh, imports, quality score, alerts */}
      <SystemHealthStrip stats={stats} loading={loadingStats} />

      {/* Database Record Counts — single source of truth, clickable to navigate */}
      <DatabaseOverview stats={stats} loading={loadingStats} />

      {/* Sales Pipeline — lead lists and campaign rollup */}
      <SalesPipelineCard />

      {/* Email Health + Top States side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <EmailHealthBar emailStats={stats?.emailStats} totalProviders={stats?.totalProviders || 0} />
        <TopStatesCard topStates={stats?.topStates || []} loading={loadingStats} />
      </div>

      {/* Data Health & Proactive Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DataHealthAlerts />
        <ProactiveAlerts proactiveInsights={proactiveInsights} />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 gap-6">
        <RecentActivityCard events={auditEvents} loading={loadingEvents} />
      </div>

    </div>
  );
}