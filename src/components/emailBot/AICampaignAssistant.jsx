import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, Copy, Mail, Clock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function AICampaignAssistant({ providers = [], locations = [], taxonomies = [] }) {
  const [tab, setTab] = useState('draft');

  // Draft state
  const [campaignGoal, setCampaignGoal] = useState('partnership');
  const [tone, setTone] = useState('professional');
  const [customContext, setCustomContext] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [drafts, setDrafts] = useState(null);

  // Subject line state
  const [subjectTopic, setSubjectTopic] = useState('');
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [subjectLines, setSubjectLines] = useState(null);

  // Follow-up state
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpPlan, setFollowUpPlan] = useState(null);

  const sampleProviders = providers.filter(p => p.email).slice(0, 5).map(p => {
    const tax = taxonomies.find(t => t.npi === p.npi);
    const loc = locations.find(l => l.npi === p.npi);
    return {
      name: p.entity_type === 'Individual' ? `${p.first_name} ${p.last_name}`.trim() : p.organization_name || '',
      credential: p.credential || '',
      specialty: tax?.taxonomy_description || '',
      city: loc?.city || '',
      state: loc?.state || '',
      entity_type: p.entity_type,
    };
  });

  const goals = {
    partnership: 'Establish a referral partnership or collaboration',
    introduction: 'Introduce our services to the provider',
    event: 'Invite to a healthcare event or webinar',
    followup: 'Follow up on a previous interaction',
    survey: 'Request participation in a survey or study',
  };

  const handleDraftEmails = async () => {
    setDraftLoading(true);
    setDrafts(null);

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare email marketing specialist. Draft personalized outreach emails for healthcare providers.

Campaign Goal: ${goals[campaignGoal]}
Tone: ${tone}
Additional Context: ${customContext || 'None'}

Sample provider profiles:
${JSON.stringify(sampleProviders, null, 1)}

Create 3 different email variations targeting these types of providers. Each email should:
1. Be personalized based on specialty and credentials
2. Reference their specific area of practice
3. Include a clear, compelling call-to-action
4. Be concise (under 200 words)
5. Sound authentic and not spammy
6. Comply with CAN-SPAM requirements

For each variation, provide the subject line, body, and notes on which provider profiles it best fits.`,
      response_json_schema: {
        type: "object",
        properties: {
          email_drafts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                variation_name: { type: "string" },
                subject: { type: "string" },
                body: { type: "string" },
                best_for: { type: "string" },
                personalization_tips: { type: "string" }
              }
            }
          },
          general_tips: { type: "string" }
        }
      }
    });

    setDrafts(res);
    setDraftLoading(false);
  };

  const handleSubjectLines = async () => {
    setSubjectLoading(true);
    setSubjectLines(null);

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an email marketing expert specializing in healthcare outreach. Generate high-performing email subject lines.

Topic/Goal: ${subjectTopic || campaignGoal}
Target Audience: Healthcare providers (${sampleProviders.map(p => p.specialty).filter(Boolean).join(', ') || 'various specialties'})

Generate 10 subject line options optimized for open rates. For each, provide:
1. The subject line text
2. Expected open rate category (high/medium/low)
3. The psychological principle it uses (curiosity, urgency, personalization, value prop, etc.)
4. A/B testing recommendation

Focus on subject lines that are:
- Under 60 characters when possible
- Not spammy or misleading
- Professional yet attention-grabbing
- Relevant to healthcare professionals`,
      response_json_schema: {
        type: "object",
        properties: {
          subject_lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                expected_performance: { type: "string" },
                principle: { type: "string" },
                ab_test_pair: { type: "string" },
                char_count: { type: "number" }
              }
            }
          },
          best_practices: { type: "string" }
        }
      }
    });

    setSubjectLines(res);
    setSubjectLoading(false);
  };

  const handleFollowUp = async () => {
    setFollowUpLoading(true);
    setFollowUpPlan(null);

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an email campaign strategist for healthcare outreach. Design an optimal follow-up email cadence.

Campaign Goal: ${goals[campaignGoal]}
Target: Healthcare providers
Tone: ${tone}

Design a complete follow-up sequence with:
1. Recommended number of follow-up emails
2. Optimal timing between each email
3. Subject line and key message for each touch
4. When to stop following up
5. How to handle different scenarios (opened but no reply, no open, bounced)

Best practices for healthcare provider outreach cadences.`,
      response_json_schema: {
        type: "object",
        properties: {
          cadence: {
            type: "array",
            items: {
              type: "object",
              properties: {
                step: { type: "number" },
                label: { type: "string" },
                days_after_previous: { type: "number" },
                subject: { type: "string" },
                key_message: { type: "string" },
                tone_shift: { type: "string" },
                send_condition: { type: "string" }
              }
            }
          },
          stop_rules: { type: "array", items: { type: "string" } },
          scenario_handling: {
            type: "object",
            properties: {
              opened_no_reply: { type: "string" },
              no_open: { type: "string" },
              bounced: { type: "string" },
              replied_negative: { type: "string" }
            }
          },
          tips: { type: "string" }
        }
      }
    });

    setFollowUpPlan(res);
    setFollowUpLoading(false);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const perfColor = { high: 'bg-green-100 text-green-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-red-100 text-red-700' };

  return (
    <Card className="border-2 border-purple-200 bg-gradient-to-r from-purple-50/30 to-blue-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-600" />
          AI Campaign Assistant
        </CardTitle>
        <CardDescription>Draft emails, optimize subject lines, and plan follow-up cadences</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <Label className="text-xs">Campaign Goal</Label>
            <Select value={campaignGoal} onValueChange={setCampaignGoal}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="partnership">Referral Partnership</SelectItem>
                <SelectItem value="introduction">Service Introduction</SelectItem>
                <SelectItem value="event">Event Invitation</SelectItem>
                <SelectItem value="followup">Follow-Up</SelectItem>
                <SelectItem value="survey">Survey Request</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="formal">Formal</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full grid grid-cols-3 h-8">
            <TabsTrigger value="draft" className="text-xs"><Mail className="w-3 h-3 mr-1" /> Draft Emails</TabsTrigger>
            <TabsTrigger value="subjects" className="text-xs"><Sparkles className="w-3 h-3 mr-1" /> Subject Lines</TabsTrigger>
            <TabsTrigger value="followup" className="text-xs"><Clock className="w-3 h-3 mr-1" /> Follow-Up Plan</TabsTrigger>
          </TabsList>

          {/* Draft Emails Tab */}
          <TabsContent value="draft" className="space-y-3 mt-3">
            <div>
              <Label className="text-xs">Additional Context (optional)</Label>
              <Textarea
                value={customContext}
                onChange={e => setCustomContext(e.target.value)}
                placeholder="e.g., We're a home health agency expanding in the Northeast..."
                className="h-16 text-sm"
              />
            </div>
            <Button onClick={handleDraftEmails} disabled={draftLoading} className="w-full bg-purple-600 hover:bg-purple-700">
              {draftLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Drafting...</> : <><Mail className="w-4 h-4 mr-2" /> Generate Email Drafts</>}
            </Button>

            {drafts && (
              <div className="space-y-3">
                {drafts.general_tips && <p className="text-[10px] text-slate-500 italic">{drafts.general_tips}</p>}
                {drafts.email_drafts?.map((d, i) => (
                  <div key={i} className="p-3 bg-white rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="outline" className="text-[10px]">{d.variation_name}</Badge>
                      <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => copyToClipboard(`Subject: ${d.subject}\n\n${d.body}`)}>
                        <Copy className="w-3 h-3 mr-1" /> Copy
                      </Button>
                    </div>
                    <p className="text-xs font-semibold text-slate-800 mb-1">Subject: {d.subject}</p>
                    <p className="text-xs text-slate-600 whitespace-pre-line mb-2">{d.body}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-blue-50 text-blue-700 text-[9px]">Best for: {d.best_for}</Badge>
                    </div>
                    {d.personalization_tips && <p className="text-[10px] text-slate-400 mt-1">💡 {d.personalization_tips}</p>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Subject Lines Tab */}
          <TabsContent value="subjects" className="space-y-3 mt-3">
            <div>
              <Label className="text-xs">Subject Topic/Focus</Label>
              <Input value={subjectTopic} onChange={e => setSubjectTopic(e.target.value)} placeholder="e.g., home health referrals" className="h-8 text-sm" />
            </div>
            <Button onClick={handleSubjectLines} disabled={subjectLoading} className="w-full bg-purple-600 hover:bg-purple-700">
              {subjectLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : <><Sparkles className="w-4 h-4 mr-2" /> Generate Subject Lines</>}
            </Button>

            {subjectLines && (
              <div className="space-y-2">
                {subjectLines.best_practices && <p className="text-[10px] text-slate-500 italic">{subjectLines.best_practices}</p>}
                {subjectLines.subject_lines?.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-100">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">{s.text}</span>
                        <Badge className={`text-[9px] ${perfColor[s.expected_performance] || perfColor.medium}`}>{s.expected_performance}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-slate-400">{s.principle}</span>
                        <span className="text-[10px] text-slate-300">·</span>
                        <span className="text-[10px] text-slate-400">{s.char_count} chars</span>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 shrink-0" onClick={() => copyToClipboard(s.text)}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Follow-Up Tab */}
          <TabsContent value="followup" className="space-y-3 mt-3">
            <Button onClick={handleFollowUp} disabled={followUpLoading} className="w-full bg-purple-600 hover:bg-purple-700">
              {followUpLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Planning...</> : <><Clock className="w-4 h-4 mr-2" /> Generate Follow-Up Plan</>}
            </Button>

            {followUpPlan && (
              <div className="space-y-3">
                {followUpPlan.tips && <p className="text-[10px] text-slate-500 italic">{followUpPlan.tips}</p>}

                {/* Cadence timeline */}
                <div className="space-y-0">
                  {followUpPlan.cadence?.map((step, i) => (
                    <div key={i} className="relative pl-6 pb-4">
                      <div className="absolute left-2 top-1.5 w-2.5 h-2.5 rounded-full bg-purple-500 border-2 border-white ring-2 ring-purple-100" />
                      {i < (followUpPlan.cadence.length - 1) && <div className="absolute left-[11px] top-4 w-0.5 h-full bg-purple-100" />}
                      <div className="bg-white rounded-lg border border-slate-100 p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className="bg-purple-100 text-purple-700 text-[9px]">Step {step.step}</Badge>
                          <span className="text-[10px] text-slate-400">+{step.days_after_previous} days</span>
                          {step.send_condition && <Badge variant="outline" className="text-[9px]">{step.send_condition}</Badge>}
                        </div>
                        <p className="text-xs font-semibold text-slate-800">{step.subject}</p>
                        <p className="text-xs text-slate-600 mt-0.5">{step.key_message}</p>
                        {step.tone_shift && <p className="text-[10px] text-slate-400 mt-0.5">Tone: {step.tone_shift}</p>}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Stop rules */}
                {followUpPlan.stop_rules?.length > 0 && (
                  <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                    <p className="text-[10px] font-semibold text-red-700 mb-1">🛑 Stop Following Up When:</p>
                    <ul className="space-y-0.5">
                      {followUpPlan.stop_rules.map((r, i) => (
                        <li key={i} className="text-[10px] text-red-600">• {r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Scenario handling */}
                {followUpPlan.scenario_handling && (
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(followUpPlan.scenario_handling).map(([key, val]) => val && (
                      <div key={key} className="bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-600 mb-0.5">{key.replace(/_/g, ' ')}</p>
                        <p className="text-[10px] text-slate-500">{val}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}