import React, { useMemo } from 'react';
import PageTabs from '@/components/layout/PageTabs';
import { useQuery } from '@tanstack/react-query';
import { invokeOrThrow } from '@/api/functionResult';
import { useUrlState } from '@/hooks/useUrlState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, TrendingUp, Heart, Users, Building2, Map, BarChart3, Network, AlertTriangle, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import InteractiveProviderMap from '../components/territory/InteractiveProviderMap';
import TerritoryMapFilters from '../components/territory/TerritoryMapFilters';
import MapStatsBar from '../components/territory/MapStatsBar';
import CountyDensityMap from '../components/territory/CountyDensityMap';
import ProviderClusterList from '../components/territory/ProviderClusterList';
import ComplianceDisclaimer from '../components/compliance/ComplianceDisclaimer';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

// Filters live in the URL so a territory view can be shared and Back restores it.
const URL_DEFAULTS = {
  state: 'PA', group: 'all', type: 'all', minScore: '', maxScore: '', minVolume: '', unscored: 'show',
  color: true, heat: false, volume: false, tab: 'map',
};

const BEHAVIORAL = /psycholog|behavioral|mental health|social work|counsel/i;

/** Territory data → the item shape the map, popup and cluster lists use. */
function toItem(p) {
  return {
    provider: {
      npi: p.npi, name: p.name, first_name: p.firstName, last_name: p.lastName,
      organization_name: p.organizationName, entity_type: p.entityType,
    },
    location: { address_1: p.address, city: p.city, state: p.state, zip: p.zip },
    taxonomy: { taxonomy_description: p.specialty, taxonomy_code: p.taxonomyCode },
    specialtyGroup: p.specialtyGroup,
    county: p.county,
    countyFips: p.countyFips,
    coords: p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null,
    coordPrecision: p.coordPrecision,
    score: p.score,
    scoreSource: p.scoreSource,
    utilization: {
      total_medicare_payment: p.totalMedicarePayment,
      total_medicare_beneficiaries: p.totalBeneficiaries,
      total_services: p.totalServices,
      data_year: p.dataYear,
    },
  };
}

export default function TerritoryIntelligence() {
  const [filters, setFilters] = useUrlState(URL_DEFAULTS);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['territoryData', filters.state, filters.group, filters.type],
    queryFn: () => invokeOrThrow('getTerritoryData', {
      state: filters.state,
      ...(filters.group !== 'all' ? { specialty_group: filters.group } : {}),
      ...(filters.type !== 'all' ? { entity_type: filters.type } : {}),
    }),
    staleTime: 120000,
    retry: 1,
  });

  const items = useMemo(() => (data?.providers || []).map(toItem), [data]);

  const filtered = useMemo(() => {
    const min = filters.minScore === '' ? null : Number(filters.minScore);
    const max = filters.maxScore === '' ? null : Number(filters.maxScore);
    const minVol = filters.minVolume === '' ? null : Number(filters.minVolume);
    return items.filter((item) => {
      if (item.score == null) {
        if (filters.unscored === 'hide' || min != null || max != null) return false;
      } else {
        if (min != null && item.score < min) return false;
        if (max != null && item.score > max) return false;
      }
      if (minVol != null && (item.utilization.total_medicare_beneficiaries || 0) < minVol) return false;
      return true;
    });
  }, [items, filters.minScore, filters.maxScore, filters.minVolume, filters.unscored]);

  const clusters = useMemo(() => ({
    high: filtered.filter((p) => p.score != null && p.score >= 70).sort((a, b) => b.score - a.score),
    behavioral: filtered.filter((p) => p.specialtyGroup === 'psychiatry' || BEHAVIORAL.test(p.taxonomy.taxonomy_description || '')),
    geriatric: filtered.filter((p) => {
      if (p.specialtyGroup === 'geriatrics') return true;
      const benes = p.utilization.total_medicare_beneficiaries || 0;
      return benes >= 200 && (p.utilization.total_services || 0) / benes >= 8;
    }),
    homeHealth: filtered.filter((p) => p.specialtyGroup === 'home_health' || p.specialtyGroup === 'hospice'),
  }), [filtered]);

  const panels = [
    { key: 'high', title: 'High score (70+)', icon: TrendingUp, color: 'text-green-400', items: clusters.high },
    { key: 'behavioral', title: 'Behavioral health', icon: Heart, color: 'text-purple-400', items: clusters.behavioral },
    { key: 'geriatric', title: 'Geriatric-heavy', icon: Users, color: 'text-orange-400', items: clusters.geriatric, hint: 'Geriatric specialists, or 200+ Medicare patients averaging 8+ services each' },
    { key: 'homeHealth', title: 'Home health & hospice', icon: Building2, color: 'text-teal-400', items: clusters.homeHealth },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <PageTabs current="TerritoryIntelligence" />
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-teal-900/30">
            <MapPin className="w-5 h-5 text-teal-400" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Territory Intelligence</h1>
            <p className="text-sm text-slate-400">Where providers are, how they score, and how dense each county is</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
          <span className="text-slate-400">Related:</span>
          <Link to={createPageUrl(`CountyIntelligence${filters.state !== 'ALL' ? `?state=${filters.state}` : ''}`)} className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
            <MapPin className="w-3 h-3" aria-hidden="true" /> County Intel
          </Link>
          <Link to={createPageUrl(`ReferralNetworkIntelligence${filters.state !== 'ALL' ? `?state=${filters.state}` : ''}`)} className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
            <Network className="w-3 h-3" aria-hidden="true" /> Referral Network
          </Link>
        </div>
      </div>

      <ComplianceDisclaimer />

      {isError ? (
        <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-6 text-center space-y-3" role="alert">
          <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" aria-hidden="true" />
          <p className="text-red-400 text-sm">Couldn't load territory data: {error?.message}</p>
          <button type="button" onClick={() => refetch()} className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-md text-xs">Try again</button>
        </div>
      ) : (
        <>
          {data?.scope && (
            <p className="flex items-start gap-1.5 text-xs text-slate-400">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                {data.scope.label}.
                {data.scope.approx_locations_in_state ? ` About ${data.scope.approx_locations_in_state.toLocaleString()} practice locations in ${data.scope.state} overall.` : ''}
                {data.geography && !data.geography.loaded && ' Census geography isn’t loaded yet, so providers can’t be placed on the map.'}
                {isFetching && ' Refreshing…'}
              </span>
            </p>
          )}

          {isLoading ? (
            <div className="space-y-4" aria-label="Loading territory">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
              <Skeleton className="h-[500px] w-full" />
            </div>
          ) : (
            <>
              <MapStatsBar providers={filtered} />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-3">
                  <TerritoryMapFilters
                    filters={filters}
                    onChange={setFilters}
                    onReset={() => setFilters(URL_DEFAULTS)}
                    providerCount={filtered.length}
                    availableStates={data?.availableStates || []}
                  />
                </div>
                <div className="lg:col-span-9">
                  <Tabs value={filters.tab} onValueChange={(tab) => setFilters({ tab })}>
                    <TabsList className="bg-slate-800/50 mb-3 h-auto flex flex-wrap">
                      <TabsTrigger value="map" className="gap-1.5 text-xs"><Map className="w-3.5 h-3.5" aria-hidden="true" /> Map</TabsTrigger>
                      <TabsTrigger value="density" className="gap-1.5 text-xs"><BarChart3 className="w-3.5 h-3.5" aria-hidden="true" /> County density</TabsTrigger>
                    </TabsList>
                    <TabsContent value="map" className="mt-0">
                      <InteractiveProviderMap
                        filteredProviders={filtered}
                        showHeatmap={filters.heat}
                        showVolumeDensity={filters.volume}
                        colorByScore={filters.color}
                      />
                    </TabsContent>
                    <TabsContent value="density" className="mt-0">
                      <CountyDensityMap counties={data?.counties || []} providers={filtered} state={filters.state !== 'ALL' ? filters.state : null} />
                    </TabsContent>
                  </Tabs>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {panels.map((panel) => (
                  <Card key={panel.key}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <panel.icon className={`h-4 w-4 ${panel.color}`} aria-hidden="true" />
                        {panel.title}
                      </CardTitle>
                      {panel.hint && <p className="text-[11px] text-slate-400">{panel.hint}</p>}
                    </CardHeader>
                    <CardContent>
                      <Badge variant="outline" className="mb-2 text-[10px]">{panel.items.length} providers</Badge>
                      <ProviderClusterList providers={panel.items.slice(0, 6)} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <DataSourcesFooter />
    </div>
  );
}
