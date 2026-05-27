import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MapPin, TrendingUp, Heart, Users, Building2, Map, BarChart3, Network } from 'lucide-react';
<<<<<<< HEAD
=======
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
>>>>>>> refs/remotes/origin/main
import InteractiveProviderMap from '../components/territory/InteractiveProviderMap';
import TerritoryMapFilters from '../components/territory/TerritoryMapFilters';
import MapStatsBar from '../components/territory/MapStatsBar';
import CountyDensityMap from '../components/territory/CountyDensityMap';
import ProviderClusterList from '../components/territory/ProviderClusterList';
<<<<<<< HEAD
import NetworkGraph from '../components/referralNetwork/NetworkGraph';
=======
>>>>>>> refs/remotes/origin/main
import ComplianceDisclaimer from '../components/compliance/ComplianceDisclaimer';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

const DEFAULT_FILTERS = {
  specialty: 'all',
  minScore: '',
  maxScore: '',
  minVolume: '',
  stateFilter: 'PA',
  entityType: 'all',
  showHeatmap: false,
  showVolumeDensity: false,
  colorByScore: true,
};

export default function TerritoryIntelligence() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [activeTab, setActiveTab] = useState('map');

  const { data: territoryData, isLoading } = useQuery({
    queryKey: ['tiTerritoryData', filters.stateFilter],
    queryFn: async () => {
      const result = await base44.functions.invoke('getTerritoryData', { state: filters.stateFilter || 'PA' });
      return result.data || result;
    },
    staleTime: 120000,
    retry: 2,
  });

  const filteredProviders = useMemo(() => {
    if (!territoryData?.providers) return [];
    return territoryData.providers
      .map(p => ({
        provider: { npi: p.npi, first_name: p.firstName, last_name: p.lastName, organization_name: p.organizationName, entity_type: p.entityType },
        location: { city: p.city, state: p.state, zip: p.zip, address_1: p.address },
        taxonomy: { taxonomy_description: p.specialty, taxonomy_code: p.taxonomyCode },
        score: 0,
        utilization: { total_medicare_payment: p.totalMedicarePayment, total_medicare_beneficiaries: p.totalBeneficiaries, total_services: p.totalServices, data_year: p.dataYear },
      }))
      .filter(item => {
        if (filters.specialty !== 'all') {
          const desc = (item.taxonomy?.taxonomy_description || '').toLowerCase();
          if (!desc.includes(filters.specialty.toLowerCase())) return false;
        }
        if (filters.minVolume && (item.utilization?.total_medicare_beneficiaries || 0) < parseFloat(filters.minVolume)) return false;
        if (filters.entityType !== 'all' && item.provider.entity_type !== filters.entityType) return false;
        return true;
      });
  }, [territoryData, filters]);

  // County stats
  const countyStats = useMemo(() => {
    const stats = {};
    filteredProviders.forEach(item => {
      const county = item.location.city || 'Unknown';
      if (!stats[county]) stats[county] = { count: 0, highScore: 0, totalScore: 0 };
      stats[county].count++;
      stats[county].totalScore += item.score;
      if (item.score > stats[county].highScore) stats[county].highScore = item.score;
    });

    return Object.entries(stats)
      .map(([county, data]) => ({
        county,
        ...data,
        avgScore: Math.round(data.totalScore / data.count),
      }))
      .sort((a, b) => b.count - a.count);
  }, [filteredProviders]);

  // Cluster views
  const highScoringProviders = useMemo(
    () => filteredProviders.filter(p => p.score >= 70).sort((a, b) => b.score - a.score),
    [filteredProviders]
  );

  const behavioralHealthProviders = useMemo(
    () => filteredProviders.filter(item => {
      const desc = (item.taxonomy?.taxonomy_description || '').toLowerCase();
      return ['psychiatry', 'psychology', 'behavioral', 'mental health'].some(t => desc.includes(t));
    }),
    [filteredProviders]
  );

  const geriatricHeavyProviders = useMemo(
    () => filteredProviders.filter(item => {
      const vol = item.utilization?.total_medicare_beneficiaries || 0;
      const intensity = vol > 0 ? (item.utilization?.total_services || 0) / vol : 0;
      return vol >= 200 && intensity >= 8;
    }),
    [filteredProviders]
  );

  const hhHospiceProviders = useMemo(
    () => filteredProviders.filter(item => {
      if (item.provider.entity_type !== 'Organization') return false;
      const desc = (item.taxonomy?.taxonomy_description || '').toLowerCase();
      return ['home health', 'hospice'].some(t => desc.includes(t));
    }),
    [filteredProviders]
  );

<<<<<<< HEAD
  const networkData = useMemo(() => {
    const nodes = filteredProviders.map(item => ({
      npi: item.provider.npi,
      label: item.provider.entity_type === 'Individual' 
        ? `${item.provider.first_name || ''} ${item.provider.last_name || ''}`.trim() 
        : item.provider.organization_name || item.provider.npi,
      entityType: item.provider.entity_type || 'Unknown',
      totalVolume: item.utilization?.total_medicare_beneficiaries || 0,
      isHub: item.score >= 80,
    }));

    const edges = [];
    const sorted = [...nodes].sort((a, b) => b.totalVolume - a.totalVolume);
    for (let i = 0; i < Math.min(sorted.length, 30); i++) {
      for (let j = i + 1; j < Math.min(sorted.length, 30); j++) {
        const vol = Math.min(sorted[i].totalVolume, sorted[j].totalVolume);
        if (vol > 0) {
          const weight = (sorted[i].entityType !== sorted[j].entityType) ? 1.5 : 1;
          edges.push({ source: sorted[i].npi, target: sorted[j].npi, volume: Math.round(vol * weight * 0.3) });
        }
      }
    }
    return { nodes: sorted.slice(0, 50), edges: edges.slice(0, 150) };
  }, [filteredProviders]);

=======
>>>>>>> refs/remotes/origin/main
  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
        <Skeleton className="h-10 w-80 mb-4" />
        <Skeleton className="h-14 w-full mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-gradient-to-br from-teal-500/20 to-blue-500/20">
            <MapPin className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Territory Intelligence</h1>
            <p className="text-sm text-slate-400">Interactive provider mapping, density analysis & market clusters</p>
          </div>
        </div>
<<<<<<< HEAD
=======
        <div className="flex flex-wrap items-center gap-3 mt-3 text-xs">
          <span className="text-slate-500">Related:</span>
          <Link to={createPageUrl('CountyIntelligence')} className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
            <MapPin className="w-3 h-3" /> County Intel (tabular breakdown)
          </Link>
          <Link to={createPageUrl('ReferralNetworkIntelligence')} className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300">
            <Network className="w-3 h-3" /> Referral Network (real referral relationships)
          </Link>
        </div>
>>>>>>> refs/remotes/origin/main
      </div>

      <ComplianceDisclaimer />
      <MapStatsBar providers={filteredProviders} countyStats={countyStats} />

      {/* Main content: Map + Filters side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-3">
          <TerritoryMapFilters
            filters={filters}
            onChange={setFilters}
            onReset={() => setFilters(DEFAULT_FILTERS)}
            providerCount={filteredProviders.length}
            availableStates={territoryData?.availableStates || []}
          />
        </div>
        <div className="lg:col-span-9">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-slate-800/50 mb-3 h-auto flex flex-wrap">
              <TabsTrigger value="map" className="gap-1.5 text-xs">
                <Map className="w-3.5 h-3.5" /> Interactive Map
              </TabsTrigger>
              <TabsTrigger value="density" className="gap-1.5 text-xs">
                <BarChart3 className="w-3.5 h-3.5" /> City Density
              </TabsTrigger>
<<<<<<< HEAD
              <TabsTrigger value="network" className="gap-1.5 text-xs">
                <Network className="w-3.5 h-3.5" /> Network Graph
              </TabsTrigger>
=======
>>>>>>> refs/remotes/origin/main
            </TabsList>

            <TabsContent value="map" className="mt-0">
              <InteractiveProviderMap
                filteredProviders={filteredProviders}
                showHeatmap={filters.showHeatmap}
                showVolumeDensity={filters.showVolumeDensity}
                colorByScore={filters.colorByScore}
              />
            </TabsContent>

            <TabsContent value="density" className="mt-0">
              <CountyDensityMap countyStats={countyStats} />
            </TabsContent>
<<<<<<< HEAD

            <TabsContent value="network" className="mt-0">
              <NetworkGraph nodes={networkData.nodes} edges={networkData.edges} />
            </TabsContent>
=======
>>>>>>> refs/remotes/origin/main
          </Tabs>
        </div>
      </div>

      {/* Cluster Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              High-Score (70+)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="mb-2 text-[10px]">{highScoringProviders.length} providers</Badge>
            <ProviderClusterList providers={highScoringProviders.slice(0, 6)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Heart className="h-4 w-4 text-purple-400" />
              Behavioral Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="mb-2 text-[10px]">{behavioralHealthProviders.length} providers</Badge>
            <ProviderClusterList providers={behavioralHealthProviders.slice(0, 6)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-orange-400" />
              Geriatric-Heavy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="mb-2 text-[10px]">{geriatricHeavyProviders.length} providers</Badge>
            <ProviderClusterList providers={geriatricHeavyProviders.slice(0, 6)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-teal-600" />
              Home Health & Hospice
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="mb-2 text-[10px]">{hhHospiceProviders.length} agencies</Badge>
            <ProviderClusterList providers={hhHospiceProviders.slice(0, 6)} />
          </CardContent>
        </Card>
      </div>

      <DataSourcesFooter />
    </div>
  );
}