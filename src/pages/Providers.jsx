import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import SearchFilterBar from '../components/filters/SearchFilterBar';

export default function Providers() {
  const [searchTerm, setSearchTerm] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [credentialFilter, setCredentialFilter] = useState('all');
  const [enrichmentFilter, setEnrichmentFilter] = useState('all');

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ['providers'],
    queryFn: () => base44.entities.Provider.list('-created_date', 100),
  });

  const { data: scores = [] } = useQuery({
    queryKey: ['scores'],
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

    for (const provider of filteredProviders.slice(0, 50)) {
      await base44.entities.LeadListMember.create({
        lead_list_id: newList.id,
        npi: provider.npi,
      });
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
        <Button onClick={handleSaveList} className="bg-blue-600 hover:bg-blue-700">
          <Save className="w-4 h-4 mr-2" />
          Save as Lead List
        </Button>
      </div>

      <Card className="mb-6 bg-white">
        <CardContent className="pt-6">
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
                          <Link to={createPageUrl(`ProviderDetail?npi=${provider.npi}`)}>
                            <Button variant="outline" size="sm">View</Button>
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
    </div>
  );
}