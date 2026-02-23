import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Users, UserCheck, ArrowLeft, BarChart3, ListTodo, Target, Zap } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import CampaignPerformancePanel from './CampaignPerformancePanel';
import CampaignTaskManager from './CampaignTaskManager';
// Removed invalid import

const STATUS_COLORS = { 'New': '#3b82f6', 'Contacted': '#eab308', 'Qualified': '#22c55e', 'Not a fit': '#6b7280' };
const STATUS_STYLES = {
  draft: 'bg-slate-500/15 text-slate-400',
  active: 'bg-emerald-500/15 text-emerald-400',
  paused: 'bg-amber-500/15 text-amber-400',
  completed: 'bg-blue-500/15 text-blue-400',
  archived: 'bg-slate-500/15 text-slate-500',
};

export default function CampaignAnalytics({ campaign, onBack, onUpdate }) {
  const [loading, setLoading] = useState(true);
  const [listsData, setListsData] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [activeTab, setActiveTab] = useState('performance');

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

  const leadStats = useMemo(() => {
    const total = allMembers.length;
    const statusCounts = { New: 0, Contacted: 0, Qualified: 0, 'Not a fit': 0 };
    allMembers.forEach(m => { statusCounts[m.status || 'New'] = (statusCounts[m.status || 'New'] || 0) + 1; });
    const contacted = statusCounts.Contacted + statusCounts.Qualified + statusCounts['Not a fit'];
    const qualified = statusCounts.Qualified;
    const contactRate = total > 0 ? (contacted / total) * 100 : 0;
    const conversionRate = contacted > 0 ? (qualified / contacted) * 100 : 0;
    return { total, statusCounts, contacted, qualified, contactRate, conversionRate };
  }, [allMembers]);

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
            {campaign.goal && <p className="text-xs text-cyan-400/80 mt-0.5 flex items-center gap-1"><Target className="w-3 h-3" /> {campaign.goal}</p>}
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-4 bg-slate-800/50 h-9">
          <TabsTrigger value="performance" className="text-xs gap-1 data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400">
            <BarChart3 className="w-3.5 h-3.5" /> Performance
          </TabsTrigger>
          <TabsTrigger value="leads" className="text-xs gap-1 data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400">
            <Users className="w-3.5 h-3.5" /> Leads
            {leadStats.total > 0 && <Badge className="bg-cyan-500/20 text-cyan-400 text-[9px] ml-1">{leadStats.total}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs gap-1 data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400">
            <ListTodo className="w-3.5 h-3.5" /> Tasks
          </TabsTrigger>
          <TabsTrigger value="automation" className="text-xs gap-1 data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-400">
            <Zap className="w-3.5 h-3.5" /> Automation
          </TabsTrigger>
        </TabsList>

        {/* Performance Tab */}
        <TabsContent value="performance" className="mt-4">
          <CampaignPerformancePanel campaign={campaign} onUpdate={onUpdate} />
        </TabsContent>

        {/* Leads Tab */}
        <TabsContent value="leads" className="mt-4 space-y-4">
          {/* Lead KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { icon: Users, label: 'Total Leads', value: leadStats.total, color: 'text-blue-400' },
              { icon: UserCheck, label: 'Contact Rate', value: `${leadStats.contactRate.toFixed(1)}%`, color: 'text-yellow-400' },
              { icon: Target, label: 'Qualified', value: leadStats.qualified, color: 'text-green-400' },
              { icon: BarChart3, label: 'CVR', value: `${leadStats.conversionRate.toFixed(1)}%`, color: 'text-emerald-400' },
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

          {/* Per-list chart */}
          {perListStats.length > 0 && (
            <Card className="bg-[#141d30] border-slate-700/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">Performance by List</CardTitle></CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          )}

          {/* Per-List Table */}
          {perListStats.length > 0 && (
            <Card className="bg-[#141d30] border-slate-700/50">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-300">List-Level Breakdown</CardTitle></CardHeader>
              <CardContent>
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
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {leadStats.total === 0 && (
            <Card className="bg-[#141d30] border-slate-700/50">
              <CardContent className="py-8 text-center">
                <Users className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No leads linked to this campaign yet</p>
                <p className="text-xs text-slate-500 mt-1">Add lead lists to this campaign to start tracking lead progress</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="mt-4">
          <CampaignTaskManager campaignId={campaign.id} />
        </TabsContent>

        {/* Automation Tab */}
        <TabsContent value="automation" className="mt-4">
          <CampaignAutomationPanel campaign={campaign} />
        </TabsContent>
      </Tabs>

      {/* Target vs Actual */}
      {campaign.target_conversion_rate > 0 && activeTab === 'performance' && (
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400">Conversion vs Target</span>
              <span className="text-xs text-slate-400">Target: {campaign.target_conversion_rate}%</span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-700/60 overflow-hidden relative">
              <div className="absolute top-0 h-full w-0.5 bg-amber-400 z-10" style={{ left: `${Math.min(campaign.target_conversion_rate, 100)}%` }} />
              {(() => {
                const sent = campaign.emails_sent || 0;
                const conv = campaign.conversions || 0;
                const actual = sent > 0 ? (conv / sent) * 100 : 0;
                return (
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${actual >= campaign.target_conversion_rate ? 'bg-emerald-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(actual, 100)}%` }}
                  />
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}