import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
<<<<<<< HEAD
import { useQuery } from '@tanstack/react-query';
=======
import { useQuery, useQueryClient } from '@tanstack/react-query';
>>>>>>> refs/remotes/origin/main
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, TrendingUp, GitCompare, Sparkles, LayoutDashboard } from 'lucide-react';

import TrendAnalysisPanel from '../components/advancedAnalytics/TrendAnalysisPanel';
import ComparativeAnalysisPanel from '../components/advancedAnalytics/ComparativeAnalysisPanel';
import PredictiveAnalyticsPanel from '../components/advancedAnalytics/PredictiveAnalyticsPanel';
import DrillDownTable from '../components/advancedAnalytics/DrillDownTable';
import DashboardBuilder from '../components/advancedAnalytics/DashboardBuilder';
import PageHeader from '../components/shared/PageHeader';

export default function AdvancedAnalytics() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeDashboardId, setActiveDashboardId] = useState(null);
<<<<<<< HEAD
=======
  const queryClient = useQueryClient();
>>>>>>> refs/remotes/origin/main

  // Core data
  const { data: providers = [], isLoading: lp } = useQuery({
    queryKey: ['aaProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: utilization = [], isLoading: lu } = useQuery({
    queryKey: ['aaUtil'],
    queryFn: async () => {
      const rows = await base44.entities.ProviderServiceUtilization.list('-data_year', 500);
      return rows.map(r => ({
        ...r,
        year: r.data_year,
        total_medicare_payment: r.total_medicare_payment_amt || 0,
        total_medicare_beneficiaries: r.total_unique_benes || 0,
        total_submitted_charges: (r.average_submitted_chrg_amt || 0) * (r.total_services || 1),
<<<<<<< HEAD
        drug_services: 0,
=======
>>>>>>> refs/remotes/origin/main
      }));
    },
    staleTime: 120000,
  });
  const { data: referrals = [], isLoading: lr } = useQuery({
    queryKey: ['aaRef'],
    queryFn: async () => {
<<<<<<< HEAD
      const rows = await base44.entities.CMSReferral.list('-created_date', 500);
      return rows.map(r => {
        const rd = r.raw_data || {};
        return {
          ...r,
          year: r.data_year,
          total_referrals: 1,
          home_health_referrals: rd.HHA === 'Y' ? 1 : 0,
          hospice_referrals: rd.HOSPICE === 'Y' ? 1 : 0,
          snf_referrals: 0,
          dme_referrals: rd.DME === 'Y' ? 1 : 0,
          imaging_referrals: 0,
=======
      // cms_referrals holds CMS "Order & Referring" eligibility rows whose
      // only real volume column is total_referrals (null unless a genuine
      // referral-counts dataset is loaded). The HHA/HOSPICE/DME raw_data
      // values are Y/N eligibility flags, not referral counts, so they are
      // intentionally not surfaced here as "referral" metrics.
      const rows = await base44.entities.CMSReferral.list('-created_date', 500);
      return rows.map(r => {
        const rd = r.raw_data || {};
        const referralSubtypeFields = ['home_health_referrals', 'hospice_referrals', 'snf_referrals', 'dme_referrals', 'imaging_referrals'];
        const referralTypeCounts = Object.fromEntries(
          referralSubtypeFields
            .filter((field) => Object.prototype.hasOwnProperty.call(r, field))
            .map((field) => {
              const numericValue = Number(r[field]);
              return [field, Number.isFinite(numericValue) ? numericValue : 0];
            })
        );
        // Prefer the real total_referrals column. Fall back to a count in
        // raw_data only if a genuine referral-counts dataset stored one
        // there; otherwise 0 — never a fabricated default.
        const rawCount = Number(
          rd.total_referrals ?? rd.total_referral_count ?? rd.TOTAL_REFERRALS ?? rd.TOTAL_REFERRAL_COUNT
        );
        const realCount = Number(r.total_referrals);
        return {
          ...r,
          ...referralTypeCounts,
          year: r.data_year,
          total_referrals: Number.isFinite(realCount)
            ? realCount
            : (Number.isFinite(rawCount) ? rawCount : 0),
>>>>>>> refs/remotes/origin/main
        };
      });
    },
    staleTime: 120000,
  });
  const { data: locations = [], isLoading: _ll } = useQuery({
    queryKey: ['aaLoc'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: taxonomies = [], isLoading: _lt } = useQuery({
    queryKey: ['aaTax'],
    queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: dashboards = [] } = useQuery({
    queryKey: ['analyticsDashboards'],
    queryFn: () => base44.entities.AnalyticsDashboard.list('-created_date', 50),
    staleTime: 30000,
  });

  // Auto-select default dashboard
  useEffect(() => {
    if (dashboards.length > 0) {
      if (!activeDashboardId || !dashboards.find(d => d.id === activeDashboardId)) {
        const def = dashboards.find(d => d.is_default) || dashboards[0];
        setActiveDashboardId(def.id);
      }
    }
  }, [dashboards, activeDashboardId]);

  const activeDashboard = dashboards.find(d => d.id === activeDashboardId);
  const loading = lp || lu || lr;

  const renderWidget = (widget) => {
    switch (widget.type) {
      case 'trend':
        return <TrendAnalysisPanel key={widget.id} utilization={utilization} referrals={referrals} />;
      case 'comparative':
        return <ComparativeAnalysisPanel key={widget.id} providers={providers} utilization={utilization} referrals={referrals} taxonomies={taxonomies} locations={locations} />;
      case 'predictive':
        return <PredictiveAnalyticsPanel key={widget.id} utilization={utilization} referrals={referrals} />;
      default:
        return null;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 sm:space-y-6">
      <PageHeader
        title="Advanced Analytics"
        subtitle="Deep insights, trend analysis, comparative reports & predictive models"
        icon={BarChart3}
        breadcrumbs={[{ label: 'Analytics', page: 'AdvancedAnalytics' }]}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800/50 w-full grid grid-cols-2 sm:grid-cols-4 h-auto">
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs">
            <LayoutDashboard className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Custom </span>Dashboards
          </TabsTrigger>
          <TabsTrigger value="trends" className="gap-1.5 text-xs">
            <TrendingUp className="w-3.5 h-3.5" /> Trends
          </TabsTrigger>
          <TabsTrigger value="compare" className="gap-1.5 text-xs">
            <GitCompare className="w-3.5 h-3.5" /> Comparative
          </TabsTrigger>
          <TabsTrigger value="predict" className="gap-1.5 text-xs">
            <Sparkles className="w-3.5 h-3.5" /> Predictive
          </TabsTrigger>
        </TabsList>

        {/* Custom Dashboards Tab */}
        <TabsContent value="dashboard" className="mt-4">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-3">
                <DashboardBuilder
                  dashboards={dashboards}
                  activeId={activeDashboardId}
                  onSelect={setActiveDashboardId}
<<<<<<< HEAD
                  onWidgetsChange={() => {}}
=======
                  onWidgetsChange={() => queryClient.invalidateQueries({ queryKey: ['analyticsDashboards'] })}
>>>>>>> refs/remotes/origin/main
                />
              </div>
              <div className="lg:col-span-9 space-y-5">
                {activeDashboard ? (
                  (activeDashboard.widgets || []).length > 0 ? (
                    (activeDashboard.widgets || []).map(w => renderWidget(w))
                  ) : (
                    <div className="flex items-center justify-center h-64 border-2 border-dashed border-slate-700/50 rounded-xl">
                      <div className="text-center">
                        <LayoutDashboard className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">Add widgets using the panel on the left</p>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="flex items-center justify-center h-64 border-2 border-dashed border-slate-700/50 rounded-xl">
                    <div className="text-center">
                      <LayoutDashboard className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">Create a dashboard to get started</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* Trend Analysis Tab */}
        <TabsContent value="trends" className="mt-4 space-y-5">
          {loading ? <Skeleton className="h-96 w-full" /> : (
            <>
              <TrendAnalysisPanel utilization={utilization} referrals={referrals} />
              <DrillDownTable providers={providers} utilization={utilization} referrals={referrals} locations={locations} />
            </>
          )}
        </TabsContent>

        {/* Comparative Tab */}
        <TabsContent value="compare" className="mt-4 space-y-5">
          {loading ? <Skeleton className="h-96 w-full" /> : (
            <>
              <ComparativeAnalysisPanel providers={providers} utilization={utilization} referrals={referrals} taxonomies={taxonomies} locations={locations} />
              <DrillDownTable providers={providers} utilization={utilization} referrals={referrals} locations={locations} />
            </>
          )}
        </TabsContent>

        {/* Predictive Tab */}
        <TabsContent value="predict" className="mt-4 space-y-5">
          {loading ? <Skeleton className="h-96 w-full" /> : (
            <>
              <PredictiveAnalyticsPanel utilization={utilization} referrals={referrals} />
              <DrillDownTable providers={providers} utilization={utilization} referrals={referrals} locations={locations} />
            </>
          )}
        </TabsContent>
      </Tabs>


    </div>
  );
}