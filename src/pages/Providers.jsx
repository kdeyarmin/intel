import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Save, Download } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import SearchFilterBar from '../components/filters/SearchFilterBar';
import ExportDialog from '../components/exports/ExportDialog';
import SavedFilterBar from '../components/filters/SavedFilterBar';

export default function Providers() {
  const [searchTerm, setSearchTerm] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [credentialFilter, setCredentialFilter] = useState('all');
  const [enrichmentFilter, setEnrichmentFilter] = useState('all');

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
  };

  const currentFilters = { searchTerm, entityTypeFilter, statusFilter, credentialFilter, enrichmentFilter };

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ['providersPage'],
    queryFn: () => base44.entities.Provider.list('-created_date', 100),
  });

  const { data: scores = [] } = useQuery({
    queryKey: ['providersPageScores'],
    queryFn: () => base44.entities.LeadScore.list(),
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
      return true;
    });
  }, [providers, searchTerm, entityTypeFilter, statusFilter, credentialFilter, enrichmentFilter]);

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
            data={filteredProviders.map(p => ({
              npi: p.npi,
              name: p.entity_type === 'Individual' ? `${p.last_name}, ${p.first_name}` : p.organization_name || '',
              credential: p.credential || '',
              entity_type: p.entity_type || '',
              status: p.status || '',
              gender: p.gender || '',
              enumeration_date: p.enumeration_date || '',
              score: getScore(p.npi)?.toFixed(0) || '',
            }))}
            fields={[
              { key: 'npi', label: 'NPI' },
              { key: 'name', label: 'Name' },
              { key: 'credential', label: 'Credential' },
              { key: 'entity_type', label: 'Type' },
              { key: 'status', label: 'Status' },
              { key: 'gender', label: 'Gender' },
              { key: 'enumeration_date', label: 'Enumeration Date' },
              { key: 'score', label: 'Score' },
            ]}
            fileName="providers"
            title="Providers"
            dateField="enumeration_date"
            trigger={<Button variant="outline"><Download className="w-4 h-4 mr-2" /> Export</Button>}
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
            onReset={() => { setSearchTerm(''); setEntityTypeFilter('all'); setStatusFilter('all'); setCredentialFilter('all'); setEnrichmentFilter('all'); }}
            filters={[
              { key: 'entityType', type: 'select', label: 'Type', value: entityTypeFilter, onChange: setEntityTypeFilter, options: [{ value: 'Individual', label: 'Individual' }, { value: 'Organization', label: 'Organization' }] },
              { key: 'status', type: 'select', label: 'Status', value: statusFilter, onChange: setStatusFilter, options: [{ value: 'Active', label: 'Active' }, { value: 'Deactivated', label: 'Deactivated' }] },
              { key: 'credential', type: 'select', label: 'Credential', value: credentialFilter, onChange: setCredentialFilter, options: credentials },
              { key: 'enrichment', type: 'select', label: 'Needs Enrichment', value: enrichmentFilter, onChange: setEnrichmentFilter, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Provider Directory</span>
            <span className="text-sm font-normal text-gray-500">{filteredProviders.length} results</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NPI</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Credential</TableHead>
                  <TableHead>Type</TableHead>
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
                      <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredProviders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                      No providers found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProviders.map(provider => {
                    const score = getScore(provider.npi);
                    return (
                      <TableRow key={provider.id}>
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
    </div>
  );
}