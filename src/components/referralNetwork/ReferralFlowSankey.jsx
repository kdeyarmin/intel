import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight } from 'lucide-react';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];

export default function ReferralFlowSankey({ edges = [], nodes = [] }) {
  const flows = useMemo(() => {
    const nodeMap = {};
    nodes.forEach(n => { nodeMap[n.npi] = n; });
    return [...edges]
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 15)
      .map(e => ({
        ...e,
        sourceLabel: nodeMap[e.source]?.label || e.source,
        targetLabel: nodeMap[e.target]?.label || e.target,
        sourceType: nodeMap[e.source]?.entityType || 'Unknown',
        targetType: nodeMap[e.target]?.entityType || 'Unknown',
      }));
  }, [edges, nodes]);

  const maxVol = Math.max(...flows.map(f => f.volume), 1);

  if (flows.length === 0) {
    return (
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-slate-300">Top Referral Flows</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-slate-500 text-center py-6">No referral flows to display</p></CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          Top Referral Flows
          <Badge variant="outline" className="text-[10px] ml-auto text-slate-500">{flows.length} connections</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {flows.map((f, i) => {
          const widthPct = Math.max(15, (f.volume / maxVol) * 100);
          return (
            <div key={i} className="flex items-center gap-2 group">
              <div className="w-[38%] text-right">
                <span className="text-xs font-medium text-slate-300 truncate inline-block max-w-full">{f.sourceLabel}</span>
                <Badge variant="outline" className="text-[9px] ml-1.5 hidden sm:inline-flex text-slate-500">{f.sourceType === 'Organization' ? 'Org' : 'Ind'}</Badge>
              </div>
              <div className="flex-1 relative h-7 flex items-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="h-3 rounded-full transition-all" style={{ width: `${widthPct}%`, backgroundColor: COLORS[i % COLORS.length], opacity: 0.6 }} />
                </div>
                <div className="relative z-10 flex items-center justify-center w-full">
                  <span className="text-[10px] font-bold text-slate-200 bg-[#141d30]/80 px-1.5 rounded">{f.volume.toLocaleString()}</span>
                </div>
              </div>
              <div className="w-[38%]">
                <ArrowRight className="w-3 h-3 text-slate-600 inline mr-1" />
                <span className="text-xs font-medium text-slate-300 truncate inline-block max-w-[85%]">{f.targetLabel}</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}