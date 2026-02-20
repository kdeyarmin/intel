import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Target, MapPin, Stethoscope, TrendingUp, CheckCircle2 } from 'lucide-react';

export default function AISmartTargeting({
  providers = [], referrals = [], scores = [], locations = [], taxonomies = [],
  onTargetsReady
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const analyze = async () => {
    setLoading(true);

    // Build data snapshot for AI
    const scoreMap = {};
    scores.forEach(s => { scoreMap[s.npi] = s.score; });
    const refMap = {};
    referrals.forEach(r => { refMap[r.npi] = (refMap[r.npi] || 0) + (r.total_referrals || 0); });
    const locMap = {};
    locations.forEach(l => { if (l.is_primary) locMap[l.npi] = l.state; });
    const taxMap = {};
    taxonomies.forEach(t => { if (t.primary_flag) taxMap[t.npi] = t.taxonomy_description; });

    // State specialty coverage
    const stateCoverage = {};
    providers.forEach(p => {
      const st = locMap[p.npi];
      const spec = taxMap[p.npi];
      if (st && spec) {
        if (!stateCoverage[st]) stateCoverage[st] = {};
        stateCoverage[st][spec] = (stateCoverage[st][spec] || 0) + 1;
      }
    });

    // High-value uncontacted (have score but no campaign messages yet)
    const highValue = providers
      .filter(p => scoreMap[p.npi] >= 60)
      .sort((a, b) => (scoreMap[b.npi] || 0) - (scoreMap[a.npi] || 0))
      .slice(0, 15)
      .map(p => ({
        npi: p.npi,
        name: p.entity_type === 'Individual' ? `${p.first_name} ${p.last_name}` : p.organization_name,
        score: scoreMap[p.npi],
        state: locMap[p.npi],
        specialty: taxMap[p.npi],
        referrals: refMap[p.npi] || 0,
      }));

    const stateSnapshot = Object.entries(stateCoverage).slice(0, 10).map(([st, specs]) => ({
      state: st, providers: Object.values(specs).reduce((a, b) => a + b, 0),
      topSpecialties: Object.entries(specs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, c]) => `${s}(${c})`).join(', ')
    }));

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare network strategist for CareMetric. Analyze this data and suggest 3-4 targeted outreach groups.

PROVIDER DATABASE: ${providers.length} providers across ${Object.keys(stateCoverage).length} states

HIGH-VALUE PROVIDERS (top by fit score):
${JSON.stringify(highValue, null, 2)}

STATE COVERAGE SNAPSHOT:
${JSON.stringify(stateSnapshot, null, 2)}

Suggest 3-4 outreach target groups:
1. Gap-filling: providers in underserved areas/specialties that could strengthen the network
2. High-value: highest fit score providers not yet engaged
3. Referral hubs: highest volume providers who could multiply partnerships
4. Emerging: newer or growing practices showing momentum

For each group, explain WHY these providers should be prioritized, the suggested approach/messaging angle, and expected impact.`,
      response_json_schema: {
        type: "object",
        properties: {
          groups: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                strategy: { type: "string", enum: ["gap_filling", "high_value", "referral_hubs", "emerging"] },
                description: { type: "string" },
                why: { type: "string" },
                messaging_angle: { type: "string" },
                expected_impact: { type: "string" },
                criteria: {
                  type: "object",
                  properties: {
                    min_score: { type: "number" },
                    states: { type: "array", items: { type: "string" } },
                    specialties: { type: "array", items: { type: "string" } },
                    min_referrals: { type: "number" }
                  }
                },
                estimated_count: { type: "number" }
              }
            }
          },
          overall_recommendation: { type: "string" }
        }
      }
    });

    // Resolve actual NPIs for each group
    const enriched = (res.groups || []).map(g => {
      const c = g.criteria || {};
      let npis = providers.map(p => p.npi);
      if (c.min_score) npis = npis.filter(n => (scoreMap[n] || 0) >= c.min_score);
      if (c.states?.length) npis = npis.filter(n => c.states.includes(locMap[n]));
      if (c.specialties?.length) npis = npis.filter(n => c.specialties.some(s => (taxMap[n] || '').toLowerCase().includes(s.toLowerCase())));
      if (c.min_referrals) npis = npis.filter(n => (refMap[n] || 0) >= c.min_referrals);
      return { ...g, npis: [...new Set(npis)].slice(0, 200) };
    });

    setSuggestions({ ...res, groups: enriched });
    setLoading(false);
  };

  const STRATEGY_ICONS = {
    gap_filling: { icon: MapPin, color: 'text-amber-400 bg-amber-500/15' },
    high_value: { icon: Target, color: 'text-emerald-400 bg-emerald-500/15' },
    referral_hubs: { icon: TrendingUp, color: 'text-cyan-400 bg-cyan-500/15' },
    emerging: { icon: Sparkles, color: 'text-violet-400 bg-violet-500/15' },
  };

  return (
    <Card className="border-violet-200 bg-gradient-to-b from-violet-50/30 to-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-500" />
          AI Smart Targeting
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[10px] text-slate-500">AI analyzes your network for gaps, high-value targets, and referral hubs to suggest who to contact.</p>
        <Button size="sm" onClick={analyze} disabled={loading} className="w-full bg-violet-600 hover:bg-violet-700 h-8 text-xs gap-1">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {loading ? 'Analyzing Network...' : 'Find Best Targets'}
        </Button>

        {suggestions?.overall_recommendation && (
          <div className="bg-violet-50 rounded-lg p-2 border border-violet-100">
            <p className="text-[10px] text-violet-600 leading-relaxed">{suggestions.overall_recommendation}</p>
          </div>
        )}

        {suggestions?.groups?.map((g, i) => {
          const s = STRATEGY_ICONS[g.strategy] || STRATEGY_ICONS.high_value;
          const Icon = s.icon;
          const isSelected = selectedGroup === i;
          return (
            <div key={i} className={`rounded-lg border p-3 transition-all cursor-pointer ${isSelected ? 'border-violet-400 bg-violet-50/50' : 'border-slate-200 hover:border-violet-300'}`}
              onClick={() => setSelectedGroup(isSelected ? null : i)}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${s.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{g.name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{g.description}</p>
                  </div>
                </div>
                <Badge className="bg-slate-100 text-slate-600 text-[10px] shrink-0">{g.npis?.length || g.estimated_count || 0}</Badge>
              </div>

              {isSelected && (
                <div className="mt-3 space-y-2 text-[10px]">
                  <div className="bg-blue-50 rounded p-2">
                    <p className="font-medium text-blue-700 mb-0.5">Why these providers?</p>
                    <p className="text-blue-600">{g.why}</p>
                  </div>
                  <div className="bg-emerald-50 rounded p-2">
                    <p className="font-medium text-emerald-700 mb-0.5">Messaging Angle</p>
                    <p className="text-emerald-600">{g.messaging_angle}</p>
                  </div>
                  <div className="bg-amber-50 rounded p-2">
                    <p className="font-medium text-amber-700 mb-0.5">Expected Impact</p>
                    <p className="text-amber-600">{g.expected_impact}</p>
                  </div>
                  <Button size="sm" className="w-full h-7 text-[10px] bg-teal-600 hover:bg-teal-700 gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTargetsReady({ source: 'ai_smart', npis: g.npis, strategy: g.strategy, messagingAngle: g.messaging_angle });
                    }}>
                    <CheckCircle2 className="w-3 h-3" /> Use This Group ({g.npis?.length || 0} providers)
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}