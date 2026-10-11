import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { RefreshCw, Loader2, Info } from 'lucide-react';
import { invokeOrThrow } from '@/api/functionResult';
import QueryErrorState from '../shared/QueryErrorState';

const STATUS_ROWS = [
  { key: 'pending', label: 'Queued', color: '#6b7280' },
  { key: 'sent', label: 'Sent', color: '#3b82f6' },
  { key: 'delivered', label: 'Delivered', color: '#06b6d4' },
  { key: 'opened', label: 'Opened', color: '#10b981' },
  { key: 'clicked', label: 'Clicked', color: '#22c55e' },
  { key: 'responded', label: 'Responded', color: '#8b5cf6' },
  { key: 'bounced', label: 'Bounced', color: '#ef4444' },
  { key: 'failed', label: 'Failed', color: '#f97316' },
  { key: 'suppressed', label: 'Unsubscribed (skipped)', color: '#a855f7' },
];

/**
 * Delivery metrics rolled up on the server from outreach_messages (one count
 * query). Refreshes every 30s while the campaign is sending.
 */
export default function CampaignPerformanceMetrics({ campaign_id, status }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['campaignMetrics', campaign_id],
    queryFn: async () => {
      const result = await invokeOrThrow('trackCampaignMetrics', { campaign_id });
      // The rollup is also written to the campaign row, which the campaign
      // cards and totals read from their own query.
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      return result;
    },
    enabled: !!campaign_id,
    refetchInterval: status === 'sending' ? 30000 : false,
  });

  if (isLoading) {
    return <Card className="bg-[#141d30] border-slate-700/50"><CardContent className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Loading metrics…</CardContent></Card>;
  }
  if (isError) {
    return <QueryErrorState title="Couldn't load campaign metrics" error={error} onRetry={refetch} />;
  }

  const metrics = data.metrics;
  const funnel = [
    { name: 'Sent', value: metrics.sent },
    { name: 'Delivered', value: metrics.delivered },
    { name: 'Opened', value: metrics.opened },
    { name: 'Clicked', value: metrics.clicked },
    { name: 'Responded', value: metrics.responded },
  ];
  const kpis = [
    { label: 'Recipients', value: metrics.total_recipients.toLocaleString(), cls: 'text-slate-100' },
    { label: 'Sent', value: metrics.sent.toLocaleString(), cls: 'text-blue-400' },
    { label: 'Open rate', value: `${metrics.open_rate}%`, cls: 'text-emerald-400' },
    { label: 'Response rate', value: `${metrics.response_rate}%`, cls: 'text-purple-400' },
    { label: 'Bounce rate', value: `${metrics.bounce_rate}%`, cls: 'text-red-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map(k => (
          <Card key={k.label} className="bg-[#141d30] border-slate-700/50">
            <CardContent className="pt-4">
              <p className="text-xs text-slate-400">{k.label}</p>
              <p className={`text-2xl font-bold mt-1 ${k.cls}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!data.tracking?.webhookConfigured && metrics.sent > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-900/20 p-3 text-sm text-amber-300">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          Opens, clicks and bounces appear once the SendGrid event webhook is connected (SENDGRID_WEBHOOK_PUBLIC_KEY). Until then only sends are counted.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardHeader><CardTitle className="text-base text-slate-200">Engagement funnel</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={funnel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#0f1729', border: '1px solid #334155' }} />
                <Bar dataKey="value" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-[#141d30] border-slate-700/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base text-slate-200">Status breakdown</CardTitle>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="h-7 gap-1 text-xs">
              {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {STATUS_ROWS.filter(r => metrics[r.key] > 0).map(r => (
                <div key={r.key} className="flex items-center justify-between rounded bg-slate-800/60 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm text-slate-300">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                    {r.label}
                  </span>
                  <span className="text-sm font-semibold text-slate-100">
                    {metrics[r.key].toLocaleString()}
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      {metrics.total_recipients ? `${((metrics[r.key] / metrics.total_recipients) * 100).toFixed(1)}%` : ''}
                    </span>
                  </span>
                </div>
              ))}
              {metrics.total_recipients === 0 && (
                <p className="text-sm text-slate-400">No messages yet. Send the campaign to build its recipient list.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
