import React, { useState, useMemo, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Save, Download, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import TypeAheadSearch from '../components/search/TypeAheadSearch';
import ProviderAdvancedFilters from '../components/filters/ProviderAdvancedFilters';
import SortControl from '../components/filters/SortControl';
import ExportDialog from '../components/exports/ExportDialog';
import SavedFilterBar from '../components/filters/SavedFilterBar';
import PageHeader from '../components/shared/PageHeader';
import EnrichProviderButton from '../components/providers/EnrichProviderButton';
import AINPIFinder from '../components/providers/AINPIFinder';
import AIDuplicateDetector from '../components/providers/AIDuplicateDetector';
import AIProfileAugmenter from '../components/providers/AIProfileAugmenter';
import TextMatchFilter, { applyTextFilters } from '../components/filters/TextMatchFilter';
import DateRangeFilterInline, { applyDateRangeFilter } from '../components/filters/DateRangeFilterInline';
import FilterPresets from '../components/filters/FilterPresets';
import ProviderComparison from '../components/providers/ProviderComparison';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Copy, Globe, List, PieChart as PieChartIcon, Map as MapIcon } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import InteractiveProviderMap from '../components/territory/InteractiveProviderMap';

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'npi', label: 'NPI' },
  { value: 'credential', label: 'Credential' },
  { value: 'score', label: 'Score' },
  { value: 'created', label: 'Date Added' },
  { value: 'updated', label: 'Last Updated' },
];

export default function Providers() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    entityTypeFilter: 'all',
    statusFilter: 'all',
    credentialFilter: 'all',
    enrichmentFilter: 'all',
    emailFilter: 'all',
    stateFilter: 'all',
    specialtyFilter: 'all',
  });
  const [sortField, setSortField] = useState('default');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedNpis, setSelectedNpis] = useState(new Set());
  const [activeTab, setActiveTab] = useState('directory');
  const [textFilters, setTextFilters] = useState([]);
  const [dateRange, setDateRange] = useState({ preset: 'all', startDate: '', endDate: '' });
  const [activePresetId, setActivePresetId] = useState(null);

  const queryClient = useQueryClient();

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ['providersPage'],
    queryFn: () => base44.entities.Provider.list('-created_date', 100),
  });

  const { data: scores = [] } = useQuery({
    queryKey: ['providersPageScores'],
    queryFn: () => base44.entities.LeadScore.list(),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['providersPageLocations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: taxonomies = [] } = useQuery({
    queryKey: ['providersPageTaxonomies'],
    queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: savedFilters = [] } = useQuery({
    queryKey: ['savedFilters', 'Providers'],
    queryFn: () => base44.entities.SavedFilter.filter({ page: 'Providers' }),
    staleTime: 30000,
  });

  const defaultApplied = useRef(false);
  useEffect(() => {
    if (defaultApplied.current) return;
    const def = savedFilters.find(f => f.is_default);
    if (def?.filters) {
      applyFilter(def.filters);
      defaultApplied.current = true;
    }
  }, [savedFilters]);

  const applyFilter = (f) => {
    setSearchTerm(f.searchTerm || '');
    setFilters({
      entityTypeFilter: f.entityTypeFilter || 'all',
      statusFilter: f.statusFilter || 'all',
      credentialFilter: f.credentialFilter || 'all',
      enrichmentFilter: f.enrichmentFilter || 'all',
      emailFilter: f.emailFilter || 'all',
      stateFilter: f.stateFilter || 'all',
      specialtyFilter: f.specialtyFilter || 'all',
    });
  };

  const resetFilters = () => {
    setSearchTerm('');
    setFilters({
      entityTypeFilter: 'all', statusFilter: 'all', credentialFilter: 'all',
      enrichmentFilter: 'all', emailFilter: 'all', stateFilter: 'all', specialtyFilter: 'all',
    });
    setSortField('default');
    setSortDir('asc');
    setTextFilters([]);
    setDateRange({ preset: 'all', startDate: '', endDate: '' });
    setActivePresetId(null);
  };

  const handleApplyPreset = (preset) => {
    if (!preset) {
      resetFilters();
      return;
    }
    setActivePresetId(preset.id);
    setFilters(_prev => ({
      entityTypeFilter: 'all', statusFilter: 'all', credentialFilter: 'all',
      enrichmentFilter: 'all', emailFilter: 'all', stateFilter: 'all', specialtyFilter: 'all',
      ...preset.filters,
    }));
    if (preset.sortOverride) {
      setSortField(preset.sortOverride.field);
      setSortDir(preset.sortOverride.dir);
    }
  };

  const currentFilters = { searchTerm, ...filters };

  const getScore = (npi) => {
    const match = scores.find(s => s.npi === npi);
    return match?.score ?? null;
  };

  // Build options from data
  const credentialOptions = useMemo(() => {
    const c = new Set(providers.map(p => p.credential).filter(Boolean));
    return [...c].sort().map(cr => ({ value: cr, label: cr }));
  }, [providers]);

  const stateOptions = useMemo(() => {
    const s = new Set(locations.map(l => l.state).filter(Boolean));
    return [...s].sort().map(st => ({ value: st, label: st }));
  }, [locations]);

  const specialtyOptions = useMemo(() => {
    const s = new Set(taxonomies.map(t => t.taxonomy_description).filter(Boolean));
    return [...s].sort().slice(0, 100).map(sp => ({ value: sp, label: sp.length > 40 ? sp.substring(0, 40) + '...' : sp }));
  }, [taxonomies]);

  // Build location/taxonomy lookup maps
  const locationByNpi = useMemo(() => {
    const map = {};
    for (const l of locations) {
      if (!map[l.npi]) map[l.npi] = [];
      map[l.npi].push(l);
    }
    return map;
  }, [locations]);

  const taxonomyByNpi = useMemo(() => {
    const map = {};
    for (const t of taxonomies) {
      if (!map[t.npi]) map[t.npi] = [];
      map[t.npi].push(t);
    }
    return map;
  }, [taxonomies]);

  // Type-ahead suggestions
  const searchSuggestions = useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return [];
    const q = searchTerm.toLowerCase();
    const results = [];

    for (const p of providers) {
      if (results.length >= 8) break;
      const name = p.entity_type === 'Individual'
        ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
        : p.organization_name || '';
      if (
        name.toLowerCase().includes(q) ||
        (p.npi || '').includes(q) ||
        (p.credential || '').toLowerCase().includes(q)
      ) {
        results.push({
          type: p.entity_type === 'Organization' ? 'organization' : 'provider',
          label: name || p.npi,
          sublabel: `NPI: ${p.npi}${p.credential ? ` · ${p.credential}` : ''}`,
          text: name || p.npi,
          badge: p.entity_type,
          npi: p.npi,
        });
      }
    }

    // Specialty suggestions
    if (results.length < 8) {
      const seen = new Set();
      for (const t of taxonomies) {
        if (results.length >= 8) break;
        const desc = t.taxonomy_description || '';
        if (desc.toLowerCase().includes(q) && !seen.has(desc)) {
          seen.add(desc);
          results.push({
            type: 'specialty',
            label: desc,
            sublabel: `Code: ${t.taxonomy_code || ''}`,
            text: desc,
            badge: 'Specialty',
          });
        }
      }
    }

    // Location suggestions
    if (results.length < 8) {
      const seen = new Set();
      for (const l of locations) {
        if (results.length >= 8) break;
        const city = (l.city || '').toLowerCase();
        const state = (l.state || '').toLowerCase();
        const key = `${l.city}, ${l.state}`;
        if ((city.includes(q) || state.includes(q)) && !seen.has(key)) {
          seen.add(key);
          results.push({
            type: 'location',
            label: key,
            sublabel: `ZIP: ${l.zip || ''}`,
            text: l.city || l.state,
            badge: 'Location',
          });
        }
      }
    }

    return results;
  }, [searchTerm, providers, taxonomies, locations]);

  const handleSuggestionSelect = (item) => {
    if (item.npi) {
      setSearchTerm(item.text || item.label);
    } else if (item.badge === 'Specialty') {
      setFilters(prev => ({ ...prev, specialtyFilter: item.label }));
      setSearchTerm('');
    } else {
      setSearchTerm(item.text || item.label);
    }
  };

  // Filtering
  const filteredProviders = useMemo(() => {
    const basic = providers.filter(p => {
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const match = (p.npi || '').includes(q) ||
          (p.last_name || '').toLowerCase().includes(q) ||
          (p.first_name || '').toLowerCase().includes(q) ||
          (p.organization_name || '').toLowerCase().includes(q) ||
          (p.credential || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filters.entityTypeFilter !== 'all' && p.entity_type !== filters.entityTypeFilter) return false;
      if (filters.statusFilter !== 'all' && p.status !== filters.statusFilter) return false;
      if (filters.credentialFilter !== 'all' && p.credential !== filters.credentialFilter) return false;
      if (filters.enrichmentFilter !== 'all') {
        if (filters.enrichmentFilter === 'yes' && !p.needs_nppes_enrichment) return false;
        if (filters.enrichmentFilter === 'no' && p.needs_nppes_enrichment) return false;
      }
      if (filters.emailFilter !== 'all') {
        if (filters.emailFilter === 'has_email' && !p.email) return false;
        if (filters.emailFilter === 'no_email' && p.email) return false;
        if (filters.emailFilter === 'high' && p.email_confidence !== 'high') return false;
        if (filters.emailFilter === 'medium' && p.email_confidence !== 'medium') return false;
        if (filters.emailFilter === 'not_searched' && p.email_searched_at) return false;
      }
      if (filters.stateFilter !== 'all') {
        const locs = locationByNpi[p.npi] || [];
        if (!locs.some(l => l.state === filters.stateFilter)) return false;
      }
      if (filters.specialtyFilter !== 'all') {
        const taxes = taxonomyByNpi[p.npi] || [];
        if (!taxes.some(t => t.taxonomy_description === filters.specialtyFilter)) return false;
      }
      return true;
    });

    // Apply date range filter on created_date
    let dateFiltered = applyDateRangeFilter(basic, 'created_date', dateRange);

    // Apply text match filters
    return applyTextFilters(dateFiltered, textFilters);
  }, [providers, searchTerm, filters, locationByNpi, taxonomyByNpi, textFilters, dateRange]);

  // Sorting
  const sortedProviders = useMemo(() => {
    if (sortField === 'default') return filteredProviders;
    const sorted = [...filteredProviders];
    const dir = sortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      let va, vb;
      switch (sortField) {
        case 'name':
          va = a.entity_type === 'Individual' ? `${a.last_name} ${a.first_name}` : a.organization_name || '';
          vb = b.entity_type === 'Individual' ? `${b.last_name} ${b.first_name}` : b.organization_name || '';
          return dir * va.localeCompare(vb);
        case 'npi':
          return dir * (a.npi || '').localeCompare(b.npi || '');
        case 'credential':
          return dir * (a.credential || '').localeCompare(b.credential || '');
        case 'score':
          return dir * ((getScore(a.npi) || 0) - (getScore(b.npi) || 0));
        case 'created':
          return dir * ((a.created_date || '').localeCompare(b.created_date || ''));
        case 'updated':
          return dir * ((a.updated_date || a.created_date || '').localeCompare(b.updated_date || b.created_date || ''));
        default:
          return 0;
      }
    });
    return sorted;
  }, [filteredProviders, sortField, sortDir, scores]);

  const selectedProviders = providers.filter(p => selectedNpis.has(p.npi));

  const toggleSelect = (npi) => {
    setSelectedNpis(prev => {
      const next = new Set(prev);
      if (next.has(npi)) next.delete(npi); else next.add(npi);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedNpis.size === sortedProviders.length) {
      setSelectedNpis(new Set());
    } else {
      setSelectedNpis(new Set(sortedProviders.map(p => p.npi)));
    }
  };

  const stateData = useMemo(() => {
    const counts = {};
    sortedProviders.forEach(p => {
      const loc = locationByNpi[p.npi]?.find(l => l.is_primary) || locationByNpi[p.npi]?.[0];
      const st = loc?.state || 'Unknown';
      counts[st] = (counts[st] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [sortedProviders, locationByNpi]);

  const typeData = useMemo(() => {
    const counts = { Individual: 0, Organization: 0 };
    sortedProviders.forEach(p => {
      counts[p.entity_type] = (counts[p.entity_type] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [sortedProviders]);

  const mapProviders = useMemo(() => {
    return sortedProviders.map(p => {
      const loc = (locationByNpi[p.npi] || []).find(l => l.is_primary) || (locationByNpi[p.npi] || [])[0];
      const tax = (taxonomyByNpi[p.npi] || []).find(t => t.primary_flag) || (taxonomyByNpi[p.npi] || [])[0];
      return {
        provider: p,
        location: loc,
        taxonomy: tax,
        score: getScore(p.npi) || 0,
      };
    });
  }, [sortedProviders, locationByNpi, taxonomyByNpi, scores]);

  const COLORS = ['#06b6d4', '#8b5cf6', '#ec4899', '#f59e0b', '#f43f5e'];

  const handleSaveList = async () => {
    const user = await base44.auth.me();
    const listName = prompt('Enter lead list name:');
    if (!listName) return;

    const newList = await base44.entities.LeadList.create({
      name: listName,
      filters: { search: searchTerm },
      provider_count: filteredProviders.length,
    });

    const memberBatch = filteredProviders.slice(0, 50).map(provider => ({
      lead_list_id: newList.id,
      npi: provider.npi,
    }));
    for (let i = 0; i < memberBatch.length; i += 25) {
      await base44.entities.LeadListMember.bulkCreate(memberBatch.slice(i, i + 25));
    }

    await base44.entities.AuditEvent.create({
      event_type: 'user_action',
      user_email: user.email,
      details: { action: 'Created Lead List', entity: 'LeadList', message: listName },
      timestamp: new Date().toISOString(),
    });

    alert('Lead list saved!');
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Providers"
        subtitle={`${providers.length} total providers`}
        icon={Users}
        breadcrumbs={[{ label: 'Providers' }]}
        actions={
          <div className="flex flex-wrap gap-2">
          <ExportDialog
            data={sortedProviders.map(p => {
              const loc = (locationByNpi[p.npi] || []).find(l => l.is_primary) || (locationByNpi[p.npi] || [])[0];
              const tax = (taxonomyByNpi[p.npi] || []).find(t => t.primary_flag) || (taxonomyByNpi[p.npi] || [])[0];
              return {
                npi: p.npi,
                name: p.entity_type === 'Individual' ? `${p.last_name}, ${p.first_name}` : p.organization_name || '',
                credential: p.credential || '',
                entity_type: p.entity_type || '',
                specialty: tax?.taxonomy_description || '',
                status: p.status || '',
                email: p.email || '',
                email_confidence: p.email_confidence || '',
                email_source: p.email_source || '',
                city: loc?.city || '',
                state: loc?.state || '',
                zip: loc?.zip || '',
                phone: loc?.phone || '',
                score: getScore(p.npi)?.toFixed(0) || '',
              };
            })}
            fields={[
              { key: 'npi', label: 'NPI' },
              { key: 'name', label: 'Name' },
              { key: 'credential', label: 'Credential' },
              { key: 'entity_type', label: 'Type' },
              { key: 'specialty', label: 'Specialty' },
              { key: 'email', label: 'Email' },
              { key: 'email_confidence', label: 'Email Confidence' },
              { key: 'city', label: 'City' },
              { key: 'state', label: 'State' },
              { key: 'zip', label: 'ZIP' },
              { key: 'phone', label: 'Phone' },
              { key: 'score', label: 'Score' },
              { key: 'status', label: 'Status' },
              { key: 'email_source', label: 'Email Source' },
            ]}
            fileName="providers"
            title="Providers"
            dateField="enumeration_date"
            dataset="providers"
            activeFilters={currentFilters}
            trigger={<Button variant="outline" className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"><Download className="w-4 h-4 mr-2" /> Export</Button>}
          />
          <EnrichProviderButton
            providers={selectedProviders.length > 0 ? selectedProviders : filteredProviders.slice(0, 20)}
            locations={locations}
            taxonomies={taxonomies}
            onComplete={() => {
              queryClient.invalidateQueries({ queryKey: ['providersPage'] });
              queryClient.invalidateQueries({ queryKey: ['providersPageLocations'] });
              queryClient.invalidateQueries({ queryKey: ['providersPageTaxonomies'] });
              setSelectedNpis(new Set());
            }}
          />
          <Button onClick={handleSaveList} className="bg-cyan-600 hover:bg-cyan-700">
            <Save className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Save as Lead List</span>
            <span className="sm:hidden">Save List</span>
          </Button>
        </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="h-auto min-h-10 mb-4 p-1 bg-slate-800/60 border border-slate-700/50 w-full grid grid-cols-2 sm:grid-cols-6 gap-1">
          <TabsTrigger value="directory" className="text-xs gap-1.5 data-[state=active]:bg-[#141d30] data-[state=active]:text-cyan-400 text-slate-400"><List className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Directory</span><span className="sm:hidden">Dir</span></TabsTrigger>
          <TabsTrigger value="map" className="text-xs gap-1.5 data-[state=active]:bg-[#141d30] data-[state=active]:text-cyan-400 text-slate-400"><MapIcon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Map</span><span className="sm:hidden">Map</span></TabsTrigger>
          <TabsTrigger value="npi-finder" className="text-xs gap-1.5 data-[state=active]:bg-[#141d30] data-[state=active]:text-cyan-400 text-slate-400"><Search className="w-3.5 h-3.5" /> <span className="hidden sm:inline">AI NPI Finder</span><span className="sm:hidden">NPI</span></TabsTrigger>
          <TabsTrigger value="augment" className="text-xs gap-1.5 data-[state=active]:bg-[#141d30] data-[state=active]:text-cyan-400 text-slate-400"><Globe className="w-3.5 h-3.5" /> <span className="hidden sm:inline">AI Augmenter</span><span className="sm:hidden">Augment</span></TabsTrigger>
          <TabsTrigger value="duplicates" className="text-xs gap-1.5 data-[state=active]:bg-[#141d30] data-[state=active]:text-cyan-400 text-slate-400"><Copy className="w-3.5 h-3.5" /> <span className="hidden sm:inline">AI Duplicates</span><span className="sm:hidden">Dupes</span></TabsTrigger>
          <TabsTrigger value="compare" className="text-xs gap-1.5 data-[state=active]:bg-[#141d30] data-[state=active]:text-cyan-400 text-slate-400"><Users className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Compare</span><span className="sm:hidden">Vs</span></TabsTrigger>
        </TabsList>

        <TabsContent value="map">
          <InteractiveProviderMap
            filteredProviders={mapProviders}
            showHeatmap={true}
            colorByScore={true}
            actions={
              <ExportDialog
                data={mapProviders.map(m => ({
                  npi: m.provider.npi,
                  name: m.provider.entity_type === 'Individual' ? `${m.provider.last_name}, ${m.provider.first_name}` : m.provider.organization_name || '',
                  credential: m.provider.credential || '',
                  entity_type: m.provider.entity_type || '',
                  specialty: m.taxonomy?.taxonomy_description || '',
                  status: m.provider.status || '',
                  email: m.provider.email || '',
                  email_confidence: m.provider.email_confidence || '',
                  email_source: m.provider.email_source || '',
                  city: m.location?.city || '',
                  state: m.location?.state || '',
                  zip: m.location?.zip || '',
                  phone: m.location?.phone || '',
                  score: m.score?.toFixed(0) || '',
                }))}
                fields={[
                  { key: 'npi', label: 'NPI' },
                  { key: 'name', label: 'Name' },
                  { key: 'credential', label: 'Credential' },
                  { key: 'entity_type', label: 'Type' },
                  { key: 'specialty', label: 'Specialty' },
                  { key: 'email', label: 'Email' },
                  { key: 'email_confidence', label: 'Email Confidence' },
                  { key: 'city', label: 'City' },
                  { key: 'state', label: 'State' },
                  { key: 'zip', label: 'ZIP' },
                  { key: 'phone', label: 'Phone' },
                  { key: 'score', label: 'Score' },
                  { key: 'status', label: 'Status' },
                  { key: 'email_source', label: 'Email Source' },
                ]}
                fileName="providers-map"
                title="Map Providers"
                dataset="providers"
                activeFilters={currentFilters}
                trigger={<Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-slate-800/40 shadow-sm text-slate-300 hover:bg-slate-800/60"><Download className="w-3 h-3" /> Export Visible</Button>}
              />
            }
          />
        </TabsContent>

        <TabsContent value="npi-finder">
          <AINPIFinder onProviderAdded={() => queryClient.invalidateQueries({ queryKey: ['providersPage'] })} />
        </TabsContent>

        <TabsContent value="augment">
          <AIProfileAugmenter
            providers={selectedProviders.length > 0 ? selectedProviders : filteredProviders.slice(0, 15)}
            locations={locations}
            taxonomies={taxonomies}
            onComplete={() => queryClient.invalidateQueries({ queryKey: ['providersPage'] })}
          />
        </TabsContent>

        <TabsContent value="duplicates">
          <AIDuplicateDetector providers={providers} locations={locations} taxonomies={taxonomies} />
        </TabsContent>

        <TabsContent value="compare">
          <ProviderComparison providerIds={Array.from(selectedNpis)} />
        </TabsContent>

        <TabsContent value="directory">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <Card className="bg-[#141d30] border-slate-700/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><PieChartIcon className="w-4 h-4"/> Providers by State (Top 10)</CardTitle></CardHeader>
              <CardContent className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stateData} margin={{ top: 5, right: 5, bottom: 20, left: -20 }}>
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} tick={{fill: '#94a3b8'}} angle={-45} textAnchor="end" />
                    <YAxis stroke="#64748b" fontSize={10} tick={{fill: '#94a3b8'}} />
                    <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px', color: '#fff'}} />
                    <Bar dataKey="value" fill="#0ea5e9" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card className="bg-[#141d30] border-slate-700/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300 flex items-center gap-2"><PieChartIcon className="w-4 h-4"/> Entity Type Distribution</CardTitle></CardHeader>
              <CardContent className="h-48 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typeData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value">
                      {typeData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px', color: '#fff'}} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-2 ml-4">
                  {typeData.map((entry, idx) => (
                    <div key={entry.name} className="flex items-center gap-2 text-xs text-slate-300">
                      <div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS[idx % COLORS.length]}}></div>
                      {entry.name} ({entry.value})
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

      <Card className="mb-6 bg-[#141d30] border-slate-700/50">
        <CardContent className="pt-6 space-y-3">
          <SavedFilterBar
            page="Providers"
            currentFilters={currentFilters}
            onApplyFilter={applyFilter}
          />

          {/* Type-ahead search */}
          <TypeAheadSearch
            value={searchTerm}
            onChange={setSearchTerm}
            suggestions={searchSuggestions}
            placeholder="Search by name, NPI, specialty, credential, city..."
            onSuggestionSelect={handleSuggestionSelect}
            className="flex-1"
          />

          {/* Quick Filter Presets */}
          <FilterPresets onApplyPreset={handleApplyPreset} activePresetId={activePresetId} />

          {/* Advanced filters + sort */}
          <div className="flex flex-col sm:flex-row sm:items-center items-start justify-between gap-3">
            <ProviderAdvancedFilters
              filters={filters}
              onFilterChange={(f) => { setFilters(f); setActivePresetId(null); }}
              onReset={resetFilters}
              specialtyOptions={specialtyOptions}
              stateOptions={stateOptions}
              credentialOptions={credentialOptions}
            />
            <SortControl
              sortField={sortField}
              sortDir={sortDir}
              onSortChange={(f, d) => { setSortField(f); setSortDir(d); }}
              sortOptions={SORT_OPTIONS}
            />
          </div>

          {/* Date Range + Text Matching Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DateRangeFilterInline dateRange={dateRange} onDateRangeChange={setDateRange} />
            <TextMatchFilter
              columns={[
                { value: 'npi', label: 'NPI' },
                { value: 'first_name', label: 'First Name' },
                { value: 'last_name', label: 'Last Name' },
                { value: 'organization_name', label: 'Organization' },
                { value: 'credential', label: 'Credential' },
                { value: 'email', label: 'Email' },
              ]}
              activeTextFilters={textFilters}
              onFiltersChange={setTextFilters}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-slate-200">
            <span>Provider Directory</span>
            <span className="text-sm font-normal text-slate-500">
              {sortedProviders.length} results
              {selectedNpis.size > 0 && (
                <Badge className="ml-2 bg-violet-500/15 text-violet-400 text-[10px]">{selectedNpis.size} selected</Badge>
              )}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input type="checkbox"
                      checked={sortedProviders.length > 0 && selectedNpis.size === sortedProviders.length}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-600 bg-slate-800"
                    />
                  </TableHead>
                  <TableHead>NPI</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Specialty</TableHead>
                  <TableHead className="hidden lg:table-cell">State</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-10" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : sortedProviders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                      No providers found
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedProviders.map(provider => {
                    const score = getScore(provider.npi);
                    const provTax = (taxonomyByNpi[provider.npi] || []).find(t => t.primary_flag) || (taxonomyByNpi[provider.npi] || [])[0];
                    const provLoc = (locationByNpi[provider.npi] || []).find(l => l.is_primary) || (locationByNpi[provider.npi] || [])[0];
                    return (
                      <TableRow key={provider.id} className={selectedNpis.has(provider.npi) ? 'bg-cyan-500/5' : ''}>
                        <TableCell>
                          <input type="checkbox"
                            checked={selectedNpis.has(provider.npi)}
                            onChange={() => toggleSelect(provider.npi)}
                            className="rounded border-slate-600 bg-slate-800"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm text-slate-400">{provider.npi}</TableCell>
                        <TableCell>
                          <Link to={createPageUrl(`ProviderDetail?npi=${provider.npi}`)} className="hover:underline">
                            {provider.entity_type === 'Individual' ? (
                              <div>
                                <p className="font-medium text-slate-200">{provider.last_name}, {provider.first_name}</p>
                                {provider.credential && <p className="text-[10px] text-slate-500">{provider.credential}</p>}
                              </div>
                            ) : (
                              <p className="font-medium text-slate-200">{provider.organization_name}</p>
                            )}
                          </Link>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-xs text-slate-400 truncate max-w-[150px] block">
                            {provTax?.taxonomy_description || '—'}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-xs text-slate-400">{provLoc?.state || '—'}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${
                            provider.status === 'Active' ? 'border-emerald-500/30 text-emerald-400' : 'border-red-500/30 text-red-400'
                          }`}>{provider.status}</Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                           {provider.email ? (
                             <div className="flex items-center gap-1.5">
                               <span className="text-xs text-slate-400 truncate max-w-[120px]">{provider.email}</span>
                               {provider.email_confidence && (
                                 <Badge className={`text-[10px] border ${
                                   provider.email_confidence === 'high' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' :
                                   provider.email_confidence === 'medium' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
                                   'bg-red-500/15 text-red-400 border-red-500/20'
                                 }`}>{provider.email_confidence}</Badge>
                               )}
                             </div>
                           ) : (
                            <span className="text-slate-500 text-xs">—</span>
                           )}
                        </TableCell>
                        <TableCell>
                           {score !== null ? (
                           <Badge className="bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
                              {score.toFixed(0)}
                            </Badge>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Link to={createPageUrl(`ProviderDetail?npi=${provider.npi}`)}>
                              <Button variant="outline" size="sm" className="text-xs h-7 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400">View</Button>
                            </Link>
                            {provider.entity_type === 'Organization' && (
                              <Link to={createPageUrl(`OrganizationDetail?npi=${provider.npi}`)}>
                                <Button variant="outline" size="sm" className="text-xs h-7 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400">Org</Button>
                              </Link>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

        </TabsContent>
      </Tabs>
    </div>
  );
}