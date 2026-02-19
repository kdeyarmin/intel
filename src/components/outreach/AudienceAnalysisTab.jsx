import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, MapPin, Stethoscope, Building2, TrendingUp } from 'lucide-react';

export default function AudienceAnalysisTab({
  loading: externalLoading,
  targetConfig,
  providers = [],
  locations = [],
  taxonomies = [],
  scores = [],
  referrals = [],
}) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const buildAudienceProfile = () => {
    const npis = targetConfig?.npis || [];
    if (npis.length === 0 && targetConfig?.source === 'lead_list') {
      return { summary: 'Lead list selected — audience details will be resolved at send time.', count: 0 };
    }

    const targetProviders = providers.filter(p => npis.includes(p.npi));
    const targetLocs = locations.filter(l => npis.includes(l.npi) && l.is_primary);
    const targetTax = taxonomies.filter(t => npis.includes(t.npi) && t.primary_flag);
    const targetScores = scores.filter(s => npis.includes(s.npi));
    const targetRefs = referrals.filter(r => npis.includes(r.npi));

    // State distribution
    const stateCounts = {};
    targetLocs.forEach(l => { if (l.state) stateCounts[l.state] = (stateCounts[l.state] || 0) + 1; });
    const topStates = Object.entries(stateCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Specialty distribution
    const specCounts = {};
    targetTax.forEach(t => { if (t.taxonomy_description) specCounts[t.taxonomy_description] = (specCounts[t.taxonomy_description] || 0) + 1; });
    const topSpecialties = Object.entries(specCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Entity type breakdown
    const individuals = targetProviders.filter(p => p.entity_type === 'Individual').length;
    const organizations = targetProviders.filter(p => p.entity_type === 'Organization').length;

    // Score & referral stats
    const avgScore = targetScores.length > 0 ? Math.round(targetScores.reduce((s, r) => s + (r.score || 0), 0) / targetScores.length) : 0;
    const avgReferrals = targetRefs.length > 0 ? Math.round(targetRefs.reduce((s, r) => s + (r.total_referrals || 0), 0) / targetRefs.length) : 0;
    const withEmail = targetProviders.filter(p => p.email).length;

    return {
      count: npis.length,
      individuals,
      organizations,
      topStates,
      topSpecialties,
      avgScore,
      avgReferrals,
      withEmail,
      emailCoverage: npis.length > 0 ? Math.round((withEmail / npis.length) * 100) : 0,
    };
  };

  const analyze = async () => {
    setLoading(true);
    const profile = buildAudienceProfile();

    if (profile.count === 0 && profile.summary) {
      setResults({ profile, insights: null });
      setLoading(false);
      return;
    }

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze this healthcare provider target audience and provide strategic recommendations for email outreach.

AUDIENCE PROFILE:
- Total recipients: ${profile.count}
- Individuals: ${profile.individuals}, Organizations: ${profile.organizations}
- Top states: ${profile.topStates.map(([st, c]) => `${st} (${c})`).join(', ') || 'N/A'}
- Top specialties: ${profile.topSpecialties.map(([sp, c]) => `${sp} (${c})`).join(', ') || 'N/A'}
- Avg CareMetric fit score: ${profile.avgScore}
- Avg referral volume: ${profile.avgReferrals}
- Email coverage: ${profile.emailCoverage}% (${profile.withEmail} of ${profile.count} have emails)

Provide:
1. Audience segment analysis - who are these providers and what motivates them
2. 3 optimal send times with reasoning (consider healthcare provider schedules - early morning, lunch, end of day)
3. 5 subject line variations optimized for this specific audience
4. Key messaging themes that would resonate
5. Potential risks or gaps (e.g., low email coverage)

Context: CareMetric is a healthcare analytics company reaching out to physicians and post-acute care providers for partnerships and referral growth.`,
      response_json_schema: {
        type: "object",
        properties: {
          audience_summary: { type: "string" },
          segments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                percentage: { type: "number" },
                description: { type: "string" },
                messaging_angle: { type: "string" }
              }
            }
          },
          optimal_send_times: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time: { type: "string" },
                day: { type: "string" },
                reasoning: { type: "string" },
                expected_open_rate_boost: { type: "string" }
              }
            }
          },
          subject_line_variations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                subject: { type: "string" },
                style: { type: "string" },
                expected_performance: { type: "string" }
              }
            }
          },
          messaging_themes: { type: "array", items: { type: "string" } },
          risks: { type: "array", items: { type: "string" } }
        }
      }
    });

    setResults({ profile, insights: res });
    setLoading(false);
  };

  const isLoading = loading || externalLoading;

  return (
    <div className="space-y-2">
      <Button size="sm" onClick={analyze} disabled={isLoading || !targetConfig}
        className="w-full bg-violet-600 hover:bg-violet-700 h-7 text-xs gap-1">
        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
        {isLoading ? 'Analyzing...' : 'Analyze Audience'}
      </Button>

      {!targetConfig && <p className="text-[10px] text-slate-400 text-center">Build a target list first</p>}

      {results?.profile && (
        <div className="grid grid-cols-3 gap-1.5">
          <div className="bg-blue-50 rounded-lg p-1.5 text-center">
            <p className="text-sm font-bold text-blue-700">{results.profile.count}</p>
            <p className="text-[8px] text-blue-500">Recipients</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-1.5 text-center">
            <p className="text-sm font-bold text-emerald-700">{results.profile.avgScore}</p>
            <p className="text-[8px] text-emerald-500">Avg Score</p>
          </div>
          <div className="bg-violet-50 rounded-lg p-1.5 text-center">
            <p className="text-sm font-bold text-violet-700">{results.profile.emailCoverage}%</p>
            <p className="text-[8px] text-violet-500">Email Coverage</p>
          </div>
        </div>
      )}

      {results?.insights && (
        <div className="space-y-2">
          {/* Summary */}
          <p className="text-[10px] text-slate-600 bg-slate-50 rounded-lg px-2 py-1.5 leading-relaxed">
            {results.insights.audience_summary}
          </p>

          {/* Segments */}
          {results.insights.segments?.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-slate-400 uppercase mb-1">Audience Segments</p>
              {results.insights.segments.map((seg, i) => (
                <div key={i} className="bg-white border rounded-lg p-2 mb-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-slate-700">{seg.name}</p>
                    <Badge variant="outline" className="text-[8px]">{seg.percentage}%</Badge>
                  </div>
                  <p className="text-[9px] text-slate-500 mt-0.5">{seg.description}</p>
                  <p className="text-[9px] text-violet-500 mt-0.5 italic">→ {seg.messaging_angle}</p>
                </div>
              ))}
            </div>
          )}

          {/* Send Times */}
          {results.insights.optimal_send_times?.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-slate-400 uppercase mb-1">Optimal Send Times</p>
              {results.insights.optimal_send_times.map((st, i) => (
                <div key={i} className="flex items-start gap-2 bg-emerald-50 rounded-lg p-2 mb-1 border border-emerald-100">
                  <Badge className="bg-emerald-600 text-white text-[8px] shrink-0 mt-0.5">#{i + 1}</Badge>
                  <div>
                    <p className="text-[10px] font-semibold text-emerald-800">{st.day} — {st.time}</p>
                    <p className="text-[9px] text-emerald-600">{st.reasoning}</p>
                    {st.expected_open_rate_boost && (
                      <p className="text-[8px] text-emerald-500 mt-0.5">Expected boost: {st.expected_open_rate_boost}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Subject Line Variations */}
          {results.insights.subject_line_variations?.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-slate-400 uppercase mb-1">Subject Line Variations</p>
              {results.insights.subject_line_variations.map((sl, i) => (
                <div key={i} className="bg-white border rounded-lg p-2 mb-1 hover:border-violet-300 transition-colors">
                  <p className="text-[10px] font-medium text-slate-800">"{sl.subject}"</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="outline" className="text-[8px]">{sl.style}</Badge>
                    <span className="text-[8px] text-slate-400">{sl.expected_performance}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Risks */}
          {results.insights.risks?.length > 0 && (
            <div className="bg-amber-50 rounded-lg p-2 border border-amber-100">
              <p className="text-[10px] font-medium text-amber-700 mb-1">⚠ Risks & Gaps</p>
              {results.insights.risks.map((r, i) => (
                <p key={i} className="text-[9px] text-amber-600">• {r}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}