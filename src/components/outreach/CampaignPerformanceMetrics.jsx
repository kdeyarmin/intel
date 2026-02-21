import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { RefreshCw, TrendingUp, Mail, MessageSquare, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
const STATUS_COLORS = {
  pending: '#6b7280',
  sent: '#3b82f6',
  opened: '#10b981',
  responded: '#8b5cf6',
  bounced: '#ef4444'
};

export default function CampaignPerformanceMetrics({ campaign_id }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);

  const { data: campaign = {} } = useQuery({
    queryKey: ['campaign', campaign_id],
    queryFn: () => base44.entities.OutreachCampaign.filter({ id: campaign_id }, '-created_date', 1),
    enabled: !!campaign_id
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['campaignMessages', campaign_id],
    queryFn: () => base44.entities.OutreachMessage.filter({ campaign_id }),
    enabled: !!campaign_id,
    refetchInterval: 5000
  });

  const handleRefreshMetrics = async () => {
    setLoading(true);
    try {
      const result = await base44.functions.invoke('trackCampaignMetrics', {
        campaign_id
      });
      setMetrics(result.data.metrics);
    } catch (error) {
      console.error('Failed to refresh metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-calculate metrics from messages
  useEffect(() => {
    if (messages.length > 0) {
      const sent = messages.filter(m => ['sent', 'opened', 'responded', 'bounced'].includes(m.status)).length;
      const opened = messages.filter(m => m.opened_at).length;
      const responded = messages.filter(m => m.responded_at).length;
      const bounced = messages.filter(m => m.status === 'bounced').length;

      setMetrics({
        campaign_id,
        total_recipients: messages.length,
        sent_count: sent,
        pending_count: messages.filter(m => m.status === 'pending').length,
        open_rate: sent > 0 ? ((opened / sent) * 100).toFixed(1) : 0,
        response_rate: sent > 0 ? ((responded / sent) * 100).toFixed(1) : 0,
        bounce_rate: sent > 0 ? ((bounced / sent) * 100).toFixed(1) : 0,
        conversion_count: responded,
        messages_by_status: {
          pending: messages.filter(m => m.status === 'pending').length,
          generated: messages.filter(m => m.status === 'generated').length,
          sent: messages.filter(m => m.status === 'sent').length,
          opened,
          responded,
          bounced,
          failed: messages.filter(m => m.status === 'failed').length
        }
      });
    }
  }, [messages]);

  if (!metrics) {
    return (
      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle>Campaign Performance</CardTitle>
          <Button size="sm" variant="outline" disabled>Loading...</Button>
        </CardHeader>
        <CardContent>
          <div className="text-center text-slate-500">No data available yet</div>
        </CardContent>
      </Card>
    );
  }

  const statusData = Object.entries(metrics.messages_by_status).map(([key, value]) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1),
    value,
    fill: STATUS_COLORS[key] || '#666'
  }));

  const progressData = [
    { name: 'Sent', value: metrics.sent_count },
    { name: 'Opened', value: Math.round(metrics.sent_count * (metrics.open_rate / 100)) },
    { name: 'Responded', value: metrics.conversion_count }
  ];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-600">Total Recipients</p>
            <p className="text-2xl font-bold mt-1">{metrics.total_recipients}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-600">Sent</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">{metrics.sent_count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-600">Open Rate</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{metrics.open_rate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-600">Response Rate</p>
            <p className="text-2xl font-bold text-purple-600 mt-1">{metrics.response_rate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-slate-600">Converted</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{metrics.conversion_count}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Message Status Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Message Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={statusData.filter(d => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Engagement Funnel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Engagement Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={progressData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {statusData.map((status) => (
              status.value > 0 && (
                <div key={status.name} className="flex items-center justify-between p-3 bg-slate-50 rounded">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: status.fill }}
                    />
                    <span className="text-sm font-medium">{status.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">{status.value}</p>
                    <p className="text-xs text-slate-600">
                      {((status.value / metrics.total_recipients) * 100).toFixed(1)}% of total
                    </p>
                  </div>
                </div>
              )
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Refresh Button */}
      <Button 
        onClick={handleRefreshMetrics}
        disabled={loading}
        className="w-full gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        Refresh Metrics
      </Button>
    </div>
  );
}