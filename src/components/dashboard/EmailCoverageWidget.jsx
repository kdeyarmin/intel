import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Mail, Bot, Download, TrendingUp } from 'lucide-react';

export default function EmailCoverageWidget({ providers }) {
  const total = providers.length;
  const withEmail = providers.filter(p => p.email).length;
  const searched = providers.filter(p => p.email_searched_at).length;
  const remaining = total - searched;
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-600" />
            Email Outreach Readiness
          </span>
          <Badge className={coveragePct >= 50 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
            {coveragePct}% coverage
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Coverage bar */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>{withEmail} of {total} providers have email</span>
            <span>{coveragePct}%</span>
          </div>
          <Progress value={coveragePct} className="h-2" />
        </div>

        {/* Confidence breakdown */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center p-2 bg-green-50 rounded-lg">
            <div className="text-lg font-bold text-green-700">{highConf}</div>
            <div className="text-[10px] text-green-600">High Conf.</div>
          </div>
          <div className="text-center p-2 bg-yellow-50 rounded-lg">
            <div className="text-lg font-bold text-yellow-700">{medConf}</div>
            <div className="text-[10px] text-yellow-600">Medium</div>
          </div>
          <div className="text-center p-2 bg-red-50 rounded-lg">
            <div className="text-lg font-bold text-red-700">{lowConf}</div>
            <div className="text-[10px] text-red-600">Low</div>
          </div>
        </div>

        {/* Search progress */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Search progress</span>
            <span>{searchedPct}% ({remaining} remaining)</span>
          </div>
          <Progress value={searchedPct} className="h-1.5" />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Link to={createPageUrl('EmailSearchBot')} className="flex-1">
            <Button variant="outline" size="sm" className="w-full text-xs gap-1.5">
              <Bot className="w-3.5 h-3.5" /> Run Email Bot
            </Button>
          </Link>
          {withEmail > 0 && (
            <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={downloadEmailCSV}>
              <Download className="w-3.5 h-3.5" /> Export CSV
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}