import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Mail, Bot, Download } from 'lucide-react';

export default function EmailCoverageWidget({ providers = [] }) {
  const total = providers.length;
  const withEmail = providers.filter(p => p.email).length;
  const searched = providers.filter(p => p.email_searched_at).length;
  const remaining = Math.max(0, total - searched);
  const coveragePct = total > 0 ? Math.round((withEmail / total) * 100) : 0;
  const searchedPct = total > 0 ? Math.round((searched / total) * 100) : 0;

  const highConf = providers.filter(p => p.email_confidence === 'high').length;
  const medConf = providers.filter(p => p.email_confidence === 'medium').length;
  const lowConf = providers.filter(p => p.email_confidence === 'low').length;

  const downloadEmailCSV = () => {
    const rows = providers
      .filter(p => p.email)
      .map(p => {
        const name = p.entity_type === 'Individual'
          ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
          : p.organization_name || '';
        return [p.npi, name, p.credential || '', p.entity_type || '', p.email, p.email_confidence || '', p.email_source || ''];
      });

    const headers = ['NPI', 'Name', 'Credential', 'Type', 'Email', 'Confidence', 'Source'];
    const csv = [
      headers.join(','),
      ...rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `provider_emails_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  };

  return (
    <Card className="bg-[#141d30] border-slate-700/50 shadow-lg shadow-black/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2 text-white font-semibold text-base">
            <Mail className="w-4 h-4 text-cyan-400" />
            Email Outreach Readiness
          </span>
          <Badge className={coveragePct >= 50 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'}>
            {coveragePct}% coverage
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm text-slate-200 mb-1.5">
            <span>{withEmail} of {total} providers have email</span>
            <span>{coveragePct}%</span>
          </div>
          <div className="h-2 bg-slate-700/60 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all" style={{ width: `${coveragePct}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <div className="text-xl font-bold text-emerald-400">{highConf}</div>
            <div className="text-xs text-emerald-300">High Conf.</div>
          </div>
          <div className="text-center p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div className="text-xl font-bold text-amber-400">{medConf}</div>
            <div className="text-xs text-amber-300">Medium</div>
          </div>
          <div className="text-center p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="text-xl font-bold text-red-400">{lowConf}</div>
            <div className="text-xs text-red-300">Low</div>
          </div>
        </div>

        <div>
          <div className="flex justify-between text-sm text-slate-200 mb-1.5">
            <span>Search progress</span>
            <span>{searchedPct}% ({remaining} remaining)</span>
          </div>
          <div className="h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
            <div className="h-full bg-violet-500/70 rounded-full transition-all" style={{ width: `${searchedPct}%` }} />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Link to={createPageUrl('EmailSearchBot')} className="flex-1">
            <Button variant="outline" size="sm" className="w-full text-xs gap-1.5 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400 hover:border-cyan-500/30">
              <Bot className="w-3.5 h-3.5" /> Run Email Bot
            </Button>
          </Link>
          {withEmail > 0 && (
            <Button variant="outline" size="sm" className="text-xs gap-1.5 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400 hover:border-cyan-500/30" onClick={downloadEmailCSV}>
              <Download className="w-3.5 h-3.5" /> CSV
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}