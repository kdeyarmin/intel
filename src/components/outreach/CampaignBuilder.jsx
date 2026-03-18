import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Loader2, Send } from 'lucide-react';

export default function CampaignBuilder({ onCampaignCreated, initialCampaign = null }) {
  const [step, setStep] = useState('details');
  const [loading, setLoading] = useState(false);
  const [campaign, setCampaign] = useState(initialCampaign || {
    name: '',
    description: '',
    lead_list_id: '',
    subject_template: '',
    body_template: '',
    ai_personalization: true,
    schedule_send: false,
    scheduled_at: ''
  });

  const [leadLists, setLeadLists] = useState([]);
  const [preview, setPreview] = useState(null);

  React.useEffect(() => {
    fetchLeadLists();
  }, []);

  const fetchLeadLists = async () => {
    try {
      const lists = await base44.entities.LeadList.list('-created_date', 50);
      setLeadLists(lists);
    } catch (error) {
      console.error('Failed to fetch lead lists:', error);
    }
  };

  const handleCreate = async () => {
    if (!campaign.name || !campaign.subject_template || !campaign.body_template) {
      alert('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const newCampaign = await base44.entities.OutreachCampaign.create({
        name: campaign.name,
        description: campaign.description,
        lead_list_id: campaign.lead_list_id,
        subject_template: campaign.subject_template,
        body_template: campaign.body_template,
        status: 'draft',
        source_criteria: campaign.lead_list_id ? 'lead_list' : 'custom'
      });

      onCampaignCreated?.(newCampaign);
      setCampaign({
        name: '',
        description: '',
        lead_list_id: '',
        subject_template: '',
        body_template: '',
        ai_personalization: true,
        schedule_send: false,
        scheduled_at: ''
      });
      setStep('details');
    } catch (error) {
      alert('Failed to create campaign: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (sendNow = false) => {
    if (!campaign.id) {
      alert('Campaign must be saved first');
      return;
    }

    setLoading(true);
    try {
      const result = await base44.functions.invoke('sendCampaignMessages', {
        campaign_id: campaign.id,
        batch_size: 50,
        send_now: sendNow
      });

      alert(`Campaign ready! ${result.data.results.messages_created} messages created.`);
      onCampaignCreated?.(campaign);
    } catch (error) {
      alert('Failed to send campaign: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Tabs value={step} onValueChange={setStep} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="template">Template</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="send">Send</TabsTrigger>
        </TabsList>

        {/* Step 1: Campaign Details */}
        <TabsContent value="details" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campaign Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Campaign Name *</Label>
                <Input
                  placeholder="e.g., Q1 2024 Network Expansion"
                  value={campaign.name}
                  onChange={(e) => setCampaign({ ...campaign, name: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">Description</Label>
                <Textarea
                  placeholder="What is the goal of this campaign?"
                  value={campaign.description}
                  onChange={(e) => setCampaign({ ...campaign, description: e.target.value })}
                  className="mt-1 h-20"
                />
              </div>

              <div>
                <Label className="text-sm font-medium">Target Provider List *</Label>
                <Select value={campaign.lead_list_id} onValueChange={(val) => setCampaign({ ...campaign, lead_list_id: val })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a lead list" />
                  </SelectTrigger>
                  <SelectContent>
                    {leadLists.map(list => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name} ({list.provider_count || 0} providers)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded border">
                <div>
                  <Label className="text-sm font-medium">AI Personalization</Label>
                  <p className="text-xs text-slate-600 mt-0.5">Personalize each message based on provider profile</p>
                </div>
                <Switch
                  checked={campaign.ai_personalization}
                  onCheckedChange={(val) => setCampaign({ ...campaign, ai_personalization: val })}
                />
              </div>

              <Button onClick={() => setStep('template')} className="w-full">
                Next: Create Template
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Step 2: Message Template */}
        <TabsContent value="template" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email Template</CardTitle>
              <p className="text-xs text-slate-600 mt-1">Use {{merge_fields}} for personalization</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Subject Line *</Label>
                <Input
                  placeholder="Hello {{first_name}}, we'd like to discuss..."
                  value={campaign.subject_template}
                  onChange={(e) => setCampaign({ ...campaign, subject_template: e.target.value })}
                  className="mt-1 font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-2">Available: {{provider_name}}, {{first_name}}, {{specialty}}, {{location_city}}, {{location_state}}</p>
              </div>

              <div>
                <Label className="text-sm font-medium">Message Body *</Label>
                <Textarea
                  placeholder="Dear {{first_name}},\n\nWe recognize your expertise in {{specialty}}..."
                  value={campaign.body_template}
                  onChange={(e) => setCampaign({ ...campaign, body_template: e.target.value })}
                  className="mt-1 h-40 font-mono text-sm"
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('details')}>Back</Button>
                <Button onClick={() => setStep('preview')} className="flex-1">Next: Preview</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Step 3: Preview */}
        <TabsContent value="preview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Message Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-slate-50 rounded border">
                <div className="mb-3">
                  <p className="text-xs text-slate-600">Subject:</p>
                  <p className="font-semibold text-sm">{campaign.subject_template || 'No subject'}</p>
                </div>
                <div className="border-t pt-3">
                  <p className="text-xs text-slate-600 mb-2">Body:</p>
                  <div className="text-sm whitespace-pre-wrap text-slate-700">{campaign.body_template || 'No body'}</div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-sm text-blue-900">
                  💡 Each message will be personalized with provider data (name, specialty, location, etc.)
                  {campaign.ai_personalization && ' and enhanced with AI.'}
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('template')}>Back</Button>
                <Button onClick={() => setStep('send')} className="flex-1">Ready to Send</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Step 4: Send */}
        <TabsContent value="send" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Launch Campaign</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded">
                <p className="text-sm text-amber-900 font-medium mb-2">Campaign Summary</p>
                <div className="space-y-1 text-sm text-amber-800">
                  <p>• Name: <strong>{campaign.name}</strong></p>
                  <p>• Target List: <strong>{campaign.lead_list_id ? 'Selected' : 'None'}</strong></p>
                  <p>• Personalization: <strong>{campaign.ai_personalization ? 'Enabled' : 'Disabled'}</strong></p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setStep('preview')}
                >
                  Back
                </Button>
                <Button 
                  onClick={() => handleSend(true)}
                  disabled={loading}
                  className="flex-1 gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send Now
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}