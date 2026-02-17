import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Trash2, Eye } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function LeadLists() {
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(null);

  const { data: leadLists = [], isLoading } = useQuery({
    queryKey: ['leadLists'],
    queryFn: () => base44.entities.LeadList.list('-created_date'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.LeadList.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['leadLists']);
    },
  });

  const handleExport = async (list) => {
    setExporting(list.id);
    try {
      const user = await base44.auth.me();
      
      // Get list members
      const members = await base44.entities.LeadListMember.filter({ lead_list_id: list.id });
      const npis = members.map(m => m.npi);
      
      // Get provider details
      const providers = await Promise.all(
        npis.map(async (npi) => {
          const [provider, score, location] = await Promise.all([
            base44.entities.Provider.filter({ npi }).then(r => r[0]),
            base44.entities.LeadScore.filter({ npi }).then(r => r[0]),
            base44.entities.ProviderLocation.filter({ npi }).then(r => r[0]),
          ]);
          return { provider, score, location };
        })
      );

      // Create CSV
      const headers = ['NPI', 'Name', 'Credential', 'Score', 'City', 'State', 'Phone'];
      const rows = providers.map(({ provider, score, location }) => [
        provider?.npi || '',
        provider?.entity_type === 'Individual' 
          ? `${provider?.first_name} ${provider?.last_name}`
          : provider?.organization_name || '',
        provider?.credential || '',
        score?.score?.toFixed(0) || '',
        location?.city || '',
        location?.state || '',
        location?.phone || '',
      ]);

      const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${list.name.replace(/\s+/g, '_')}_leads.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

      // Log audit event
      await base44.entities.AuditEvent.create({
        event_type: 'export',
        user_email: user.email,
        details: {
          action: 'Export Lead List',
          entity: 'LeadList',
          row_count: providers.length,
          message: list.name,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      alert('Export failed: ' + error.message);
    } finally {
      setExporting(null);
    }
  };

  const handleDelete = async (list) => {
    if (!confirm(`Delete "${list.name}"?`)) return;
    
    // Delete members first
    const members = await base44.entities.LeadListMember.filter({ lead_list_id: list.id });
    await Promise.all(members.map(m => base44.entities.LeadListMember.delete(m.id)));
    
    // Delete list
    deleteMutation.mutate(list.id);
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Lead Lists</h1>
        <p className="text-gray-600 mt-1">Saved provider segments for targeting</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Lead Lists</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Providers</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(3).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-32" /></TableCell>
                    </TableRow>
                  ))
                ) : leadLists.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                      No lead lists yet. Create one from the Providers page.
                    </TableCell>
                  </TableRow>
                ) : (
                  leadLists.map(list => (
                    <TableRow key={list.id}>
                      <TableCell className="font-medium">{list.name}</TableCell>
                      <TableCell className="text-gray-600">{list.description || '-'}</TableCell>
                      <TableCell>
                        <Badge className="bg-teal-100 text-teal-800">
                          {list.provider_count || 0} providers
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {new Date(list.created_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport(list)}
                            disabled={exporting === list.id}
                          >
                            <Download className="w-4 h-4 mr-1" />
                            {exporting === list.id ? 'Exporting...' : 'Export'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(list)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}