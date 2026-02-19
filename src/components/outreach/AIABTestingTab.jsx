import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FlaskConical, Copy, Check, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function AIABTestingTab({ onApplySubject, onApplyBody, campaigns = [], tone, goal }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [baseSubject, setBaseSubject] = useState('');
  const [baseBody, setBaseBody] = useState('');
  const [copiedIdx, setCopiedIdx] = useState(null);

  const generateVariations = async () => {
    setLoading(true);

    const pastSubjects = campaigns.filter(c => c.sent_count > 0).map(c => ({
      subject: c.subject_template,
      openRate: c.sent_count > 0 ? Math.round((c.opened_count / c.sent_count) * 100) : 0,
      responseRate: c.sent_count > 0 ? Math.round((c.responded_count / c.sent_count) * 100) : 0,
    }));

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an A/B testing expert for healthcare B2B email campaigns. Generate test variations for subject lines and email content.

${baseSubject ? `BASE SUBJECT LINE: "${baseSubject}"` : 'No base subject provided - generate fresh options.'}
${baseBody ? `BASE EMAIL BODY: "${baseBody}"` : ''}

CAMPAIGN TONE: ${tone || 'professional'}
CAMPAIGN GOAL: ${goal || 'partnership'}

PAST CAMPAIGN PERFORMANCE (for learning):
${pastSubjects.length > 0 ? JSON.stringify(pastSubjects, null, 2) : 'No historical data yet.'}

Available merge fields: {{provider_name}}, {{specialty}}, {{city}}, {{state}}, {{score}}, {{referral_volume}}, {{organization}}

Generate A/B test plan with:
1. 4 subject line variations using different psychological triggers (curiosity, urgency, personalization, value proposition, social proof, data-driven)
2. For each variation, explain the psychological principle and predict which audience segment it works best for
3. 2 complete email body variations (if base body provided, create variations; if not, create from scratch)
4. Recommended test methodology (split percentages, sample size, duration)
5. Key metrics to track and success criteria`,
      response_json_schema: {
        type: "object",
        properties: {
          subject_variations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                subject: { type: "string" },
                trigger: { type: "string" },
                best_for: { type: "string" },
                predicted_open_lift: { type: "string" }
              }
            }
          },
          body_variations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                body: { type: "string" },
                approach: { type: "string" },
                predicted_response_lift: { type: "string" }
              }
            }
          },
          test_methodology: {
            type: "object",
            properties: {
              recommended_split: { type: "string" },
              minimum_sample_size: { type: "number" },
              test_duration: { type: "string" },
              primary_metric: { type: "string" },
              secondary_metrics: { type: "array", items: { type: "string" } },
              success_criteria: { type: "string" }
            }
          },
          insights_from_history: { type: "string" }
        }
      }
    });
    setResults(res);
    setLoading(false);
  };

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    toast.success('Copied');
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <div>
          <Label className="text-[10px]">Base Subject (optional)</Label>
          <Input value={baseSubject} onChange={(e) => setBaseSubject(e.target.value)}
            placeholder="Enter existing subject to generate variations..."
            className="h-7 text-[10px] mt-0.5" />
        </div>
        <div>
          <Label className="text-[10px]">Base Body (optional)</Label>
          <textarea value={baseBody} onChange={(e) => setBaseBody(e.target.value)}
            placeholder="Enter existing email body to generate variations..."
            className="w-full h-14 text-[10px] rounded-md border px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-violet-400" />
        </div>
      </div>

      <Button size="sm" onClick={generateVariations} disabled={loading} className="w-full bg-violet-600 hover:bg-violet-700 h-7 text-xs gap-1">
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FlaskConical className="w-3 h-3" />}
        {loading ? 'Generating A/B Variations...' : 'Generate A/B Test Variations'}
      </Button>

      {results && (
        <div className="space-y-2.5">
          {/* Historical Insight */}
          {results.insights_from_history && (
            <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
              <p className="text-[10px] font-medium text-blue-700 mb-0.5">📊 Historical Insight</p>
              <p className="text-[9px] text-blue-600">{results.insights_from_history}</p>
            </div>
          )}

          {/* Subject Variations */}
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Subject Line Variations</p>
            {results.subject_variations?.map((v, i) => (
              <div key={i} className="bg-white rounded-lg border p-2 mb-1.5 hover:border-violet-300 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Badge className="bg-violet-100 text-violet-700 text-[8px]">{String.fromCharCode(65 + i)}</Badge>
                    <span className="text-[9px] font-medium text-slate-500">{v.label}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-5 text-[9px] text-slate-400 px-1"
                      onClick={() => handleCopy(v.subject, `s${i}`)}>
                      {copiedIdx === `s${i}` ? <Check className="w-2.5 h-2.5 text-green-500" /> : <Copy className="w-2.5 h-2.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-5 text-[9px] text-violet-600 hover:bg-violet-50 px-1.5"
                      onClick={() => { onApplySubject(v.subject); toast.success('Subject applied'); }}>
                      Use
                    </Button>
                  </div>
                </div>
                <p className="text-[10px] font-medium text-slate-800 mb-1">"{v.subject}"</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[8px]">🧠 {v.trigger}</Badge>
                  <span className="text-[8px] text-slate-400">Best for: {v.best_for}</span>
                  {v.predicted_open_lift && (
                    <Badge className="bg-green-50 text-green-600 text-[8px] border border-green-200">{v.predicted_open_lift}</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Body Variations */}
          {results.body_variations?.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Content Variations</p>
              {results.body_variations.map((v, i) => (
                <div key={i} className="bg-white rounded-lg border p-2 mb-1.5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <Badge className="bg-emerald-100 text-emerald-700 text-[8px]">Body {String.fromCharCode(65 + i)}</Badge>
                      <span className="text-[9px] font-medium text-slate-500">{v.label}</span>
                    </div>
                    <Button size="sm" variant="ghost" className="h-5 text-[9px] text-violet-600 hover:bg-violet-50 px-1.5"
                      onClick={() => { onApplyBody(v.body); toast.success('Body applied'); }}>
                      Use This
                    </Button>
                  </div>
                  <p className="text-[9px] text-slate-600 whitespace-pre-wrap leading-relaxed max-h-20 overflow-y-auto mb-1">{v.body}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] text-slate-400">{v.approach}</span>
                    {v.predicted_response_lift && (
                      <Badge className="bg-green-50 text-green-600 text-[8px] border border-green-200">{v.predicted_response_lift}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Test Methodology */}
          {results.test_methodology && (
            <div className="bg-violet-50 rounded-lg p-2.5 border border-violet-100">
              <p className="text-[10px] font-semibold text-violet-700 mb-1.5">🔬 Test Methodology</p>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <p className="text-[8px] text-violet-400">Split</p>
                  <p className="text-[9px] font-medium text-violet-800">{results.test_methodology.recommended_split}</p>
                </div>
                <div>
                  <p className="text-[8px] text-violet-400">Min Sample</p>
                  <p className="text-[9px] font-medium text-violet-800">{results.test_methodology.minimum_sample_size} per variant</p>
                </div>
                <div>
                  <p className="text-[8px] text-violet-400">Duration</p>
                  <p className="text-[9px] font-medium text-violet-800">{results.test_methodology.test_duration}</p>
                </div>
                <div>
                  <p className="text-[8px] text-violet-400">Primary Metric</p>
                  <p className="text-[9px] font-medium text-violet-800">{results.test_methodology.primary_metric}</p>
                </div>
              </div>
              {results.test_methodology.success_criteria && (
                <p className="text-[9px] text-violet-600 mt-1.5 pt-1.5 border-t border-violet-200">
                  <strong>Success:</strong> {results.test_methodology.success_criteria}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}