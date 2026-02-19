import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Users, GitBranch, Activity } from 'lucide-react';

import StateProviderChart from '../components/locationAnalytics/StateProviderChart';
import ReferralVolumeChart from '../components/locationAnalytics/ReferralVolumeChart';
import LocationTypeBreakdown from '../components/locationAnalytics/LocationTypeBreakdown';
import LocationInsightsPanel from '../components/locationAnalytics/LocationInsightsPanel';
import TopLocationsTable from '../components/locationAnalytics/TopLocationsTable';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

export default function LocationAnalytics() {
  const { data: locations = [], isLoading: loadingLoc } = useQuery({
    queryKey: ['locAnalyticsLocations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    staleTime: 60000,
  });

  const { data: referrals = [], isLoading: loadingRef } = useQuery({
    queryKey: ['locAnalyticsReferrals'],
    queryFn: () => base44.entities.CMSReferral.list('-created_date', 500),
    staleTime: 60000,
  });

  const { data: utilizations = [], isLoading: loadingUtil } = useQuery({
    queryKey: ['locAnalyticsUtilizations'],
    queryFn: () => base44.entities.CMSUtilization.list('-created_date', 500),
    staleTime: 60000,
  });

  const isLoading = loadingLoc || loadingRef || loadingUtil;

  // Aggregate by state
  const stateData = useMemo(() => {
    const stateMap = {};
    locations.forEach(l => {
      if (!l.state) return;
      if (!stateMap[l.state]) stateMap[l.state] = { providers: new Set(), locations: 0 };
      stateMap[l.state].providers.add(l.npi);
      stateMap[l.state].locations++;
    });
    return Object.entries(stateMap)
      .map(([state, d]) => ({ state, providers: d.providers.size, locations: d.locations }))
      .sort((a, b) => b.providers - a.providers)
      .slice(0, 15);
  }, [locations]);

  // Aggregate by city+state
  const cityData = useMemo(() => {
    const cityMap = {};
    const refByNPI = {};
    referrals.forEach(r => { refByNPI[r.npi] = r; });
    const utilByNPI = {};
    utilizations.forEach(u => { utilByNPI[u.npi] = u; });

    locations.forEach(l => {
      const key = `${l.city || 'Unknown'}|${l.state || ''}`;
      if (!cityMap[key]) cityMap[key] = { city: l.city || 'Unknown', state: l.state || '', npis: new Set(), locationCount: 0, totalReferrals: 0, totalBeneficiaries: 0 };
      cityMap[key].npis.add(l.npi);
      cityMap[key].locationCount++;
      const ref = refByNPI[l.npi];
      if (ref) cityMap[key].totalReferrals += (ref.total_referrals || 0);
      const util = utilByNPI[l.npi];
      if (util) cityMap[key].totalBeneficiaries += (util.total_medicare_beneficiaries || 0);
    });

    return Object.values(cityMap)
      .map(c => ({
        ...c,
        providerCount: c.npis.size,
        avgBeneficiaries: c.npis.size ? Math.round(c.totalBeneficiaries / c.npis.size) : 0,
      }))
      .sort((a, b) => b.providerCount - a.providerCount);
  }, [locations, referrals, utilizations]);

  // Referral volume by state
  const referralByState = useMemo(() => {
    const refByNPI = {};
    referrals.forEach(r => { refByNPI[r.npi] = r; });

    const stateRef = {};
    locations.forEach(l => {
      if (!l.state) return;
      const ref = refByNPI[l.npi];
      if (!ref) return;
      if (!stateRef[l.state]) stateRef[l.state] = { home_health: 0, hospice: 0, snf: 0 };
      stateRef[l.state].home_health += (ref.home_health_referrals || 0);
      stateRef[l.state].hospice += (ref.hospice_referrals || 0);
      stateRef[l.state].snf += (ref.snf_referrals || 0);
    });

    return Object.entries(stateRef)
      .map(([state, d]) => ({ label: state, ...d, total: d.home_health + d.hospice + d.snf }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [locations, referrals]);

  // Summary stats
  const stats = useMemo(() => {
    const uniqueNPIs = new Set(locations.map(l => l.npi));
    const totalRef = referrals.reduce((s, r) => s + (r.total_referrals || 0), 0);
    const totalBen = utilizations.reduce((s, u) => s + (u.total_medicare_beneficiaries || 0), 0);
    const practiceCount = locations.filter(l => l.location_type === 'Practice').length;
    const mailingCount = locations.filter(l => l.location_type === 'Mailing').length;
    const primaryCount = locations.filter(l => l.is_primary).length;
    const uniqueStates = new Set(locations.map(l => l.state).filter(Boolean));
    return { totalLocations: locations.length, uniqueProviders: uniqueNPIs.size, totalReferrals: totalRef, totalBeneficiaries: totalBen, practiceCount, mailingCount, primaryCount, stateCount: uniqueStates.size };
  }, [locations, referrals, utilizations]);

  // For AI insights
  const summaryForAI = useMemo(() => ({
    total_locations: stats.totalLocations,
    unique_providers: stats.uniqueProviders,
    states_covered: stats.stateCount,
    total_referrals: stats.totalReferrals,
    total_beneficiaries: stats.totalBeneficiaries,
    top_states: stateData.slice(0, 8),
    top_cities: cityData.slice(0, 10).map(c => ({ city: c.city, state: c.state, providers: c.providerCount, referrals: c.totalReferrals })),
    referral_breakdown_by_state: referralByState.slice(0, 8),
  }), [stats, stateData, cityData, referralByState]);

  const kpis = [
    { label: 'Total Locations', value: stats.totalLocations.toLocaleString(), icon: MapPin, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Unique Providers', value: stats.uniqueProviders.toLocaleString(), icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Total Referrals', value: stats.totalReferrals.toLocaleString(), icon: GitBranch, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'States Covered', value: stats.stateCount, icon: Activity, color: 'text-violet-600', bg: 'bg-violet-50' },
  ];

  if (isLoading) {
    return (
      <div className="p-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-72" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Location Analytics</h1>
        <p className="text-gray-600 mt-1">Aggregated location metrics, referral volumes, and AI-driven insights</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="bg-gray-100">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${k.bg}`}>
                  <Icon className={`w-5 h-5 ${k.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{k.value}</p>
                  <p className="text-xs text-gray-500">{k.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <StateProviderChart data={stateData} />
        <ReferralVolumeChart data={referralByState} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-1">
          <LocationTypeBreakdown
            practiceCount={stats.practiceCount}
            mailingCount={stats.mailingCount}
            primaryCount={stats.primaryCount}
          />
        </div>
        <div className="lg:col-span-2">
          <LocationInsightsPanel summaryData={summaryForAI} />
        </div>
      </div>

      {/* Top Locations Table */}
      <TopLocationsTable locations={cityData} />

      <DataSourcesFooter />
    </div>
  );
}