import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import InteractiveProviderMap from '../territory/InteractiveProviderMap';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function DashboardGeospatialMap() {
  const [specialtyFilter, setSpecialtyFilter] = useState('all');
  const [minVolume, setMinVolume] = useState('0');

  const { data: providers = [], isLoading: pLoad } = useQuery({
    queryKey: ['dashMapProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: locations = [], isLoading: lLoad } = useQuery({
    queryKey: ['dashMapLocations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: taxonomies = [], isLoading: tLoad } = useQuery({
    queryKey: ['dashMapTax'],
    queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: utilizations = [], isLoading: uLoad } = useQuery({
    queryKey: ['dashMapUtil'],
    queryFn: () => base44.entities.CMSUtilization.list('-created_date', 500),
    staleTime: 120000,
  });

  const isLoading = pLoad || lLoad || tLoad || uLoad;

  const filteredProviders = useMemo(() => {
    return providers
      .map(provider => {
        const providerLocs = locations.filter(l => l.npi === provider.npi);
        const primaryLoc = providerLocs.find(l => l.is_primary) || providerLocs[0];
        const providerTax = taxonomies.filter(t => t.npi === provider.npi);
        const primaryTax = providerTax.find(t => t.primary_flag) || providerTax[0];
        const util = utilizations.find(u => u.npi === provider.npi);

        return {
          provider,
          location: primaryLoc,
          taxonomy: primaryTax,
          score: 50, // Default generic score if missing
          utilization: util,
        };
      })
      .filter(item => {
        if (!item.location) return false;

        if (specialtyFilter !== 'all') {
          const desc = (item.taxonomy?.taxonomy_description || '').toLowerCase();
          if (!desc.includes(specialtyFilter.toLowerCase())) return false;
        }

        const vol = item.utilization?.total_medicare_beneficiaries || 0;
        if (minVolume !== '0' && vol < parseInt(minVolume, 10)) return false;

        return true;
      });
  }, [providers, locations, taxonomies, utilizations, specialtyFilter, minVolume]);

  if (isLoading) {
    return <Skeleton className="h-[500px] w-full rounded-xl" />;
  }

  const mapActions = (
    <div className="flex items-center gap-2 hidden sm:flex">
      <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
        <SelectTrigger className="w-[140px] h-7 text-[11px] bg-white">
          <SelectValue placeholder="Specialty" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Specialties</SelectItem>
          <SelectItem value="internal medicine">Internal Medicine</SelectItem>
          <SelectItem value="family medicine">Family Medicine</SelectItem>
          <SelectItem value="cardiology">Cardiology</SelectItem>
          <SelectItem value="orthopedic">Orthopedic</SelectItem>
          <SelectItem value="neurology">Neurology</SelectItem>
          <SelectItem value="psychiatry">Psychiatry</SelectItem>
        </SelectContent>
      </Select>
      <Select value={minVolume} onValueChange={setMinVolume}>
        <SelectTrigger className="w-[140px] h-7 text-[11px] bg-white">
          <SelectValue placeholder="Min Volume" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0">Any Volume</SelectItem>
          <SelectItem value="100">100+ Patients</SelectItem>
          <SelectItem value="500">500+ Patients</SelectItem>
          <SelectItem value="1000">1,000+ Patients</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="w-full">
      <InteractiveProviderMap 
        filteredProviders={filteredProviders}
        showHeatmap={true}
        showVolumeDensity={false}
        colorByScore={false}
        actions={mapActions}
      />
    </div>
  );
}