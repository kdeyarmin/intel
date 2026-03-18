import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Network, TrendingUp, Users, Target } from 'lucide-react';

export default function AINetworkFitCard({ provider, taxonomy = [], utilization, referrals, score, locations = [] }) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const runAnalysis = async () => {
    setLoading(true);
    const name = provider.entity_type === 'Individual'
      ? `${provider.first_name || ''} ${provider.last_name || ''}`.trim()
      : provider.organization_name || provider.npi;
    const primaryTax = taxonomy.find(t => t.primary_flag) || taxonomy[0];
    const primaryLoc = locations.find(l => l.is_primary) || locations[0];

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze this healthcare provider's network fit, referral likelihood, and patient demographic alignment.

PROVIDER: ${name}
NPI: ${provider.npi}
Type: ${provider.entity_type}
Specialty: ${primaryTax?.taxonomy_description || 'Unknown'}
Location: ${primaryLoc ? `${primaryLoc.city || ''}, ${primaryLoc.state || ''}` : 'Unknown'}
CareMetric Score: ${score?.score || 'N/A'}

UTILIZATION: ${utilization ? `${utilization.total_medicare_beneficiaries || 0} beneficiaries, ${utilization.total_services || 0} services, $${utilization.total_medicare_payment?.toLocaleString() || 0} payment` : 'No data'}

REFERRALS: ${referrals ? `Total: ${referrals.total_referrals || 0}, Home Health: ${referrals.home_health_referrals || 0}, Hospice: ${referrals.hospice_referrals || 0}, SNF: ${referrals.snf_referrals || 0}` : 'No data'}

Provide:
1. Network Fit Score (0-100) — how well this provider fits into a post-acute care referral network
2. Referral Likelihood Score (0-100) — probability of generating referrals to home health/hospice
3. Patient Demographic Alignment Score (0-100) — how well their patient population aligns with target demographics
4. Key network strengths and weaknesses
5. Recommended engagement approach
6. Predicted referral volume if engaged`,
      response_json_schema: {
        type: "object",
        properties: {
          network_fit_score: { type: "number" },
          network_fit_reasons: { type: "array", items: { type: "string" } },
          referral_likelihood_score: { type: "number" },
          referral_likelihood_reasons: { type: "array", items: { type: "string" } },
          demographic_alignment_score: { type: "number" },
          demographic_factors: { type: "array", items: { type: "string" } },
          strengths: { type: "array", items: { type: "string" } },
          weaknesses: { type: "array", items: { type: "string" } },
          engagement_approach: { type: "string" },
          predicted_monthly_referrals: { type: "number" },
          overall_priority: { type: "string", enum: ["high", "medium", "low"] }
        }
      }
    });
    setAnalysis(res);
    setLoading(false);
  };

  const scoreColor = (s) => s >= 75 ? 'text-emerald-400' : s >= 50 ? 'text-amber-400' : 'text-red-400';
  const scoreBg = (s) => s >= 75 ? 'bg-emerald-500/15' : s >= 50 ? 'bg-amber-500/15' : 'bg-red-500/15';

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-400" />
            AI Network Fit Analysis
          </CardTitle>
          <Button size="sm" onClick={runAnalysis} disabled={loading}
            className="h-7 text-[10px] gap-1 bg-cyan-600 hover:bg-cyan-700">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {loading ? 'Analyzing...' : analysis ? 'Refresh' : 'Analyze'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!analysis && !loading && (
          <p className="text-sm text-slate-400 text-center py-4">AI-powered network fit, referral probability, and demographic alignment analysis.</p>
        )}

        {loading && (
          <div className="text-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-400 mx-auto mb-1" />
            <p className="text-xs text-slate-500">Analyzing network fit...</p>
          </div>
        )}

        {analysis && !loading && (
          <div className="space-y-3">
            {/* Score cards */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Network Fit', score: analysis.network_fit_score, icon: Network },
                { label: 'Referral Likelihood', score: analysis.referral_likelihood_score, icon: TrendingUp },
                { label: 'Demographic Align', score: analysis.demographic_alignment_score, icon: Users },
              ].map(s => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className={`rounded-lg p-2.5 text-center ${scoreBg(s.score)}`}>
                    <Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${scoreColor(s.score)}`} />
                    <p className={`text-xl font-bold ${scoreColor(s.score)}`}>{s.score}</p>
                    <p className="text-[9px] text-slate-400">{s.label}</p>
                  </div>
                );
              })}
            </div>

            {/* Priority + predicted referrals */}
            <div className="flex items-center justify-between bg-slate-800/40 rounded-lg p-2">
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs text-slate-300">Priority</span>
                <Badge className={`text-[9px] ${analysis.overall_priority === 'high' ? 'bg-emerald-500/15 text-emerald-400' : analysis.overall_priority === 'medium' ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-700 text-slate-400'}`}>
                  {analysis.overall_priority}
                </Badge>
              </div>
              <span className="text-xs text-slate-300">
                ~<span className="font-bold text-cyan-400">{analysis.predicted_monthly_referrals}</span> referrals/mo predicted
              </span>
            </div>

            {/* Reasons */}
            {[
              { items: analysis.strengths, label: 'Strengths', color: 'text-emerald-400' },
              { items: analysis.weaknesses, label: 'Gaps', color: 'text-amber-400' },
            ].filter(s => s.items?.length > 0).map(section => (
              <div key={section.label}>
                <p className={`text-[10px] font-medium uppercase tracking-wide mb-1 ${section.color}`}>{section.label}</p>
                <ul className="space-y-0.5">
                  {section.items.slice(0, 3).map((r, i) => (
                    <li key={i} className="text-[11px] text-slate-300 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-slate-600">{r}</li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Engagement approach */}
            {analysis.engagement_approach && (
              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-2">
                <p className="text-[10px] font-medium text-cyan-400 mb-0.5">Recommended Approach</p>
                <p className="text-[11px] text-slate-300">{analysis.engagement_approach}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}