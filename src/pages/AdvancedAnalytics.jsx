import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { createPageUrl } from '@/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, TrendingUp, GitCompare, Sparkles, LayoutDashboard, Lock } from 'lucide-react';

import TrendAnalysisPanel from '../components/advancedAnalytics/TrendAnalysisPanel';
import ComparativeAnalysisPanel from '../components/advancedAnalytics/ComparativeAnalysisPanel';
import PredictiveAnalyticsPanel from '../components/advancedAnalytics/PredictiveAnalyticsPanel';
import DrillDownTable from '../components/advancedAnalytics/DrillDownTable';
import DashboardBuilder from '../components/advancedAnalytics/DashboardBuilder';
import PageHeader from '../components/shared/PageHeader';

export default function AdvancedAnalytics() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeDashboardId, setActiveDashboardId] = useState(null);
  const queryClient = useQueryClient();
  const { user, isLoadingAuth } = useAuth();

  // Plans whose coverage is only the places chosen on the Billing page. The
  // entity lists below are national, so for these plans the page shows an
  // upgrade notice and never loads them (mirrors server TERRITORY_PLANS in
  // server/lib/entitlements.ts). Unknown user/plan defaults to the full
  // view, matching the server's isUnrestricted.
  const territoryLimited = !!user && !user.isPlatformAdmin
    && !!user.planCode && ['county_pack', 'state'].includes(user.planCode);
  // Don't fire the national lists until the plan is known.
  const mayLoad = !isLoadingAuth && !territoryLimited;

  // Core data
  const { data: providers = [], isLoading: lp } = useQuery({
    queryKey: ['aaProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    enabled: mayLoad,
    staleTime: 120000,
  });
  const { data: utilization = [], isLoading: lu } = useQuery({
    queryKey: ['aaUtil'],
    enabled: mayLoad,
    queryFn: async () => {
      const rows = await base44.entities.ProviderServiceUtilization.list('-data_year', 500);
      return rows.map(r => ({
        ...r,
        year: r.data_year,
        total_medicare_payment: r.total_medicare_payment_amt || 0,
        total_medicare_beneficiaries: r.total_unique_benes || 0,
        total_submitted_charges: r.total_services ? (r.average_submitted_chrg_amt || 0) * r.total_services : null,
      }));
    },
    staleTime: 120000,
  });
  const { data: referrals = [], isLoading: lr } = useQuery({
    queryKey: ['aaRef'],
    enabled: mayLoad,
    queryFn: async () => {
      // cms_referrals holds CMS "Order & Referring" eligibility rows whose
      // only real volume column is total_referrals (null unless a genuine
      // referral-counts dataset is loaded). The HHA/HOSPICE/DME raw_data
      // values are Y/N eligibility flags, not referral counts, so they are
      // intentionally not surfaced here as "referral" metrics.
      const rows = await base44.entities.CMSReferral.list('-created_date', 500);
      return rows.map(r => {
        const rd = r.raw_data || {};
        // Prefer the real total_referrals column. Fall back to a count in
        // raw_data only if a genuine referral-counts dataset stored one
        // there; otherwise 0 — never a fabricated default.
        const rawCount = Number(
          rd.total_referrals ?? rd.total_referral_count ?? rd.TOTAL_REFERRALS ?? rd.TOTAL_REFERRAL_COUNT
        );
        const realCount = Number(r.total_referrals);
        return {
          ...r,
          year: r.data_year,
          total_referrals: Number.isFinite(realCount)
            ? realCount
            : (Number.isFinite(rawCount) ? rawCount : 0),
        };
      });
    },
    staleTime: 120000,
  });
  const { data: locations = [], isLoading: _ll } = useQuery({
    queryKey: ['aaLoc'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    enabled: mayLoad,
    staleTime: 120000,
  });
  const { data: taxonomies = [], isLoading: _lt } = useQuery({
    queryKey: ['aaTax'],
    queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 500),
    enabled: mayLoad,
    staleTime: 120000,
  });
  const { data: dashboards = [] } = useQuery({
    queryKey: ['analyticsDashboards'],
    queryFn: () => base44.entities.AnalyticsDashboard.list('-created_date', 50),
    enabled: mayLoad,
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

      {territoryLimited ? (
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="py-12 text-center space-y-4">
            <Lock className="w-10 h-10 text-slate-500 mx-auto" aria-hidden="true" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-200">National analytics need a national plan</h2>
              <p className="text-sm text-slate-400 max-w-xl mx-auto">
                Advanced Analytics works across the full national dataset, but your plan covers only the
                places you chose. Upgrade to a national plan, or use the county and market views for your
                territory instead.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild variant="outline" className="border-slate-700 text-slate-300">
                <Link to={createPageUrl('Billing')}>View plans</Link>
              </Button>
              <Button asChild variant="outline" className="border-slate-700 text-slate-300">
                <Link to={createPageUrl('MarketIntelligence')}>Open Market Intelligence</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
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
                  onWidgetsChange={() => queryClient.invalidateQueries({ queryKey: ['analyticsDashboards'] })}
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
      )}


    </div>
  );
}