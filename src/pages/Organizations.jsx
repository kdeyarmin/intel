import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Save, Download, Sparkles, Building2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import TypeAheadSearch from '../components/search/TypeAheadSearch';
import SortControl from '../components/filters/SortControl';
import ExportDialog from '../components/exports/ExportDialog';
import SavedFilterBar from '../components/filters/SavedFilterBar';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';
import EnrichProviderButton from '../components/providers/EnrichProviderButton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Copy, Globe, List } from 'lucide-react';
import AINPIFinder from '../components/providers/AINPIFinder';
import AIProfileAugmenter from '../components/providers/AIProfileAugmenter';
import AIDuplicateDetector from '../components/providers/AIDuplicateDetector';
import PageHeader from '../components/shared/PageHeader';

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'npi', label: 'NPI' },
  { value: 'score', label: 'Score' },
  { value: 'created', label: 'Date Added' },
  { value: 'updated', label: 'Last Updated' },
];

export default function Organizations() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    statusFilter: 'all',
    enrichmentFilter: 'all',
    emailFilter: 'all',
    stateFilter: 'all',
    specialtyFilter: 'all',
  });
  const [sortField, setSortField] = useState('default');
  const [sortDir, setSortDir] = useState('asc');
  const [selectedNpis, setSelectedNpis] = useState(new Set());
  const [activeTab, setActiveTab] = useState('directory');

  const queryClient = useQueryClient();

  // Fetch only Organization type providers if possible via filter, or fetch all and filter client side
  // Since list() doesn't support complex filtering in one go easily without checking backend capabilities,
  // we'll fetch all and filter client-side as done in Providers.js, but optimized would be filtering at API level.
  // base44.entities.Provider.filter({ entity_type: 'Organization' }) is better if supported.
  const { data: providers = [], isLoading } = useQuery({
    queryKey: ['organizationsPage'],
    queryFn: () => base44.entities.Provider.filter({ entity_type: 'Organization' }, '-created_date', 500),
  });

  const { data: scores = [] } = useQuery({
    queryKey: ['organizationsPageScores'],
    queryFn: () => base44.entities.LeadScore.list(),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['organizationsPageLocations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 1000),
    staleTime: 120000,
  });

  const { data: taxonomies = [] } = useQuery({
    queryKey: ['organizationsPageTaxonomies'],
    queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 1000),
    staleTime: 120000,
  });

  const { data: savedFilters = [] } = useQuery({
    queryKey: ['savedFilters', 'Organizations'],
    queryFn: () => base44.entities.SavedFilter.filter({ page: 'Organizations' }),
    staleTime: 30000,
  });

  useEffect(() => {
    const def = savedFilters.find(f => f.is_default);
    if (def?.filters) applyFilter(def.filters);
  }, [savedFilters.length]);

  const applyFilter = (f) => {
    setSearchTerm(f.searchTerm || '');
    setFilters({
      statusFilter: f.statusFilter || 'all',
      enrichmentFilter: f.enrichmentFilter || 'all',
      emailFilter: f.emailFilter || 'all',
      stateFilter: f.stateFilter || 'all',
      specialtyFilter: f.specialtyFilter || 'all',
    });
  };

  const resetFilters = () => {
    setSearchTerm('');
    setFilters({
      statusFilter: 'all', enrichmentFilter: 'all', emailFilter: 'all', stateFilter: 'all', specialtyFilter: 'all',
    });
    setSortField('default');
    setSortDir('asc');
  };

  const currentFilters = { searchTerm, ...filters };

  const getScore = (npi) => {
    const s = scores.find(s => s.npi === npi);
    return s?.score || null;
  };

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

  const searchSuggestions = useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return [];
    const q = searchTerm.toLowerCase();
    const results = [];
    for (const p of providers) {
      if (results.length >= 8) break;
      const name = p.organization_name || '';
      if (name.toLowerCase().includes(q) || (p.npi || '').includes(q)) {
        results.push({
          type: 'organization',
          label: name || p.npi,
          sublabel: `NPI: ${p.npi}`,
          text: name || p.npi,
          badge: 'Org',
          npi: p.npi,
        });
      }
    }
    return results;
  }, [searchTerm, providers]);

  const handleSuggestionSelect = (item) => {
    setSearchTerm(item.text || item.label);
  };

  const filteredProviders = useMemo(() => {
    return providers.filter(p => {
      // Basic type check just in case, though query should filter it
      if (p.entity_type !== 'Organization') return false;

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const match = (p.npi || '').includes(q) ||
          (p.organization_name || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      if (filters.statusFilter !== 'all' && p.status !== filters.statusFilter) return false;
      if (filters.enrichmentFilter !== 'all') {
        if (filters.enrichmentFilter === 'yes' && !p.needs_nppes_enrichment) return false;
        if (filters.enrichmentFilter === 'no' && p.needs_nppes_enrichment) return false;
      }
      if (filters.emailFilter !== 'all') {
        if (filters.emailFilter === 'has_email' && !p.email) return false;
        if (filters.emailFilter === 'no_email' && p.email) return false;
      }
      if (filters.stateFilter !== 'all') {
        const locs = locationByNpi[p.npi] || [];
        if (!locs.some(l => l.state === filters.stateFilter)) return false;
      }
      return true;
    });
  }, [providers, searchTerm, filters, locationByNpi]);

  const sortedProviders = useMemo(() => {
    if (sortField === 'default') return filteredProviders;
    const sorted = [...filteredProviders];
    const dir = sortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      let va, vb;
      switch (sortField) {
        case 'name':
          va = a.organization_name || '';
          vb = b.organization_name || '';
          return dir * va.localeCompare(vb);
        case 'npi':
          return dir * (a.npi || '').localeCompare(b.npi || '');
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

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Organizations"
        subtitle={`${providers.length} organizations found`}
        icon={Building2}
        breadcrumbs={[{ label: 'Providers', page: 'Providers' }, { label: 'Organizations' }]}
      />
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div />
        <div className="flex flex-wrap gap-2">
          <ExportDialog
            data={sortedProviders}
            fields={[
              { key: 'npi', label: 'NPI' },
              { key: 'organization_name', label: 'Organization Name' },
              { key: 'status', label: 'Status' },
              { key: 'email', label: 'Email' },
            ]}
            fileName="organizations"
            title="Organizations"
            trigger={<Button variant="outline" className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"><Download className="w-4 h-4 mr-2" /> Export</Button>}
          />
          <EnrichProviderButton
            providers={selectedProviders.length > 0 ? selectedProviders : filteredProviders.slice(0, 20)}
            locations={locations}
            taxonomies={taxonomies}
            onComplete={() => queryClient.invalidateQueries({ queryKey: ['organizationsPage'] })}
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="h-auto min-h-10 mb-4 p-1 bg-slate-800/60 border border-slate-700/50 w-full grid grid-cols-2 sm:grid-cols-4 gap-1">
          <TabsTrigger value="directory" className="text-xs gap-1.5 data-[state=active]:bg-[#141d30] data-[state=active]:text-cyan-400 text-slate-400"><List className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Directory</span></TabsTrigger>
          <TabsTrigger value="npi-finder" className="text-xs gap-1.5 data-[state=active]:bg-[#141d30] data-[state=active]:text-cyan-400 text-slate-400"><Search className="w-3.5 h-3.5" /> <span className="hidden sm:inline">AI NPI Finder</span></TabsTrigger>
          <TabsTrigger value="augment" className="text-xs gap-1.5 data-[state=active]:bg-[#141d30] data-[state=active]:text-cyan-400 text-slate-400"><Globe className="w-3.5 h-3.5" /> <span className="hidden sm:inline">AI Augmenter</span></TabsTrigger>
          <TabsTrigger value="duplicates" className="text-xs gap-1.5 data-[state=active]:bg-[#141d30] data-[state=active]:text-cyan-400 text-slate-400"><Copy className="w-3.5 h-3.5" /> <span className="hidden sm:inline">AI Duplicates</span></TabsTrigger>
        </TabsList>

        <TabsContent value="npi-finder">
           <AINPIFinder onProviderAdded={() => queryClient.invalidateQueries({ queryKey: ['organizationsPage'] })} />
        </TabsContent>

        <TabsContent value="augment">
          <AIProfileAugmenter
            providers={selectedProviders.length > 0 ? selectedProviders : filteredProviders.slice(0, 15)}
            locations={locations}
            taxonomies={taxonomies}
            onComplete={() => queryClient.invalidateQueries({ queryKey: ['organizationsPage'] })}
          />
        </TabsContent>

        <TabsContent value="duplicates">
          <AIDuplicateDetector providers={providers} locations={locations} taxonomies={taxonomies} />
        </TabsContent>

        <TabsContent value="directory">
          <Card className="mb-6 bg-[#141d30] border-slate-700/50">
            <CardContent className="pt-6 space-y-3">
              <SavedFilterBar
                page="Organizations"
                currentFilters={currentFilters}
                onApplyFilter={applyFilter}
              />
              <TypeAheadSearch
                value={searchTerm}
                onChange={setSearchTerm}
                suggestions={searchSuggestions}
                placeholder="Search organizations..."
                onSuggestionSelect={handleSuggestionSelect}
                className="flex-1"
              />
              <div className="flex items-start justify-end gap-3">
                <SortControl
                  sortField={sortField}
                  sortDir={sortDir}
                  onSortChange={(f, d) => { setSortField(f); setSortDir(d); }}
                  sortOptions={SORT_OPTIONS}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#141d30] border-slate-700/50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-slate-200">
                <span>Organization Directory</span>
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
                      <TableHead>Organization Name</TableHead>
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
                          <TableCell><Skeleton className="h-4 w-64" /></TableCell>
                          <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-10" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                        </TableRow>
                      ))
                    ) : sortedProviders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                          No organizations found
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedProviders.map(provider => {
                        const score = getScore(provider.npi);
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
                              <Link to={createPageUrl(`OrganizationDetail?npi=${provider.npi}`)} className="hover:underline font-medium text-slate-200">
                                {provider.organization_name}
                              </Link>
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
                                <span className="text-slate-600 text-xs">—</span>
                               )}
                            </TableCell>
                            <TableCell>
                               {score !== null ? (
                               <Badge className="bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">
                                  {score.toFixed(0)}
                                </Badge>
                              ) : (
                                <span className="text-slate-600">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Link to={createPageUrl(`OrganizationDetail?npi=${provider.npi}`)}>
                                <Button variant="outline" size="sm" className="text-xs h-7 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400">View Details</Button>
                              </Link>
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
          <DataSourcesFooter />
        </TabsContent>
      </Tabs>
    </div>
  );
}