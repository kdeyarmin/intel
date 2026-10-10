import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Building2, Save, ListPlus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import QueryErrorState from '../components/shared/QueryErrorState';
import AddToLeadListDialog from '../components/leadlists/AddToLeadListDialog';
import { useUrlState } from '@/hooks/useUrlState';
import { US_STATES } from '@/lib/usStates';
import { pickPrimaryLocation } from '@/lib/locations';

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'npi', label: 'NPI' },
  { value: 'score', label: 'Score' },
  { value: 'created', label: 'Date Added' },
  { value: 'updated', label: 'Last Updated' },
];

const SEARCH_LIMIT = 300;
const RECENT_LIMIT = 200;

// Search, filters, sort and tab live in the URL (Back restores them; links are shareable).
const URL_DEFAULTS = { q: '', status: 'all', email: 'all', state: 'all', sort: 'default', dir: 'asc', tab: 'directory' };

const filtersFromUrl = (url) => ({
  statusFilter: url.status,
  enrichmentFilter: 'all',
  emailFilter: url.email,
  stateFilter: url.state,
  specialtyFilter: 'all',
});

export default function Organizations() {
  const [url, setUrl] = useUrlState(URL_DEFAULTS);
  const [searchTerm, setSearchTerm] = useState(url.q);
  const filters = useMemo(() => filtersFromUrl(url), [url]);
  const setFilters = useCallback((f) => setUrl({
    status: f.statusFilter || 'all',
    email: f.emailFilter || 'all',
    state: f.stateFilter || 'all',
  }), [setUrl]);
  const sortField = url.sort;
  const sortDir = url.dir;
  const activeTab = url.tab;
  const setActiveTab = useCallback((tab) => setUrl({ tab }), [setUrl]);
  const [selectedNpis, setSelectedNpis] = useState(new Set());
  const [listDialogNpis, setListDialogNpis] = useState(null);

  const queryClient = useQueryClient();

  const [debouncedSearch, setDebouncedSearch] = useState(url.q.trim());
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);
  useEffect(() => { setUrl({ q: debouncedSearch }); }, [debouncedSearch, setUrl]);
  useEffect(() => {
    setSearchTerm((current) => (current.trim() === url.q ? current : url.q));
  }, [url.q]);

  // Search runs on the server across every organization (it used to filter
  // only the newest 500 loaded in the browser). With no search, show the
  // newest organizations.
  const isSearching = debouncedSearch.length >= 2;
  // While searching, the state filter runs on the server across every
  // organization; otherwise it filters the recent ones shown.
  const searchState = isSearching && url.state !== 'all' ? url.state : null;
  const { data: result, isLoading, isError, error: loadError, refetch, isPlaceholderData } = useQuery({
    queryKey: ['organizationsPage', debouncedSearch, searchState],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (isSearching) {
        const res = await base44.functions.invoke('searchProviders', {
          q: debouncedSearch, entity_type: 'Organization', limit: SEARCH_LIMIT, ...(searchState ? { state: searchState } : {}),
        });
        return { providers: res.data?.providers || [], truncated: !!res.data?.truncated, mode: res.data?.mode, degraded: !!res.data?.degraded };
      }
      return { providers: await base44.entities.Provider.filter({ entity_type: 'Organization' }, '-created_date', RECENT_LIMIT) };
    },
  });
  const providers = useMemo(() => result?.providers ?? [], [result]);

  // Stable key of displayed NPIs so the scoped score fetch refetches with the list.
  const npiKey = useMemo(
    () => providers.map(p => p.npi).filter(Boolean).sort().join(','),
    [providers],
  );

  // Fetch lead scores only for the displayed organizations (was: newest 5000
  // scores, which over-fetched and usually didn't include the shown orgs).
  const { data: scores = [] } = useQuery({
    queryKey: ['organizationsPageScores', npiKey],
    enabled: providers.length > 0,
    staleTime: 60000,
    queryFn: () => {
      const npis = providers.map(p => p.npi).filter(Boolean);
      if (npis.length === 0) return [];
      return base44.entities.LeadScore.filter(
        { npi: { $in: npis } },
        '-created_date',
        Math.max(npis.length * 2, 500),
      );
    },
  });

  // Locations/specialties for the organizations on screen (was: the newest
  // 1000 rows of the whole table, which rarely matched the listed orgs).
  const { data: locations = [] } = useQuery({
    queryKey: ['organizationsPageLocations', npiKey],
    enabled: providers.length > 0,
    staleTime: 120000,
    placeholderData: keepPreviousData,
    queryFn: () => base44.entities.ProviderLocation.filter(
      { npi: { $in: providers.map(p => p.npi).filter(Boolean) } }, undefined, 2000,
    ),
  });

  const { data: taxonomies = [] } = useQuery({
    queryKey: ['organizationsPageTaxonomies', npiKey],
    enabled: providers.length > 0,
    staleTime: 120000,
    placeholderData: keepPreviousData,
    queryFn: () => base44.entities.ProviderTaxonomy.filter(
      { npi: { $in: providers.map(p => p.npi).filter(Boolean) } }, undefined, 2000,
    ),
  });

  const { data: savedFilters = [] } = useQuery({
    queryKey: ['savedFilters', 'Organizations'],
    queryFn: () => base44.entities.SavedFilter.filter({ page: 'Organizations' }),
    staleTime: 30000,
  });

  const defaultApplied = useRef(Object.keys(URL_DEFAULTS).some(k => k !== 'tab' && url[k] !== URL_DEFAULTS[k]));
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
      statusFilter: f.statusFilter || 'all',
      enrichmentFilter: f.enrichmentFilter || 'all',
      emailFilter: f.emailFilter || 'all',
      stateFilter: f.stateFilter || 'all',
      specialtyFilter: f.specialtyFilter || 'all',
    });
  };

  const resetFilters = () => {
    setSearchTerm('');
    setUrl({ q: '', status: 'all', email: 'all', state: 'all', sort: 'default', dir: 'asc' });
  };
  const hasActiveFilters = filters.statusFilter !== 'all' || filters.emailFilter !== 'all' || filters.stateFilter !== 'all';

  const stateOptions = useMemo(
    () => (isSearching ? US_STATES : [...new Set(locations.map(l => l.state).filter(Boolean))].sort()),
    [locations, isSearching],
  );

  const currentFilters = { searchTerm, ...filters };

  // O(1) score lookup (was scores.find per row → O(n^2) in the sort comparator).
  const scoreByNpi = useMemo(() => {
    const m = new Map();
    for (const s of scores) {
      if (s.npi && !m.has(s.npi)) m.set(s.npi, s.score);
    }
    return m;
  }, [scores]);

  const getScore = (npi) => scoreByNpi.get(npi) ?? null;

  const locationByNpi = useMemo(() => {
    const map = {};
    for (const l of locations) {
      if (!map[l.npi]) map[l.npi] = [];
      map[l.npi].push(l);
    }
    return map;
  }, [locations]);

  const _taxonomyByNpi = useMemo(() => {
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
  }, [providers, filters, locationByNpi]);

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
        subtitle={
          isPlaceholderData
            ? 'Searching…'
            : isSearching
            ? `${providers.length.toLocaleString()}${result?.truncated ? '+' : ''} organization${providers.length === 1 ? '' : 's'} ${result?.mode === 'contains' ? 'containing' : 'starting with'} "${debouncedSearch}"${searchState ? ` in ${searchState}` : ''}${result?.degraded ? ' (search indexes are still being built, so this may be slow or incomplete)' : ''}`
            : `Showing the ${providers.length.toLocaleString()} most recently added organizations — search by name or NPI to find others`
        }
        icon={Building2}
        breadcrumbs={[{ label: 'Providers', page: 'Providers' }, { label: 'Organizations' }]}
      />
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div />
        <div className="flex flex-wrap gap-2">
          <ExportDialog
            data={sortedProviders.map(p => {
              const loc = pickPrimaryLocation(locationByNpi[p.npi]);
              return {
                npi: p.npi,
                organization_name: p.organization_name || '',
                status: p.status || '',
                email: p.email || '',
                phone: loc?.phone || p.phone || '',
                address: loc?.address_1 || '',
                city: loc?.city || '',
                state: loc?.state || '',
                zip: loc?.zip || '',
                score: getScore(p.npi)?.toFixed(0) || '',
              };
            })}
            fields={[
              { key: 'npi', label: 'NPI' },
              { key: 'organization_name', label: 'Organization Name' },
              { key: 'status', label: 'Status' },
              { key: 'email', label: 'Email' },
              { key: 'phone', label: 'Phone' },
              { key: 'address', label: 'Address' },
              { key: 'city', label: 'City' },
              { key: 'state', label: 'State' },
              { key: 'zip', label: 'ZIP' },
              { key: 'score', label: 'Score' },
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
          <Button
            onClick={() => setListDialogNpis(selectedNpis.size > 0 ? Array.from(selectedNpis) : sortedProviders.map(p => p.npi))}
            disabled={sortedProviders.length === 0}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            <Save className="w-4 h-4 mr-2" />
            {selectedNpis.size > 0 ? `Add ${selectedNpis.size} to Lead List` : 'Save as Lead List'}
          </Button>
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
                ariaLabel="Search organizations"
                placeholder="Search organizations by any part of the name, or NPI"
                onSuggestionSelect={handleSuggestionSelect}
                className="flex-1"
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <FilterSelect
                    label="Status"
                    value={filters.statusFilter}
                    onChange={(v) => setFilters({ ...filters, statusFilter: v })}
                    options={[{ value: 'Active', label: 'Active' }, { value: 'Deactivated', label: 'Deactivated' }]}
                  />
                  <FilterSelect
                    label="Email"
                    value={filters.emailFilter}
                    onChange={(v) => setFilters({ ...filters, emailFilter: v })}
                    options={[{ value: 'has_email', label: 'Has email' }, { value: 'no_email', label: 'No email' }]}
                  />
                  <FilterSelect
                    label="State"
                    value={filters.stateFilter}
                    onChange={(v) => setFilters({ ...filters, stateFilter: v })}
                    options={stateOptions.map(st => ({ value: st, label: st }))}
                  />
                  {(hasActiveFilters || searchTerm) && (
                    <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs text-slate-400 hover:text-slate-200">
                      Clear all
                    </Button>
                  )}
                </div>
                <SortControl
                  sortField={sortField}
                  sortDir={sortDir}
                  onSortChange={(f, d) => setUrl({ sort: f, dir: d })}
                  sortOptions={SORT_OPTIONS}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#141d30] border-slate-700/50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-slate-200">
                <span>Organization Directory</span>
                <span className="text-sm font-normal text-slate-400">
                  {sortedProviders.length} results
                  {selectedNpis.size > 0 && (
                    <Badge className="ml-2 bg-violet-900/15 text-violet-400 text-[10px]">{selectedNpis.size} selected</Badge>
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
                          aria-label="Select all organizations"
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
                    ) : isError ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-6">
                          <QueryErrorState title="Couldn't load organizations" error={loadError} onRetry={refetch} />
                        </TableCell>
                      </TableRow>
                    ) : sortedProviders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                          {isSearching
                            ? `No organizations match "${debouncedSearch}" with the current filters.`
                            : 'No organizations match the current filters.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      sortedProviders.map(provider => {
                        const score = getScore(provider.npi);
                        const provLoc = pickPrimaryLocation(locationByNpi[provider.npi]);
                        return (
                          <TableRow key={provider.id} className={selectedNpis.has(provider.npi) ? 'bg-cyan-900/5' : ''}>
                            <TableCell>
                              <input type="checkbox"
                                aria-label={`Select ${provider.organization_name || provider.npi}`}
                                checked={selectedNpis.has(provider.npi)}
                                onChange={() => toggleSelect(provider.npi)}
                                className="rounded border-slate-600 bg-slate-800"
                              />
                            </TableCell>
                            <TableCell className="font-mono text-sm text-slate-400">{provider.npi}</TableCell>
                            <TableCell>
                              <Link to={createPageUrl(`ProviderDetail?npi=${provider.npi}`)} className="hover:underline font-medium text-slate-200">
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
                                       provider.email_confidence === 'high' ? 'bg-emerald-900/15 text-emerald-400 border-emerald-500/20' :
                                       provider.email_confidence === 'medium' ? 'bg-amber-900/15 text-amber-400 border-amber-500/20' :
                                       'bg-red-900/15 text-red-400 border-red-500/20'
                                     }`}>{provider.email_confidence}</Badge>
                                   )}
                                 </div>
                               ) : (
                                <span className="text-slate-400 text-xs">—</span>
                               )}
                            </TableCell>
                            <TableCell>
                               {score !== null ? (
                               <Badge className="bg-cyan-900/15 text-cyan-400 border border-cyan-500/20">
                                  {score.toFixed(0)}
                                </Badge>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Link to={createPageUrl(`ProviderDetail?npi=${provider.npi}`)}>
                                  <Button variant="outline" size="sm" className="text-xs h-7 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400">View Details</Button>
                                </Link>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  aria-label="Add to lead list"
                                  title="Add to lead list"
                                  onClick={() => setListDialogNpis([provider.npi])}
                                  className="h-7 w-7 p-0 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
                                >
                                  <ListPlus className="w-3.5 h-3.5" />
                                </Button>
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
          <DataSourcesFooter />
        </TabsContent>
      </Tabs>

      <AddToLeadListDialog
        open={!!listDialogNpis}
        onOpenChange={(open) => { if (!open) setListDialogNpis(null); }}
        npis={listDialogNpis || []}
        defaultName={isSearching ? `Organizations: ${debouncedSearch}` : ''}
        onSaved={() => setSelectedNpis(new Set())}
      />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs bg-slate-800/50 border-slate-700 text-slate-300" aria-label={`${label} filter`}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: All</SelectItem>
        {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}