import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, UserCheck, Phone, DollarSign, Target, TrendingUp, ArrowLeft, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from 'recharts';

const STATUS_COLORS = { 'New': '#3b82f6', 'Contacted': '#eab308', 'Qualified': '#22c55e', 'Not a fit': '#6b7280' };
const STATUS_STYLES = {
  draft: 'bg-slate-500/15 text-slate-400',
  active: 'bg-emerald-500/15 text-emerald-400',
  paused: 'bg-amber-500/15 text-amber-400',
  completed: 'bg-blue-500/15 text-blue-400',
};

export default function CampaignAnalytics({ campaign, onBack, onUpdate }) {
  const [loading, setLoading] = useState(true);
  const [listsData, setListsData] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [revenueInput, setRevenueInput] = useState(campaign.revenue_generated || 0);
  const [savingRevenue, setSavingRevenue] = useState(false);

  useEffect(() => {
    loadData();
  }, [campaign.id]);

  const loadData = async () => {
    setLoading(true);
    const listIds = campaign.lead_list_ids || [];
    if (listIds.length === 0) { setLoading(false); return; }

    const lists = await base44.entities.LeadList.list('-created_date', 200);
    const linkedLists = lists.filter(l => listIds.includes(l.id));

    let members = [];
    for (const lid of listIds) {
      const m = await base44.entities.LeadListMember.filter({ lead_list_id: lid });
      members.push(...m.map(mm => ({ ...mm, _list_id: lid })));
    }

    setListsData(linkedLists);
    setAllMembers(members);
    setLoading(false);
  };

  const stats = useMemo(() => {
    const total = allMembers.length;
    const statusCounts = { New: 0, Contacted: 0, Qualified: 0, 'Not a fit': 0 };
    allMembers.forEach(m => { statusCounts[m.status || 'New'] = (statusCounts[m.status || 'New'] || 0) + 1; });

    const contacted = statusCounts.Contacted + statusCounts.Qualified + statusCounts['Not a fit'];
    const qualified = statusCounts.Qualified;
    const contactRate = total > 0 ? (contacted / total) * 100 : 0;
    const conversionRate = contacted > 0 ? (qualified / contacted) * 100 : 0;
    const qualificationRate = total > 0 ? (qualified / total) * 100 : 0;

    const budget = campaign.budget || 0;
    const revenue = campaign.revenue_generated || 0;
    const roi = budget > 0 ? ((revenue - budget) / budget) * 100 : 0;
    const costPerLead = total > 0 ? budget / total : 0;
    const costPerQualified = qualified > 0 ? budget / qualified : 0;

    return { total, statusCounts, contacted, qualified, contactRate, conversionRate, qualificationRate, roi, costPerLead, costPerQualified, budget, revenue };
  }, [allMembers, campaign]);

  const perListStats = useMemo(() => {
    return listsData.map(list => {
      const members = allMembers.filter(m => m._list_id === list.id);
      const total = members.length;
      const qualified = members.filter(m => m.status === 'Qualified').length;
      const contacted = members.filter(m => ['Contacted', 'Qualified', 'Not a fit'].includes(m.status)).length;
      const cvr = contacted > 0 ? ((qualified / contacted) * 100).toFixed(1) : '0';
      return { name: list.name, total, contacted, qualified, cvr: Number(cvr), notAFit: members.filter(m => m.status === 'Not a fit').length, newCount: members.filter(m => (m.status || 'New') === 'New').length };
    });
  }, [listsData, allMembers]);

  const pieData = Object.entries(stats.statusCounts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));

  const handleSaveRevenue = async () => {
    setSavingRevenue(true);
    await base44.entities.Campaign.update(campaign.id, { revenue_generated: Number(revenueInput) });
    onUpdate?.({ ...campaign, revenue_generated: Number(revenueInput) });
    setSavingRevenue(false);
  };

  const handleStatusChange = async (newStatus) => {
    await base44.entities.Campaign.update(campaign.id, { status: newStatus });
    onUpdate?.({ ...campaign, status: newStatus });
  };

  if (loading) return <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}</div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={onBack} className="h-8 w-8 p-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white">{campaign.name}</h2>
              <Badge className={STATUS_STYLES[campaign.status]}>{campaign.status}</Badge>
            </div>
            {campaign.description && <p className="text-xs text-slate-400 mt-0.5">{campaign.description}</p>}
          </div>
        </div>
        <Select value={campaign.status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {['draft', 'active', 'paused', 'completed', 'archived'].map(s => (
              <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { icon: Users, label: 'Total Leads', value: stats.total, color: 'text-blue-400' },
          { icon: Phone, label: 'Contact Rate', value: `${stats.contactRate.toFixed(1)}%`, color: 'text-yellow-400' },
          { icon: UserCheck, label: 'Conversion Rate', value: `${stats.conversionRate.toFixed(1)}%`, color: 'text-emerald-400' },
          { icon: Target, label: 'Qualified', value: stats.qualified, color: 'text-green-400' },
          { icon: DollarSign, label: 'ROI', value: stats.budget > 0 ? `${stats.roi.toFixed(0)}%` : '-', color: stats.roi >= 0 ? 'text-emerald-400' : 'text-red-400' },
          { icon: TrendingUp, label: 'Cost/Qualified', value: stats.costPerQualified > 0 ? `$${stats.costPerQualified.toFixed(0)}` : '-', color: 'text-violet-400' },
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

      {/* Revenue / ROI input */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardContent className="p-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs text-slate-400">Revenue Generated ($)</Label>
              <Input type="number" value={revenueInput} onChange={e => setRevenueInput(e.target.value)} className="h-8 mt-1" />
            </div>
            <div className="text-center px-4">
              <div className="text-xs text-slate-500">Budget</div>
              <div className="text-sm font-semibold text-slate-200">${(stats.budget || 0).toLocaleString()}</div>
            </div>
            <div className="text-center px-4">
              <div className="text-xs text-slate-500">ROI</div>
              <div className={`text-sm font-bold ${stats.roi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {stats.budget > 0 ? `${stats.roi.toFixed(1)}%` : '-'}
              </div>
            </div>
            <Button size="sm" onClick={handleSaveRevenue} disabled={savingRevenue} className="h-8 gap-1">
              {savingRevenue ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Status Breakdown</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                  {pieData.map(e => <Cell key={e.name} fill={STATUS_COLORS[e.name] || '#6b7280'} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center">
              {pieData.map(d => (
                <div key={d.name} className="flex items-center gap-1 text-[10px] text-slate-300">
                  <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[d.name] }} />
                  {d.name} ({d.value})
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#141d30] border-slate-700/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Performance by List</CardTitle></CardHeader>
          <CardContent>
            {perListStats.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">No lists linked</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={perListStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="newCount" name="New" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="contacted" name="Contacted" fill="#eab308" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="qualified" name="Qualified" fill="#22c55e" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="notAFit" name="Not a fit" fill="#6b7280" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-List Table */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">List-Level Performance</CardTitle></CardHeader>
        <CardContent>
          {perListStats.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">No lists linked</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700/50 text-[11px] text-slate-400">
                    <th className="text-left py-2 pr-4">List Name</th>
                    <th className="text-center px-2">Total</th>
                    <th className="text-center px-2">New</th>
                    <th className="text-center px-2">Contacted</th>
                    <th className="text-center px-2">Qualified</th>
                    <th className="text-center px-2">Not a Fit</th>
                    <th className="text-center px-2">CVR</th>
                  </tr>
                </thead>
                <tbody>
                  {perListStats.map((row, i) => (
                    <tr key={i} className="border-b border-slate-800/40">
                      <td className="py-2 pr-4 font-medium text-slate-200">{row.name}</td>
                      <td className="text-center text-slate-300">{row.total}</td>
                      <td className="text-center text-blue-400">{row.newCount}</td>
                      <td className="text-center text-yellow-400">{row.contacted}</td>
                      <td className="text-center text-green-400">{row.qualified}</td>
                      <td className="text-center text-slate-400">{row.notAFit}</td>
                      <td className="text-center">
                        <Badge className={`text-[10px] ${row.cvr >= (campaign.target_conversion_rate || 0) ? 'bg-green-500/15 text-green-400' : 'bg-slate-500/15 text-slate-400'}`}>
                          {row.cvr}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {/* Totals */}
                  <tr className="font-semibold">
                    <td className="py-2 pr-4 text-slate-200">Total</td>
                    <td className="text-center text-slate-200">{stats.total}</td>
                    <td className="text-center text-blue-400">{stats.statusCounts.New}</td>
                    <td className="text-center text-yellow-400">{stats.statusCounts.Contacted}</td>
                    <td className="text-center text-green-400">{stats.statusCounts.Qualified}</td>
                    <td className="text-center text-slate-400">{stats.statusCounts['Not a fit']}</td>
                    <td className="text-center">
                      <Badge className="text-[10px] bg-cyan-500/15 text-cyan-400">{stats.conversionRate.toFixed(1)}%</Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Target vs Actual */}
      {campaign.target_conversion_rate > 0 && (
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">Conversion vs Target</span>
              <span className="text-xs text-slate-400">Target: {campaign.target_conversion_rate}%</span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-700/60 overflow-hidden relative">
              {/* Target marker */}
              <div className="absolute top-0 h-full w-0.5 bg-amber-400 z-10" style={{ left: `${Math.min(campaign.target_conversion_rate, 100)}%` }} />
              {/* Actual bar */}
              <div
                className={`h-full rounded-full transition-all duration-700 ${stats.conversionRate >= campaign.target_conversion_rate ? 'bg-emerald-500' : 'bg-blue-500'}`}
                style={{ width: `${Math.min(stats.conversionRate, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] mt-1">
              <span className={stats.conversionRate >= campaign.target_conversion_rate ? 'text-emerald-400' : 'text-blue-400'}>
                Actual: {stats.conversionRate.toFixed(1)}%
              </span>
              <span className="text-amber-400">Target: {campaign.target_conversion_rate}%</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}