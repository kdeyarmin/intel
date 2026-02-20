import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { X, ExternalLink, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export default function NodeDetailPanel({ node, edges = [], nodes = [], onClose }) {
  if (!node) return null;

  const nodeMap = {};
  nodes.forEach(n => { nodeMap[n.npi] = n; });

  const outEdges = edges.filter(e => e.source === node.npi).sort((a, b) => b.volume - a.volume);
  const inEdges = edges.filter(e => e.target === node.npi).sort((a, b) => b.volume - a.volume);

  const fv = (v) => v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : v.toLocaleString();

  return (
    <Card className="border-cyan-500/30 bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-200 truncate flex-1">{node.label}</CardTitle>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-slate-400 hover:text-slate-200" onClick={onClose}><X className="w-3.5 h-3.5" /></Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] font-mono text-slate-400">{node.npi}</Badge>
          <Badge variant="outline" className="text-[10px] text-slate-400">{node.entityType}</Badge>
          {node.isHub && <Badge className="bg-red-500/15 text-red-400 text-[10px]">Hub</Badge>}
          {node.state && <Badge variant="outline" className="text-[10px] text-slate-400">{node.state}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-blue-500/10 rounded-lg p-2">
            <p className="text-lg font-bold text-blue-400">{fv(node.outbound)}</p>
            <p className="text-[10px] text-blue-400/60">Outbound</p>
          </div>
          <div className="bg-violet-500/10 rounded-lg p-2">
            <p className="text-lg font-bold text-violet-400">{fv(node.inbound)}</p>
            <p className="text-[10px] text-violet-400/60">Inbound</p>
          </div>
          <div className="bg-slate-500/10 rounded-lg p-2">
            <p className="text-lg font-bold text-slate-300">{node.connections}</p>
            <p className="text-[10px] text-slate-400">Connections</p>
          </div>
        </div>

        {outEdges.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <ArrowUpRight className="w-3 h-3" /> Top Outbound ({outEdges.length})
            </p>
            {outEdges.slice(0, 5).map(e => (
              <div key={e.target} className="flex items-center justify-between text-xs py-1 border-b border-slate-700/30">
                <span className="text-slate-400 truncate max-w-[60%]">{nodeMap[e.target]?.label || e.target}</span>
                <span className="font-mono text-blue-400">{fv(e.volume)}</span>
              </div>
            ))}
          </div>
        )}

        {inEdges.length > 0 && (
          <div>
            <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
              <ArrowDownLeft className="w-3 h-3" /> Top Inbound ({inEdges.length})
            </p>
            {inEdges.slice(0, 5).map(e => (
              <div key={e.source} className="flex items-center justify-between text-xs py-1 border-b border-slate-700/30">
                <span className="text-slate-400 truncate max-w-[60%]">{nodeMap[e.source]?.label || e.source}</span>
                <span className="font-mono text-violet-400">{fv(e.volume)}</span>
              </div>
            ))}
          </div>
        )}

        <Link to={createPageUrl(`ProviderDetail?npi=${node.npi}`)}>
          <Button variant="outline" size="sm" className="w-full text-xs gap-1.5 mt-1 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400">
            <ExternalLink className="w-3 h-3" /> View Provider Profile
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}