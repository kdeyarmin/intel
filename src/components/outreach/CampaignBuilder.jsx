import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Send, Save, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import { MERGE_FIELDS, buildMergeVars, renderTemplate } from './mergeFields';
import { useCampaignSender } from './useCampaignSender';

const EMPTY = { name: '', description: '', lead_list_id: '', subject_template: '', body_template: '' };

/** Fetch one member of the list so the preview shows a real, personalised message. */
function useSampleRecipient(listId) {
  return useQuery({
    queryKey: ['campaignPreviewSample', listId],
    enabled: !!listId,
    staleTime: 60000,
    queryFn: async () => {
      const [member] = await base44.entities.LeadListMember.filter({ list_id: Number(listId) }, '-created_date', 1);
      if (!member) return null;
      const [[provider], taxonomies, locations] = await Promise.all([
        base44.entities.Provider.filter({ npi: member.npi }, undefined, 1),
        base44.entities.ProviderTaxonomy.filter({ npi: member.npi }, undefined, 20),
        base44.entities.ProviderLocation.filter({ npi: member.npi }, undefined, 20),
      ]);
      if (!provider) return null;
      return {
        provider,
        taxonomy: taxonomies.find(t => t.is_primary) || taxonomies[0],
        location: locations.find(l => l.is_primary) || locations[0],
      };
    },
  });
}

export default function CampaignBuilder({ onCampaignCreated, initialCampaign = null, initialLeadListId = '' }) {
  const confirm = useConfirm();
  const [step, setStep] = useState('details');
  const [saving, setSaving] = useState(false);
  const [campaign, setCampaign] = useState(initialCampaign || {
    ...EMPTY,
    lead_list_id: initialLeadListId ? String(initialLeadListId) : '',
  });
  const { send, sending, progress } = useCampaignSender();

  // Same set the Lead Lists page shows, plus the list a "Start campaign" link
  // preselected if it's older than that, so the selected target has an option.
  const { data: leadLists = [], isLoading: listsLoading } = useQuery({
    queryKey: ['leadLists', 'campaignBuilder', String(initialLeadListId || '')],
    queryFn: async () => {
      const lists = await base44.entities.LeadList.list('-created_date', 500);
      if (initialLeadListId && !lists.some((l) => String(l.id) === String(initialLeadListId))) {
        const [linked] = await base44.entities.LeadList.filter({ id: Number(initialLeadListId) }, undefined, 1);
        if (linked) return [linked, ...lists];
      }
      return lists;
    },
  });
  const selectedList = leadLists.find(l => String(l.id) === String(campaign.lead_list_id));
  // The confirmation states how many providers will be emailed, so it waits
  // until the chosen list (and its count) has actually loaded.
  const listPending = !!campaign.lead_list_id && !selectedList;
  const { data: sample } = useSampleRecipient(campaign.lead_list_id);

  const previewVars = useMemo(
    () => (sample ? buildMergeVars(sample.provider, sample.taxonomy, sample.location) : null),
    [sample],
  );
  const placeholderVars = useMemo(
    () => Object.fromEntries(MERGE_FIELDS.map(f => [f.key, `[${f.label}]`])),
    [],
  );
  const vars = previewVars || placeholderVars;

  const update = (patch) => setCampaign(prev => ({ ...prev, ...patch }));
  const insertField = (target, key) => update({ [target]: `${campaign[target] || ''}{{${key}}}` });

  const validate = () => {
    if (!campaign.name || !campaign.subject_template || !campaign.body_template) {
      toast.error('Please fill in the campaign name, subject, and message body first.');
      return false;
    }
    return true;
  };

  // Persist the campaign (once). The form keeps *_template names for its
  // inputs; the table columns are subject / body / target_list_id.
  const saveCampaign = async () => {
    const fields = {
      name: campaign.name,
      description: campaign.description,
      target_list_id: campaign.lead_list_id ? Number(campaign.lead_list_id) : null,
      subject: campaign.subject_template,
      body: campaign.body_template,
    };
    if (campaign.id) {
      await base44.entities.OutreachCampaign.update(campaign.id, fields);
      return campaign.id;
    }
    const created = await base44.entities.OutreachCampaign.create({
      ...fields,
      status: 'draft',
      campaign_type: campaign.lead_list_id ? 'lead_list' : 'custom',
    });
    update({ id: created.id });
    return created.id;
  };

  const handleSaveDraft = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const id = await saveCampaign();
      toast.success('Campaign saved as a draft.');
      onCampaignCreated?.({ ...campaign, id, status: 'draft' });
    } catch (error) {
      toast.error('Failed to save campaign: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSendNow = async () => {
    if (!validate()) return;
    if (!campaign.lead_list_id) {
      toast.error('Choose a lead list to send to.');
      return;
    }
    if (!selectedList) {
      toast.error(listsLoading ? 'The lead list is still loading.' : "Couldn't load the selected lead list. Reload the page and try again.");
      return;
    }
    const count = selectedList.member_count || 0;
    const ok = await confirm({
      title: `Send "${campaign.name}" to ${count.toLocaleString()} provider${count === 1 ? '' : 's'}?`,
      description: 'Providers without a valid email, and anyone who has unsubscribed or bounced, are skipped automatically. Each email includes an unsubscribe link.',
      confirmLabel: 'Send emails',
    });
    if (!ok) return;
    setSaving(true);
    let id;
    try {
      id = await saveCampaign();
    } catch (error) {
      toast.error('Failed to save campaign: ' + error.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    await send(id);
    onCampaignCreated?.({ ...campaign, id });
  };

  const busy = saving || sending;

  return (
    <div className="space-y-6">
      <Tabs value={step} onValueChange={setStep} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="template">Message</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="send">Send</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campaign information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="campaign-name" className="text-sm font-medium">Campaign name *</Label>
                <Input
                  id="campaign-name"
                  placeholder="e.g., Q1 Network Expansion"
                  value={campaign.name}
                  onChange={(e) => update({ name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="campaign-description" className="text-sm font-medium">Description</Label>
                <Textarea
                  id="campaign-description"
                  placeholder="What is the goal of this campaign?"
                  value={campaign.description}
                  onChange={(e) => update({ description: e.target.value })}
                  className="mt-1 h-20"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Send to (lead list) *</Label>
                <Select value={campaign.lead_list_id} onValueChange={(val) => update({ lead_list_id: val })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a lead list" />
                  </SelectTrigger>
                  <SelectContent>
                    {leadLists.map(list => (
                      <SelectItem key={list.id} value={String(list.id)}>
                        {list.name} ({(list.member_count || 0).toLocaleString()} providers)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => setStep('template')} className="w-full">Next: write the message</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="template" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Message</CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                Click a field to insert it. Each provider sees their own details, e.g. {'{{first_name}}'} becomes their first name.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="campaign-subject" className="text-sm font-medium">Subject *</Label>
                <Input
                  id="campaign-subject"
                  placeholder="Hello {{first_name}}, we'd like to discuss..."
                  value={campaign.subject_template}
                  onChange={(e) => update({ subject_template: e.target.value })}
                  className="mt-1 font-mono text-sm"
                />
                <FieldButtons onInsert={(key) => insertField('subject_template', key)} />
              </div>
              <div>
                <Label htmlFor="campaign-body" className="text-sm font-medium">Message *</Label>
                <Textarea
                  id="campaign-body"
                  placeholder={'Dear {{provider_name}},\n\nWe work with {{specialty}} practices in {{location_city}}...'}
                  value={campaign.body_template}
                  onChange={(e) => update({ body_template: e.target.value })}
                  className="mt-1 h-48 font-mono text-sm"
                />
                <FieldButtons onInsert={(key) => insertField('body_template', key)} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('details')}>Back</Button>
                <Button onClick={() => setStep('preview')} className="flex-1">Next: preview</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Preview</CardTitle>
              <p className="text-xs text-slate-400 mt-1">
                {sample
                  ? `As ${previewVars.provider_name || sample.provider.npi} will see it (first provider on the list).`
                  : 'Choose a lead list to preview with a real provider; fields are shown as placeholders.'}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-slate-800/60 rounded border border-slate-700">
                <p className="text-xs text-slate-400">Subject</p>
                <p className="font-semibold text-sm text-slate-100">{renderTemplate(campaign.subject_template, vars) || 'No subject'}</p>
                <div className="border-t border-slate-700 mt-3 pt-3">
                  <div className="text-sm whitespace-pre-wrap text-slate-300">{renderTemplate(campaign.body_template, vars) || 'No message'}</div>
                  <p className="mt-4 border-t border-slate-700 pt-2 text-[11px] text-slate-500">
                    Every email ends with an unsubscribe link and your organization&apos;s postal address.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('template')}>Back</Button>
                <Button onClick={() => setStep('send')} className="flex-1">Next: send</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="send" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Send</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-slate-800/60 border border-slate-700 rounded space-y-1 text-sm text-slate-300">
                <p>Campaign: <strong className="text-slate-100">{campaign.name || '—'}</strong></p>
                <p>Lead list: <strong className="text-slate-100">{selectedList ? `${selectedList.name} (${(selectedList.member_count || 0).toLocaleString()} providers)` : listPending ? (listsLoading ? 'Loading…' : "Couldn't load this list") : 'None selected'}</strong></p>
              </div>
              <div className="flex items-start gap-2 rounded border border-blue-500/30 bg-blue-900/20 p-3 text-xs text-blue-300">
                <Info className="w-4 h-4 shrink-0" />
                Providers with no valid email, duplicates, and anyone who has unsubscribed or bounced are skipped. You can save a draft and send later from the Campaigns tab.
              </div>
              {progress && (
                <div className="rounded border border-slate-700 bg-slate-800/60 p-3 text-sm text-slate-300" role="status">
                  {sending ? 'Sending… ' : 'Done: '}
                  {progress.sent.toLocaleString()} sent
                  {progress.failed ? `, ${progress.failed.toLocaleString()} failed` : ''}
                  {progress.remaining ? `, ${progress.remaining.toLocaleString()} remaining` : ''}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('preview')} disabled={busy}>Back</Button>
                <Button variant="outline" onClick={handleSaveDraft} disabled={busy} className="gap-2">
                  {saving && !sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save draft
                </Button>
                <Button onClick={handleSendNow} disabled={busy || listPending} className="flex-1 gap-2">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send now
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FieldButtons({ onInsert }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {MERGE_FIELDS.map(f => (
        <button
          key={f.key}
          type="button"
          onClick={() => onInsert(f.key)}
          className="rounded border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[11px] text-slate-400 hover:border-cyan-500/40 hover:text-cyan-400"
        >
          + {f.label}
        </button>
      ))}
    </div>
  );
}
