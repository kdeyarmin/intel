import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Save, Download, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import SearchFilterBar from '../components/filters/SearchFilterBar';
import ExportDialog from '../components/exports/ExportDialog';
import SavedFilterBar from '../components/filters/SavedFilterBar';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';
import EnrichProviderButton from '../components/providers/EnrichProviderButton';

export default function Providers() {
  const [searchTerm, setSearchTerm] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [credentialFilter, setCredentialFilter] = useState('all');
  const [enrichmentFilter, setEnrichmentFilter] = useState('all');
  const [emailFilter, setEmailFilter] = useState('all');
  const [selectedNpis, setSelectedNpis] = useState(new Set());

  const toggleSelect = (npi) => {
    setSelectedNpis(prev => {
      const next = new Set(prev);
      if (next.has(npi)) next.delete(npi); else next.add(npi);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedNpis.size === filteredProviders.length) {
      setSelectedNpis(new Set());
    } else {
      setSelectedNpis(new Set(filteredProviders.map(p => p.npi)));
    }
  };

  const selectedProviders = providers.filter(p => selectedNpis.has(p.npi));

  // Load default saved filter
  const { data: savedFilters = [] } = useQuery({
    queryKey: ['savedFilters', 'Providers'],
    queryFn: () => base44.entities.SavedFilter.filter({ page: 'Providers' }),
    staleTime: 30000,
  });

  useEffect(() => {
    const def = savedFilters.find(f => f.is_default);
    if (def?.filters) applyFilter(def.filters);
  }, [savedFilters.length]);

  const applyFilter = (filters) => {
    setSearchTerm(filters.searchTerm || '');
    setEntityTypeFilter(filters.entityTypeFilter || 'all');
    setStatusFilter(filters.statusFilter || 'all');
    setCredentialFilter(filters.credentialFilter || 'all');
    setEnrichmentFilter(filters.enrichmentFilter || 'all');
    setEmailFilter(filters.emailFilter || 'all');
  };

  const currentFilters = { searchTerm, entityTypeFilter, statusFilter, credentialFilter, enrichmentFilter, emailFilter };

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

  const getScore = (npi) => {
    const scoreRecord = scores.find(s => s.npi === npi);
    return scoreRecord?.score || null;
  };

  const credentials = useMemo(() => {
    const c = new Set(providers.map(p => p.credential).filter(Boolean));
    return [...c].sort().map(cr => ({ value: cr, label: cr }));
  }, [providers]);

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
      if (entityTypeFilter !== 'all' && p.entity_type !== entityTypeFilter) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (credentialFilter !== 'all' && p.credential !== credentialFilter) return false;
      if (enrichmentFilter !== 'all') {
        if (enrichmentFilter === 'yes' && !p.needs_nppes_enrichment) return false;
        if (enrichmentFilter === 'no' && p.needs_nppes_enrichment) return false;
      }
      if (emailFilter !== 'all') {
        if (emailFilter === 'has_email' && !p.email) return false;
        if (emailFilter === 'no_email' && p.email) return false;
        if (emailFilter === 'high' && p.email_confidence !== 'high') return false;
        if (emailFilter === 'medium' && p.email_confidence !== 'medium') return false;
        if (emailFilter === 'not_searched' && p.email_searched_at) return false;
      }
      return true;
    });
  }, [providers, searchTerm, entityTypeFilter, statusFilter, credentialFilter, enrichmentFilter, emailFilter]);

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
            data={filteredProviders.map(p => {
              const loc = locations.find(l => l.npi === p.npi && l.is_primary) || locations.find(l => l.npi === p.npi);
              const tax = taxonomies.find(t => t.npi === p.npi && t.primary_flag) || taxonomies.find(t => t.npi === p.npi);
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

      <Card className="mb-6 bg-white">
        <CardContent className="pt-6 space-y-3">
          <SavedFilterBar
            page="Providers"
            currentFilters={currentFilters}
            onApplyFilter={applyFilter}
          />
          <SearchFilterBar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onReset={() => { setSearchTerm(''); setEntityTypeFilter('all'); setStatusFilter('all'); setCredentialFilter('all'); setEnrichmentFilter('all'); setEmailFilter('all'); }}
            filters={[
              { key: 'entityType', type: 'select', label: 'Type', value: entityTypeFilter, onChange: setEntityTypeFilter, options: [{ value: 'Individual', label: 'Individual' }, { value: 'Organization', label: 'Organization' }] },
              { key: 'status', type: 'select', label: 'Status', value: statusFilter, onChange: setStatusFilter, options: [{ value: 'Active', label: 'Active' }, { value: 'Deactivated', label: 'Deactivated' }] },
              { key: 'credential', type: 'select', label: 'Credential', value: credentialFilter, onChange: setCredentialFilter, options: credentials },
              { key: 'email', type: 'select', label: 'Email Status', value: emailFilter, onChange: setEmailFilter, options: [{ value: 'has_email', label: 'Has Email' }, { value: 'no_email', label: 'No Email' }, { value: 'high', label: 'High Confidence' }, { value: 'medium', label: 'Medium Confidence' }, { value: 'not_searched', label: 'Not Searched' }] },
              { key: 'enrichment', type: 'select', label: 'Needs Enrichment', value: enrichmentFilter, onChange: setEnrichmentFilter, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Provider Directory</span>
            <span className="text-sm font-normal text-gray-500">
              {filteredProviders.length} results
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
                      checked={filteredProviders.length > 0 && selectedNpis.size === filteredProviders.length}
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
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredProviders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      No providers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProviders.map(provider => {
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
    </div>
  );
}