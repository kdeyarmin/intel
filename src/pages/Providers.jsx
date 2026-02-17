import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Providers() {
  const [searchTerm, setSearchTerm] = useState('');
  const [stateFilter, setStateFilter] = useState('');

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

  const filteredProviders = providers.filter(p => {
    const matchesSearch = !searchTerm || 
      p.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.npi?.includes(searchTerm);
    return matchesSearch;
  });

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
        <Button onClick={handleSaveList} className="bg-teal-600 hover:bg-teal-700">
          <Save className="w-4 h-4 mr-2" />
          Save as Lead List
        </Button>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                placeholder="Search by name or NPI..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Provider Directory</CardTitle>
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
                            <Badge className="bg-teal-100 text-teal-800 border-teal-200">
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