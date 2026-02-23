import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Megaphone, Mail, UserCheck, Target, TrendingUp } from 'lucide-react';
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

  // Aggregate stats across all campaigns
  const overallStats = useMemo(() => {
    const active = campaigns.filter(c => c.status === 'active').length;
    const totalSent = campaigns.reduce((s, c) => s + (c.emails_sent || 0), 0);
    const totalResponded = campaigns.reduce((s, c) => s + (c.emails_responded || 0), 0);
    const totalConversions = campaigns.reduce((s, c) => s + (c.conversions || 0), 0);
    const totalRevenue = campaigns.reduce((s, c) => s + (c.revenue_generated || 0), 0);
    return { active, totalSent, totalResponded, totalConversions, totalRevenue };
  }, [campaigns]);

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
        subtitle="Create, manage, and track outreach campaigns targeting provider segments"
        icon={Megaphone}
        breadcrumbs={[{ label: 'Sales & Outreach' }, { label: 'Campaigns' }]}
        actions={<CampaignCreateDialog onCreated={handleCreated} />}
      />

      {/* Overview KPIs */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { icon: Megaphone, label: 'Active Campaigns', value: overallStats.active, color: 'text-emerald-400' },
            { icon: Mail, label: 'Emails Sent', value: overallStats.totalSent.toLocaleString(), color: 'text-cyan-400' },
            { icon: UserCheck, label: 'Responses', value: overallStats.totalResponded.toLocaleString(), color: 'text-blue-400' },
            { icon: Target, label: 'Conversions', value: overallStats.totalConversions.toLocaleString(), color: 'text-green-400' },
            { icon: TrendingUp, label: 'Total Revenue', value: `$${overallStats.totalRevenue.toLocaleString()}`, color: 'text-violet-400' },
          ].map(({ icon: Icon, label, value, color }) => (
            <Card key={label} className="bg-slate-800/50 border-slate-700/50">
              <CardContent className="p-3 text-center">
                <Icon className={`w-4 h-4 mx-auto ${color} mb-1`} />
                <div className="text-lg font-bold text-slate-100">{value}</div>
                <div className="text-[10px] text-slate-400">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search campaigns..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-9 bg-slate-800/50 border-slate-700 text-slate-200"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-9 bg-slate-800/50 border-slate-700">
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
        {campaigns.length > 0 && (
          <Badge variant="outline" className="h-9 px-3 flex items-center text-xs text-slate-400">
            {filtered.length} campaign{filtered.length !== 1 ? 's' : ''}
          </Badge>
        )}
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
            <p className="text-xs text-slate-500">Create your first campaign to start tracking outreach performance</p>
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