import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, Plus, TrendingUp, MessageSquare } from 'lucide-react';
import CampaignBuilder from '../components/outreach/CampaignBuilder';
import CampaignPerformanceMetrics from '../components/outreach/CampaignPerformanceMetrics';
import PageHeader from '../components/shared/PageHeader';

export default function ProviderOutreach() {
  const [tab, setTab] = useState('campaigns');
  const [searchCampaign, setSearchCampaign] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const queryClient = useQueryClient();

  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => base44.entities.OutreachCampaign.list('-created_date', 100)
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['messages', selectedCampaign?.id],
    queryFn: () => selectedCampaign ? base44.entities.OutreachMessage.filter({ campaign_id: selectedCampaign.id }) : [],
    enabled: !!selectedCampaign?.id
  });

  const filteredCampaigns = campaigns.filter(c =>
    (c.name || '').toLowerCase().includes(searchCampaign.toLowerCase())
  );

  const getStatusColor = (status) => {
    const colors = {
      draft: 'bg-slate-100 text-slate-800',
      scheduled: 'bg-blue-100 text-blue-800',
      sending: 'bg-amber-100 text-amber-800',
      completed: 'bg-green-100 text-green-800',
      paused: 'bg-orange-100 text-orange-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 sm:space-y-6">
      <PageHeader
        title="Provider Outreach"
        subtitle="Create and manage provider engagement campaigns"
        icon={Mail}
        breadcrumbs={[{ label: 'Sales & Outreach', page: 'ProviderOutreach' }, { label: 'Campaigns' }]}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-800/60 border border-slate-700/50 h-auto flex flex-wrap gap-1">
          <TabsTrigger value="campaigns" className="gap-2 data-[state=active]:bg-[#141d30] data-[state=active]:text-cyan-400 text-slate-400">
            <Mail className="w-4 h-4" /> Campaigns
          </TabsTrigger>
          <TabsTrigger value="new" className="gap-2 data-[state=active]:bg-[#141d30] data-[state=active]:text-cyan-400 text-slate-400">
            <Plus className="w-4 h-4" /> New Campaign
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2 data-[state=active]:bg-[#141d30] data-[state=active]:text-cyan-400 text-slate-400">
            <TrendingUp className="w-4 h-4" /> Analytics
          </TabsTrigger>
        </TabsList>

        {/* View Campaigns */}
        <TabsContent value="campaigns" className="space-y-4">
          <Card className="bg-[#141d30] border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-lg text-slate-200">Active Campaigns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Input
                  placeholder="Search campaigns..."
                  value={searchCampaign}
                  onChange={(e) => setSearchCampaign(e.target.value)}
                  className="max-w-sm"
                />
              </div>

              {loadingCampaigns ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
                </div>
              ) : filteredCampaigns.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-400 mb-4">No campaigns yet</p>
                  <Button onClick={() => setTab('new')} className="gap-2">
                    <Plus className="w-4 h-4" /> Create First Campaign
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredCampaigns.map(campaign => (
                    <div
                      key={campaign.id}
                      onClick={() => {
                        setSelectedCampaign(campaign);
                        setTab('analytics');
                      }}
                      className="p-4 border border-slate-700/50 rounded-lg hover:bg-slate-800/30 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-sm text-slate-200">{campaign.name}</h3>
                          <p className="text-xs text-slate-400 mt-1">{campaign.description}</p>
                        </div>
                        <Badge className={getStatusColor(campaign.status)}>
                          {campaign.status}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-700/50">
                        <div className="text-center">
                          <p className="text-xs text-slate-500">Recipients</p>
                          <p className="font-bold text-lg text-slate-200 mt-1">{campaign.total_recipients || 0}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-500">Sent</p>
                          <p className="font-bold text-lg text-blue-400 mt-1">{campaign.sent_count || 0}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-500">Opened</p>
                          <p className="font-bold text-lg text-emerald-400 mt-1">{campaign.opened_count || 0}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-500">Responded</p>
                          <p className="font-bold text-lg text-purple-400 mt-1">{campaign.responded_count || 0}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Create New Campaign */}
        <TabsContent value="new" className="space-y-4">
          <Card className="bg-[#141d30] border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-slate-200">Create New Campaign</CardTitle>
              <p className="text-sm text-slate-400 mt-2">
                Design a personalized outreach campaign for a specific provider segment
              </p>
            </CardHeader>
            <CardContent>
              <CampaignBuilder
                onCampaignCreated={(campaign) => {
                  queryClient.invalidateQueries({ queryKey: ['campaigns'] });
                  setSelectedCampaign(campaign);
                  setTab('analytics');
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics & Performance */}
        <TabsContent value="analytics" className="space-y-4">
          {selectedCampaign ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white">{selectedCampaign.name}</h2>
                  <p className="text-sm text-slate-400 mt-1">{selectedCampaign.description}</p>
                </div>
                <Badge className={getStatusColor(selectedCampaign.status)}>
                  {selectedCampaign.status}
                </Badge>
              </div>

              <CampaignPerformanceMetrics campaign_id={selectedCampaign.id} />

              {/* Recent Messages */}
              <Card className="bg-[#141d30] border-slate-700/50">
                <CardHeader>
                  <CardTitle className="text-base text-slate-200">Recent Messages</CardTitle>
                </CardHeader>
                <CardContent>
                  {messages.slice(0, 5).length === 0 ? (
                    <p className="text-slate-400 text-sm">No messages sent yet</p>
                  ) : (
                    <div className="space-y-2">
                      {messages.slice(0, 5).map(msg => (
                        <div key={msg.id} className="flex items-center justify-between p-2 bg-slate-800/40 rounded text-sm">
                          <div>
                            <p className="font-medium text-slate-200">{msg.recipient_name}</p>
                            <p className="text-xs text-slate-500">{msg.npi}</p>
                          </div>
                          <Badge variant="outline">{msg.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="bg-[#141d30] border-slate-700/50">
              <CardContent className="pt-8 text-center">
                <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 mb-4">Select a campaign to view performance metrics</p>
                <Button onClick={() => setTab('campaigns')}>View Campaigns</Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}