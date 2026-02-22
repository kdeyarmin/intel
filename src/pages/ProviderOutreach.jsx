import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, Plus, TrendingUp, MessageSquare, Clock } from 'lucide-react';
import CampaignBuilder from '../components/outreach/CampaignBuilder';
import CampaignPerformanceMetrics from '../components/outreach/CampaignPerformanceMetrics';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';
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
    c.name.toLowerCase().includes(searchCampaign.toLowerCase())
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
        breadcrumbs={[{ label: 'Sales & Outreach' }, { label: 'Campaigns' }]}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-100">
          <TabsTrigger value="campaigns" className="gap-2">
            <Mail className="w-4 h-4" /> Campaigns
          </TabsTrigger>
          <TabsTrigger value="new" className="gap-2">
            <Plus className="w-4 h-4" /> New Campaign
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <TrendingUp className="w-4 h-4" /> Analytics
          </TabsTrigger>
        </TabsList>

        {/* View Campaigns */}
        <TabsContent value="campaigns" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Active Campaigns</CardTitle>
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
                  <p className="text-slate-600 mb-4">No campaigns yet</p>
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
                      className="p-4 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-sm">{campaign.name}</h3>
                          <p className="text-xs text-slate-600 mt-1">{campaign.description}</p>
                        </div>
                        <Badge className={getStatusColor(campaign.status)}>
                          {campaign.status}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t">
                        <div className="text-center">
                          <p className="text-xs text-slate-600">Recipients</p>
                          <p className="font-bold text-lg mt-1">{campaign.total_recipients || 0}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-600">Sent</p>
                          <p className="font-bold text-lg text-blue-600 mt-1">{campaign.sent_count || 0}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-600">Opened</p>
                          <p className="font-bold text-lg text-green-600 mt-1">{campaign.opened_count || 0}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-slate-600">Responded</p>
                          <p className="font-bold text-lg text-purple-600 mt-1">{campaign.responded_count || 0}</p>
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
          <Card>
            <CardHeader>
              <CardTitle>Create New Campaign</CardTitle>
              <p className="text-sm text-slate-600 mt-2">
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
                  <h2 className="text-2xl font-bold">{selectedCampaign.name}</h2>
                  <p className="text-sm text-slate-600 mt-1">{selectedCampaign.description}</p>
                </div>
                <Badge className={getStatusColor(selectedCampaign.status)}>
                  {selectedCampaign.status}
                </Badge>
              </div>

              <CampaignPerformanceMetrics campaign_id={selectedCampaign.id} />

              {/* Recent Messages */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recent Messages</CardTitle>
                </CardHeader>
                <CardContent>
                  {messages.slice(0, 5).length === 0 ? (
                    <p className="text-slate-600 text-sm">No messages sent yet</p>
                  ) : (
                    <div className="space-y-2">
                      {messages.slice(0, 5).map(msg => (
                        <div key={msg.id} className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm">
                          <div>
                            <p className="font-medium">{msg.recipient_name}</p>
                            <p className="text-xs text-slate-600">{msg.npi}</p>
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
            <Card>
              <CardContent className="pt-8 text-center">
                <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600 mb-4">Select a campaign to view performance metrics</p>
                <Button onClick={() => setTab('campaigns')}>View Campaigns</Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}