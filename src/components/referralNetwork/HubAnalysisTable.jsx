import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Crown, ExternalLink, ArrowUp, ArrowDown } from 'lucide-react';
import { formatVolume } from './NetworkKPIs';

const COLS = [
  { key: 'totalVolume', label: 'Total volume', format: formatVolume, className: 'text-slate-300' },
  { key: 'outbound', label: 'Sends', format: formatVolume, className: 'text-blue-400' },
  { key: 'inbound', label: 'Receives', format: formatVolume, className: 'text-violet-400' },
  { key: 'partners', label: 'Partners', format: (v) => (Number(v) || 0).toLocaleString(), className: 'text-slate-300' },
];

/** The providers shown, ranked by hub score or any volume column. */
export default function HubAnalysisTable({ hubs = [], sortKey, sortDir, onSort }) {
  const SortIcon = sortDir === 'asc' ? ArrowUp : ArrowDown;
  const header = (key, label) => (
    <th key={key} scope="col" className="text-right py-2 font-medium" aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(key)} className="inline-flex items-center gap-1 hover:text-slate-200">
        {label}
        {sortKey === key && <SortIcon className="w-3 h-3" aria-hidden="true" />}
      </button>
    </th>
  );

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-400" aria-hidden="true" />
          Network hubs
          <Badge variant="outline" className="text-[10px] ml-auto text-slate-400">{hubs.length} providers</Badge>
        </CardTitle>
        <p className="text-xs text-slate-400">
          Hub score (0–100) blends where referrals flow (PageRank) with how many distinct partners a provider has.
        </p>
      </CardHeader>
      <CardContent>
        {hubs.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">No providers match the filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700/50 text-slate-400">
                  <th scope="col" className="text-left py-2 font-medium w-6">#</th>
                  <th scope="col" className="text-left py-2 font-medium">Provider</th>
                  <th scope="col" className="text-left py-2 font-medium w-16">Type</th>
                  {COLS.map((c) => header(c.key, c.label))}
                  {header('hubScore', 'Hub score')}
                  <th scope="col" className="w-8"><span className="sr-only">Profile</span></th>
                </tr>
              </thead>
              <tbody>
                {hubs.map((h, i) => (
                  <tr key={h.npi} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                    <td className="py-2 text-slate-400 font-mono">{i + 1}</td>
                    <td className="py-2">
                      <span className="font-medium text-slate-200">{h.label || h.npi}</span>
                      <span className="text-slate-400 ml-1.5 text-[10px]">{h.npi}</span>
                      {(h.specialtyGroupLabel || h.state) && (
                        <div className="text-[10px] text-slate-400">{[h.specialtyGroupLabel !== 'Other' ? h.specialtyGroupLabel : h.specialty, h.city, h.state].filter(Boolean).join(' · ')}</div>
                      )}
                    </td>
                    <td><Badge variant="outline" className="text-[10px] text-slate-400">{h.entityType === 'Organization' ? 'Org' : h.entityType === 'Individual' ? 'Ind' : '—'}</Badge></td>
                    {COLS.map((c) => (
                      <td key={c.key} className={`text-right font-mono ${c.className}`}>{c.format(h[c.key])}</td>
                    ))}
                    <td className="text-right">
                      <Badge className={`text-[10px] ${h.hubScore >= 80 ? 'bg-red-900/30 text-red-400' : h.hubScore >= 50 ? 'bg-amber-900/30 text-amber-400' : 'bg-slate-700/50 text-slate-300'}`}>
                        {Math.round(Number(h.hubScore) || 0)}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <Link to={createPageUrl(`ProviderDetail?npi=${h.npi}`)} aria-label={`Open ${h.label || h.npi}'s profile`}>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 hover:text-cyan-400 inline" aria-hidden="true" />
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
