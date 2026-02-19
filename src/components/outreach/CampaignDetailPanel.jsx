import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { X, Send, Eye, MessageSquare, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const statusColors = {
  pending: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-100 text-blue-700',
  opened: 'bg-emerald-100 text-emerald-700',
  responded: 'bg-violet-100 text-violet-700',
  bounced: 'bg-red-100 text-red-700',
  failed: 'bg-red-100 text-red-700',
};

const PIE_COLORS = ['#94a3b8', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b'];

export default function CampaignDetailPanel({ campaign, onClose }) {
  const queryClient = useQueryClient();

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['outreachMessages', campaign.id],
    queryFn: () => base44.entities.OutreachMessage.filter({ campaign_id: campaign.id }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.OutreachMessage.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(['outreachMessages', campaign.id]),
  });

  const statusCounts = messages.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{campaign.name}</h2>
          <p className="text-xs text-slate-500">{campaign.description}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: messages.length, icon: Send, color: 'text-slate-600 bg-slate-50' },
          { label: 'Sent', value: statusCounts.sent || 0, icon: Send, color: 'text-blue-600 bg-blue-50' },
          { label: 'Opened', value: statusCounts.opened || 0, icon: Eye, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Responded', value: statusCounts.responded || 0, icon: MessageSquare, color: 'text-violet-600 bg-violet-50' },
          { label: 'Bounced', value: (statusCounts.bounced || 0) + (statusCounts.failed || 0), icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
        ].map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className={`rounded-lg p-3 ${k.color}`}>
              <Icon className="w-3.5 h-3.5 mb-1" />
              <p className="text-lg font-bold">{k.value}</p>
              <p className="text-[10px]">{k.label}</p>
            </div>
          );
        })}
      </div>

      {/* Pie chart */}
      {pieData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Engagement Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({name, value}) => `${name} (${value})`} labelLine={false}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Messages table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recipients ({messages.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <div className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Recipient</TableHead>
                    <TableHead className="text-xs">NPI</TableHead>
                    <TableHead className="text-xs">Email</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Sent</TableHead>
                    <TableHead className="text-xs">Opened</TableHead>
                    <TableHead className="text-xs">Notes</TableHead>
                    <TableHead className="text-xs w-28">Update</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs font-medium">{m.recipient_name || '-'}</TableCell>
                      <TableCell className="text-[10px] font-mono text-slate-400">{m.npi}</TableCell>
                      <TableCell className="text-xs">{m.recipient_email || <span className="text-slate-300">—</span>}</TableCell>
                      <TableCell><Badge className={`text-[10px] ${statusColors[m.status]}`}>{m.status}</Badge></TableCell>
                      <TableCell className="text-[10px] text-slate-400">{m.sent_at ? new Date(m.sent_at).toLocaleDateString() : '-'}</TableCell>
                      <TableCell className="text-[10px] text-slate-400">{m.opened_at ? new Date(m.opened_at).toLocaleDateString() : '-'}</TableCell>
                      <TableCell className="text-[10px] text-slate-500 max-w-[120px] truncate">{m.response_notes || '-'}</TableCell>
                      <TableCell>
                        <Select value={m.status} onValueChange={(val) => {
                          const now = new Date().toISOString();
                          const updates = { status: val };
                          if (val === 'sent') updates.sent_at = now;
                          if (val === 'opened') updates.opened_at = now;
                          if (val === 'responded') updates.responded_at = now;
                          updateMutation.mutate({ id: m.id, data: updates });
                        }}>
                          <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="sent">Sent</SelectItem>
                            <SelectItem value="opened">Opened</SelectItem>
                            <SelectItem value="responded">Responded</SelectItem>
                            <SelectItem value="bounced">Bounced</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}