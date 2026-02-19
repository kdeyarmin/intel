import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Megaphone, Plus, Send, BarChart3, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

import CampaignKPIs from '../components/outreach/CampaignKPIs';
import CampaignTable from '../components/outreach/CampaignTable';
import CampaignDetailPanel from '../components/outreach/CampaignDetailPanel';
import CampaignPerformanceAnalysis from '../components/outreach/CampaignPerformanceAnalysis';
import TargetListBuilder from '../components/outreach/TargetListBuilder';
import TemplateEditor from '../components/outreach/TemplateEditor';
import AICampaignAssistant from '../components/outreach/AICampaignAssistant';
import FollowUpManager from '../components/outreach/FollowUpManager';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

export default function ProviderOutreach() {
  const [tab, setTab] = useState('campaigns');
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [campaignName, setCampaignName] = useState('');
  const [campaignDesc, setCampaignDesc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [targetConfig, setTargetConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [analyzingCampaign, setAnalyzingCampaign] = useState(null);
  const queryClient = useQueryClient();

  // Fetch data
  const { data: campaigns = [], isLoading: lc } = useQuery({
    queryKey: ['outreachCampaigns'],
    queryFn: () => base44.entities.OutreachCampaign.list('-created_date'),
  });
  const { data: leadLists = [] } = useQuery({
    queryKey: ['leadLists'],
    queryFn: () => base44.entities.LeadList.list('-created_date'),
  });
  const { data: providers = [] } = useQuery({
    queryKey: ['outProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: referrals = [] } = useQuery({
    queryKey: ['outReferrals'],
    queryFn: () => base44.entities.CMSReferral.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: scores = [] } = useQuery({
    queryKey: ['outScores'],
    queryFn: () => base44.entities.LeadScore.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: locations = [] } = useQuery({
    queryKey: ['outLocations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: taxonomies = [] } = useQuery({
    queryKey: ['outTax'],
    queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 500),
    staleTime: 120000,
  });
  const { data: dqAlerts = [] } = useQuery({
    queryKey: ['outDQ'],
    queryFn: () => base44.entities.DataQualityAlert.filter({ status: 'open' }),
    staleTime: 120000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const msgs = await base44.entities.OutreachMessage.filter({ campaign_id: id });
      for (const m of msgs) await base44.entities.OutreachMessage.delete(m.id);
      await base44.entities.OutreachCampaign.delete(id);
    },
    onSuccess: () => queryClient.invalidateQueries(['outreachCampaigns']),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.OutreachCampaign.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries(['outreachCampaigns']),
  });

  const renderMerge = (template, prov, loc, tax, score, ref) => {
    const name = prov.entity_type === 'Individual'
      ? `${prov.first_name || ''} ${prov.last_name || ''}`.trim()
      : prov.organization_name || '';
    return (template || '')
      .replace(/\{\{provider_name\}\}/g, name)
      .replace(/\{\{npi\}\}/g, prov.npi || '')
      .replace(/\{\{specialty\}\}/g, tax?.taxonomy_description || '')
      .replace(/\{\{city\}\}/g, loc?.city || '')
      .replace(/\{\{state\}\}/g, loc?.state || '')
      .replace(/\{\{score\}\}/g, String(score?.score || ''))
      .replace(/\{\{referral_volume\}\}/g, String(ref?.total_referrals || ''))
      .replace(/\{\{beneficiaries\}\}/g, String(ref?.total_medicare_beneficiaries || ''))
      .replace(/\{\{organization\}\}/g, prov.organization_name || '');
  };

  const handleCreate = async () => {
    if (!campaignName || !subject || !body || !targetConfig) {
      alert('Please fill in all fields and build a target list');
      return;
    }
    setSaving(true);

    let targetNPIs = [];
    if (targetConfig.source === 'lead_list') {
      const members = await base44.entities.LeadListMember.filter({ lead_list_id: targetConfig.listId });
      targetNPIs = members.map(m => m.npi);
    } else {
      targetNPIs = targetConfig.npis || [];
    }

    const campaign = await base44.entities.OutreachCampaign.create({
      name: campaignName,
      description: campaignDesc,
      subject_template: subject,
      body_template: body,
      status: 'draft',
      total_recipients: targetNPIs.length,
      sent_count: 0,
      opened_count: 0,
      responded_count: 0,
      bounced_count: 0,
      source_criteria: targetConfig.source,
      lead_list_id: targetConfig.listId || '',
    });

    // Build lookup maps
    const provMap = {};
    providers.forEach(p => { provMap[p.npi] = p; });
    const locMap = {};
    locations.forEach(l => { if (l.is_primary) locMap[l.npi] = l; });
    const taxMap = {};
    taxonomies.forEach(t => { if (t.primary_flag) taxMap[t.npi] = t; });
    const scoreMap = {};
    scores.forEach(s => { scoreMap[s.npi] = s; });
    const refMap = {};
    referrals.forEach(r => { refMap[r.npi] = r; });

    // Create messages in batches
    const batch = [];
    for (const npi of targetNPIs) {
      const prov = provMap[npi];
      if (!prov) continue;
      const loc = locMap[npi];
      const tax = taxMap[npi];
      const sc = scoreMap[npi];
      const ref = refMap[npi];
      const name = prov.entity_type === 'Individual'
        ? `${prov.first_name || ''} ${prov.last_name || ''}`.trim()
        : prov.organization_name || '';

      batch.push({
        campaign_id: campaign.id,
        npi,
        recipient_name: name,
        recipient_email: '',
        subject: renderMerge(subject, prov, loc, tax, sc, ref),
        status: 'pending',
      });
    }

    // Bulk create in chunks
    for (let i = 0; i < batch.length; i += 25) {
      const chunk = batch.slice(i, i + 25);
      await base44.entities.OutreachMessage.bulkCreate(chunk);
    }

    queryClient.invalidateQueries(['outreachCampaigns']);
    setCreating(false);
    setCampaignName('');
    setCampaignDesc('');
    setSubject('');
    setBody('');
    setTargetConfig(null);
    setSaving(false);
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-violet-100 to-blue-100">
            <Megaphone className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Provider Outreach</h1>
            <p className="text-sm text-slate-500">Targeted campaigns with engagement tracking</p>
          </div>
        </div>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button className="bg-violet-600 hover:bg-violet-700 gap-2">
              <Plus className="w-4 h-4" /> New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Outreach Campaign</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
              <div className="space-y-4">
                <div>
                  <Label>Campaign Name</Label>
                  <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="e.g., Q1 High-Volume Provider Outreach" className="mt-1" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={campaignDesc} onChange={(e) => setCampaignDesc(e.target.value)} placeholder="Brief description..." rows={2} className="mt-1" />
                </div>
                <TargetListBuilder
                  leadLists={leadLists}
                  providers={providers}
                  referrals={referrals}
                  scores={scores}
                  locations={locations}
                  taxonomies={taxonomies}
                  dqAlerts={dqAlerts}
                  onTargetListReady={setTargetConfig}
                />
                {targetConfig && (
                  <Badge className="bg-teal-100 text-teal-700">
                    Target: {targetConfig.source === 'lead_list' ? 'From lead list' : `${targetConfig.npis?.length || 0} providers`}
                  </Badge>
                )}
              </div>
              <div>
                <TemplateEditor subject={subject} onSubjectChange={setSubject} body={body} onBodyChange={setBody} />
              </div>
              <div>
                <AICampaignAssistant
                  onApplyName={setCampaignName}
                  onApplyDescription={setCampaignDesc}
                  onApplySubject={setSubject}
                  onApplyBody={setBody}
                  targetConfig={targetConfig}
                  campaigns={campaigns}
                  providers={providers}
                  scores={scores}
                  referrals={referrals}
                  locations={locations}
                  taxonomies={taxonomies}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
              <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={saving} className="bg-violet-600 hover:bg-violet-700 gap-2">
                {saving ? <><span className="animate-spin">⏳</span> Creating...</> : <><Send className="w-4 h-4" /> Create Campaign</>}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {lc ? (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          <CampaignKPIs campaigns={campaigns} />

          <Tabs value={viewing ? 'detail' : tab} onValueChange={(v) => { if (v !== 'detail') { setViewing(null); setTab(v); } }}>
            <TabsList className="bg-slate-100">
              <TabsTrigger value="campaigns" className="text-xs gap-1.5">
                <Megaphone className="w-3.5 h-3.5" /> All Campaigns
              </TabsTrigger>
              <TabsTrigger value="follow_ups" className="text-xs gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" /> Follow-Ups
              </TabsTrigger>
              <TabsTrigger value="metrics" className="text-xs gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" /> Engagement Metrics
              </TabsTrigger>
              {viewing && (
                <TabsTrigger value="detail" className="text-xs gap-1.5">
                  <Send className="w-3.5 h-3.5" /> {viewing.name}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="campaigns" className="mt-4">
              <CampaignTable
                campaigns={campaigns}
                onView={(c) => setViewing(c)}
                onDelete={(id) => { if (confirm('Delete this campaign and all its messages?')) deleteMutation.mutate(id); }}
                onToggle={(c, status) => toggleMutation.mutate({ id: c.id, status })}
                onAnalyze={(c) => setAnalyzingCampaign(c)}
              />
              {analyzingCampaign && (
                <div className="mt-4">
                  <CampaignPerformanceAnalysis
                    campaign={analyzingCampaign}
                    onClose={() => setAnalyzingCampaign(null)}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="follow_ups" className="mt-4">
              <FollowUpManager campaigns={campaigns} providers={providers} />
            </TabsContent>

            <TabsContent value="metrics" className="mt-4">
              <EngagementMetrics campaigns={campaigns} />
            </TabsContent>

            {viewing && (
              <TabsContent value="detail" className="mt-4">
                <CampaignDetailPanel campaign={viewing} onClose={() => setViewing(null)} />
              </TabsContent>
            )}
          </Tabs>
        </>
      )}

      <DataSourcesFooter />
    </div>
  );
}

// Inline engagement metrics component
function EngagementMetrics({ campaigns }) {
  const data = campaigns
    .filter(c => c.sent_count > 0)
    .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))
    .map(c => ({
      name: c.name.length > 15 ? c.name.slice(0, 13) + '…' : c.name,
      Sent: c.sent_count || 0,
      Opened: c.opened_count || 0,
      Responded: c.responded_count || 0,
    }));

  if (data.length === 0) {
    return (
      <div className="text-center text-sm text-slate-400 py-12">
        No campaign data to display yet. Send your first campaign to see engagement metrics.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-6">
      <h3 className="text-sm font-medium text-slate-700 mb-4">Campaign Engagement Comparison</h3>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="Sent" fill="#94a3b8" radius={[2, 2, 0, 0]} />
            <Bar dataKey="Opened" fill="#10b981" radius={[2, 2, 0, 0]} />
            <Bar dataKey="Responded" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}