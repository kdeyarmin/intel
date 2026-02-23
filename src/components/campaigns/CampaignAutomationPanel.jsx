import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Plus, Zap, Mail, Eye, MousePointerClick, AlertTriangle, BrainCircuit, Trash2, Clock, Activity, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export default function CampaignAutomationPanel({ campaign }) {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [newStep, setNewStep] = useState({
    name: '',
    trigger_type: 'time_delay',
    delay_days: 1,
    trigger_status: 'New',
    subject_template: '',
    body_template: '',
    use_ai_personalization: true,
  });

  const { data: steps = [], isLoading: stepsLoading } = useQuery({
    queryKey: ['campaignSequence', campaign.id],
    queryFn: () => base44.entities.CampaignSequenceStep.filter({ campaign_id: campaign.id }, 'step_number'),
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['campaignMessages', campaign.id],
    queryFn: () => base44.entities.OutreachMessage.filter({ campaign_id: campaign.id }, '-sent_at', 50),
  });

  const handleAddStep = async () => {
    if (!newStep.name || !newStep.subject_template || !newStep.body_template) return;
    setSaving(true);
    await base44.entities.CampaignSequenceStep.create({
      ...newStep,
      campaign_id: campaign.id,
      step_number: steps.length + 1,
      delay_days: Number(newStep.delay_days)
    });
    setSaving(false);
    setShowAdd(false);
    setNewStep({ name: '', trigger_type: 'time_delay', delay_days: 1, trigger_status: 'New', subject_template: '', body_template: '', use_ai_personalization: true });
    queryClient.invalidateQueries({ queryKey: ['campaignSequence', campaign.id] });
    toast.success('Sequence step added');
  };

  const handleDeleteStep = async (id) => {
    if(!confirm('Delete this step?')) return;
    await base44.entities.CampaignSequenceStep.delete(id);
    queryClient.invalidateQueries({ queryKey: ['campaignSequence', campaign.id] });
  };

  const toggleStepActive = async (step) => {
    await base44.entities.CampaignSequenceStep.update(step.id, { is_active: !step.is_active });
    queryClient.invalidateQueries({ queryKey: ['campaignSequence', campaign.id] });
  };

  return (
    <div className="space-y-4">
      {/* Sequence Builder */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" /> Drip Sequence & Automation
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">Define auto-emails and AI personalization</CardDescription>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 border-slate-700 hover:bg-slate-800" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="w-3 h-3" /> Add Step
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {/* Add Step Form */}
          {showAdd && (
            <div className="border border-cyan-900/50 bg-slate-800/30 rounded-lg p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[10px] text-slate-400">Step Name</Label>
                  <Input value={newStep.name} onChange={e => setNewStep(p => ({...p, name: e.target.value}))} placeholder="e.g. Initial Outreach" className="h-8 text-xs bg-slate-900/50 border-slate-700 text-slate-200 mt-1" />
                </div>
                <div>
                  <Label className="text-[10px] text-slate-400">Trigger Type</Label>
                  <Select value={newStep.trigger_type} onValueChange={v => setNewStep(p => ({...p, trigger_type: v}))}>
                    <SelectTrigger className="h-8 text-xs bg-slate-900/50 border-slate-700 mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="time_delay">Time Delay (Drip)</SelectItem>
                      <SelectItem value="status_change">Lead Status Change</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {newStep.trigger_type === 'time_delay' ? (
                  <div>
                    <Label className="text-[10px] text-slate-400">Delay (Days after previous step / start)</Label>
                    <Input type="number" value={newStep.delay_days} onChange={e => setNewStep(p => ({...p, delay_days: e.target.value}))} className="h-8 text-xs bg-slate-900/50 border-slate-700 text-slate-200 mt-1" />
                  </div>
                ) : (
                  <div>
                    <Label className="text-[10px] text-slate-400">Trigger on Status</Label>
                    <Select value={newStep.trigger_status} onValueChange={v => setNewStep(p => ({...p, trigger_status: v}))}>
                      <SelectTrigger className="h-8 text-xs bg-slate-900/50 border-slate-700 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="New">New</SelectItem>
                        <SelectItem value="Contacted">Contacted</SelectItem>
                        <SelectItem value="Qualified">Qualified</SelectItem>
                        <SelectItem value="Not a fit">Not a fit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-6">
                  <Switch checked={newStep.use_ai_personalization} onCheckedChange={(c) => setNewStep(p => ({...p, use_ai_personalization: c}))} />
                  <Label className="text-xs text-slate-300 flex items-center gap-1 cursor-pointer">
                    <BrainCircuit className="w-3.5 h-3.5 text-violet-400" /> AI Personalization
                  </Label>
                </div>
              </div>

              <div>
                <Label className="text-[10px] text-slate-400">Subject Template (use {'{{first_name}}'}, {'{{specialty}}'})</Label>
                <Input value={newStep.subject_template} onChange={e => setNewStep(p => ({...p, subject_template: e.target.value}))} placeholder="Question for a {{specialty}} provider in {{state}}" className="h-8 text-xs bg-slate-900/50 border-slate-700 text-slate-200 mt-1" />
              </div>

              <div>
                <Label className="text-[10px] text-slate-400">Body Template</Label>
                <Textarea value={newStep.body_template} onChange={e => setNewStep(p => ({...p, body_template: e.target.value}))} placeholder="Hi Dr. {{last_name}},\n\nI noticed you specialize in {{specialty}}..." rows={4} className="text-xs bg-slate-900/50 border-slate-700 text-slate-200 mt-1" />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button size="sm" onClick={handleAddStep} disabled={saving || !newStep.name || !newStep.subject_template} className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700">
                  {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null} Save Step
                </Button>
              </div>
            </div>
          )}

          {/* List of Steps */}
          {stepsLoading ? (
             <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
          ) : steps.length === 0 ? (
            <div className="text-center py-6">
              <Mail className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No automation steps defined</p>
              <p className="text-xs text-slate-500 mt-1">Add sequence steps to automatically email your leads</p>
            </div>
          ) : (
            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div key={step.id} className={`relative border rounded-lg p-3 transition-colors ${step.is_active ? 'border-slate-700/60 bg-slate-800/20' : 'border-slate-800 bg-slate-900/20 opacity-70'}`}>
                  {idx < steps.length - 1 && <div className="absolute left-6 top-full w-px h-3 bg-slate-700" />}
                  
                  <div className="flex items-start justify-between">
                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300 shrink-0">
                        {step.step_number}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-slate-200">{step.name}</h4>
                          <Badge variant="outline" className="text-[9px] bg-slate-900/50 border-slate-700 text-slate-400">
                            {step.trigger_type === 'time_delay' ? (
                              <><Clock className="w-2.5 h-2.5 mr-1 inline" /> {step.delay_days} days later</>
                            ) : (
                              <><Activity className="w-2.5 h-2.5 mr-1 inline" /> On: {step.trigger_status}</>
                            )}
                          </Badge>
                          {step.use_ai_personalization && (
                            <Badge variant="outline" className="text-[9px] bg-violet-900/20 border-violet-700/50 text-violet-300">
                              <BrainCircuit className="w-2.5 h-2.5 mr-1 inline" /> AI Personalized
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1"><span className="font-semibold">Subj:</span> {step.subject_template}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <Switch checked={step.is_active} onCheckedChange={() => toggleStepActive(step)} />
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-500 hover:text-red-400" onClick={() => handleDeleteStep(step.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </CardContent>
      </Card>

      {/* Outreach Tracking */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" /> Recent Outreach Tracking
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">Live feed of sent emails, opens, and clicks</CardDescription>
        </CardHeader>
        <CardContent>
          {messagesLoading ? (
            <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          ) : messages.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">No outreach messages recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/50 text-slate-400">
                    <th className="text-left py-2 font-medium">Recipient</th>
                    <th className="text-left py-2 font-medium">Subject</th>
                    <th className="text-center py-2 font-medium">Status</th>
                    <th className="text-right py-2 font-medium">Sent At</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map(msg => (
                    <tr key={msg.id} className="border-b border-slate-800/40 text-slate-300">
                      <td className="py-2">
                        <div className="font-medium">{msg.recipient_name || 'Provider'}</div>
                        <div className="text-[10px] text-slate-500">{msg.recipient_email}</div>
                      </td>
                      <td className="py-2 truncate max-w-[200px]">{msg.subject}</td>
                      <td className="py-2 text-center">
                        <StatusBadge status={msg.status} />
                      </td>
                      <td className="py-2 text-right text-slate-400">
                        {msg.sent_at ? new Date(msg.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    pending: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    generated: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
    sent: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    opened: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    clicked: "bg-green-500/15 text-green-400 border-green-500/30",
    responded: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    bounced: "bg-red-500/15 text-red-400 border-red-500/30",
    failed: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  
  const icons = {
    pending: <Clock className="w-2.5 h-2.5 mr-1 inline" />,
    generated: <Sparkles className="w-2.5 h-2.5 mr-1 inline" />,
    sent: <Mail className="w-2.5 h-2.5 mr-1 inline" />,
    opened: <Eye className="w-2.5 h-2.5 mr-1 inline" />,
    clicked: <MousePointerClick className="w-2.5 h-2.5 mr-1 inline" />,
    responded: <MessageSquare className="w-2.5 h-2.5 mr-1 inline" />,
    bounced: <AlertTriangle className="w-2.5 h-2.5 mr-1 inline" />,
    failed: <AlertTriangle className="w-2.5 h-2.5 mr-1 inline" />,
  };

  return (
    <Badge variant="outline" className={`text-[9px] capitalize ${styles[status] || styles.pending}`}>
      {icons[status] || icons.pending}
      {status}
    </Badge>
  );
}