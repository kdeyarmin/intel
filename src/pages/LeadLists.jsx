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
import { listMembers } from '../components/leadlists/leadListService';
import PageHeader from '../components/shared/PageHeader';
import { ListCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function LeadLists() {
  const queryClient = useQueryClient();

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['leadLists'],
    queryFn: () => base44.entities.LeadList.list('-created_date', 500),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.LeadList.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leadLists'] }),
  });

  const handleDelete = async (listId) => {
    if (!confirm('Delete this lead list?')) return;
    try {
      // The server removes the list's members together with the list.
      await deleteMutation.mutateAsync(listId);
    } catch {
      // Already surfaced by the global mutation error toast.
    }
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
                      <TableCell className="text-slate-300">{list.member_count}</TableCell>
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

// Detail lookups go in NPI chunks with a row budget per NPI; one capped
// $in over thousands of NPIs left most members without details.
const NPI_CHUNK = 200;
async function fetchByNpis(entity, npis, rowsPerNpi) {
  const rows = [];
  for (let i = 0; i < npis.length; i += NPI_CHUNK) {
    const chunk = npis.slice(i, i + NPI_CHUNK);
    rows.push(...await entity.filter({ npi: { $in: chunk } }, undefined, chunk.length * rowsPerNpi));
  }
  return rows;
}

/** First row per NPI, preferring rows that pass `prefer`. */
function firstByNpi(rows, prefer) {
  const preferred = new Map();
  const any = new Map();
  for (const r of rows) {
    if (!any.has(r.npi)) any.set(r.npi, r);
    if (prefer && !preferred.has(r.npi) && prefer(r)) preferred.set(r.npi, r);
  }
  return (npi) => preferred.get(npi) || any.get(npi);
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
    try {
      // Every member, newest first: a list can outgrow any single page.
      const members = (await listMembers(listId)).reverse();
      if (members.length === 0) { setLeads([]); return; }

      const npis = [...new Set(members.map(m => m.npi))];
      const [providers, scores, locations, utilizations, referrals, taxonomies] = await Promise.all([
        fetchByNpis(base44.entities.Provider, npis, 1),
        fetchByNpis(base44.entities.LeadScore, npis, 2),
        fetchByNpis(base44.entities.ProviderLocation, npis, 5),
        fetchByNpis(base44.entities.ProviderServiceUtilization, npis, 10).then(rows => rows.map(r => ({ ...r, year: r.data_year, total_medicare_payment: r.total_medicare_payment_amt || 0, total_medicare_beneficiaries: r.total_unique_benes || 0 }))),
        fetchByNpis(base44.entities.CMSReferral, npis, 5),
        fetchByNpis(base44.entities.ProviderTaxonomy, npis, 5),
      ]);

      const providerOf = firstByNpi(providers);
      const scoreOf = firstByNpi(scores);
      const locationOf = firstByNpi(locations, l => l.is_primary);
      const utilizationOf = firstByNpi(utilizations);
      const referralsOf = firstByNpi(referrals);
      const taxonomyOf = firstByNpi(taxonomies, t => t.is_primary);
      const enriched = members.map(member => ({
        member,
        provider: providerOf(member.npi),
        score: scoreOf(member.npi),
        location: locationOf(member.npi),
        utilization: utilizationOf(member.npi),
        referrals: referralsOf(member.npi),
        taxonomy: taxonomyOf(member.npi),
      }));

      setLeads(enriched);
    } catch (err) {
      console.error('[LeadLists] Failed to load leads:', err);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (memberId, status) => {
    try {
      await base44.entities.LeadListMember.update(memberId, { status });
      setLeads(prev => prev.map(l =>
        l.member.id === memberId ? { ...l, member: { ...l.member, status } } : l
      ));
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleUpdateNotes = async (memberId, notes) => {
    try {
      await base44.entities.LeadListMember.update(memberId, { notes });
      setLeads(prev => prev.map(l =>
        l.member.id === memberId ? { ...l, member: { ...l.member, notes } } : l
      ));
    } catch (err) {
      console.error('Failed to update notes:', err);
    }
  };

  const handleRemoveProvider = async (memberId) => {
    try {
      await base44.entities.LeadListMember.delete(memberId);
      setLeads(prev => prev.filter(l => l.member.id !== memberId));
      const list = await base44.entities.LeadList.filter({ id: listId });
      if (list[0]) {
        await base44.entities.LeadList.update(listId, { member_count: Math.max((list[0].member_count || 0) - 1, 0) });
      }
    } catch (err) {
      console.error('Failed to remove provider:', err);
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
