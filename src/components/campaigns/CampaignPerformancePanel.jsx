import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Mail, Eye, MessageSquare, AlertTriangle, UserCheck, TrendingUp, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const FUNNEL_COLORS = ['#06b6d4', '#3b82f6', '#22c55e', '#eab308', '#ef4444'];

export default function CampaignPerformancePanel({ campaign, onUpdate }) {
  const [saving, setSaving] = useState(false);
  const [metrics, setMetrics] = useState({
    emails_sent: campaign.emails_sent || 0,
    emails_opened: campaign.emails_opened || 0,
    emails_responded: campaign.emails_responded || 0,
    emails_bounced: campaign.emails_bounced || 0,
    conversions: campaign.conversions || 0,
    revenue_generated: campaign.revenue_generated || 0,
  });

  const handleSave = async () => {
    setSaving(true);
    const numMetrics = {};
    Object.entries(metrics).forEach(([k, v]) => { numMetrics[k] = Number(v) || 0; });
    await base44.entities.Campaign.update(campaign.id, numMetrics);
    onUpdate?.({ ...campaign, ...numMetrics });
    setSaving(false);
  };

  const sent = Number(metrics.emails_sent) || 0;
  const opened = Number(metrics.emails_opened) || 0;
  const responded = Number(metrics.emails_responded) || 0;
  const bounced = Number(metrics.emails_bounced) || 0;
  const conversions = Number(metrics.conversions) || 0;
  const revenue = Number(metrics.revenue_generated) || 0;
  const budget = campaign.budget || 0;

  const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0';
  const responseRate = sent > 0 ? ((responded / sent) * 100).toFixed(1) : '0';
  const bounceRate = sent > 0 ? ((bounced / sent) * 100).toFixed(1) : '0';
  const conversionRate = sent > 0 ? ((conversions / sent) * 100).toFixed(1) : '0';
  const roi = budget > 0 ? (((revenue - budget) / budget) * 100).toFixed(1) : '0';
  const costPerConversion = conversions > 0 ? (budget / conversions).toFixed(0) : '-';

  const funnelData = [
    { name: 'Sent', value: sent },
    { name: 'Opened', value: opened },
    { name: 'Responded', value: responded },
    { name: 'Converted', value: conversions },
  ].filter(d => d.value > 0 || sent > 0);

  const pieData = [
    { name: 'Opened', value: Math.max(0, opened - responded) },
    { name: 'Responded', value: Math.max(0, responded - conversions) },
    { name: 'Converted', value: conversions },
    { name: 'Bounced', value: bounced },
    { name: 'No Action', value: Math.max(0, sent - opened - bounced) },
  ].filter(d => d.value > 0);

  const PIE_COLORS = ['#3b82f6', '#22c55e', '#06b6d4', '#ef4444', '#6b7280'];

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { icon: Mail, label: 'Emails Sent', value: sent, color: 'text-cyan-400' },
          { icon: Eye, label: 'Open Rate', value: `${openRate}%`, color: 'text-blue-400' },
          { icon: MessageSquare, label: 'Response Rate', value: `${responseRate}%`, color: 'text-green-400' },
          { icon: AlertTriangle, label: 'Bounce Rate', value: `${bounceRate}%`, color: Number(bounceRate) > 5 ? 'text-red-400' : 'text-slate-400' },
          { icon: UserCheck, label: 'Conversions', value: conversions, color: 'text-emerald-400' },
          { icon: TrendingUp, label: 'ROI', value: budget > 0 ? `${roi}%` : '-', color: Number(roi) >= 0 ? 'text-emerald-400' : 'text-red-400' },
        ].map(({ icon: Icon, label, value, color }) => (
          <Card key={label} className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="p-3 text-center">
              <Icon className={`w-4 h-4 mx-auto ${color} mb-1`} />
              <div className="text-lg font-bold text-slate-100">{value}</div>
              <div className="text-[10px] text-slate-400">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      {sent > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="bg-[#141d30] border-slate-700/50">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Email Funnel</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={funnelData}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {funnelData.map((_, i) => <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-[#141d30] border-slate-700/50">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Outcome Breakdown</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 justify-center">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1 text-[10px] text-slate-300">
                    <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    {d.name} ({d.value})
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Manual metrics input */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Update Metrics</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { key: 'emails_sent', label: 'Emails Sent' },
              { key: 'emails_opened', label: 'Opened' },
              { key: 'emails_responded', label: 'Responded' },
              { key: 'emails_bounced', label: 'Bounced' },
              { key: 'conversions', label: 'Conversions' },
              { key: 'revenue_generated', label: 'Revenue ($)' },
            ].map(({ key, label }) => (
              <div key={key}>
                <Label className="text-[10px] text-slate-500">{label}</Label>
                <Input
                  type="number"
                  value={metrics[key]}
                  onChange={e => setMetrics(p => ({ ...p, [key]: e.target.value }))}
                  className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-200"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-3">
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1 bg-cyan-600 hover:bg-cyan-700">
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Save Metrics
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}