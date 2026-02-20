import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Crown, ExternalLink, ArrowUpDown } from 'lucide-react';

export default function HubAnalysisTable({ hubs = [], sortKey, sortDir, onSort }) {
  const fv = (v) => {
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v.toLocaleString();
  };

  const cols = [
    { key: 'totalVolume', label: 'Total Volume' },
    { key: 'outbound', label: 'Outbound' },
    { key: 'inbound', label: 'Inbound' },
    { key: 'connections', label: 'Connections' },
    { key: 'hubScore', label: 'Hub Score' },
  ];

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-400" />
          Network Hubs
          <Badge variant="outline" className="text-[10px] ml-auto text-slate-500">{hubs.length} identified</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hubs.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">No hub providers identified</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/50 text-slate-500">
                  <th className="text-left py-2 font-medium w-6">#</th>
                  <th className="text-left py-2 font-medium">Provider</th>
                  <th className="text-left py-2 font-medium w-16">Type</th>
                  {cols.map(c => (
                    <th key={c.key} className="text-right py-2 font-medium cursor-pointer hover:text-slate-300 select-none" onClick={() => onSort(c.key)}>
                      <span className="flex items-center justify-end gap-1">
                        {c.label}
                        {sortKey === c.key && <ArrowUpDown className="w-3 h-3" />}
                      </span>
                    </th>
                  ))}
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {hubs.map((h, i) => (
                  <tr key={h.npi} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                    <td className="py-2 text-slate-500 font-mono">{i + 1}</td>
                    <td className="py-2">
                      <span className="font-medium text-slate-200">{h.label}</span>
                      <span className="text-slate-500 ml-1.5 text-[10px]">{h.npi}</span>
                    </td>
                    <td><Badge variant="outline" className="text-[10px] text-slate-400">{h.entityType === 'Organization' ? 'Org' : 'Ind'}</Badge></td>
                    <td className="text-right font-mono text-slate-400">{fv(h.totalVolume)}</td>
                    <td className="text-right font-mono text-blue-400">{fv(h.outbound)}</td>
                    <td className="text-right font-mono text-violet-400">{fv(h.inbound)}</td>
                    <td className="text-right text-slate-400">{h.connections}</td>
                    <td className="text-right">
                      <Badge className={`text-[10px] ${h.hubScore >= 80 ? 'bg-red-500/15 text-red-400' : h.hubScore >= 50 ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-700/50 text-slate-400'}`}>
                        {h.hubScore}
                      </Badge>
                    </td>
                    <td>
                      <Link to={createPageUrl(`ProviderDetail?npi=${h.npi}`)}>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500 hover:text-cyan-400" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}