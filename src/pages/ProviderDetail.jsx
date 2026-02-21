import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, LayoutDashboard, Stethoscope, Network, Mail, ShieldCheck, MapPin as MapPinIcon, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import BasicProfile from '../components/providers/BasicProfile';
import ProviderKPIRow from '../components/providers/ProviderKPIRow';
import UtilizationInsights from '../components/providers/UtilizationInsights';
import UtilizationTrendChart from '../components/providers/UtilizationTrendChart';
import ReferralTrendChart from '../components/providers/ReferralTrendChart';
import ReferralLikelihoodSignals from '../components/providers/ReferralLikelihoodSignals';
import PatientPopulationFingerprint from '../components/providers/PatientPopulationFingerprint';
import WhyThisProvider from '../components/providers/WhyThisProvider';
import ScoreBreakdown from '../components/providers/ScoreBreakdown';
import LocationsTable from '../components/providers/LocationsTable';
import TaxonomyList from '../components/providers/TaxonomyList';
import TerritoryIntelligence from '../components/providers/TerritoryIntelligence';
import RelatedLocations from '../components/providers/RelatedLocations';
import AISummary from '../components/providers/AISummary';
import AIEmailFinder from '../components/providers/AIEmailFinder';
import ComplianceDisclaimer from '../components/compliance/ComplianceDisclaimer';
import UtilizationSummaryCard from '../components/providers/UtilizationSummaryCard';
import ReferralSummaryCard from '../components/providers/ReferralSummaryCard';
import DataQualityInsightsCard from '../components/providers/DataQualityInsightsCard';
import AIContactEnrichment from '../components/ai/AIContactEnrichment';
import AIRelatedProviders from '../components/ai/AIRelatedProviders';
import AIMarketInsights from '../components/ai/AIMarketInsights';
import AIDataEnrichmentPanel from '../components/ai/AIDataEnrichmentPanel';
import SingleEmailVerifier from '../components/emailBot/SingleEmailVerifier';
import ProviderAffiliations from '../components/providers/ProviderAffiliations';
import AINetworkFitCard from '../components/providers/AINetworkFitCard';
import ProviderMessaging from '../components/providers/ProviderMessaging';
import ProviderImportHistory from '../components/providers/ProviderImportHistory';
import ProviderAIQualityInsights from '../components/providers/ProviderAIQualityInsights';
import ExternalDataDisplay from '../components/enrichment/ExternalDataDisplay';

export default function ProviderDetail() {
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  const npi = searchParams.get('npi');
  const fromPage = searchParams.get('from');

  const { data: providers = [], isLoading: loadingProvider } = useQuery({
    queryKey: ['provider', npi],
    queryFn: () => base44.entities.Provider.filter({ npi }),
    enabled: !!npi,
  });

  const { data: scores = [], isLoading: loadingScore } = useQuery({
    queryKey: ['providerScore', npi],
    queryFn: () => base44.entities.LeadScore.filter({ npi }),
    enabled: !!npi,
  });

  const { data: locations = [], isLoading: loadingLocations } = useQuery({
    queryKey: ['providerLocations', npi],
    queryFn: () => base44.entities.ProviderLocation.filter({ npi }),
    enabled: !!npi,
  });

  const { data: taxonomies = [], isLoading: loadingTaxonomies } = useQuery({
    queryKey: ['providerTaxonomies', npi],
    queryFn: () => base44.entities.ProviderTaxonomy.filter({ npi }),
    enabled: !!npi,
  });

  const { data: utilizations = [], isLoading: loadingUtil } = useQuery({
    queryKey: ['providerUtilAll', npi],
    queryFn: () => base44.entities.CMSUtilization.filter({ npi }),
    enabled: !!npi,
  });

  const { data: referrals = [], isLoading: loadingRef } = useQuery({
    queryKey: ['providerRefAll', npi],
    queryFn: () => base44.entities.CMSReferral.filter({ npi }),
    enabled: !!npi,
  });

  const { data: serviceUtil = [] } = useQuery({
    queryKey: ['providerServiceUtil', npi],
    queryFn: () => base44.entities.ProviderServiceUtilization.filter({ npi }),
    enabled: !!npi,
  });

  // Data for AI Related Providers
  const { data: allProviders = [] } = useQuery({
    queryKey: ['allProvsForAI'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: allLocations = [] } = useQuery({
    queryKey: ['allLocsForAI'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: allTaxonomies = [] } = useQuery({
    queryKey: ['allTaxForAI'],
    queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: outreachMessages = [] } = useQuery({
    queryKey: ['providerMessages', npi],
    queryFn: () => base44.entities.OutreachMessage.filter({ npi }),
    enabled: !!npi,
  });

  const queryClient = useQueryClient();
  const loading = loadingProvider || loadingScore || loadingLocations || loadingUtil || loadingRef || loadingTaxonomies;

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
        <Skeleton className="h-8 w-32 mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-64" />)}
          </div>
          <div className="space-y-6">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-48" />)}
          </div>
        </div>
      </div>
    );
  }

  const provider = providers?.[0];
  const score = scores?.[0];
  const primaryLocation = locations?.find(l => l.is_primary) || locations?.[0];
  const latestUtil = [...utilizations].sort((a, b) => (b.year || 0) - (a.year || 0))[0];
  const latestRef = [...referrals].sort((a, b) => (b.year || 0) - (a.year || 0))[0];

  if (!provider) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">
        <p className="text-gray-500 text-lg mb-4">Provider not found</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Link to={createPageUrl('Providers')}>
          <Button variant="outline" size="sm" className="text-xs h-7 bg-transparent border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-cyan-400">
            All Providers
          </Button>
        </Link>
      </div>

      <div className="mb-4">
        <ComplianceDisclaimer />
      </div>

      {/* KPI Summary Row */}
      <div className="mb-6">
        <ProviderKPIRow
          utilizations={utilizations}
          referrals={referrals}
          locations={locations}
          taxonomies={taxonomies}
          score={score}
        />
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start h-12 bg-slate-100 p-1 mb-6 overflow-x-auto">
          <TabsTrigger value="overview" className="gap-2 h-10 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <LayoutDashboard className="w-4 h-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="clinical" className="gap-2 h-10 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Stethoscope className="w-4 h-4" /> Clinical Data
          </TabsTrigger>
          <TabsTrigger value="locations" className="gap-2 h-10 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <MapPinIcon className="w-4 h-4" /> Locations & Territory
          </TabsTrigger>
          <TabsTrigger value="network" className="gap-2 h-10 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Network className="w-4 h-4" /> Network & Affiliations
          </TabsTrigger>
          <TabsTrigger value="outreach" className="gap-2 h-10 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Mail className="w-4 h-4" /> Outreach
          </TabsTrigger>
          <TabsTrigger value="quality" className="gap-2 h-10 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <ShieldCheck className="w-4 h-4" /> Data Quality
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <BasicProfile provider={provider} taxonomy={taxonomies} locations={locations} />
              <AISummary
                provider={provider}
                taxonomies={taxonomies}
                utilization={latestUtil}
                referral={latestRef}
                locations={locations}
                score={score}
              />
              <WhyThisProvider
                score={score}
                utilization={latestUtil}
                referrals={latestRef}
                taxonomy={taxonomies}
              />
              {score && (
                <ScoreBreakdown
                  score={score.score}
                  breakdown={score.score_breakdown}
                  reasons={score.reasons}
                />
              )}
            </div>
            <div className="space-y-6">
              <AINetworkFitCard
                provider={provider}
                taxonomy={taxonomies}
                utilization={latestUtil}
                referrals={latestRef}
                score={score}
                locations={locations}
              />
              <ReferralLikelihoodSignals
                utilization={latestUtil}
                referrals={latestRef}
                taxonomy={taxonomies}
              />
               <AIMarketInsights
                provider={provider}
                location={primaryLocation}
                taxonomies={taxonomies}
                utilizations={utilizations}
                referrals={referrals}
                score={score}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="clinical" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UtilizationSummaryCard utilizations={utilizations} />
            <ReferralSummaryCard referrals={referrals} />
          </div>
          <UtilizationInsights utilization={latestUtil} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <UtilizationTrendChart utilizations={utilizations} />
            <ReferralTrendChart referrals={referrals} />
          </div>
          <PatientPopulationFingerprint
            provider={provider}
            taxonomy={taxonomies}
            utilization={latestUtil}
            referrals={latestRef}
          />
          <TaxonomyList taxonomies={taxonomies} />
        </TabsContent>

        <TabsContent value="locations" className="space-y-6">
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
               <LocationsTable locations={locations} />
               <TerritoryIntelligence location={primaryLocation} />
            </div>
             <div className="space-y-6">
               <RelatedLocations npi={npi} />
             </div>
           </div>
        </TabsContent>

        <TabsContent value="network" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
               <ProviderAffiliations
                npi={npi}
                provider={provider}
                location={primaryLocation}
                taxonomies={taxonomies}
              />
            </div>
            <div className="space-y-6">
              <AIRelatedProviders
                provider={provider}
                location={primaryLocation}
                taxonomies={taxonomies}
                referrals={latestRef}
                allProviders={allProviders}
                allLocations={allLocations}
                allTaxonomies={allTaxonomies}
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="outreach" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <ProviderMessaging
                provider={provider}
                locations={locations}
              />
              
              {outreachMessages.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                       <MessageSquare className="w-5 h-5 text-violet-500" />
                       Campaign History
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                     <div className="space-y-4">
                      {outreachMessages.sort((a,b) => new Date(b.created_date) - new Date(a.created_date)).map(msg => (
                        <div key={msg.id} className="border rounded-lg p-3">
                           <div className="flex justify-between items-start mb-2">
                              <div>
                                <h4 className="font-semibold text-sm">{msg.subject || 'No Subject'}</h4>
                                <p className="text-xs text-slate-500">Sent: {new Date(msg.created_date).toLocaleDateString()}</p>
                              </div>
                              <Badge variant="outline">{msg.status}</Badge>
                           </div>
                           <p className="text-sm text-slate-600 line-clamp-2">{msg.body}</p>
                        </div>
                      ))}
                     </div>
                  </CardContent>
                </Card>
              )}
            </div>
            <div className="space-y-6">
              <AIEmailFinder provider={provider} locations={locations} taxonomies={taxonomies} />
              {provider.email && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      Email Verification
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SingleEmailVerifier
                      provider={provider}
                      onVerified={() => queryClient.invalidateQueries({ queryKey: ['provider', npi] })}
                    />
                  </CardContent>
                </Card>
              )}
              <AIContactEnrichment provider={provider} location={primaryLocation} taxonomies={taxonomies} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="quality" className="space-y-6">
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             <div className="lg:col-span-2 space-y-6">
               <DataQualityInsightsCard npi={npi} provider={provider} />
               <ExternalDataDisplay npi={npi} onEnrichmentComplete={() => {
                 queryClient.invalidateQueries({ queryKey: ['provider', npi] });
               }} />
               <ProviderAIQualityInsights
                 provider={provider}
                 locations={locations}
                 utilizations={utilizations}
                 referrals={referrals}
                 taxonomies={taxonomies}
               />
               <ProviderImportHistory npi={npi} />
             </div>
             <div className="space-y-6">
               <AIDataEnrichmentPanel
                 provider={provider}
                 location={primaryLocation}
                 taxonomies={taxonomies}
                 entityType={provider.entity_type === 'Organization' ? 'organization' : 'provider'}
                 onDataUpdated={() => {
                   queryClient.invalidateQueries({ queryKey: ['provider', npi] });
                   queryClient.invalidateQueries({ queryKey: ['providerLocations', npi] });
                   queryClient.invalidateQueries({ queryKey: ['providerTaxonomies', npi] });
                 }}
               />
             </div>
           </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}