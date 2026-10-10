import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { X, ExternalLink, ArrowUpRight, ArrowDownLeft, Target } from 'lucide-react';
import { formatVolume } from './NetworkKPIs';

/** One provider's volumes and its heaviest edges among the providers shown. */
export default function NodeDetailPanel({ node, edges = [], nodes = [], onClose, onFocus }) {
  if (!node) return null;

  const nodeMap = {};
  nodes.forEach(n => { nodeMap[n.npi] = n; });
  const byVolume = (a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0);
  const outEdges = edges.filter(e => e.source === node.npi).sort(byVolume);
  const inEdges = edges.filter(e => e.target === node.npi).sort(byVolume);

  const list = (title, Icon, items, other, color) => items.length > 0 && (
    <div>
      <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1">
        <Icon className="w-3 h-3" aria-hidden="true" /> {title} ({items.length} shown)
      </p>
      {items.slice(0, 5).map(e => (
        <div key={`${e.source}>${e.target}`} className="flex items-center justify-between text-xs py-1 border-b border-slate-700/30">
          <span className="text-slate-300 truncate max-w-[60%]">{nodeMap[e[other]]?.label || e[other]}</span>
          <span className={`font-mono ${color}`}>{formatVolume(e.volume)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <Card className="border-cyan-500/30 bg-[#141d30]">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-200 truncate flex-1">{node.label || node.npi}</CardTitle>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-slate-400 hover:text-slate-200" onClick={onClose} aria-label="Close provider details">
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] font-mono text-slate-400">{node.npi}</Badge>
          {node.entityType && <Badge variant="outline" className="text-[10px] text-slate-400">{node.entityType}</Badge>}
          {node.isHub && <Badge className="bg-red-900/30 text-red-400 text-[10px]">Hub</Badge>}
          {node.state && <Badge variant="outline" className="text-[10px] text-slate-400">{[node.city, node.state].filter(Boolean).join(', ')}</Badge>}
        </div>
        {node.specialty && <p className="text-xs text-slate-400 mt-1">{node.specialty}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-blue-900/30 rounded-lg p-2">
            <p className="text-lg font-bold text-blue-400">{formatVolume(node.outbound)}</p>
            <p className="text-[10px] text-blue-400">Sends</p>
          </div>
          <div className="bg-violet-900/30 rounded-lg p-2">
            <p className="text-lg font-bold text-violet-400">{formatVolume(node.inbound)}</p>
            <p className="text-[10px] text-violet-400">Receives</p>
          </div>
          <div className="bg-slate-700/30 rounded-lg p-2">
            <p className="text-lg font-bold text-slate-200">{(Number(node.partners) || 0).toLocaleString()}</p>
            <p className="text-[10px] text-slate-400">Partners</p>
          </div>
        </div>

        {list('Sends to', ArrowUpRight, outEdges, 'target', 'text-blue-400')}
        {list('Receives from', ArrowDownLeft, inEdges, 'source', 'text-violet-400')}

        <div className="flex flex-col gap-2">
          {onFocus && (
            <Button variant="outline" size="sm" onClick={() => onFocus(node)} className="w-full text-xs gap-1.5 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400">
              <Target className="w-3 h-3" aria-hidden="true" /> Show all of this provider's partners
            </Button>
          )}
          <Button asChild variant="outline" size="sm" className="w-full text-xs gap-1.5 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400">
            <Link to={createPageUrl(`ProviderDetail?npi=${node.npi}`)}>
              <ExternalLink className="w-3 h-3" aria-hidden="true" /> View provider profile
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
