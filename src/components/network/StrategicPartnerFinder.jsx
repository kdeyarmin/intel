import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Handshake, Building2, MapPin, Megaphone, Users, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';

const PRIORITY_STYLES = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  high: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  medium: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  low: 'bg-slate-700/50 text-slate-400 border-slate-600',
};

const TYPE_ICONS = {
  health_system: Building2,
  clinic: Building2,
  specialty_group: Users,
  home_health: Handshake,
  default: Handshake,
};

export default function StrategicPartnerFinder({ nodes = [], edges = [], locations = [] }) {
  const [loading, setLoading] = useState(false);
  const [partners, setPartners] = useState(null);

  const findPartners = async () => {
    setLoading(true);

    // Build network snapshot
    const npiState = {};
    locations.forEach(l => { if (l.npi && l.state) npiState[l.npi] = l.state; });

    const stateData = {};
    nodes.forEach(n => {
      const st = n.state || npiState[n.npi];
      if (!st) return;
      if (!stateData[st]) stateData[st] = { count: 0, hubs: 0, totalVol: 0, specs: {} };
      stateData[st].count++;
      stateData[st].totalVol += n.totalVolume;
      if (n.isHub) stateData[st].hubs++;
      if (n.specialty) stateData[st].specs[n.specialty] = (stateData[st].specs[n.specialty] || 0) + 1;
    });

    const statesSummary = Object.entries(stateData)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 12)
      .map(([st, d]) => `${st}: ${d.count} providers, ${d.hubs} hubs, ${Object.keys(d.specs).length} specialties`)
      .join('\n');

    // Cross-specialty flows
    const flowMap = {};
    edges.forEach(e => {
      const src = nodes.find(n => n.npi === e.source);
      const tgt = nodes.find(n => n.npi === e.target);
      if (src?.specialty && tgt?.specialty && src.specialty !== tgt.specialty) {
        const key = `${src.specialty} → ${tgt.specialty}`;
        flowMap[key] = (flowMap[key] || 0) + e.volume;
      }
    });
    const topFlows = Object.entries(flowMap).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([path, vol]) => `${path}: ${vol}`).join('\n');

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `You are a healthcare network strategy expert. Based on referral network data, identify specific strategic partner organizations that should be recruited.

NETWORK: ${nodes.length} providers across ${Object.keys(stateData).length} states

STATE BREAKDOWN:
${statesSummary}

TOP REFERRAL FLOWS:
${topFlows}

Based on network gaps, referral patterns, and underserved areas:

1. Identify 5-7 SPECIFIC types of strategic partner organizations (e.g., "Multi-specialty clinic in [state]", "Home health agency covering [region]")
2. For each, explain WHY they would strengthen the network — what gap they fill
3. What referral patterns support this need
4. Suggest a specific outreach campaign approach for each partner type
5. Estimate the impact of each partnership on network coverage and referral volume
6. Identify which underserved populations would benefit most

Be very specific about locations, specialties, and organizational types.`,
      response_json_schema: {
        type: "object",
        properties: {
          strategic_partners: {
            type: "array",
            items: {
              type: "object",
              properties: {
                partner_type: { type: "string" },
                organization_profile: { type: "string" },
                target_location: { type: "string" },
                priority: { type: "string", enum: ["critical", "high", "medium", "low"] },
                gap_addressed: { type: "string" },
                referral_evidence: { type: "string" },
                outreach_strategy: { type: "string" },
                campaign_subject: { type: "string" },
                campaign_hook: { type: "string" },
                expected_impact: { type: "string" },
                populations_served: { type: "array", items: { type: "string" } },
                partner_category: { type: "string", enum: ["health_system", "clinic", "specialty_group", "home_health"] }
              }
            }
          },
          network_coverage_current: { type: "number" },
          network_coverage_projected: { type: "number" },
          summary: { type: "string" }
        }
      }
    });

    setPartners(res);
    setLoading(false);
  };

  if (nodes.length === 0) return null;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
            <Handshake className="w-5 h-5 text-violet-400" />
            AI Strategic Partner Discovery
          </CardTitle>
          <Button size="sm" onClick={findPartners} disabled={loading}
            className="h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {loading ? 'Finding Partners...' : 'Find Partners'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!partners && !loading && (
          <p className="text-sm text-slate-400 text-center py-6">
            AI will analyze your network gaps and referral patterns to recommend strategic partnerships and suggest outreach campaigns for each.
          </p>
        )}

        {loading && (
          <div className="text-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Analyzing network topology for partnership opportunities...</p>
          </div>
        )}

        {partners && !loading && (
          <div className="space-y-4">
            {/* Coverage projection */}
            {partners.network_coverage_current && (
              <div className="bg-slate-800/40 rounded-lg p-3 flex items-center gap-4">
                <div className="text-center">
                  <p className="text-xl font-bold text-slate-300">{partners.network_coverage_current}%</p>
                  <p className="text-[10px] text-slate-500">Current</p>
                </div>
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                <div className="text-center">
                  <p className="text-xl font-bold text-emerald-400">{partners.network_coverage_projected}%</p>
                  <p className="text-[10px] text-slate-500">Projected</p>
                </div>
                <p className="text-xs text-slate-400 flex-1">{partners.summary}</p>
              </div>
            )}

            {/* Partner cards */}
            {partners.strategic_partners?.map((p, i) => {
              const Icon = TYPE_ICONS[p.partner_category] || TYPE_ICONS.default;
              return (
                <div key={i} className={`border rounded-lg p-3 ${PRIORITY_STYLES[p.priority]}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start gap-2">
                      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium">{p.partner_type}</p>
                        <p className="text-[11px] text-slate-400">{p.organization_profile}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <Badge className="bg-slate-800/60 text-slate-300 text-[9px]">
                        <MapPin className="w-2.5 h-2.5 mr-0.5" />{p.target_location}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-1.5 ml-6">
                    <p className="text-[11px] text-slate-300"><span className="text-slate-500">Gap:</span> {p.gap_addressed}</p>
                    <p className="text-[11px] text-slate-300"><span className="text-slate-500">Evidence:</span> {p.referral_evidence}</p>
                    <p className="text-[11px] text-emerald-400"><span className="text-slate-500">Impact:</span> {p.expected_impact}</p>

                    {p.populations_served?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.populations_served.map((pop, j) => (
                          <Badge key={j} className="bg-violet-500/10 text-violet-400 text-[8px] border border-violet-500/20">{pop}</Badge>
                        ))}
                      </div>
                    )}

                    {/* Campaign suggestion */}
                    <div className="bg-slate-800/60 rounded-lg p-2 mt-2">
                      <p className="text-[10px] text-cyan-400 font-medium mb-0.5 flex items-center gap-1">
                        <Megaphone className="w-3 h-3" /> Suggested Outreach
                      </p>
                      <p className="text-[10px] text-slate-300">{p.outreach_strategy}</p>
                      {p.campaign_subject && (
                        <p className="text-[9px] text-slate-500 mt-0.5 italic">Subject: "{p.campaign_subject}"</p>
                      )}
                      <Link to={createPageUrl('ProviderOutreach')}>
                        <Button size="sm" variant="outline" className="h-5 text-[9px] gap-1 mt-1.5 bg-transparent border-slate-600 text-cyan-400 hover:bg-slate-800">
                          <Megaphone className="w-2.5 h-2.5" /> Create Campaign
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}