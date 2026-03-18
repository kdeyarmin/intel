import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Trash2, Eye, BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import LeadListTable from '../components/leadlists/LeadListTable';
import AddProviderDialog from '../components/leadlists/AddProviderDialog';
import LeadListAnalytics from '../components/leadlists/LeadListAnalytics';
import LeadListStatusExport from '../components/leadlists/LeadListStatusExport';
import PageHeader from '../components/shared/PageHeader';
import { ListCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function LeadLists() {
  const queryClient = useQueryClient();

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['leadLists'],
    queryFn: () => base44.entities.LeadList.list('-created_date'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.LeadList.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leadLists'] }),
  });

  const handleDelete = async (listId) => {
    if (!confirm('Delete this lead list?')) return;
    const members = await base44.entities.LeadListMember.filter({ lead_list_id: listId });
    await Promise.all(members.map(member => base44.entities.LeadListMember.delete(member.id)));
    deleteMutation.mutate(listId);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Lead Lists"
        subtitle="Create and manage targeted provider lists"
        icon={ListCheck}
        breadcrumbs={[{ label: 'Lead Lists' }]}
        actions={
          <Link to={createPageUrl('LeadListBuilder')}>
            <Button className="bg-cyan-600 hover:bg-cyan-700">
              <Plus className="w-4 h-4 mr-2" />
              Create New List
            </Button>
          </Link>
        }
      />

      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader>
          <CardTitle className="text-slate-200">Your Lead Lists</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
            </div>
          ) : lists.length === 0 ? (
            <p className="text-slate-500 text-center py-8">No lead lists yet. Create one to get started!</p>
          ) : (
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
                  {lists.map(list => (
                    <TableRow key={list.id}>
                      <TableCell className="font-medium text-slate-200">{list.name}</TableCell>
                      <TableCell className="text-sm text-slate-400">{list.description || '-'}</TableCell>
                      <TableCell className="text-slate-300">{list.provider_count}</TableCell>
                      <TableCell className="text-slate-400">{new Date(list.created_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-2 flex-wrap">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline">
                                <Eye className="w-4 h-4 mr-1" />
                                <span className="hidden sm:inline">View</span>
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>{list.name}</DialogTitle>
                              </DialogHeader>
                              <ViewListDialog listId={list.id} listName={list.name} />
                            </DialogContent>
                          </Dialog>
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ViewListDialog({ listId, listName }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  React.useEffect(() => {
    loadLeads();
  }, [listId]);

  const loadLeads = async () => {
    setLoading(true);
    const members = await base44.entities.LeadListMember.filter({ lead_list_id: listId });
    if (members.length === 0) { setLeads([]); setLoading(false); return; }

    const npis = members.map(m => m.npi);
    const [providers, scores, locations, utilizations, referrals, taxonomies] = await Promise.all([
      base44.entities.Provider.filter({ npi: { $in: npis } }, undefined, 1000),
      base44.entities.LeadScore.filter({ npi: { $in: npis } }, undefined, 1000),
      base44.entities.ProviderLocation.filter({ npi: { $in: npis } }, undefined, 2000),
      base44.entities.CMSUtilization.filter({ npi: { $in: npis } }, undefined, 1000),
      base44.entities.CMSReferral.filter({ npi: { $in: npis } }, undefined, 1000),
      base44.entities.ProviderTaxonomy.filter({ npi: { $in: npis } }, undefined, 2000),
    ]);

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

  const handleRemoveProvider = async (memberId) => {
    await base44.entities.LeadListMember.delete(memberId);
    setLeads(leads.filter(l => l.member.id !== memberId));
    // Update list count
    const list = await base44.entities.LeadList.filter({ id: listId });
    if (list[0]) {
      await base44.entities.LeadList.update(listId, { provider_count: Math.max((list[0].provider_count || 0) - 1, 0) });
    }
  };

  const filteredLeads = statusFilter === 'all'
    ? leads
    : leads.filter(l => (l.member?.status || 'New') === statusFilter);

  if (loading) {
    return <div className="p-6"><Skeleton className="h-64" /></div>;
  }

  return (
    <Tabs defaultValue="providers" className="w-full">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <TabsList>
          <TabsTrigger value="providers">Providers ({leads.length})</TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="w-3.5 h-3.5 mr-1" /> Analytics
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2 flex-wrap">
          <AddProviderDialog
            listId={listId}
            existingNpis={leads.map(l => l.member.npi)}
            onAdded={loadLeads}
          />
          <LeadListStatusExport leads={leads} listName={listName} />
        </div>
      </div>

      <TabsContent value="providers">
        {/* Status segment filter */}
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {['all', 'New', 'Contacted', 'Qualified', 'Not a fit'].map(s => {
            const count = s === 'all' ? leads.length : leads.filter(l => (l.member?.status || 'New') === s).length;
            const isActive = statusFilter === s;
            return (
              <Button
                key={s}
                size="sm"
                variant={isActive ? 'default' : 'outline'}
                onClick={() => setStatusFilter(s)}
                className="text-xs h-7 gap-1"
              >
                {s === 'all' ? 'All' : s}
                <Badge variant="secondary" className="text-[10px] h-4 px-1">{count}</Badge>
              </Button>
            );
          })}
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          <LeadListTable
            leads={filteredLeads}
            onUpdateStatus={handleUpdateStatus}
            onUpdateNotes={handleUpdateNotes}
            onRemove={handleRemoveProvider}
          />
        </div>
      </TabsContent>

      <TabsContent value="analytics">
        <LeadListAnalytics leads={leads} />
      </TabsContent>
    </Tabs>
  );
}
