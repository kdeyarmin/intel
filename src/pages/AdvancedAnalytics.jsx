import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, TrendingUp, GitCompare, Sparkles, LayoutDashboard } from 'lucide-react';

import TrendAnalysisPanel from '../components/advancedAnalytics/TrendAnalysisPanel';
import ComparativeAnalysisPanel from '../components/advancedAnalytics/ComparativeAnalysisPanel';
import PredictiveAnalyticsPanel from '../components/advancedAnalytics/PredictiveAnalyticsPanel';
import DrillDownTable from '../components/advancedAnalytics/DrillDownTable';
import DashboardBuilder from '../components/advancedAnalytics/DashboardBuilder';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

export default function AdvancedAnalytics() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeDashboardId, setActiveDashboardId] = useState(null);

  // Core data
  const { data: providers = [], isLoading: lp } = useQuery({
    queryKey: ['aaProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: utilization = [], isLoading: lu } = useQuery({
    queryKey: ['aaUtil'],
    queryFn: () => base44.entities.CMSUtilization.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: referrals = [], isLoading: lr } = useQuery({
    queryKey: ['aaRef'],
    queryFn: () => base44.entities.CMSReferral.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: locations = [], isLoading: ll } = useQuery({
    queryKey: ['aaLoc'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: taxonomies = [], isLoading: lt } = useQuery({
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
    if (!activeDashboardId && dashboards.length > 0) {
      const def = dashboards.find(d => d.is_default) || dashboards[0];
      setActiveDashboardId(def.id);
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
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-violet-100 to-blue-100">
            <BarChart3 className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Advanced Analytics</h1>
            <p className="text-sm text-slate-500">Deep insights, trend analysis, comparative reports & predictive models</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-100">
          <TabsTrigger value="dashboard" className="gap-1.5 text-xs">
            <LayoutDashboard className="w-3.5 h-3.5" /> Custom Dashboards
          </TabsTrigger>
          <TabsTrigger value="trends" className="gap-1.5 text-xs">
            <TrendingUp className="w-3.5 h-3.5" /> Trend Analysis
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
                  onWidgetsChange={() => {}}
                />
              </div>
              <div className="lg:col-span-9 space-y-5">
                {activeDashboard ? (
                  (activeDashboard.widgets || []).length > 0 ? (
                    (activeDashboard.widgets || []).map(w => renderWidget(w))
                  ) : (
                    <div className="flex items-center justify-center h-64 border-2 border-dashed border-slate-200 rounded-xl">
                      <div className="text-center">
                        <LayoutDashboard className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">Add widgets using the panel on the left</p>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="flex items-center justify-center h-64 border-2 border-dashed border-slate-200 rounded-xl">
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

      <DataSourcesFooter />
    </div>
  );
}