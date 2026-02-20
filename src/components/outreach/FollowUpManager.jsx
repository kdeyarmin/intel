import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RefreshCw, Sparkles, Send, Clock, Eye, MessageSquare, Mail, ChevronRight, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { formatDateET } from '../utils/dateUtils';
import { toast } from 'sonner';
import AIFollowUpGenerator from './AIFollowUpGenerator';
import AutoFollowUpSequencer from './AutoFollowUpSequencer';

const STATUS_COLORS = {
  pending: 'bg-slate-100 text-slate-600',
  queued: 'bg-blue-100 text-blue-700',
  sent: 'bg-emerald-100 text-emerald-700',
  skipped: 'bg-slate-100 text-slate-400',
};

export default function FollowUpManager({ campaigns = [], providers = [] }) {
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const queryClient = useQueryClient();

  const eligibleCampaigns = campaigns.filter(c => c.sent_count > 0);
  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);

  const { data: messages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: ['followUpMessages', selectedCampaignId],
    queryFn: () => base44.entities.OutreachMessage.filter({ campaign_id: selectedCampaignId }),
    enabled: !!selectedCampaignId,
  });

  const { data: followUpCampaigns = [] } = useQuery({
    queryKey: ['followUpCampaigns'],
    queryFn: async () => {
      const all = await base44.entities.OutreachCampaign.list('-created_date');
      return all.filter(c => c.description?.includes('[Follow-Up]'));
    },
  });

  const provMap = useMemo(() => {
    const m = {};
    providers.forEach(p => { m[p.npi] = p; });
    return m;
  }, [providers]);

  const segments = useMemo(() => ({
    opened_no_response: messages.filter(m => m.status === 'opened'),
    not_opened: messages.filter(m => m.status === 'sent'),
    bounced: messages.filter(m => m.status === 'bounced' || m.status === 'failed'),
    responded: messages.filter(m => m.status === 'responded'),
  }), [messages]);

  const createFollowUpMutation = useMutation({
    mutationFn: async ({ segment, subject, body, recipientNPIs }) => {
      setSendingFollowUp(true);

      const fuCampaign = await base44.entities.OutreachCampaign.create({
        name: `${selectedCampaign.name} — Follow-Up (${segment})`,
        description: `[Follow-Up] Auto-generated follow-up for "${selectedCampaign.name}" targeting: ${segment}`,
        subject_template: subject,
        body_template: body,
        status: 'draft',
        total_recipients: recipientNPIs.length,
        sent_count: 0, opened_count: 0, responded_count: 0, bounced_count: 0,
        source_criteria: 'custom',
      });

      const batch = recipientNPIs.map(npi => {
        const prov = provMap[npi];
        const name = prov
          ? prov.entity_type === 'Individual'
            ? `${prov.first_name || ''} ${prov.last_name || ''}`.trim()
            : prov.organization_name || ''
          : '';
        return {
          campaign_id: fuCampaign.id,
          npi,
          recipient_name: name,
          recipient_email: '',
          subject,
          status: 'pending',
        };
      });

      for (let i = 0; i < batch.length; i += 25) {
        await base44.entities.OutreachMessage.bulkCreate(batch.slice(i, i + 25));
      }

      return fuCampaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['outreachCampaigns']);
      queryClient.invalidateQueries(['followUpCampaigns']);
      setSendingFollowUp(false);
      setGeneratorOpen(false);
      toast.success('Follow-up campaign created');
    },
    onError: () => {
      setSendingFollowUp(false);
    },
  });

  const segmentConfigs = [
    { key: 'opened_no_response', label: 'Opened, No Response', icon: Eye, color: 'bg-emerald-50 text-emerald-600', borderColor: 'border-emerald-200' },
    { key: 'not_opened', label: 'Not Opened', icon: Mail, color: 'bg-slate-50 text-slate-500', borderColor: 'border-slate-200' },
    { key: 'bounced', label: 'Bounced', icon: RefreshCw, color: 'bg-red-50 text-red-500', borderColor: 'border-red-200' },
    { key: 'responded', label: 'Responded ✓', icon: CheckCircle2, color: 'bg-violet-50 text-violet-600', borderColor: 'border-violet-200' },
  ];

  return (
    <div className="space-y-4">
      {/* Campaign selector */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select a campaign to manage follow-ups..." />
                </SelectTrigger>
                <SelectContent>
                  {eligibleCampaigns.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {c.sent_count} sent, {c.opened_count} opened, {c.responded_count} responded
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedCampaignId && (
              <Button onClick={() => setGeneratorOpen(true)} className="bg-blue-600 hover:bg-blue-700 gap-1.5 shrink-0">
                <Sparkles className="w-4 h-4" /> Generate AI Follow-Ups
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedCampaignId && !loadingMsgs && selectedCampaign && (
        <AutoFollowUpSequencer
          campaign={selectedCampaign}
          messages={messages}
          providers={providers}
          onCreateFollowUp={(data) => createFollowUpMutation.mutate(data)}
        />
      )}

      {!selectedCampaignId && (
        <div className="text-center py-12 text-sm text-slate-400">
          Select a campaign above to view engagement segments and generate AI follow-ups.
        </div>
      )}

      {selectedCampaignId && loadingMsgs && (
        <div className="grid grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24" />)}</div>
      )}

      {selectedCampaignId && !loadingMsgs && (
        <>
          {/* Segment cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {segmentConfigs.map(seg => {
              const Icon = seg.icon;
              const count = segments[seg.key]?.length || 0;
              const pct = messages.length > 0 ? Math.round((count / messages.length) * 100) : 0;
              return (
                <div key={seg.key} className={`rounded-xl border p-4 ${seg.color} ${seg.borderColor}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="w-4 h-4" />
                    <span className="text-[10px] font-medium uppercase tracking-wide">{seg.label}</span>
                  </div>
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-[10px] opacity-70">{pct}% of recipients</p>
                </div>
              );
            })}
          </div>

          {/* Recipient detail table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Engagement Detail ({messages.length} recipients)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[350px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Recipient</TableHead>
                      <TableHead className="text-xs">NPI</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Sent</TableHead>
                      <TableHead className="text-xs">Segment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {messages.slice(0, 50).map(m => {
                      let segment = 'pending';
                      if (m.status === 'responded') segment = 'responded';
                      else if (m.status === 'opened') segment = 'opened_no_response';
                      else if (m.status === 'sent') segment = 'not_opened';
                      else if (m.status === 'bounced' || m.status === 'failed') segment = 'bounced';

                      const segCfg = segmentConfigs.find(s => s.key === segment);
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-xs font-medium">{m.recipient_name || '-'}</TableCell>
                          <TableCell className="text-[10px] font-mono text-slate-400">{m.npi}</TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${segCfg?.color || 'bg-slate-50 text-slate-400'}`}>{m.status}</Badge>
                          </TableCell>
                          <TableCell className="text-[10px] text-slate-400">{m.sent_at ? formatDateET(m.sent_at) : '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[9px]">{segCfg?.label || segment}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Existing follow-up campaigns for this parent */}
          {followUpCampaigns.filter(fc => fc.description?.includes(selectedCampaign?.name)).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ArrowRight className="w-4 h-4 text-blue-500" /> Follow-Up Campaigns Created
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {followUpCampaigns
                  .filter(fc => fc.description?.includes(selectedCampaign?.name))
                  .map(fc => (
                    <div key={fc.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                      <div>
                        <p className="text-xs font-medium">{fc.name}</p>
                        <p className="text-[10px] text-slate-400">{fc.total_recipients} recipients • {fc.status}</p>
                      </div>
                      <Badge className={`text-[10px] ${fc.status === 'draft' ? 'bg-slate-100 text-slate-600' : fc.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {fc.status}
                      </Badge>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* AI Generator Dialog */}
      <Dialog open={generatorOpen} onOpenChange={setGeneratorOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-500" />
              AI Follow-Up for: {selectedCampaign?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedCampaign && (
            <AIFollowUpGenerator
              campaign={selectedCampaign}
              messages={messages}
              onApplyFollowUp={(data) => createFollowUpMutation.mutate(data)}
            />
          )}
          {sendingFollowUp && (
            <div className="flex items-center justify-center gap-2 py-4 text-blue-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Creating follow-up campaign...</span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}