import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { MapPin, Users, TrendingUp, Heart, Building2 } from 'lucide-react';
import CountyDensityMap from '../components/territory/CountyDensityMap';
import ProviderClusterList from '../components/territory/ProviderClusterList';
import ComplianceDisclaimer from '../components/compliance/ComplianceDisclaimer';

export default function TerritoryIntelligence() {
  const [filters, setFilters] = useState({
    specialty: 'all',
    minScore: '',
  });

  const { data: providers = [], isLoading: loadingProviders } = useQuery({
    queryKey: ['tiProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: locations = [], isLoading: loadingLocations } = useQuery({
    queryKey: ['tiLocations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: taxonomies = [], isLoading: loadingTaxonomies } = useQuery({
    queryKey: ['tiTaxonomies'],
    queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: scores = [], isLoading: loadingScores } = useQuery({
    queryKey: ['tiScores'],
    queryFn: () => base44.entities.LeadScore.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: utilizations = [], isLoading: loadingUtil } = useQuery({
    queryKey: ['tiUtilizations'],
    queryFn: () => base44.entities.CMSUtilization.list('-created_date', 500),
    staleTime: 120000,
  });

  const isLoading = loadingProviders || loadingLocations || loadingTaxonomies || loadingScores || loadingUtil;

  // Filter PA providers and apply user filters
  const paProviders = useMemo(() => {
    return providers
      .map(provider => {
        const providerLocs = locations.filter(l => l.npi === provider.npi && l.state === 'PA');
        const primaryLoc = providerLocs.find(l => l.is_primary) || providerLocs[0];
        const providerTax = taxonomies.filter(t => t.npi === provider.npi);
        const primaryTax = providerTax.find(t => t.primary_flag) || providerTax[0];
        const score = scores.find(s => s.npi === provider.npi);
        const util = utilizations.find(u => u.npi === provider.npi);

        return {
          provider,
          location: primaryLoc,
          taxonomy: primaryTax,
          score: score?.score || 0,
          utilization: util,
        };
      })
      .filter(item => item.location) // Must have PA location
      .filter(item => {
        if (filters.specialty !== 'all') {
          const taxonomyDesc = (item.taxonomy?.taxonomy_description || '').toLowerCase();
          if (!taxonomyDesc.includes(filters.specialty.toLowerCase())) return false;
        }
        if (filters.minScore && item.score < parseFloat(filters.minScore)) return false;
        return true;
      });
  }, [providers, locations, taxonomies, scores, utilizations, filters]);

  // County density analysis
  const countyStats = useMemo(() => {
    const stats = {};
    paProviders.forEach(item => {
      const county = item.location.city || 'Unknown';
      if (!stats[county]) {
        stats[county] = { count: 0, highScore: 0, avgScore: 0, totalScore: 0 };
      }
      stats[county].count++;
      stats[county].totalScore += item.score;
      if (item.score > stats[county].highScore) {
        stats[county].highScore = item.score;
      }
    });

    Object.keys(stats).forEach(county => {
      stats[county].avgScore = Math.round(stats[county].totalScore / stats[county].count);
    });

    return Object.entries(stats)
      .map(([county, data]) => ({ county, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [paProviders]);

  // High-scoring clusters (70+)
  const highScoringProviders = useMemo(() => {
    return paProviders
      .filter(item => item.score >= 70)
      .sort((a, b) => b.score - a.score);
  }, [paProviders]);

  // Behavioral health clusters
  const behavioralHealthProviders = useMemo(() => {
    return paProviders.filter(item => {
      const taxonomyDesc = (item.taxonomy?.taxonomy_description || '').toLowerCase();
      return ['psychiatry', 'psychology', 'behavioral', 'mental health'].some(t => taxonomyDesc.includes(t));
    });
  }, [paProviders]);

  // Geriatric-heavy clusters
  const geriatricHeavyProviders = useMemo(() => {
    return paProviders.filter(item => {
      const volume = item.utilization?.total_medicare_beneficiaries || 0;
      const intensity = volume > 0 ? (item.utilization?.total_services || 0) / volume : 0;
      return volume >= 200 && intensity >= 8;
    });
  }, [paProviders]);

  // Home Health & Hospice providers (organizations with relevant taxonomy)
  const hhHospiceProviders = useMemo(() => {
    return paProviders.filter(item => {
      if (item.provider.entity_type !== 'Organization') return false;
      const taxonomyDesc = (item.taxonomy?.taxonomy_description || '').toLowerCase();
      return ['home health', 'hospice'].some(t => taxonomyDesc.includes(t));
    });
  }, [paProviders]);

  if (isLoading) {
    return (
      <div className="p-8">
        <Skeleton className="h-12 w-96 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-96" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <MapPin className="h-8 w-8 text-teal-600" />
          <h1 className="text-3xl font-bold text-gray-900">Territory Intelligence</h1>
          <Badge className="bg-blue-100 text-blue-800">Pennsylvania</Badge>
        </div>
        <p className="text-gray-600">
          Geographic analysis of provider density, clusters, and market opportunities
        </p>
      </div>

      <div className="mb-6">
        <ComplianceDisclaimer />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Specialty Filter</Label>
              <Select value={filters.specialty} onValueChange={(v) => setFilters({ ...filters, specialty: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Specialties</SelectItem>
                  <SelectItem value="family medicine">Family Medicine</SelectItem>
                  <SelectItem value="internal medicine">Internal Medicine</SelectItem>
                  <SelectItem value="psychiatry">Psychiatry</SelectItem>
                  <SelectItem value="geriatric">Geriatric Medicine</SelectItem>
                  <SelectItem value="nurse practitioner">Nurse Practitioner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Minimum Score</Label>
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="e.g., 70"
                value={filters.minScore}
                onChange={(e) => setFilters({ ...filters, minScore: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <CountyDensityMap countyStats={countyStats} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              High-Scoring Referral Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-gray-600 mb-3">
                <span>Score 70+ providers</span>
                <Badge variant="outline">{highScoringProviders.length} providers</Badge>
              </div>
              <ProviderClusterList providers={highScoringProviders.slice(0, 10)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-purple-600" />
              Behavioral Health Clusters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm text-gray-600 mb-3">
                <Badge variant="outline">{behavioralHealthProviders.length} providers</Badge>
              </div>
              <ProviderClusterList providers={behavioralHealthProviders.slice(0, 8)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-orange-600" />
              Geriatric-Heavy Practices
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm text-gray-600 mb-3">
                <Badge variant="outline">{geriatricHeavyProviders.length} providers</Badge>
              </div>
              <ProviderClusterList providers={geriatricHeavyProviders.slice(0, 8)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-teal-600" />
              Home Health & Hospice
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-sm text-gray-600 mb-3">
                <Badge variant="outline">{hhHospiceProviders.length} agencies</Badge>
              </div>
              <ProviderClusterList providers={hhHospiceProviders.slice(0, 8)} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}