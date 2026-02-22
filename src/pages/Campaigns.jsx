import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Megaphone } from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';
import CampaignCreateDialog from '../components/campaigns/CampaignCreateDialog';
import CampaignListCard from '../components/campaigns/CampaignListCard';
import CampaignAnalytics from '../components/campaigns/CampaignAnalytics';

export default function Campaigns() {
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['campaigns_page'],
    queryFn: () => base44.entities.Campaign.list('-created_date', 200),
  });

  const { data: lists = [] } = useQuery({
    queryKey: ['leadLists'],
    queryFn: () => base44.entities.LeadList.list('-created_date', 500),
  });

  const { data: allMembers = [] } = useQuery({
    queryKey: ['allLeadListMembers'],
    queryFn: () => base44.entities.LeadListMember.list('-created_date', 5000),
  });

  const listNameMap = useMemo(() => {
    const map = {};
    lists.forEach(l => { map[l.id] = l.name; });
    return map;
  }, [lists]);

  const campaignProviderCounts = useMemo(() => {
    const map = {};
    campaigns.forEach(c => {
      const ids = c.lead_list_ids || [];
      const npis = new Set();
      allMembers.forEach(m => { if (ids.includes(m.lead_list_id)) npis.add(m.npi); });
      map[c.id] = npis.size;
    });
    return map;
  }, [campaigns, allMembers]);

  const filtered = useMemo(() => {
    return campaigns.filter(c => {
      const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'all' || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [campaigns, search, statusFilter]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this campaign?')) return;
    await base44.entities.Campaign.delete(id);
    queryClient.invalidateQueries(['campaigns_page']);
    if (selectedCampaign?.id === id) setSelectedCampaign(null);
  };

  const handleCreated = () => {
    queryClient.invalidateQueries(['campaigns_page']);
  };

  const handleUpdate = (updatedCampaign) => {
    setSelectedCampaign(updatedCampaign);
    queryClient.invalidateQueries(['campaigns_page']);
  };

  if (selectedCampaign) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4">
        <CampaignAnalytics
          campaign={selectedCampaign}
          onBack={() => setSelectedCampaign(null)}
          onUpdate={handleUpdate}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4">
      <PageHeader
        title="Campaigns"
        subtitle="Group lead lists into outreach campaigns and track performance"
        icon={Megaphone}
        breadcrumbs={[{ label: 'Sales & Outreach' }, { label: 'Campaigns' }]}
        actions={<CampaignCreateDialog onCreated={handleCreated} />}
      />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search campaigns..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-9"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-9">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="py-12 text-center">
            <Megaphone className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 mb-1">No campaigns found</p>
            <p className="text-xs text-slate-500">Create your first campaign to group lead lists and track performance</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(c => (
            <CampaignListCard
              key={c.id}
              campaign={c}
              listNames={listNameMap}
              totalProviders={campaignProviderCounts[c.id] || 0}
              onView={setSelectedCampaign}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}