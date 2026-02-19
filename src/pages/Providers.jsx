import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Save, Download } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import TypeAheadSearch from '../components/search/TypeAheadSearch';
import ProviderAdvancedFilters from '../components/filters/ProviderAdvancedFilters';
import SortControl from '../components/filters/SortControl';
import ExportDialog from '../components/exports/ExportDialog';
import SavedFilterBar from '../components/filters/SavedFilterBar';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';
import EnrichProviderButton from '../components/providers/EnrichProviderButton';
import AINPIFinder from '../components/providers/AINPIFinder';
import AIDuplicateDetector from '../components/providers/AIDuplicateDetector';
import AIProfileAugmenter from '../components/providers/AIProfileAugmenter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Copy, Globe, List } from 'lucide-react';

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'npi', label: 'NPI' },
  { value: 'credential', label: 'Credential' },
  { value: 'score', label: 'Score' },
  { value: 'created', label: 'Date Added' },
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

  useEffect(() => {
    const def = savedFilters.find(f => f.is_default);
    if (def?.filters) applyFilter(def.filters);
  }, [savedFilters.length]);

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
  };

  const currentFilters = { searchTerm, ...filters };

  const getScore = (npi) => {
    const s = scores.find(s => s.npi === npi);
    return s?.score || null;
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
    return providers.filter(p => {
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
  }, [providers, searchTerm, filters, locationByNpi, taxonomyByNpi]);

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
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Providers</h1>
          <p className="text-gray-600 mt-1">{providers.length} total providers</p>
        </div>
        <div className="flex gap-2">
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
            trigger={<Button variant="outline"><Download className="w-4 h-4 mr-2" /> Export</Button>}
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
          <Button onClick={handleSaveList} className="bg-blue-600 hover:bg-blue-700">
            <Save className="w-4 h-4 mr-2" />
            Save as Lead List
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="h-9 mb-4">
          <TabsTrigger value="directory" className="text-xs gap-1.5"><List className="w-3.5 h-3.5" /> Directory</TabsTrigger>
          <TabsTrigger value="npi-finder" className="text-xs gap-1.5"><Search className="w-3.5 h-3.5" /> NPI Finder</TabsTrigger>
          <TabsTrigger value="augment" className="text-xs gap-1.5"><Globe className="w-3.5 h-3.5" /> Profile Augmenter</TabsTrigger>
          <TabsTrigger value="duplicates" className="text-xs gap-1.5"><Copy className="w-3.5 h-3.5" /> Duplicate Detector</TabsTrigger>
        </TabsList>

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

        <TabsContent value="directory">
      <Card className="mb-6 bg-white">
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

          {/* Advanced filters + sort */}
          <div className="flex items-start justify-between gap-3">
            <ProviderAdvancedFilters
              filters={filters}
              onFilterChange={setFilters}
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
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Provider Directory</span>
            <span className="text-sm font-normal text-gray-500">
              {sortedProviders.length} results
              {selectedNpis.size > 0 && (
                <Badge className="ml-2 bg-violet-100 text-violet-700 text-[10px]">{selectedNpis.size} selected</Badge>
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
                      className="rounded border-slate-300"
                    />
                  </TableHead>
                  <TableHead>NPI</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Credential</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Email</TableHead>
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
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : sortedProviders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                      No providers found
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedProviders.map(provider => {
                    const score = getScore(provider.npi);
                    return (
                      <TableRow key={provider.id} className={selectedNpis.has(provider.npi) ? 'bg-violet-50/50' : ''}>
                        <TableCell>
                          <input type="checkbox"
                            checked={selectedNpis.has(provider.npi)}
                            onChange={() => toggleSelect(provider.npi)}
                            className="rounded border-slate-300"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{provider.npi}</TableCell>
                        <TableCell>
                          {provider.entity_type === 'Individual' ? (
                            <div>
                              <p className="font-medium">{provider.last_name}, {provider.first_name}</p>
                            </div>
                          ) : (
                            <p className="font-medium">{provider.organization_name}</p>
                          )}
                        </TableCell>
                        <TableCell>{provider.credential || '-'}</TableCell>
                        <TableCell>
                           <Badge variant="outline">{provider.entity_type}</Badge>
                         </TableCell>
                         <TableCell>
                           {provider.email ? (
                             <div className="flex items-center gap-1.5">
                               <span className="text-xs text-slate-700 truncate max-w-[160px]">{provider.email}</span>
                               {provider.email_confidence && (
                                 <Badge className={`text-[10px] ${
                                   provider.email_confidence === 'high' ? 'bg-green-100 text-green-700' :
                                   provider.email_confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                   'bg-red-100 text-red-700'
                                 }`}>{provider.email_confidence}</Badge>
                               )}
                             </div>
                           ) : (
                             <span className="text-gray-300 text-xs">—</span>
                           )}
                         </TableCell>
                         <TableCell>
                          {score !== null ? (
                            <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                              {score.toFixed(0)}
                            </Badge>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Link to={createPageUrl(`ProviderDetail?npi=${provider.npi}`)}>
                              <Button variant="outline" size="sm" className="text-xs h-7">View</Button>
                            </Link>
                            {provider.entity_type === 'Organization' && (
                              <Link to={createPageUrl(`OrganizationDetail?npi=${provider.npi}`)}>
                                <Button variant="outline" size="sm" className="text-xs h-7">Org</Button>
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

      <DataSourcesFooter />
        </TabsContent>
      </Tabs>
    </div>
  );
}