import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Crown, AlertTriangle, MapPin, Stethoscope, TrendingUp, Network } from 'lucide-react';

const KEY_SPECIALTIES = [
  'Internal Medicine', 'Family Medicine', 'Cardiology', 'Orthopedic Surgery',
  'General Surgery', 'Psychiatry', 'Neurology', 'Oncology', 'Dermatology',
  'Emergency Medicine', 'Obstetrics & Gynecology', 'Pediatrics', 'Pulmonology',
  'Gastroenterology', 'Nephrology', 'Urology', 'Endocrinology',
];

function HubCard({ hub, rank }) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-700/30 hover:bg-slate-800/30">
      <div className="w-7 h-7 rounded-full bg-amber-500/15 flex items-center justify-center text-amber-400 text-xs font-bold shrink-0">
        {rank}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-200 truncate">{hub.label}</p>
        <p className="text-[10px] text-slate-500">{hub.specialty || hub.entityType}{hub.state ? ` · ${hub.state}` : ''}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-bold text-cyan-400">{hub.totalVolume.toLocaleString()}</p>
        <p className="text-[10px] text-slate-500">{hub.connections} conn.</p>
      </div>
      <Badge className={`text-[9px] shrink-0 ${hub.hubScore >= 80 ? 'bg-red-500/15 text-red-400' : hub.hubScore >= 50 ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-700/50 text-slate-400'}`}>
        {hub.hubScore}
      </Badge>
    </div>
  );
}

function GapCard({ gap }) {
  return (
    <div className="p-2.5 rounded-lg border border-slate-700/30 hover:bg-slate-800/30">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Badge className="bg-slate-700/50 text-slate-300 font-mono text-[10px]">{gap.state}</Badge>
          <span className="text-[10px] text-slate-500">{gap.totalProviders} providers</span>
        </div>
        <Badge className={`text-[9px] ${gap.severity === 'high' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
          {gap.severity}
        </Badge>
      </div>
      <p className="text-[11px] text-slate-300">{gap.description}</p>
      {gap.missingSpecialties?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {gap.missingSpecialties.slice(0, 4).map(s => (
            <Badge key={s} className="bg-red-500/10 text-red-400 text-[8px] border border-red-500/20">{s}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NetworkInsightsDashboard({ nodes = [], edges = [], locations = [] }) {
  const [aiInsights, setAiInsights] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);

  // Auto-identify hubs
  const topHubs = useMemo(() => {
    return [...nodes].sort((a, b) => b.hubScore - a.hubScore).slice(0, 8);
  }, [nodes]);

  // Auto-detect care gaps
  const careGaps = useMemo(() => {
    const npiState = {};
    locations.forEach(l => { if (l.npi && l.state) npiState[l.npi] = l.state; });

    const stateSpecs = {};
    const stateCounts = {};
    nodes.forEach(n => {
      const st = n.state || npiState[n.npi];
      if (!st) return;
      if (!stateSpecs[st]) stateSpecs[st] = {};
      stateCounts[st] = (stateCounts[st] || 0) + 1;
      if (n.specialty) stateSpecs[st][n.specialty] = (stateSpecs[st][n.specialty] || 0) + 1;
    });

    const gaps = [];
    Object.entries(stateSpecs).forEach(([state, specs]) => {
      const total = stateCounts[state] || 1;
      const missing = KEY_SPECIALTIES.filter(s => !specs[s]);
      const low = KEY_SPECIALTIES.filter(s => specs[s] && specs[s] / total < 0.02);

      if (missing.length >= 5) {
        gaps.push({
          state, totalProviders: total, severity: 'high',
          description: `Missing ${missing.length} key specialties — significant care gap`,
          missingSpecialties: missing,
        });
      } else if (missing.length >= 2 || low.length >= 3) {
        gaps.push({
          state, totalProviders: total, severity: 'medium',
          description: `${missing.length} missing, ${low.length} underserved specialties`,
          missingSpecialties: [...missing, ...low.map(s => s)],
        });
      }
    });

    return gaps.sort((a, b) => (b.severity === 'high' ? 1 : 0) - (a.severity === 'high' ? 1 : 0) || b.missingSpecialties.length - a.missingSpecialties.length).slice(0, 6);
  }, [nodes, locations]);

  // Network efficiency metrics
  const metrics = useMemo(() => {
    if (nodes.length === 0) return null;
    const totalVol = nodes.reduce((s, n) => s + n.totalVolume, 0);
    const hubVol = nodes.filter(n => n.isHub).reduce((s, n) => s + n.totalVolume, 0);
    const concentration = totalVol > 0 ? Math.round((hubVol / totalVol) * 100) : 0;
    const avgConn = nodes.reduce((s, n) => s + n.connections, 0) / nodes.length;
    const isolated = nodes.filter(n => n.connections === 0).length;
    const stateCount = new Set(nodes.map(n => n.state).filter(Boolean)).size;
    return { totalVol, concentration, avgConn: avgConn.toFixed(1), isolated, stateCount, hubCount: nodes.filter(n => n.isHub).length };
  }, [nodes]);

  const handleAIAnalysis = async () => {
    setLoadingAI(true);
    const hubSummary = topHubs.slice(0, 5).map(h => `${h.label} (${h.entityType}, ${h.state || '?'}, vol=${h.totalVolume}, score=${h.hubScore})`).join('\n');
    const gapSummary = careGaps.map(g => `${g.state}: ${g.description}`).join('\n');

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze this healthcare referral network and provide actionable insights:

NETWORK OVERVIEW:
- ${nodes.length} providers across ${metrics?.stateCount || 0} states
- Total referral volume: ${metrics?.totalVol?.toLocaleString() || 0}
- ${metrics?.hubCount || 0} network hubs controlling ${metrics?.concentration || 0}% of volume
- ${metrics?.isolated || 0} isolated providers (no connections)
- Avg connections: ${metrics?.avgConn || 0}

TOP HUBS:
${hubSummary}

CARE GAPS:
${gapSummary || 'None detected'}

Provide:
1. Key findings about network health and efficiency
2. Specific actionable recommendations for improving the network
3. Risk factors or concerns
4. Opportunities for growth`,
      response_json_schema: {
        type: "object",
        properties: {
          health_score: { type: "number", description: "Network health score 0-100" },
          key_findings: { type: "array", items: { type: "string" } },
          recommendations: { type: "array", items: { type: "string" } },
          risks: { type: "array", items: { type: "string" } },
          opportunities: { type: "array", items: { type: "string" } }
        }
      }
    });

    setAiInsights(res);
    setLoadingAI(false);
  };

  if (nodes.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Metrics overview */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: 'Hub Concentration', value: `${metrics.concentration}%`, sub: 'of volume via hubs', color: metrics.concentration > 70 ? 'text-red-400' : 'text-cyan-400' },
            { label: 'Avg Connections', value: metrics.avgConn, sub: 'per provider', color: 'text-violet-400' },
            { label: 'Isolated Nodes', value: metrics.isolated, sub: 'no connections', color: metrics.isolated > 10 ? 'text-amber-400' : 'text-emerald-400' },
            { label: 'Network Hubs', value: metrics.hubCount, sub: 'identified', color: 'text-amber-400' },
            { label: 'States Covered', value: metrics.stateCount, sub: 'geographic reach', color: 'text-blue-400' },
            { label: 'Care Gaps', value: careGaps.length, sub: 'states affected', color: careGaps.length > 3 ? 'text-red-400' : 'text-emerald-400' },
          ].map(m => (
            <Card key={m.label} className="bg-[#141d30] border-slate-700/50">
              <CardContent className="p-3 text-center">
                <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                <p className="text-[10px] text-slate-400 font-medium">{m.label}</p>
                <p className="text-[9px] text-slate-600">{m.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Auto-detected hubs */}
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" />
              Key Referral Hubs
              <Badge variant="outline" className="text-[10px] text-slate-500 ml-auto">{topHubs.length} detected</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 max-h-[350px] overflow-y-auto pr-1">
            {topHubs.map((hub, i) => <HubCard key={hub.npi} hub={hub} rank={i + 1} />)}
          </CardContent>
        </Card>

        {/* Auto-detected care gaps */}
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Care Gaps & Inefficiencies
              <Badge variant="outline" className="text-[10px] text-slate-500 ml-auto">{careGaps.length} found</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 max-h-[350px] overflow-y-auto pr-1">
            {careGaps.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No significant care gaps detected</p>
            ) : careGaps.map((gap, i) => <GapCard key={i} gap={gap} />)}
          </CardContent>
        </Card>
      </div>

      {/* AI Insights */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              AI Network Analysis
            </CardTitle>
            <Button size="sm" onClick={handleAIAnalysis} disabled={loadingAI}
              className="h-7 text-[10px] gap-1 bg-violet-600 hover:bg-violet-700">
              {loadingAI ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {loadingAI ? 'Analyzing...' : aiInsights ? 'Refresh' : 'Run Analysis'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!aiInsights && !loadingAI && (
            <p className="text-xs text-slate-500 text-center py-6">Click "Run Analysis" for AI-powered network insights</p>
          )}
          {loadingAI && (
            <div className="text-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-violet-400 mx-auto mb-2" />
              <p className="text-xs text-slate-500">Analyzing network patterns...</p>
            </div>
          )}
          {aiInsights && !loadingAI && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 mb-3">
                <div className={`text-2xl font-bold ${aiInsights.health_score >= 70 ? 'text-emerald-400' : aiInsights.health_score >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                  {aiInsights.health_score}/100
                </div>
                <span className="text-xs text-slate-500">Network Health Score</span>
              </div>

              {[
                { items: aiInsights.key_findings, label: 'Key Findings', icon: TrendingUp, color: 'text-cyan-400' },
                { items: aiInsights.recommendations, label: 'Recommendations', icon: Sparkles, color: 'text-emerald-400' },
                { items: aiInsights.risks, label: 'Risk Factors', icon: AlertTriangle, color: 'text-red-400' },
                { items: aiInsights.opportunities, label: 'Opportunities', icon: Network, color: 'text-violet-400' },
              ].filter(s => s.items?.length > 0).map(section => (
                <div key={section.label}>
                  <p className={`text-[10px] font-medium uppercase tracking-wide mb-1.5 flex items-center gap-1 ${section.color}`}>
                    <section.icon className="w-3 h-3" /> {section.label}
                  </p>
                  <ul className="space-y-1">
                    {section.items.map((item, i) => (
                      <li key={i} className="text-xs text-slate-400 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-slate-600">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}