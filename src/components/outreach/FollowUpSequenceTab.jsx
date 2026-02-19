import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ListOrdered, ArrowRight, Clock, Mail, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

const SEQUENCE_TYPES = [
  { value: 'gentle_nurture', label: 'Gentle Nurture (3 emails, 7-day gaps)' },
  { value: 'aggressive', label: 'Aggressive (5 emails, 3-day gaps)' },
  { value: 're_engage', label: 'Re-Engagement (3 emails for cold leads)' },
  { value: 'value_drip', label: 'Value Drip (4 emails, share insights)' },
  { value: 'custom', label: 'Custom Sequence' },
];

export default function FollowUpSequenceTab({
  loading: externalLoading,
  tone = 'professional',
  goal = 'partnership',
  audience = '',
  targetConfig,
  onApplySubject,
  onApplyBody,
}) {
  const [loading, setLoading] = useState(false);
  const [sequenceType, setSequenceType] = useState('gentle_nurture');
  const [numEmails, setNumEmails] = useState(3);
  const [daysBetween, setDaysBetween] = useState(7);
  const [results, setResults] = useState(null);
  const [expandedEmail, setExpandedEmail] = useState(null);

  const targetSummary = targetConfig
    ? targetConfig.source === 'lead_list' ? 'Lead list providers' : `${targetConfig.npis?.length || 0} providers`
    : 'No target list selected';

  const generate = async () => {
    setLoading(true);

    const seqConfig = SEQUENCE_TYPES.find(s => s.value === sequenceType);
    const emailCount = sequenceType === 'custom' ? numEmails : 
      sequenceType === 'aggressive' ? 5 :
      sequenceType === 'value_drip' ? 4 : 3;
    const gapDays = sequenceType === 'custom' ? daysBetween :
      sequenceType === 'aggressive' ? 3 :
      sequenceType === 'value_drip' ? 5 : 7;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Create a complete follow-up email sequence for a healthcare provider outreach campaign.

SEQUENCE TYPE: ${seqConfig?.label || sequenceType}
NUMBER OF EMAILS: ${emailCount}
DAYS BETWEEN EMAILS: ${gapDays}
CAMPAIGN GOAL: ${goal}
TONE: ${tone}
TARGET AUDIENCE: ${audience || targetSummary}

MERGE FIELDS AVAILABLE:
- {{provider_name}}, {{specialty}}, {{city}}, {{state}}, {{score}}, {{referral_volume}}, {{organization}}, {{npi}}

For each email in the sequence, provide:
1. Subject line (compelling, using merge fields where natural)
2. Full email body (under 150 words, personal feel)
3. The strategic purpose of this specific touchpoint
4. Recommended send day (e.g., "Day 1", "Day 7", etc.)
5. A/B test alternative subject line

Also provide:
- Overall sequence strategy explanation
- Expected cumulative response rate
- Recommended stop conditions (when to remove someone from the sequence)

Context: CareMetric is a healthcare analytics company. Emails should feel authentic and provide value, not just ask for meetings.`,
      response_json_schema: {
        type: "object",
        properties: {
          sequence_name: { type: "string" },
          strategy: { type: "string" },
          expected_cumulative_response_rate: { type: "string" },
          stop_conditions: { type: "array", items: { type: "string" } },
          emails: {
            type: "array",
            items: {
              type: "object",
              properties: {
                email_number: { type: "integer" },
                send_day: { type: "string" },
                purpose: { type: "string" },
                subject: { type: "string" },
                subject_alt: { type: "string" },
                body: { type: "string" }
              }
            }
          }
        }
      }
    });

    setResults(res);
    setExpandedEmail(0);
    setLoading(false);
  };

  const isLoading = loading || externalLoading;

  return (
    <div className="space-y-2">
      {/* Config */}
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <Label className="text-[10px]">Sequence Type</Label>
          <Select value={sequenceType} onValueChange={setSequenceType}>
            <SelectTrigger className="h-7 text-[10px] mt-0.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEQUENCE_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {sequenceType === 'custom' && (
          <>
            <div>
              <Label className="text-[10px]"># Emails</Label>
              <Input type="number" min={2} max={7} value={numEmails} onChange={(e) => setNumEmails(Number(e.target.value))}
                className="h-7 text-[10px] mt-0.5" />
            </div>
            <div>
              <Label className="text-[10px]">Days Between</Label>
              <Input type="number" min={1} max={30} value={daysBetween} onChange={(e) => setDaysBetween(Number(e.target.value))}
                className="h-7 text-[10px] mt-0.5" />
            </div>
          </>
        )}
      </div>

      <Button size="sm" onClick={generate} disabled={isLoading}
        className="w-full bg-violet-600 hover:bg-violet-700 h-7 text-xs gap-1">
        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ListOrdered className="w-3 h-3" />}
        {isLoading ? 'Generating...' : 'Generate Follow-Up Sequence'}
      </Button>

      {results && (
        <div className="space-y-2">
          {/* Strategy */}
          <div className="bg-violet-50 rounded-lg p-2 border border-violet-100">
            <p className="text-[10px] font-semibold text-violet-800">{results.sequence_name}</p>
            <p className="text-[9px] text-violet-600 mt-0.5 leading-relaxed">{results.strategy}</p>
            {results.expected_cumulative_response_rate && (
              <Badge className="bg-violet-200 text-violet-800 text-[8px] mt-1">
                Expected response: {results.expected_cumulative_response_rate}
              </Badge>
            )}
          </div>

          {/* Timeline */}
          <div className="relative pl-4">
            <div className="absolute left-1.5 top-0 bottom-0 w-px bg-violet-200" />
            {results.emails?.map((email, i) => {
              const isExpanded = expandedEmail === i;
              return (
                <div key={i} className="relative mb-2">
                  <div className="absolute -left-[14px] top-1 w-3 h-3 rounded-full bg-violet-500 border-2 border-white" />
                  <div
                    className="bg-white border rounded-lg p-2 cursor-pointer hover:border-violet-300 transition-colors"
                    onClick={() => setExpandedEmail(isExpanded ? null : i)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-slate-100 text-slate-600 text-[8px]">
                          <Clock className="w-2.5 h-2.5 mr-0.5" />{email.send_day}
                        </Badge>
                        <p className="text-[10px] font-medium text-slate-800">Email {email.email_number}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm" variant="ghost"
                          className="h-5 text-[9px] text-violet-600 hover:bg-violet-50 px-1.5"
                          onClick={(e) => { e.stopPropagation(); onApplySubject(email.subject); onApplyBody(email.body); toast.success(`Email ${email.email_number} applied`); }}
                        >
                          Use
                        </Button>
                        {isExpanded ? <ChevronUp className="w-3 h-3 text-slate-400" /> : <ChevronDown className="w-3 h-3 text-slate-400" />}
                      </div>
                    </div>

                    <p className="text-[9px] text-slate-500 mt-0.5 italic">{email.purpose}</p>

                    {isExpanded && (
                      <div className="mt-2 space-y-1.5">
                        <div>
                          <p className="text-[9px] text-slate-400 font-medium">Subject:</p>
                          <p className="text-[10px] text-slate-700 font-medium">{email.subject}</p>
                        </div>
                        {email.subject_alt && (
                          <div>
                            <p className="text-[9px] text-slate-400 font-medium">A/B Alt:</p>
                            <p className="text-[10px] text-slate-600 italic">{email.subject_alt}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[9px] text-slate-400 font-medium">Body:</p>
                          <p className="text-[10px] text-slate-600 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                            {email.body}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stop conditions */}
          {results.stop_conditions?.length > 0 && (
            <div className="bg-amber-50 rounded-lg p-2 border border-amber-100">
              <p className="text-[10px] font-medium text-amber-700 mb-1">Stop Sequence When:</p>
              {results.stop_conditions.map((c, i) => (
                <p key={i} className="text-[9px] text-amber-600">• {c}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}