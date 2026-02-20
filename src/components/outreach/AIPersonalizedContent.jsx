import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Mail, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function AIPersonalizedContent({
  targetConfig, providers = [], scores = [], referrals = [],
  locations = [], taxonomies = [],
  onApplySubject, onApplyBody
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  if (!targetConfig?.npis?.length && targetConfig?.source !== 'lead_list') return null;

  const generate = async () => {
    setLoading(true);

    // Build representative provider profiles
    const provMap = {};
    providers.forEach(p => { provMap[p.npi] = p; });
    const scoreMap = {};
    scores.forEach(s => { scoreMap[s.npi] = s; });
    const locMap = {};
    locations.forEach(l => { if (l.is_primary) locMap[l.npi] = l; });
    const taxMap = {};
    taxonomies.forEach(t => { if (t.primary_flag) taxMap[t.npi] = t; });
    const refMap = {};
    referrals.forEach(r => { refMap[r.npi] = r; });

    const sampleNPIs = (targetConfig.npis || []).slice(0, 5);
    const profiles = sampleNPIs.map(npi => {
      const p = provMap[npi];
      if (!p) return null;
      return {
        name: p.entity_type === 'Individual' ? `${p.first_name} ${p.last_name}` : p.organization_name,
        specialty: taxMap[npi]?.taxonomy_description,
        city: locMap[npi]?.city, state: locMap[npi]?.state,
        score: scoreMap[npi]?.score,
        referrals: refMap[npi]?.total_referrals,
        credential: p.credential,
      };
    }).filter(Boolean);

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Create a highly personalized outreach email template for CareMetric targeting these healthcare providers.

TARGET GROUP: ${targetConfig.strategy || targetConfig.source || 'custom'}
${targetConfig.messagingAngle ? `MESSAGING ANGLE: ${targetConfig.messagingAngle}` : ''}
TOTAL RECIPIENTS: ${targetConfig.npis?.length || 'Unknown'}

SAMPLE PROVIDER PROFILES:
${JSON.stringify(profiles, null, 2)}

Create:
1. A subject line template using merge fields ({{provider_name}}, {{specialty}}, {{city}}, {{state}}, {{score}}, {{referral_volume}})
2. A personalized email body template that:
   - Opens with something specific to their specialty/location
   - References relevant data points (referral volume, score) naturally
   - Explains CareMetric's value proposition tailored to their profile
   - Includes a clear, compelling call-to-action
   - Feels individually written, not mass-mailed
3. Also generate 2 alternative subject line variations for A/B testing

Keep the email body under 150 words. Be warm but professional.`,
      response_json_schema: {
        type: "object",
        properties: {
          primary_subject: { type: "string" },
          alt_subjects: { type: "array", items: { type: "string" } },
          body: { type: "string" },
          personalization_notes: { type: "string", description: "Explain what makes this personalized" },
          key_hooks: { type: "array", items: { type: "string" }, description: "Key persuasion points used" }
        }
      }
    });

    setResult(res);
    setLoading(false);
  };

  return (
    <Card className="border-emerald-200 bg-gradient-to-b from-emerald-50/30 to-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Mail className="w-4 h-4 text-emerald-500" />
          AI Personalized Content
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[10px] text-slate-500">Generate email content personalized to your target audience's specialties, locations, and network data.</p>
        <Button size="sm" onClick={generate} disabled={loading} className="w-full bg-emerald-600 hover:bg-emerald-700 h-8 text-xs gap-1">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {loading ? 'Personalizing...' : 'Generate Personalized Content'}
        </Button>

        {result && (
          <div className="space-y-3">
            {/* Primary subject */}
            <div className="bg-white rounded-lg border p-2.5">
              <div className="flex items-center justify-between mb-1">
                <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">Primary Subject</Badge>
                <Button size="sm" variant="ghost" className="h-5 text-[9px] text-emerald-600"
                  onClick={() => { onApplySubject(result.primary_subject); toast.success('Subject applied'); }}>
                  <Check className="w-3 h-3 mr-0.5" /> Use
                </Button>
              </div>
              <p className="text-[11px] text-slate-700 font-medium">{result.primary_subject}</p>
            </div>

            {/* Alt subjects */}
            {result.alt_subjects?.map((s, i) => (
              <div key={i} className="bg-slate-50 rounded-lg border p-2 flex items-center justify-between">
                <div>
                  <Badge variant="outline" className="text-[8px] text-slate-500">Variant {i + 1}</Badge>
                  <p className="text-[10px] text-slate-600 mt-0.5">{s}</p>
                </div>
                <Button size="sm" variant="ghost" className="h-5 text-[9px] text-slate-500"
                  onClick={() => { onApplySubject(s); toast.success('Subject applied'); }}>Use</Button>
              </div>
            ))}

            {/* Body */}
            <div className="bg-white rounded-lg border p-2.5">
              <div className="flex items-center justify-between mb-1">
                <Badge className="bg-emerald-100 text-emerald-700 text-[9px]">Email Body</Badge>
                <Button size="sm" variant="ghost" className="h-5 text-[9px] text-emerald-600"
                  onClick={() => { onApplyBody(result.body); toast.success('Body applied'); }}>
                  <Check className="w-3 h-3 mr-0.5" /> Use
                </Button>
              </div>
              <p className="text-[10px] text-slate-600 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">{result.body}</p>
            </div>

            {/* Personalization notes */}
            {result.personalization_notes && (
              <div className="bg-violet-50 rounded-lg p-2 border border-violet-100">
                <p className="text-[10px] font-medium text-violet-700 mb-0.5">Why this works</p>
                <p className="text-[9px] text-violet-600">{result.personalization_notes}</p>
              </div>
            )}

            {result.key_hooks?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {result.key_hooks.map((h, i) => (
                  <Badge key={i} className="bg-slate-100 text-slate-600 text-[8px]">{h}</Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}