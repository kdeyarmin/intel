import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Download, Trash2, Eye } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import FilterBuilder from '../components/leadlists/FilterBuilder';
import LeadListTable from '../components/leadlists/LeadListTable';

export default function LeadLists() {
  const [creating, setCreating] = useState(false);
  const [viewingListId, setViewingListId] = useState(null);
  const [newList, setNewList] = useState({ name: '', description: '', filters: {} });
  const queryClient = useQueryClient();

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['leadLists'],
    queryFn: () => base44.entities.LeadList.list('-created_date'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.LeadList.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['leadLists']),
  });

  const handleCreateList = async () => {
    if (!newList.name) {
      alert('Please enter a list name');
      return;
    }

    // Apply filters to find matching providers
    const providers = await base44.entities.Provider.list();
    const scores = await base44.entities.LeadScore.list();
    const utilizations = await base44.entities.CMSUtilization.list();
    const referrals = await base44.entities.CMSReferral.list();
    const locations = await base44.entities.ProviderLocation.list();

    let filtered = providers;

    // Apply state filter
    if (newList.filters.states?.length > 0) {
      const matchingNPIs = new Set(
        locations.filter(l => newList.filters.states.includes(l.state)).map(l => l.npi)
      );
      filtered = filtered.filter(p => matchingNPIs.has(p.npi));
    }

    // Apply score filter
    if (newList.filters.min_score || newList.filters.max_score) {
      const min = newList.filters.min_score || 0;
      const max = newList.filters.max_score || 100;
      const matchingNPIs = new Set(
        scores.filter(s => s.score >= min && s.score <= max).map(s => s.npi)
      );
      filtered = filtered.filter(p => matchingNPIs.has(p.npi));
    }

    // Apply beneficiaries filter
    if (newList.filters.min_beneficiaries) {
      const matchingNPIs = new Set(
        utilizations.filter(u => u.total_medicare_beneficiaries >= newList.filters.min_beneficiaries).map(u => u.npi)
      );
      filtered = filtered.filter(p => matchingNPIs.has(p.npi));
    }

    // Apply referrals filter
    if (newList.filters.min_referrals) {
      const matchingNPIs = new Set(
        referrals.filter(r => r.total_referrals >= newList.filters.min_referrals).map(r => r.npi)
      );
      filtered = filtered.filter(p => matchingNPIs.has(p.npi));
    }

    // Apply medicare active filter
    if (newList.filters.medicare_active) {
      filtered = filtered.filter(p => p.status === 'Active' && !p.needs_nppes_enrichment);
    }

    // Create the list
    const list = await base44.entities.LeadList.create({
      name: newList.name,
      description: newList.description,
      filters: newList.filters,
      provider_count: filtered.length,
    });

    // Add members
    for (const provider of filtered) {
      await base44.entities.LeadListMember.create({
        lead_list_id: list.id,
        npi: provider.npi,
        status: 'New',
      });
    }

    // Log audit
    const user = await base44.auth.me();
    await base44.entities.AuditEvent.create({
      event_type: 'user_action',
      user_email: user.email,
      details: {
        action: 'Create Lead List',
        entity: 'LeadList',
        row_count: filtered.length,
        message: `Created list: ${newList.name}`,
      },
      timestamp: new Date().toISOString(),
    });

    queryClient.invalidateQueries();
    setCreating(false);
    setNewList({ name: '', description: '', filters: {} });
  };

  const handleExport = async (listId) => {
    const members = await base44.entities.LeadListMember.filter({ lead_list_id: listId });
    const providers = await base44.entities.Provider.list();
    const scores = await base44.entities.LeadScore.list();
    const locations = await base44.entities.ProviderLocation.list();
    const utilizations = await base44.entities.CMSUtilization.list();
    const referrals = await base44.entities.CMSReferral.list();

    const rows = members.map(member => {
      const provider = providers.find(p => p.npi === member.npi);
      const score = scores.find(s => s.npi === member.npi);
      const location = locations.find(l => l.npi === member.npi && l.is_primary);
      const util = utilizations.find(u => u.npi === member.npi);
      const ref = referrals.find(r => r.npi === member.npi);

      return {
        NPI: member.npi,
        Name: provider?.entity_type === 'Individual' 
          ? `${provider.first_name} ${provider.last_name}`
          : provider?.organization_name,
        Score: score?.score || '',
        City: location?.city || '',
        State: location?.state || '',
        Phone: location?.phone || '',
        Beneficiaries: util?.total_medicare_beneficiaries || 0,
        Referrals: ref?.total_referrals || 0,
        Status: member.status || 'New',
        Notes: member.notes || '',
      };
    });

    const csv = [
      Object.keys(rows[0]).join(','),
      ...rows.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lead-list-${listId}.csv`;
    a.click();

    const user = await base44.auth.me();
    await base44.entities.AuditEvent.create({
      event_type: 'export',
      user_email: user.email,
      details: { action: 'Export Lead List', row_count: rows.length },
      timestamp: new Date().toISOString(),
    });
  };

  const handleDelete = async (listId) => {
    if (!confirm('Delete this lead list?')) return;
    
    const members = await base44.entities.LeadListMember.filter({ lead_list_id: listId });
    for (const member of members) {
      await base44.entities.LeadListMember.delete(member.id);
    }
    
    deleteMutation.mutate(listId);
  };

  const ViewListDialog = ({ listId }) => {
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);

    React.useEffect(() => {
      const loadLeads = async () => {
        const members = await base44.entities.LeadListMember.filter({ lead_list_id: listId });
        const providers = await base44.entities.Provider.list();
        const scores = await base44.entities.LeadScore.list();
        const locations = await base44.entities.ProviderLocation.list();
        const utilizations = await base44.entities.CMSUtilization.list();
        const referrals = await base44.entities.CMSReferral.list();
        const taxonomies = await base44.entities.ProviderTaxonomy.list();

        const enriched = members.map(member => ({
          member,
          provider: providers.find(p => p.npi === member.npi),
          score: scores.find(s => s.npi === member.npi),
          location: locations.find(l => l.npi === member.npi && l.is_primary),
          utilization: utilizations.find(u => u.npi === member.npi),
          referrals: referrals.find(r => r.npi === member.npi),
          taxonomy: taxonomies.find(t => t.npi === member.npi && t.primary_flag),
        }));

        setLeads(enriched);
        setLoading(false);
      };

      loadLeads();
    }, [listId]);

    const handleUpdateStatus = async (memberId, status) => {
      await base44.entities.LeadListMember.update(memberId, { status });
      setLeads(leads.map(l => 
        l.member.id === memberId ? { ...l, member: { ...l.member, status } } : l
      ));
    };

    const handleUpdateNotes = async (memberId, notes) => {
      await base44.entities.LeadListMember.update(memberId, { notes });
      setLeads(leads.map(l => 
        l.member.id === memberId ? { ...l, member: { ...l.member, notes } } : l
      ));
    };

    if (loading) {
      return <div className="p-6"><Skeleton className="h-64" /></div>;
    }

    return (
      <div className="max-h-[70vh] overflow-y-auto">
        <LeadListTable 
          leads={leads}
          onUpdateStatus={handleUpdateStatus}
          onUpdateNotes={handleUpdateNotes}
        />
      </div>
    );
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Lead Lists</h1>
          <p className="text-gray-600 mt-1">Create and manage targeted provider lists</p>
        </div>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button className="bg-teal-600 hover:bg-teal-700">
              <Plus className="w-4 h-4 mr-2" />
              Create New List
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Lead List</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label>List Name</Label>
                  <Input
                    placeholder="e.g., High-Value Behavioral Health Providers"
                    value={newList.name}
                    onChange={(e) => setNewList({ ...newList, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    placeholder="Brief description of this list..."
                    value={newList.description}
                    onChange={(e) => setNewList({ ...newList, description: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>

              <FilterBuilder
                filters={newList.filters}
                onChange={(filters) => setNewList({ ...newList, filters })}
              />

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateList} className="bg-teal-600 hover:bg-teal-700">
                  Create List
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Lead Lists</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : lists.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No lead lists yet. Create one to get started!</p>
          ) : (
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
                {lists.map(list => (
                  <TableRow key={list.id}>
                    <TableCell className="font-medium">{list.name}</TableCell>
                    <TableCell className="text-sm text-gray-600">{list.description || '-'}</TableCell>
                    <TableCell>{list.provider_count}</TableCell>
                    <TableCell>{new Date(list.created_date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Eye className="w-4 h-4 mr-1" />
                              View
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-[95vw]">
                            <DialogHeader>
                              <DialogTitle>{list.name}</DialogTitle>
                            </DialogHeader>
                            <ViewListDialog listId={list.id} />
                          </DialogContent>
                        </Dialog>
                        <Button size="sm" variant="outline" onClick={() => handleExport(list.id)}>
                          <Download className="w-4 h-4 mr-1" />
                          Export
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleDelete(list.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}