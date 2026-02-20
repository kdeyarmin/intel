import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

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
import ProviderAffiliations from '../components/providers/ProviderAffiliations';
import AINetworkFitCard from '../components/providers/AINetworkFitCard';
import ProviderMessaging from '../components/providers/ProviderMessaging';
import ProviderImportHistory from '../components/providers/ProviderImportHistory';
import ProviderAIQualityInsights from '../components/providers/ProviderAIQualityInsights';

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Left 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          <BasicProfile provider={provider} taxonomy={taxonomies} locations={locations} />

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

          <AISummary
            provider={provider}
            taxonomies={taxonomies}
            utilization={latestUtil}
            referral={latestRef}
            locations={locations}
            score={score}
          />

          {/* Aggregated Summaries */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UtilizationSummaryCard utilizations={utilizations} />
            <ReferralSummaryCard referrals={referrals} />
          </div>

          <UtilizationInsights utilization={latestUtil} />

          {/* Historical Charts */}
          <UtilizationTrendChart utilizations={utilizations} />
          <ReferralTrendChart referrals={referrals} />

          <PatientPopulationFingerprint
            provider={provider}
            taxonomy={taxonomies}
            utilization={latestUtil}
            referrals={latestRef}
          />

          {/* Affiliations */}
          <ProviderAffiliations
            npi={npi}
            provider={provider}
            location={primaryLocation}
            taxonomies={taxonomies}
          />

          {/* Full Locations Table */}
          <LocationsTable locations={locations} />

          {/* Full Taxonomy List */}
          <TaxonomyList taxonomies={taxonomies} />
        </div>

        {/* Sidebar - Right 1/3 */}
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

          <ProviderMessaging
            provider={provider}
            locations={locations}
          />

          <TerritoryIntelligence location={primaryLocation} />

          <RelatedLocations npi={npi} />

          <DataQualityInsightsCard npi={npi} provider={provider} />

          <ProviderAIQualityInsights
            provider={provider}
            locations={locations}
            utilizations={utilizations}
            referrals={referrals}
            taxonomies={taxonomies}
          />

          <ProviderImportHistory npi={npi} />

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

          <AIContactEnrichment provider={provider} location={primaryLocation} taxonomies={taxonomies} />

          <AIRelatedProviders
            provider={provider}
            location={primaryLocation}
            taxonomies={taxonomies}
            referrals={latestRef}
            allProviders={allProviders}
            allLocations={allLocations}
            allTaxonomies={allTaxonomies}
          />

          <AIMarketInsights
            provider={provider}
            location={primaryLocation}
            taxonomies={taxonomies}
            utilizations={utilizations}
            referrals={referrals}
            score={score}
          />

          <AIEmailFinder provider={provider} locations={locations} taxonomies={taxonomies} />
        </div>
      </div>
    </div>
  );
}