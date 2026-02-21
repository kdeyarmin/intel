import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles } from 'lucide-react';

import HighReferralPotentialWidget from '../components/aiInsights/HighReferralPotentialWidget';
import ProviderSummaryWidget from '../components/aiInsights/ProviderSummaryWidget';
import MarketInsightsWidget from '../components/aiInsights/MarketInsightsWidget';
import CampaignPredictionWidget from '../components/aiInsights/CampaignPredictionWidget';
import LeadScoringTrendsWidget from '../components/aiInsights/LeadScoringTrendsWidget';
import ConnectionsWidget from '../components/aiInsights/ConnectionsWidget';
import ProactiveAlerts from '../components/dashboard/ProactiveAlerts';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

export default function AIInsights() {
  const { data: providers = [], isLoading: lp } = useQuery({
    queryKey: ['aiInsProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: locations = [], isLoading: ll } = useQuery({
    queryKey: ['aiInsLocations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: taxonomies = [] } = useQuery({
    queryKey: ['aiInsTax'],
    queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: utilizations = [] } = useQuery({
    queryKey: ['aiInsUtil'],
    queryFn: () => base44.entities.CMSUtilization.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: referrals = [] } = useQuery({
    queryKey: ['aiInsRef'],
    queryFn: () => base44.entities.CMSReferral.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: scores = [] } = useQuery({
    queryKey: ['aiInsScores'],
    queryFn: () => base44.entities.LeadScore.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: campaigns = [] } = useQuery({
    queryKey: ['aiInsCampaigns'],
    queryFn: () => base44.entities.OutreachCampaign.list('-created_date'),
    staleTime: 120000,
  });

  const loading = lp || ll;

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-36" />
        <div className="grid grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-gradient-to-br from-violet-100 to-blue-100">
          <Sparkles className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">AI Insights</h1>
          <p className="text-sm text-slate-500">AI-driven intelligence across your provider network — identify trends, leads, and data issues</p>
        </div>
      </div>

      {/* Proactive Alerts & Data Quality (Consolidated) */}
      <ProactiveAlerts
        providers={providers}
        utilizations={utilizations}
        referrals={referrals}
        locations={locations}
      />

      {/* NEW: Provider Summary — full width */}
      <ProviderSummaryWidget
        providers={providers}
        locations={locations}
        taxonomies={taxonomies}
        referrals={referrals}
        utilizations={utilizations}
      />

      {/* NEW: Referral Potential */}
      <div className="grid grid-cols-1 gap-6">
        <HighReferralPotentialWidget
          providers={providers}
          referrals={referrals}
          utilizations={utilizations}
          locations={locations}
          taxonomies={taxonomies}
          scores={scores}
        />
      </div>

      {/* Market Intelligence + Campaign Prediction */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <MarketInsightsWidget
          providers={providers}
          locations={locations}
          taxonomies={taxonomies}
          utilizations={utilizations}
          referrals={referrals}
        />
        <CampaignPredictionWidget campaigns={campaigns} />
      </div>

      {/* Lead Scoring + Connections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LeadScoringTrendsWidget scores={scores} providers={providers} />
        <ConnectionsWidget
          providers={providers}
          locations={locations}
          taxonomies={taxonomies}
          referrals={referrals}
          scores={scores}
        />
      </div>

      <DataSourcesFooter />
    </div>
  );
}