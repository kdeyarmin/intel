import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles, Clock, Mail, Eye, MessageSquare, Zap, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const SEQUENCE_STEPS = [
  { id: 1, trigger: 'sent_no_open', delay: '3 days', label: 'Not Opened after 3d', icon: Mail, color: 'text-slate-400' },
  { id: 2, trigger: 'opened_no_reply', delay: '5 days', label: 'Opened, No Reply after 5d', icon: Eye, color: 'text-emerald-400' },
  { id: 3, trigger: 'still_no_reply', delay: '10 days', label: 'Final nudge after 10d', icon: MessageSquare, color: 'text-violet-400' },
];

export default function AutoFollowUpSequencer({ campaign, messages = [], providers = [], onCreateFollowUp }) {
  const [generating, setGenerating] = useState(false);
  const [sequence, setSequence] = useState(null);
  const [enabledSteps, setEnabledSteps] = useState(new Set([1, 2, 3]));

  const segments = useMemo(() => ({
    not_opened: messages.filter(m => m.status === 'sent'),
    opened_no_reply: messages.filter(m => m.status === 'opened'),
    responded: messages.filter(m => m.status === 'responded'),
  }), [messages]);

  const generateSequence = async () => {
    setGenerating(true);
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Create a 3-step automated follow-up email sequence for this healthcare outreach campaign.

ORIGINAL CAMPAIGN: "${campaign.name}"
ORIGINAL SUBJECT: "${campaign.subject_template}"
RESULTS: ${campaign.sent_count} sent, ${campaign.opened_count} opened, ${campaign.responded_count} responded

SEGMENTS:
- Not opened: ${segments.not_opened.length} recipients
- Opened no reply: ${segments.opened_no_reply.length} recipients

Generate 3 follow-up emails:
1. For NOT OPENED (sent 3 days later) - different subject line to improve open rate, brief nudge
2. For OPENED NO REPLY (sent 5 days later) - they showed interest, reference the original, add value
3. FINAL NUDGE (sent 10 days later) - last gentle touch, create urgency or offer something new

Each should feel natural, not pushy. Use {{provider_name}}, {{specialty}}, {{city}}, {{state}} merge fields.
Keep each under 100 words.`,
      response_json_schema: {
        type: "object",
        properties: {
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                step: { type: "number" },
                subject: { type: "string" },
                body: { type: "string" },
                reasoning: { type: "string" }
              }
            }
          },
          best_send_times: {
            type: "object",
            properties: {
              day_of_week: { type: "string" },
              time_of_day: { type: "string" },
              reasoning: { type: "string" }
            }
          }
        }
      }
    });
    setSequence(res);
    setGenerating(false);
  };

  const activateStep = (step) => {
    const stepConfig = SEQUENCE_STEPS.find(s => s.id === step.step);
    if (!stepConfig) return;

    let targetNPIs = [];
    if (step.step === 1) targetNPIs = segments.not_opened.map(m => m.npi);
    else if (step.step === 2) targetNPIs = segments.opened_no_reply.map(m => m.npi);
    else targetNPIs = [...segments.not_opened, ...segments.opened_no_reply].map(m => m.npi);

    onCreateFollowUp({
      segment: stepConfig.trigger,
      subject: step.subject,
      body: step.body,
      recipientNPIs: [...new Set(targetNPIs)],
    });
    toast.success(`Follow-up step ${step.step} campaign created`);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          Automated Follow-Up Sequence
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Sequence timeline */}
        <div className="space-y-2">
          {SEQUENCE_STEPS.map((step, i) => {
            const Icon = step.icon;
            const enabled = enabledSteps.has(step.id);
            const seqStep = sequence?.steps?.find(s => s.step === step.id);
            return (
              <div key={step.id} className={`relative border rounded-lg p-3 transition-all ${enabled ? 'border-slate-200' : 'border-slate-100 opacity-50'}`}>
                {i < SEQUENCE_STEPS.length - 1 && <div className="absolute left-6 top-full w-px h-2 bg-slate-200" />}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center`}>
                      <Icon className={`w-3 h-3 ${step.color}`} />
                    </div>
                    <span className="text-xs font-medium text-slate-700">Step {step.id}: {step.label}</span>
                    <Badge variant="outline" className="text-[9px]"><Clock className="w-2.5 h-2.5 mr-0.5" />{step.delay}</Badge>
                  </div>
                  <Switch checked={enabled} onCheckedChange={() => {
                    setEnabledSteps(prev => { const n = new Set(prev); if (n.has(step.id)) n.delete(step.id); else n.add(step.id); return n; });
                  }} />
                </div>
                {seqStep && enabled && (
                  <div className="ml-8 space-y-1.5 mt-2">
                    <p className="text-[10px] text-slate-700"><span className="font-medium">Subject:</span> {seqStep.subject}</p>
                    <p className="text-[10px] text-slate-500 leading-relaxed max-h-16 overflow-y-auto">{seqStep.body}</p>
                    <p className="text-[9px] text-violet-500 italic">{seqStep.reasoning}</p>
                    <Button size="sm" className="h-6 text-[10px] bg-teal-600 hover:bg-teal-700 gap-1"
                      onClick={() => activateStep(seqStep)}>
                      <CheckCircle2 className="w-3 h-3" /> Activate Step
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {sequence?.best_send_times && (
          <div className="bg-amber-50 rounded-lg p-2 border border-amber-100">
            <p className="text-[10px] font-medium text-amber-700 mb-0.5">Optimal Send Time</p>
            <p className="text-[9px] text-amber-600">{sequence.best_send_times.day_of_week} at {sequence.best_send_times.time_of_day} — {sequence.best_send_times.reasoning}</p>
          </div>
        )}

        <Button size="sm" onClick={generateSequence} disabled={generating} className="w-full bg-amber-600 hover:bg-amber-700 h-8 text-xs gap-1">
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {generating ? 'Generating...' : sequence ? 'Regenerate Sequence' : 'Generate AI Sequence'}
        </Button>
      </CardContent>
    </Card>
  );
}