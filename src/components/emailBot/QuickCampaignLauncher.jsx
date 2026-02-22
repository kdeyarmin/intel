import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Send, Loader2, Mail, Users, Calendar } from 'lucide-react';
import { toast } from 'sonner';

export default function QuickCampaignLauncher({ selectedProviders = [], open, onOpenChange }) {
  const [step, setStep] = useState('setup');
  const [loading, setLoading] = useState(false);
  const [campaign, setCampaign] = useState({
    name: '',
    subject_template: '',
    body_template: '',
    ai_personalization: true,
    schedule_send: false,
    scheduled_at: '',
  });

  const eligibleProviders = selectedProviders.filter(p => p.email && p.email_validation_status !== 'invalid');

  const handleCreate = async () => {
    if (!campaign.name || !campaign.subject_template || !campaign.body_template) {
      toast.error('Please fill in all required fields');
      return;
    }
    setLoading(true);

    const newCampaign = await base44.entities.OutreachCampaign.create({
      name: campaign.name,
      subject_template: campaign.subject_template,
      body_template: campaign.body_template,
      status: 'draft',
      total_recipients: eligibleProviders.length,
      source_criteria: 'custom',
    });

    // Create outreach messages for each provider
    const messages = eligibleProviders.map(p => ({
      campaign_id: newCampaign.id,
      npi: p.npi,
      recipient_email: p.email,
      recipient_name: p.entity_type === 'Individual'
        ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
        : p.organization_name || p.npi,
      status: 'pending',
    }));

    if (messages.length > 0) {
      await base44.entities.OutreachMessage.bulkCreate(messages);
    }

    toast.success(`Campaign "${campaign.name}" created with ${eligibleProviders.length} recipients`);
    setLoading(false);
    setStep('done');
  };

  const handleSend = async (campaignId) => {
    setLoading(true);
    await base44.functions.invoke('sendCampaignMessages', {
      campaign_id: campaignId,
      batch_size: 50,
      send_now: true,
    });
    toast.success('Campaign is being sent!');
    setLoading(false);
    onOpenChange(false);
    resetForm();
  };

  const resetForm = () => {
    setStep('setup');
    setCampaign({ name: '', subject_template: '', body_template: '', ai_personalization: true, schedule_send: false, scheduled_at: '' });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto bg-[#0f1729] border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-200">
            <Mail className="w-5 h-5 text-cyan-400" />
            Quick Email Campaign
          </DialogTitle>
        </DialogHeader>

        {step === 'setup' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <Users className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-slate-300">
                {eligibleProviders.length} eligible recipients
              </span>
              {selectedProviders.length !== eligibleProviders.length && (
                <Badge className="bg-amber-500/15 text-amber-400 text-[9px] border border-amber-500/20">
                  {selectedProviders.length - eligibleProviders.length} excluded (no email / invalid)
                </Badge>
              )}
            </div>

            <div>
              <Label className="text-xs text-slate-400">Campaign Name *</Label>
              <Input
                placeholder="e.g., Provider Outreach - February 2026"
                value={campaign.name}
                onChange={(e) => setCampaign({ ...campaign, name: e.target.value })}
                className="mt-1 bg-slate-800/50 border-slate-700 text-slate-200"
              />
            </div>

            <div>
              <Label className="text-xs text-slate-400">Subject Line *</Label>
              <Input
                placeholder="Hello {{first_name}}, partnership opportunity"
                value={campaign.subject_template}
                onChange={(e) => setCampaign({ ...campaign, subject_template: e.target.value })}
                className="mt-1 bg-slate-800/50 border-slate-700 text-slate-200 font-mono text-xs"
              />
              <p className="text-[10px] text-slate-600 mt-1">Variables: {'{{provider_name}}, {{first_name}}, {{specialty}}, {{location_city}}'}</p>
            </div>

            <div>
              <Label className="text-xs text-slate-400">Message Body *</Label>
              <Textarea
                placeholder={"Dear {{first_name}},\n\nWe recognize your expertise in {{specialty}}..."}
                value={campaign.body_template}
                onChange={(e) => setCampaign({ ...campaign, body_template: e.target.value })}
                className="mt-1 h-32 bg-slate-800/50 border-slate-700 text-slate-200 font-mono text-xs"
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
              <div>
                <Label className="text-xs text-slate-300">AI Personalization</Label>
                <p className="text-[10px] text-slate-500">Customize each message with provider context</p>
              </div>
              <Switch
                checked={campaign.ai_personalization}
                onCheckedChange={(val) => setCampaign({ ...campaign, ai_personalization: val })}
              />
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
              <div>
                <Label className="text-xs text-slate-300">Schedule for Later</Label>
                <p className="text-[10px] text-slate-500">Choose a date/time to send</p>
              </div>
              <Switch
                checked={campaign.schedule_send}
                onCheckedChange={(val) => setCampaign({ ...campaign, schedule_send: val })}
              />
            </div>

            {campaign.schedule_send && (
              <div>
                <Label className="text-xs text-slate-400">Scheduled Date & Time</Label>
                <Input
                  type="datetime-local"
                  value={campaign.scheduled_at}
                  onChange={(e) => setCampaign({ ...campaign, scheduled_at: e.target.value })}
                  className="mt-1 bg-slate-800/50 border-slate-700 text-slate-200"
                />
              </div>
            )}

            <Button onClick={handleCreate} disabled={loading || eligibleProviders.length === 0} className="w-full bg-cyan-600 hover:bg-cyan-700 gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Create Campaign ({eligibleProviders.length} recipients)
            </Button>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center space-y-4 py-4">
            <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Mail className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">Campaign Created!</p>
              <p className="text-xs text-slate-400 mt-1">{eligibleProviders.length} messages queued</p>
            </div>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => onOpenChange(false)} variant="outline" className="border-slate-700 text-slate-300">
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}