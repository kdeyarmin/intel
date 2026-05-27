import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Megaphone, ListChecks, Users, Send } from 'lucide-react';

const ACTIVE_STATUSES = ['active', 'sending', 'scheduled', 'running'];

export default function SalesPipelineCard() {
  const { data: leadLists = [], isLoading: loadingLists } = useQuery({
    queryKey: ['dashLeadLists'],
    queryFn: () => base44.entities.LeadList.list('-created_date', 200),
    staleTime: 60000,
    retry: 1,
  });
  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery({
    queryKey: ['dashCampaigns'],
    queryFn: () => base44.entities.OutreachCampaign.list('-created_date', 200),
    staleTime: 60000,
    retry: 1,
  });

  const loading = loadingLists || loadingCampaigns;
  const totalLeads = leadLists.reduce((s, l) => s + (l.member_count || 0), 0);
  const activeCampaigns = campaigns.filter(c => ACTIVE_STATUSES.includes((c.status || '').toLowerCase())).length;

  const tiles = [
    { label: 'Lead Lists', value: leadLists.length, icon: ListChecks, link: 'LeadLists', cls: 'text-cyan-400' },
    { label: 'Leads Tracked', value: totalLeads, icon: Users, link: 'LeadLists', cls: 'text-blue-400' },
    { label: 'Active Campaigns', value: activeCampaigns, icon: Send, link: 'ProviderOutreach', cls: 'text-emerald-400' },
    { label: 'Total Campaigns', value: campaigns.length, icon: Megaphone, link: 'ProviderOutreach', cls: 'text-violet-400' },
  ];

  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-violet-400" /> Sales Pipeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {tiles.map(t => {
            const Icon = t.icon;
            return (
              <Link
                key={t.label}
                to={createPageUrl(t.link)}
                className="p-3 bg-slate-800/40 rounded-lg border border-slate-700/40 hover:border-cyan-500/40 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${t.cls}`} />
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide">{t.label}</p>
                </div>
                <p className="text-2xl font-bold text-white">{loading ? '—' : t.value.toLocaleString()}</p>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
