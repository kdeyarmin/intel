import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, Database } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function DataQualityWidget() {
  const { data: providers = [], isLoading: loadingProviders } = useQuery({
    queryKey: ['providers'],
    queryFn: () => base44.entities.Provider.list(),
  });

  const { data: utilization = [], isLoading: loadingUtil } = useQuery({
    queryKey: ['utilization'],
    queryFn: () => base44.entities.CMSUtilization.list(),
  });

  const { data: referrals = [], isLoading: loadingRef } = useQuery({
    queryKey: ['referrals'],
    queryFn: () => base44.entities.CMSReferral.list(),
  });

  const { data: locations = [], isLoading: loadingLoc } = useQuery({
    queryKey: ['locations'],
    queryFn: () => base44.entities.ProviderLocation.list(),
  });

  if (loadingProviders || loadingUtil || loadingRef || loadingLoc) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Data Quality</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const providerNPIs = new Set(providers.map(p => p.npi));
  const utilizationNPIs = new Set(utilization.map(u => u.npi));
  const referralNPIs = new Set(referrals.map(r => r.npi));
  const locationNPIs = new Set(locations.map(l => l.npi));

  const utilMatchRate = utilization.length > 0
    ? ((utilization.filter(u => providerNPIs.has(u.npi)).length / utilization.length) * 100).toFixed(1)
    : 0;

  const refMatchRate = referrals.length > 0
    ? ((referrals.filter(r => providerNPIs.has(r.npi)).length / referrals.length) * 100).toFixed(1)
    : 0;

  const locMatchRate = locations.length > 0
    ? ((locations.filter(l => providerNPIs.has(l.npi)).length / locations.length) * 100).toFixed(1)
    : 100;

  const needsEnrichment = providers.filter(p => p.needs_nppes_enrichment).length;

  // Calculate unmatched NPIs (in CMS data but not in Provider table)
  const unmatchedUtil = [...utilizationNPIs].filter(npi => !providerNPIs.has(npi)).length;
  const unmatchedRef = [...referralNPIs].filter(npi => !providerNPIs.has(npi)).length;
  const totalUnmatched = new Set([...utilizationNPIs, ...referralNPIs].filter(npi => !providerNPIs.has(npi))).size;

  // Calculate providers with multiple locations
  const multipleLocations = locations.length - locationNPIs.size;

  const getStatusColor = (rate) => {
    if (rate >= 90) return 'text-green-600 bg-green-50';
    if (rate >= 70) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getStatusIcon = (rate) => {
    if (rate >= 90) return <CheckCircle className="w-4 h-4 text-green-600" />;
    return <AlertCircle className="w-4 h-4 text-yellow-600" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5 text-teal-600" />
          Data Quality & Provider Linking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div className="flex items-center gap-2">
            {getStatusIcon(utilMatchRate)}
            <span className="text-sm font-medium">CMS Utilization</span>
          </div>
          <Badge className={getStatusColor(utilMatchRate)}>
            {utilMatchRate}% matched
          </Badge>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div className="flex items-center gap-2">
            {getStatusIcon(refMatchRate)}
            <span className="text-sm font-medium">CMS Referrals</span>
          </div>
          <Badge className={getStatusColor(refMatchRate)}>
            {refMatchRate}% matched
          </Badge>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg border">
          <div className="flex items-center gap-2">
            {getStatusIcon(locMatchRate)}
            <span className="text-sm font-medium">Provider Locations</span>
          </div>
          <Badge className={getStatusColor(locMatchRate)}>
            {locMatchRate}% matched
          </Badge>
        </div>

        {needsEnrichment > 0 && (
          <div className="mt-4 p-3 bg-orange-50 rounded-lg border border-orange-200">
            <p className="text-sm text-orange-800">
              <span className="font-semibold">{needsEnrichment}</span> placeholder provider{needsEnrichment !== 1 ? 's' : ''} created from CMS data need NPPES enrichment
            </p>
          </div>
        )}

        {totalUnmatched > 0 && (
          <div className="mt-2 p-3 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm text-red-800">
              <span className="font-semibold">{totalUnmatched}</span> unmatched NPI{totalUnmatched !== 1 ? 's' : ''} found in CMS datasets
            </p>
          </div>
        )}

        <div className="mt-4 pt-3 border-t space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Total Providers</span>
            <span className="font-medium">{providers.length}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Unique NPIs</span>
            <span className="font-medium">{providerNPIs.size}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Multiple Locations</span>
            <span className="font-medium">{multipleLocations}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Needs Enrichment</span>
            <span className="font-medium text-orange-600">{needsEnrichment}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-600">Unmatched NPIs</span>
            <span className="font-medium text-red-600">{totalUnmatched}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}