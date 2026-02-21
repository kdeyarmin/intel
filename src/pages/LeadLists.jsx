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
import { Plus, Download, Trash2, Eye, FileDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import LeadListTable from '../components/leadlists/LeadListTable';
import { exportCSV, exportExcel, exportPDF } from '../components/exports/exportUtils';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

export default function LeadLists() {
  const [viewingListId, setViewingListId] = useState(null);
  const queryClient = useQueryClient();

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['leadLists'],
    queryFn: () => base44.entities.LeadList.list('-created_date'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.LeadList.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['leadLists']),
  });



  const buildExportRows = async (listId) => {
    const members = await base44.entities.LeadListMember.filter({ lead_list_id: listId });
    const providers = await base44.entities.Provider.list();
    const scores = await base44.entities.LeadScore.list();
    const locations = await base44.entities.ProviderLocation.list();
    const utilizations = await base44.entities.CMSUtilization.list();
    const referrals = await base44.entities.CMSReferral.list();

    return members.map(member => {
      const provider = providers.find(p => p.npi === member.npi);
      const score = scores.find(s => s.npi === member.npi);
      const location = locations.find(l => l.npi === member.npi && l.is_primary);
      const util = utilizations.find(u => u.npi === member.npi);
      const ref = referrals.find(r => r.npi === member.npi);
      return {
        npi: member.npi,
        name: provider?.entity_type === 'Individual'
          ? `${provider?.first_name} ${provider?.last_name}`
          : provider?.organization_name || '',
        score: score?.score ?? '',
        city: location?.city || '',
        state: location?.state || '',
        phone: location?.phone || '',
        beneficiaries: util?.total_medicare_beneficiaries ?? 0,
        referrals: ref?.total_referrals ?? 0,
        status: member.status || 'New',
        notes: member.notes || '',
      };
    });
  };

  const LEAD_FIELDS = [
    { key: 'npi', label: 'NPI' }, { key: 'name', label: 'Name' }, { key: 'score', label: 'Score' },
    { key: 'city', label: 'City' }, { key: 'state', label: 'State' }, { key: 'phone', label: 'Phone' },
    { key: 'beneficiaries', label: 'Beneficiaries' }, { key: 'referrals', label: 'Referrals' },
    { key: 'status', label: 'Status' }, { key: 'notes', label: 'Notes' },
  ];

  const handleExport = async (listId, format = 'csv') => {
    const rows = await buildExportRows(listId);
    const list = lists.find(l => l.id === listId);
    const name = `lead-list-${(list?.name || listId).replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}`;

    if (format === 'csv') exportCSV(rows, LEAD_FIELDS, name);
    else if (format === 'excel') exportExcel(rows, LEAD_FIELDS, name);
    else if (format === 'pdf') exportPDF(rows, LEAD_FIELDS, name, list?.name || 'Lead List');

    const user = await base44.auth.me();
    await base44.entities.AuditEvent.create({
      event_type: 'export',
      user_email: user.email,
      details: { action: 'Export Lead List', format, row_count: rows.length },
      timestamp: new Date().toISOString(),
    });
  };

  const handleDelete = async (listId) => {
    if (!confirm('Delete this lead list?')) return;
    
    const members = await base44.entities.LeadListMember.filter({ lead_list_id: listId });
    await Promise.all(members.map(member => base44.entities.LeadListMember.delete(member.id)));
    
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
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6 sm:mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Lead Lists</h1>
          <p className="text-slate-500 mt-1">Create and manage targeted provider lists</p>
        </div>
        <Link to={createPageUrl('LeadListBuilder')}>
          <Button className="bg-cyan-600 hover:bg-cyan-700">
            <Plus className="w-4 h-4 mr-2" />
            Create New List
          </Button>
        </Link>
      </div>

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
                        <div className="flex items-center border rounded-md overflow-hidden">
                          <Button size="sm" variant="ghost" onClick={() => handleExport(list.id, 'csv')} className="rounded-none text-xs px-2">CSV</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleExport(list.id, 'excel')} className="rounded-none border-x text-xs px-2">XLS</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleExport(list.id, 'pdf')} className="rounded-none text-xs px-2">PDF</Button>
                        </div>
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

      <DataSourcesFooter />
    </div>
  );
}