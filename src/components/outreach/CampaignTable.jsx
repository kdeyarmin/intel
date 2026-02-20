import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Trash2, Play, Pause, Sparkles } from 'lucide-react';
import { formatDateET } from '../utils/dateUtils';

const statusColors = {
  draft: 'bg-slate-100 text-slate-700',
  scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
  paused: 'bg-red-100 text-red-700',
};

const sourceLabels = {
  lead_list: 'Lead List',
  referral_hubs: 'Referral Hubs',
  network_position: 'Network Position',
  data_quality: 'Data Quality',
  custom: 'Custom',
};

export default function CampaignTable({ campaigns = [], onView, onDelete, onToggle, onAnalyze }) {
  if (campaigns.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-slate-400">
          No campaigns yet. Create one to get started.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Campaigns</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Sent</TableHead>
              <TableHead className="text-right">Opened</TableHead>
              <TableHead className="text-right">Responded</TableHead>
              <TableHead className="text-right">Open %</TableHead>
              <TableHead>Created</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map(c => {
              const openRate = c.sent_count > 0 ? ((c.opened_count / c.sent_count) * 100).toFixed(1) : '-';
              return (
                <TableRow key={c.id} className="hover:bg-slate-50/50">
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{c.name}</p>
                      {c.description && <p className="text-[10px] text-slate-400 truncate max-w-[200px]">{c.description}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{sourceLabels[c.source_criteria] || c.source_criteria}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] ${statusColors[c.status] || 'bg-slate-100'}`}>{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{c.sent_count || 0}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-emerald-600">{c.opened_count || 0}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-violet-600">{c.responded_count || 0}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{openRate}%</TableCell>
                  <TableCell className="text-xs text-slate-500">{formatDateET(c.created_date)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onView(c)}><Eye className="w-3.5 h-3.5" /></Button>
                      {c.status === 'draft' && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-teal-600" onClick={() => onToggle(c, 'sending')}><Play className="w-3.5 h-3.5" /></Button>
                      )}
                      {c.status === 'sending' && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600" onClick={() => onToggle(c, 'paused')}><Pause className="w-3.5 h-3.5" /></Button>
                      )}
                      {c.status === 'completed' && onAnalyze && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-violet-500 hover:text-violet-700" onClick={() => onAnalyze(c)} title="AI Performance Analysis"><Sparkles className="w-3.5 h-3.5" /></Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => onDelete(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}