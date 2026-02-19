import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, Mail, Eye, MessageSquare, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

const SEGMENT_LABELS = {
  opened_no_response: { label: 'Opened, No Response', icon: Eye, color: 'text-emerald-600 bg-emerald-50' },
  not_opened: { label: 'Not Opened', icon: Mail, color: 'text-slate-500 bg-slate-50' },
  bounced: { label: 'Bounced (Retry)', icon: Mail, color: 'text-red-500 bg-red-50' },
  all_no_response: { label: 'All Non-Responders', icon: MessageSquare, color: 'text-amber-600 bg-amber-50' },
};

export default function AIFollowUpGenerator({ campaign, messages = [], onApplyFollowUp }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const segments = {
    opened_no_response: messages.filter(m => m.status === 'opened'),
    not_opened: messages.filter(m => m.status === 'sent'),
    bounced: messages.filter(m => m.status === 'bounced' || m.status === 'failed'),
    all_no_response: messages.filter(m => m.status === 'sent' || m.status === 'opened'),
  };

  const generate = async () => {
    setLoading(true);

    const segmentSummary = Object.entries(segments)
      .map(([k, v]) => `${SEGMENT_LABELS[k]?.label}: ${v.length} recipients`)
      .join('\n');

    const sampleRecipients = messages.slice(0, 5).map(m => m.recipient_name || m.npi).join(', ');

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Generate personalized follow-up email templates for different engagement segments of an outreach campaign.

ORIGINAL CAMPAIGN:
- Name: ${campaign.name}
- Subject: ${campaign.subject_template}
- Body preview: ${(campaign.body_template || '').slice(0, 300)}
- Total recipients: ${messages.length}

ENGAGEMENT SEGMENTS:
${segmentSummary}

Sample recipients: ${sampleRecipients}

For EACH segment that has recipients, create a follow-up email that:

1. **Opened but not responded**: Acknowledge they saw the email, add a specific value proposition or case study mention, create mild urgency, suggest a specific next step (call, meeting, demo)
2. **Not opened**: Different subject line approach (question, stat, or personalized hook), shorter body, single clear CTA
3. **Bounced (retry)**: If applicable, suggest an alternative approach or channel
4. **All non-responders**: A general "final touch" follow-up with a compelling reason to engage

Each follow-up should:
- Reference the original outreach naturally (not "I noticed you opened my email")
- Use merge fields: {{provider_name}}, {{specialty}}, {{city}}, {{organization}}, {{score}}
- Be concise (under 120 words per body)
- Include a soft CTA, not aggressive`,
      response_json_schema: {
        type: "object",
        properties: {
          follow_ups: {
            type: "array",
            items: {
              type: "object",
              properties: {
                segment: { type: "string" },
                subject: { type: "string" },
                body: { type: "string" },
                tone: { type: "string" },
                strategy: { type: "string" },
                expected_lift: { type: "string" },
              }
            }
          },
          general_tips: { type: "array", items: { type: "string" } },
          optimal_send_delay: { type: "string" },
        }
      }
    });

    setResults(res);
    setLoading(false);
  };

  return (
    <Card className="border-blue-200 bg-gradient-to-b from-blue-50/30 to-white">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-500" />
          AI Follow-Up Generator
        </CardTitle>
        <Button size="sm" onClick={generate} disabled={loading} className="bg-blue-600 hover:bg-blue-700 h-7 text-xs gap-1">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {loading ? 'Generating...' : 'Generate Follow-Ups'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Segment summary */}
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(segments).map(([key, list]) => {
            const cfg = SEGMENT_LABELS[key];
            const Icon = cfg?.icon || Mail;
            return (
              <div key={key} className={`rounded-lg px-2.5 py-2 ${cfg?.color || 'bg-slate-50'}`}>
                <div className="flex items-center gap-1.5">
                  <Icon className="w-3 h-3" />
                  <span className="text-[10px] font-medium">{cfg?.label}</span>
                </div>
                <p className="text-lg font-bold mt-0.5">{list.length}</p>
              </div>
            );
          })}
        </div>

        {loading && <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-24" />)}</div>}

        {results && (
          <div className="space-y-3">
            {results.follow_ups?.map((fu, i) => {
              const segCfg = SEGMENT_LABELS[fu.segment];
              const count = segments[fu.segment]?.length || 0;
              if (count === 0) return null;
              return (
                <div key={i} className="border rounded-lg p-3 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px]">{segCfg?.label || fu.segment}</Badge>
                      <Badge className="text-[9px] bg-blue-100 text-blue-700">{count} recipients</Badge>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] text-blue-600 hover:bg-blue-50 gap-1"
                      onClick={() => {
                        onApplyFollowUp({
                          segment: fu.segment,
                          subject: fu.subject,
                          body: fu.body,
                          recipientNPIs: segments[fu.segment]?.map(m => m.npi) || [],
                        });
                        toast.success(`Follow-up queued for ${count} recipients`);
                      }}>
                      <ArrowRight className="w-3 h-3" /> Apply
                    </Button>
                  </div>
                  <p className="text-[10px] font-medium text-slate-700 mb-0.5">Subject: {fu.subject}</p>
                  <p className="text-[10px] text-slate-500 whitespace-pre-wrap leading-relaxed max-h-20 overflow-y-auto">{fu.body}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {fu.tone && <Badge variant="outline" className="text-[8px]">Tone: {fu.tone}</Badge>}
                    {fu.expected_lift && <Badge variant="outline" className="text-[8px]">Expected lift: {fu.expected_lift}</Badge>}
                  </div>
                  {fu.strategy && <p className="text-[9px] text-blue-400 mt-1 italic">Strategy: {fu.strategy}</p>}
                </div>
              );
            })}

            {results.optimal_send_delay && (
              <p className="text-[10px] text-slate-500">⏰ Optimal send delay: {results.optimal_send_delay}</p>
            )}

            {results.general_tips?.length > 0 && (
              <div className="bg-amber-50 rounded-lg p-2 border border-amber-100">
                <p className="text-[10px] font-medium text-amber-700 mb-1">💡 Follow-Up Tips</p>
                {results.general_tips.map((t, i) => <p key={i} className="text-[9px] text-amber-600">• {t}</p>)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}