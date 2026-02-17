import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import BasicProfile from '../components/providers/BasicProfile';
import UtilizationInsights from '../components/providers/UtilizationInsights';
import PatientPopulationFingerprint from '../components/providers/PatientPopulationFingerprint';
import ReferralLikelihoodSignals from '../components/providers/ReferralLikelihoodSignals';
import TerritoryIntelligence from '../components/providers/TerritoryIntelligence';
import WhyThisProvider from '../components/providers/WhyThisProvider';
import ScoreBreakdown from '../components/providers/ScoreBreakdown';
import ComplianceDisclaimer from '../components/compliance/ComplianceDisclaimer';

export default function ProviderDetail() {
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(window.location.search);
  const npi = searchParams.get('npi');

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
    queryKey: ['providerUtil', npi],
    queryFn: () => base44.entities.CMSUtilization.filter({ npi }),
    enabled: !!npi,
  });

  const { data: referrals = [], isLoading: loadingRef } = useQuery({
    queryKey: ['providerRef', npi],
    queryFn: () => base44.entities.CMSReferral.filter({ npi }),
    enabled: !!npi,
  });

  if (loadingProvider || loadingScore || loadingLocations || loadingUtil || loadingRef || loadingTaxonomies) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <Skeleton className="h-10 w-32 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-64" />)}
          </div>
          <div className="space-y-6">
            {[1, 2].map(i => <Skeleton key={i} className="h-48" />)}
          </div>
        </div>
      </div>
    );
  }

  const provider = providers?.[0];
  const score = scores?.[0];
  const primaryLocation = locations?.find(l => l.is_primary) || locations?.[0];
  const utilization = utilizations?.[0];
  const referral = referrals?.[0];

  if (!provider) {
    return (
      <div className="p-8">
        <p className="text-gray-600">Provider not found</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Button
        variant="ghost"
        className="mb-6"
        onClick={() => navigate(-1)}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </Button>

      <div className="mb-6">
        <ComplianceDisclaimer />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Profile & Intelligence */}
        <div className="lg:col-span-2 space-y-6">
          <BasicProfile 
            provider={provider} 
            taxonomy={taxonomies} 
            locations={locations} 
          />

          <WhyThisProvider 
            score={score}
            utilization={utilization}
            referrals={referral}
            taxonomy={taxonomies}
          />

          {score && (
            <ScoreBreakdown 
              score={score.score}
              breakdown={score.score_breakdown} 
              reasons={score.reasons} 
            />
          )}

          <UtilizationInsights utilization={utilization} />

          <PatientPopulationFingerprint
            provider={provider}
            taxonomy={taxonomies}
            utilization={utilization}
            referrals={referral}
          />
        </div>

        {/* Right Column - Signals & Territory */}
        <div className="space-y-6">
          <ReferralLikelihoodSignals
            utilization={utilization}
            referrals={referral}
            taxonomy={taxonomies}
          />

          <TerritoryIntelligence location={primaryLocation} />
        </div>
      </div>
    </div>
  );
}