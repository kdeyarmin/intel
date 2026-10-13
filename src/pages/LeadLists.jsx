import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Trash2, Eye, BarChart3, Megaphone } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import LeadListTable from '../components/leadlists/LeadListTable';
import AddProviderDialog from '../components/leadlists/AddProviderDialog';
import LeadListAnalytics from '../components/leadlists/LeadListAnalytics';
import LeadListStatusExport from '../components/leadlists/LeadListStatusExport';
import { listMembers } from '../components/leadlists/leadListService';
import PageHeader from '../components/shared/PageHeader';
import PageTabs from '@/components/layout/PageTabs';
import { ListCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useUrlState } from '@/hooks/useUrlState';
import QueryErrorState from '../components/shared/QueryErrorState';

// ?list=<id> opens that list, so a list can be linked to directly.
const URL_DEFAULTS = { list: '' };
import { useConfirm } from '@/components/shared/ConfirmDialog';
import { usePageAccess } from '@/hooks/usePageAccess';

export default function LeadLists() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  // Campaigns (and sending) are for an organization's owners.
  const { isOwner: canStartCampaign } = usePageAccess();
  const [url, setUrl] = useUrlState(URL_DEFAULTS);

  const { data: lists = [], isLoading, isError, error: loadError, refetch } = useQuery({
    queryKey: ['leadLists'],
    queryFn: () => base44.entities.LeadList.list('-created_date', 500),
  });

  // A linked list older than the 500 loaded above is fetched on its own.
  const listedOpen = url.list ? lists.find(l => String(l.id) === url.list) : null;
  const { data: fetchedOpen = null } = useQuery({
    queryKey: ['leadLists', 'one', url.list],
    queryFn: async () => (await base44.entities.LeadList.filter({ id: Number(url.list) }, undefined, 1))[0] || null,
    enabled: !!url.list && /^\d+$/.test(url.list) && !isLoading && !listedOpen,
  });
  const openList = listedOpen || fetchedOpen;

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.LeadList.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leadLists'] }),
  });

  const handleDelete = async (listId) => {
    const list = lists.find(l => l.id === listId);
    const ok = await confirm({
      title: `Delete "${list?.name || 'this lead list'}"?`,
      description: `This removes the list and its ${(list?.member_count || 0).toLocaleString()} member entries. The providers themselves are not affected.`,
      confirmLabel: 'Delete list',
      destructive: true,
    });
    if (!ok) return;
    try {
      // The server removes the list's members together with the list.
      await deleteMutation.mutateAsync(listId);
    } catch {
      // Already surfaced by the global mutation error toast.
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageTabs current="LeadLists" />
      <PageHeader
        title="Lead Lists"
        subtitle="Create and manage targeted provider lists"
        icon={ListCheck}
        breadcrumbs={[{ label: 'Lead Lists' }]}
        actions={
          <Button asChild className="bg-cyan-600 hover:bg-cyan-700">
            <Link to={createPageUrl('LeadListBuilder')}>
              <Plus className="w-4 h-4 mr-2" />
              Create New List
            </Link>
          </Button>
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
          ) : isError ? (
            <QueryErrorState title="Unable to load lead lists" error={loadError} onRetry={refetch} />
          ) : lists.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No lead lists have been created. Create a list to organize providers for outreach.</p>
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
                      <TableCell className="font-medium text-slate-200">
                        <button type="button" onClick={() => setUrl({ list: String(list.id) })} className="text-left hover:text-cyan-400 hover:underline">
                          {list.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-slate-400">{list.description || '-'}</TableCell>
                      <TableCell className="text-slate-300">{list.member_count}</TableCell>
                      <TableCell className="text-slate-400">{new Date(list.created_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" onClick={() => setUrl({ list: String(list.id) })}>
                            <Eye className="w-4 h-4 mr-1" />
                            <span className="hidden sm:inline">View</span>
                          </Button>
                          {canStartCampaign && (
                            <Button asChild size="sm" variant="outline" title="Start a campaign for this list">
                              <Link to={`${createPageUrl('ProviderOutreach')}?leadList=${list.id}`}>
                                <Megaphone className="w-4 h-4 mr-1" />
                                <span className="hidden sm:inline">Start campaign</span>
                              </Link>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Delete ${list.name}`}
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

      <Dialog open={!!openList} onOpenChange={(open) => { if (!open) setUrl({ list: '' }); }}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{openList?.name}</DialogTitle>
          </DialogHeader>
          {openList && <ViewListDialog listId={openList.id} listName={openList.name} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// The server picks each member's detail rows per NPI. A row limit shared by a
// chunk of NPIs let one NPI with hundreds of rows leave the others blank.
const DETAIL_CHUNK = 500; // getLeadListMemberDetails' per-call maximum
async function fetchMemberDetails(npis) {
  const out = { providers: [], scores: [], locations: [], utilizations: [], referrals: [], taxonomies: [] };
  for (let i = 0; i < npis.length; i += DETAIL_CHUNK) {
    const { data } = await base44.functions.invoke('getLeadListMemberDetails', { npis: npis.slice(i, i + DETAIL_CHUNK) });
    for (const key of Object.keys(out)) out[key].push(...(data?.[key] || []));
  }
  return out;
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
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  React.useEffect(() => {
    loadLeads();
  }, [listId]);

  const loadLeads = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // Every member, newest first: a list can outgrow any single page.
      const members = (await listMembers(listId)).reverse();
      if (members.length === 0) { setLeads([]); return; }

      const npis = [...new Set(members.map(m => m.npi))];
      const details = await fetchMemberDetails(npis);
      const { providers, scores, locations, referrals, taxonomies } = details;
      const utilizations = details.utilizations.map(r => ({ ...r, year: r.data_year, total_medicare_payment: r.total_medicare_payment_amt || 0, total_medicare_beneficiaries: r.total_unique_benes || 0 }));

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
      setLoadError(err);
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
      toast.error(`Unable to update status: ${err.message}`);
    }
  };

  const handleUpdateNotes = async (memberId, notes) => {
    try {
      await base44.entities.LeadListMember.update(memberId, { notes });
      setLeads(prev => prev.map(l =>
        l.member.id === memberId ? { ...l, member: { ...l.member, notes } } : l
      ));
    } catch (err) {
      toast.error(`Unable to save notes: ${err.message}`);
    }
  };

  const handleRemoveProvider = async (memberId) => {
    try {
      await base44.entities.LeadListMember.delete(memberId);
      setLeads(prev => prev.filter(l => l.member.id !== memberId));
      // member_count is recomputed from what is actually stored, not derived
      // from the old value: concurrent edits would otherwise drift it.
      const remaining = await listMembers(listId);
      await base44.entities.LeadList.update(listId, { member_count: remaining.length });
    } catch (err) {
      toast.error(`Unable to remove provider: ${err.message}`);
    }
  };

  const filteredLeads = statusFilter === 'all'
    ? leads
    : leads.filter(l => (l.member?.status || 'New') === statusFilter);

  if (loading) {
    return <div className="p-6"><Skeleton className="h-64" /></div>;
  }

  if (loadError) {
    return <QueryErrorState title="Unable to load this list" error={loadError} onRetry={loadLeads} />;
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
