import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import PredictiveNetworkAnalysis from './PredictiveNetworkAnalysis';
import StrategicPartnerFinder from './StrategicPartnerFinder';

/**
 * Concentration and reach of the network shown, plus the on-demand AI
 * partner finder and outlook. The grounded recommendations (built from the
 * whole scope on the server) are in AINetworkRecommendations next to this.
 */
export default function NetworkInsightsDashboard({ nodes = [], edges = [], summary = null, locations = [] }) {
  const metrics = useMemo(() => {
    if (nodes.length === 0) return null;
    const totalVol = nodes.reduce((s, n) => s + (Number(n.totalVolume) || 0), 0);
    const hubVol = nodes.filter(n => n.isHub).reduce((s, n) => s + (Number(n.totalVolume) || 0), 0);
    const linked = new Set(edges.flatMap(e => [e.source, e.target]));
    return {
      concentration: totalVol > 0 ? Math.round((hubVol / totalVol) * 100) : 0,
      avgPartners: (nodes.reduce((s, n) => s + (Number(n.partners) || 0), 0) / nodes.length).toFixed(1),
      unlinked: nodes.filter(n => !linked.has(n.npi)).length,
      hubCount: nodes.filter(n => n.isHub).length,
      stateCount: new Set(nodes.map(n => n.state).filter(Boolean)).size,
      outsideScope: nodes.filter(n => n.inScope === false).length,
    };
  }, [nodes, edges]);

  if (nodes.length === 0) return null;

  return (
    <div className="space-y-4">
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: 'Hub concentration', value: `${metrics.concentration}%`, sub: 'of shown volume via hubs', color: metrics.concentration > 70 ? 'text-red-400' : 'text-cyan-400' },
            { label: 'Avg partners', value: metrics.avgPartners, sub: 'per provider (whole scope)', color: 'text-violet-400' },
            { label: 'Not linked in view', value: metrics.unlinked, sub: 'partners are outside the view', color: 'text-slate-300' },
            { label: 'Hubs', value: metrics.hubCount, sub: 'among providers shown', color: 'text-amber-400' },
            { label: 'States', value: metrics.stateCount, sub: 'among providers shown', color: 'text-blue-400' },
            { label: 'Outside scope', value: metrics.outsideScope, sub: 'partners from elsewhere', color: 'text-emerald-400' },
          ].map(m => (
            <Card key={m.label} className="bg-[#141d30] border-slate-700/50">
              <CardContent className="p-3 text-center">
                <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
                <p className="text-[10px] text-slate-300 font-medium">{m.label}</p>
                <p className="text-[9px] text-slate-400">{m.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {summary?.display_capped && (
        <p className="text-xs text-slate-400">
          These figures cover the {summary.shown_nodes} busiest of {summary.network_nodes.toLocaleString()} providers in this network.
        </p>
      )}

      <StrategicPartnerFinder nodes={nodes} edges={edges} locations={locations} />
      <PredictiveNetworkAnalysis nodes={nodes} edges={edges} locations={locations} />
    </div>
  );
}
