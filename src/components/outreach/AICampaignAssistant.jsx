import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, Wand2, BarChart3, Mail, Copy, Check, RefreshCw, Users, ListOrdered } from 'lucide-react';
import { toast } from 'sonner';
import AudienceAnalysisTab from './AudienceAnalysisTab';
import FollowUpSequenceTab from './FollowUpSequenceTab';

const TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'warm', label: 'Warm & Personal' },
  { value: 'concise', label: 'Concise & Direct' },
  { value: 'consultative', label: 'Consultative' },
  { value: 'data-driven', label: 'Data-Driven' },
];

const GOALS = [
  { value: 'partnership', label: 'Propose Partnership' },
  { value: 'referral', label: 'Grow Referrals' },
  { value: 'introduction', label: 'Introduce Services' },
  { value: 'follow_up', label: 'Follow-Up / Re-engage' },
  { value: 'event', label: 'Event Invitation' },
];

export default function AICampaignAssistant({
  onApplyName,
  onApplyDescription,
  onApplySubject,
  onApplyBody,
  targetConfig,
  campaigns = [],
  providers = [],
  scores = [],
  referrals = [],
  locations = [],
  taxonomies = [],
}) {
  const [tab, setTab] = useState('naming');
  const [tone, setTone] = useState('professional');
  const [goal, setGoal] = useState('partnership');
  const [audience, setAudience] = useState('');
  const [loading, setLoading] = useState(false);
  const [nameResults, setNameResults] = useState(null);
  const [templateResults, setTemplateResults] = useState(null);
  const [predictionResults, setPredictionResults] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  const targetSummary = targetConfig
    ? targetConfig.source === 'lead_list' ? 'Lead list providers' : `${targetConfig.npis?.length || 0} providers (${targetConfig.source})`
    : 'No target list selected';

  const copy = (val, field) => {
    navigator.clipboard.writeText(val);
    setCopiedField(field);
    toast.success('Copied');
    setTimeout(() => setCopiedField(null), 1500);
  };

  const generateNames = async () => {
    setLoading(true);
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Generate 5 creative and professional campaign names and descriptions for a healthcare provider outreach campaign.

Campaign Goal: ${GOALS.find(g => g.value === goal)?.label || goal}
Target Audience: ${audience || targetSummary}
Tone: ${TONES.find(t => t.value === tone)?.label || tone}

Each name should be catchy but professional. Each description should be 1-2 sentences explaining the campaign purpose and expected outcome.

Consider that this is a healthcare B2B outreach context for a company called CareMetric reaching out to physicians, hospitals, and post-acute care providers.`,
      response_json_schema: {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                why: { type: "string" }
              }
            }
          }
        }
      }
    });
    setNameResults(res);
    setLoading(false);
  };

  const generateTemplates = async () => {
    setLoading(true);
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Create 3 email template variations for a healthcare provider outreach campaign.

Campaign Goal: ${GOALS.find(g => g.value === goal)?.label || goal}
Target Audience: ${audience || targetSummary}
Tone: ${TONES.find(t => t.value === tone)?.label || tone}

IMPORTANT: Use these merge fields in the templates:
- {{provider_name}} - recipient's full name
- {{specialty}} - their medical specialty
- {{city}}, {{state}} - their practice location
- {{score}} - their CareMetric fit score (0-100)
- {{referral_volume}} - their total referral count
- {{organization}} - their organization name

Each variation should have a different approach (e.g., one data-focused, one relationship-focused, one value-proposition focused).

For each template provide:
1. A compelling subject line using merge fields
2. A complete email body using merge fields
3. A label for the approach style

Keep emails concise (under 200 words per body). Make them feel personal, not mass-mailed.`,
      response_json_schema: {
        type: "object",
        properties: {
          templates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                subject: { type: "string" },
                body: { type: "string" },
                approach: { type: "string" },
              }
            }
          },
          tips: { type: "array", items: { type: "string" } }
        }
      }
    });
    setTemplateResults(res);
    setLoading(false);
  };

  const predictPerformance = async () => {
    setLoading(true);

    const historicalData = campaigns.filter(c => c.sent_count > 0).map(c => ({
      name: c.name,
      sent: c.sent_count,
      opened: c.opened_count,
      responded: c.responded_count,
      bounced: c.bounced_count,
      source: c.source_criteria,
      openRate: c.sent_count > 0 ? Math.round((c.opened_count / c.sent_count) * 100) : 0,
      responseRate: c.sent_count > 0 ? Math.round((c.responded_count / c.sent_count) * 100) : 0,
    }));

    const targetProvCount = targetConfig?.npis?.length || 0;
    const avgScore = targetConfig?.npis
      ? scores.filter(s => targetConfig.npis.includes(s.npi)).reduce((a, s) => a + (s.score || 0), 0) / (targetProvCount || 1)
      : 0;
    const avgRefVol = targetConfig?.npis
      ? referrals.filter(r => targetConfig.npis.includes(r.npi)).reduce((a, r) => a + (r.total_referrals || 0), 0) / (targetProvCount || 1)
      : 0;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Predict the performance of a new outreach campaign based on historical data and target list characteristics.

HISTORICAL CAMPAIGN DATA:
${historicalData.length > 0 ? JSON.stringify(historicalData, null, 2) : 'No historical campaigns yet.'}

NEW CAMPAIGN:
- Goal: ${GOALS.find(g => g.value === goal)?.label || goal}
- Tone: ${TONES.find(t => t.value === tone)?.label || tone}
- Target audience: ${audience || targetSummary}
- Target list size: ${targetProvCount || 'Unknown'}
- Avg CareMetric fit score of targets: ${Math.round(avgScore) || 'Unknown'}
- Avg referral volume of targets: ${Math.round(avgRefVol) || 'Unknown'}
- Source criteria: ${targetConfig?.source || 'Unknown'}

Provide realistic predictions with reasoning. If no historical data exists, use healthcare B2B email benchmarks (typically 20-30% open rate, 2-8% response rate).`,
      response_json_schema: {
        type: "object",
        properties: {
          predicted_open_rate: { type: "number" },
          predicted_response_rate: { type: "number" },
          predicted_bounce_rate: { type: "number" },
          confidence_level: { type: "string", enum: ["high", "medium", "low"] },
          estimated_responses: { type: "number" },
          factors: {
            type: "array",
            items: {
              type: "object",
              properties: {
                factor: { type: "string" },
                impact: { type: "string", enum: ["positive", "negative", "neutral"] },
                explanation: { type: "string" }
              }
            }
          },
          recommendations: { type: "array", items: { type: "string" } },
          best_send_time: { type: "string" },
          overall_assessment: { type: "string" }
        }
      }
    });
    setPredictionResults(res);
    setLoading(false);
  };

  return (
    <Card className="border-violet-200 bg-gradient-to-b from-violet-50/50 to-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          AI Campaign Assistant
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Shared Controls */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-[10px]">Goal</Label>
            <Select value={goal} onValueChange={setGoal}>
              <SelectTrigger className="h-7 text-[10px] mt-0.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {GOALS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="h-7 text-[10px] mt-0.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TONES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px]">Audience</Label>
            <Input value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g., cardiologists in PA" className="h-7 text-[10px] mt-0.5" />
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="bg-violet-100/60 h-7">
            <TabsTrigger value="naming" className="text-[10px] h-6 gap-1"><Wand2 className="w-3 h-3" /> Names</TabsTrigger>
            <TabsTrigger value="templates" className="text-[10px] h-6 gap-1"><Mail className="w-3 h-3" /> Templates</TabsTrigger>
            <TabsTrigger value="predict" className="text-[10px] h-6 gap-1"><BarChart3 className="w-3 h-3" /> Predict</TabsTrigger>
            <TabsTrigger value="audience" className="text-[10px] h-6 gap-1"><Users className="w-3 h-3" /> Audience</TabsTrigger>
            <TabsTrigger value="sequence" className="text-[10px] h-6 gap-1"><ListOrdered className="w-3 h-3" /> Sequence</TabsTrigger>
          </TabsList>

          <TabsContent value="naming" className="mt-2">
            <NamingTab
              loading={loading}
              results={nameResults}
              onGenerate={generateNames}
              onApplyName={onApplyName}
              onApplyDescription={onApplyDescription}
              copiedField={copiedField}
              copy={copy}
            />
          </TabsContent>
          <TabsContent value="templates" className="mt-2">
            <TemplatesTab
              loading={loading}
              results={templateResults}
              onGenerate={generateTemplates}
              onApplySubject={onApplySubject}
              onApplyBody={onApplyBody}
            />
          </TabsContent>
          <TabsContent value="predict" className="mt-2">
            <PredictTab
              loading={loading}
              results={predictionResults}
              onGenerate={predictPerformance}
              targetConfig={targetConfig}
            />
          </TabsContent>
          <TabsContent value="audience" className="mt-2">
            <AudienceAnalysisTab
              loading={loading}
              targetConfig={targetConfig}
              providers={providers}
              locations={locations}
              taxonomies={taxonomies}
              scores={scores}
              referrals={referrals}
            />
          </TabsContent>
          <TabsContent value="sequence" className="mt-2">
            <FollowUpSequenceTab
              loading={loading}
              tone={tone}
              goal={goal}
              audience={audience}
              targetConfig={targetConfig}
              onApplySubject={onApplySubject}
              onApplyBody={onApplyBody}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function NamingTab({ loading, results, onGenerate, onApplyName, onApplyDescription, copiedField, copy }) {
  return (
    <div className="space-y-2">
      <Button size="sm" onClick={onGenerate} disabled={loading} className="w-full bg-violet-600 hover:bg-violet-700 h-7 text-xs gap-1">
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
        {loading ? 'Generating...' : 'Generate Campaign Names'}
      </Button>
      {results?.suggestions?.map((s, i) => (
        <div key={i} className="bg-white rounded-lg border p-2.5 hover:border-violet-300 transition-colors">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800">{s.name}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{s.description}</p>
            </div>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] text-violet-600 hover:bg-violet-50 shrink-0 ml-2"
              onClick={() => { onApplyName(s.name); onApplyDescription(s.description); toast.success('Applied'); }}>
              Apply
            </Button>
          </div>
          {s.why && <p className="text-[9px] text-slate-400 mt-1 italic">{s.why}</p>}
        </div>
      ))}
    </div>
  );
}

function TemplatesTab({ loading, results, onGenerate, onApplySubject, onApplyBody }) {
  return (
    <div className="space-y-2">
      <Button size="sm" onClick={onGenerate} disabled={loading} className="w-full bg-violet-600 hover:bg-violet-700 h-7 text-xs gap-1">
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
        {loading ? 'Generating...' : 'Generate Email Templates'}
      </Button>
      {results?.templates?.map((t, i) => (
        <div key={i} className="bg-white rounded-lg border p-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <Badge variant="outline" className="text-[9px]">{t.label}</Badge>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] text-violet-600 hover:bg-violet-50"
              onClick={() => { onApplySubject(t.subject); onApplyBody(t.body); toast.success('Template applied'); }}>
              Use This
            </Button>
          </div>
          <p className="text-[10px] font-medium text-slate-700 mb-1">Subject: {t.subject}</p>
          <p className="text-[10px] text-slate-500 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">{t.body}</p>
          {t.approach && <p className="text-[9px] text-violet-400 mt-1 italic">{t.approach}</p>}
        </div>
      ))}
      {results?.tips?.length > 0 && (
        <div className="bg-amber-50 rounded-lg p-2 border border-amber-100">
          <p className="text-[10px] font-medium text-amber-700 mb-1">💡 Tips</p>
          {results.tips.map((tip, i) => (
            <p key={i} className="text-[9px] text-amber-600">• {tip}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function PredictTab({ loading, results, onGenerate, targetConfig }) {
  const impactColors = { positive: 'bg-green-100 text-green-700', negative: 'bg-red-100 text-red-700', neutral: 'bg-slate-100 text-slate-600' };
  const confColors = { high: 'bg-green-100 text-green-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-red-100 text-red-700' };

  return (
    <div className="space-y-2">
      <Button size="sm" onClick={onGenerate} disabled={loading || !targetConfig} className="w-full bg-violet-600 hover:bg-violet-700 h-7 text-xs gap-1">
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <BarChart3 className="w-3 h-3" />}
        {loading ? 'Predicting...' : 'Predict Performance'}
      </Button>
      {!targetConfig && <p className="text-[10px] text-slate-400 text-center">Build a target list first to enable predictions</p>}
      {results && (
        <div className="space-y-2">
          {/* Predicted KPIs */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-blue-50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-blue-700">{results.predicted_open_rate || 0}%</p>
              <p className="text-[9px] text-blue-500">Open Rate</p>
            </div>
            <div className="bg-violet-50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-violet-700">{results.predicted_response_rate || 0}%</p>
              <p className="text-[9px] text-violet-500">Response Rate</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-emerald-700">{results.estimated_responses || 0}</p>
              <p className="text-[9px] text-emerald-500">Est. Responses</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge className={`text-[9px] ${confColors[results.confidence_level] || confColors.medium}`}>
              Confidence: {results.confidence_level}
            </Badge>
            {results.best_send_time && (
              <Badge variant="outline" className="text-[9px]">Best time: {results.best_send_time}</Badge>
            )}
          </div>

          {results.overall_assessment && (
            <p className="text-[10px] text-slate-600 bg-slate-50 rounded-lg px-2.5 py-2 leading-relaxed">{results.overall_assessment}</p>
          )}

          {/* Impact factors */}
          {results.factors?.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-slate-400 uppercase mb-1">Impact Factors</p>
              {results.factors.map((f, i) => (
                <div key={i} className="flex items-start gap-2 mb-1">
                  <Badge className={`text-[8px] shrink-0 mt-0.5 ${impactColors[f.impact]}`}>{f.impact}</Badge>
                  <div>
                    <p className="text-[10px] font-medium text-slate-700">{f.factor}</p>
                    <p className="text-[9px] text-slate-400">{f.explanation}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {results.recommendations?.length > 0 && (
            <div className="bg-violet-50 rounded-lg p-2 border border-violet-100">
              <p className="text-[10px] font-medium text-violet-700 mb-1">Recommendations</p>
              {results.recommendations.map((r, i) => (
                <p key={i} className="text-[9px] text-violet-600">• {r}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}