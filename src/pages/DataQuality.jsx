import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ShieldCheck, Play, Loader2, AlertTriangle, CheckCircle,
  BarChart3, Clock, Sparkles, ListChecks, ShieldAlert, Bot, MapPin, Copy
} from 'lucide-react';
import QualityScoreCard from '../components/dataQuality/QualityScoreCard';
import RuleResultsTable from '../components/dataQuality/RuleResultsTable';
import AlertsList from '../components/dataQuality/AlertsList';
import ScanHistoryPanel from '../components/dataQuality/ScanHistoryPanel';
import AlertTrendChart from '../components/dataQuality/AlertTrendChart';
import ProactiveAIScanner from '../components/dataQuality/ProactiveAIScanner';
import DQAssistant from '../components/dataQuality/DQAssistant';
import ProfileCompletenessChart from '../components/dataQuality/ProfileCompletenessChart';
import StateQualityBreakdown from '../components/dataQuality/StateQualityBreakdown';
import DuplicateStatsWidget from '../components/dataQuality/DuplicateStatsWidget';
import ProactiveDQAlerts from '../components/dataQuality/ProactiveDQAlerts';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';
import PageHeader from '../components/shared/PageHeader';

export default function DataQuality() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');

  const { data: scans = [], isLoading: scansLoading } = useQuery({
    queryKey: ['dqScans'],
    queryFn: () => base44.entities.DataQualityScan.list('-created_date', 20),
    staleTime: 30000,
  });

  const { data: alerts = [], isLoading: alertsLoading } = useQuery({
    queryKey: ['dqAlerts'],
    queryFn: () => base44.entities.DataQualityAlert.list('-created_date', 200),
    staleTime: 30000,
  });

  const { data: providers = [] } = useQuery({
    queryKey: ['dqProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 10000),
    staleTime: 120000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['dqLocations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 10000),
    staleTime: 120000,
  });

  const { data: batches = [] } = useQuery({
    queryKey: ['dqBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 50),
    staleTime: 60000,
  });

  const runScanMutation = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('runDataQualityScan', { action: 'run_scan' });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dqScans'] });
      queryClient.invalidateQueries({ queryKey: ['dqAlerts'] });
    },
  });

  const latestScan = scans[0];
  const latestScores = latestScan?.scores || { completeness: 0, accuracy: 0, timeliness: 0, consistency: 0, overall: 0 };

  const openAlerts = alerts.filter(a => a.status === 'open');
  const criticalAlerts = openAlerts.filter(a => a.severity === 'critical' || a.severity === 'high');
  const withSuggestions = alerts.filter(a => a.suggested_value && a.status === 'open');

  const latestRuleResults = latestScan?.rule_results || [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 sm:space-y-6">
      <PageHeader
        title="Data Quality Center"
        subtitle="Automated quality monitoring, alerts, and AI-powered corrections"
        icon={ShieldCheck}
        breadcrumbs={[{ label: 'Admin' }, { label: 'Data Quality' }]}
        actions={<>
        </>}
      />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div />
        <div className="flex items-center gap-3">
          {latestScan?.completed_at && (
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last scan: {new Date(latestScan.completed_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} ET
            </span>
          )}
          <Button
            onClick={() => runScanMutation.mutate()}
            disabled={runScanMutation.isPending}
            className="bg-cyan-600 hover:bg-cyan-700"
          >
            {runScanMutation.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Running Scan...</>
            ) : (
              <><Play className="w-4 h-4 mr-2" />Run Quality Scan</>
            )}
          </Button>
        </div>
      </div>

      {/* Score Cards */}
      {scansLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-24 bg-slate-700/50" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <QualityScoreCard label="Overall" score={latestScores.overall} icon={ShieldCheck} />
          <QualityScoreCard label="Completeness" score={latestScores.completeness} icon={ListChecks} />
          <QualityScoreCard label="Accuracy" score={latestScores.accuracy} icon={CheckCircle} />
          <QualityScoreCard label="Timeliness" score={latestScores.timeliness} icon={Clock} />
          <QualityScoreCard label="Consistency" score={latestScores.consistency} icon={BarChart3} />
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-amber-500/10 border-amber-500/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-amber-400">Open Alerts</p>
              <p className="text-2xl font-bold text-amber-300">{openAlerts.length}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-amber-500/40" />
          </CardContent>
        </Card>
        <Card className="bg-red-500/10 border-red-500/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-red-400">Critical / High</p>
              <p className="text-2xl font-bold text-red-300">{criticalAlerts.length}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-500/40" />
          </CardContent>
        </Card>
        <Card className="bg-violet-500/10 border-violet-500/20">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-violet-400">AI Suggestions</p>
              <p className="text-2xl font-bold text-violet-300">{withSuggestions.length}</p>
            </div>
            <Sparkles className="w-8 h-8 text-violet-500/40" />
          </CardContent>
        </Card>
      </div>

      {/* Data Quality Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ProfileCompletenessChart providers={providers} />
        </div>
        <DuplicateStatsWidget batches={batches} />
      </div>

      <StateQualityBreakdown providers={providers} locations={locations} />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800/50 w-full grid grid-cols-3 sm:grid-cols-6 h-auto">
          <TabsTrigger value="overview" className="text-xs">Rules</TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs">
            Alerts
            {openAlerts.length > 0 && (
              <Badge className="ml-1.5 bg-amber-500 text-white text-[10px] h-4 px-1.5">{openAlerts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="assistant" className="gap-1 text-xs">
            <Bot className="w-3.5 h-3.5" /> <span className="hidden sm:inline">AI </span>Assistant
          </TabsTrigger>
          <TabsTrigger value="predictive" className="gap-1 text-xs">
            <ShieldAlert className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Predictive</span><span className="sm:hidden">Predict</span>
          </TabsTrigger>
          <TabsTrigger value="proactive" className="gap-1 text-xs">
            <ShieldAlert className="w-3.5 h-3.5" /> Scanner
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Card className="bg-[#141d30] border-slate-700/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-slate-300">Quality Rules ({latestRuleResults.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {latestRuleResults.length > 0 ? (
                    <RuleResultsTable results={latestRuleResults} />
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-8">Run a scan to see rule results</p>
                  )}
                </CardContent>
              </Card>
            </div>
            <AlertTrendChart alerts={openAlerts} />
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <AlertsList alerts={alerts} />
        </TabsContent>

        <TabsContent value="assistant" className="mt-4">
          <DQAssistant />
        </TabsContent>

        <TabsContent value="predictive" className="mt-4">
          <ProactiveDQAlerts />
        </TabsContent>

        <TabsContent value="proactive" className="mt-4">
          <ProactiveAIScanner />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ScanHistoryPanel scans={scans} />
        </TabsContent>
      </Tabs>

      {/* AI Summary Banner */}
      {latestScan?.summary && (
        <div className="bg-gradient-to-r from-violet-500/10 to-cyan-500/10 border border-violet-500/20 rounded-xl p-4 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-violet-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-violet-300 mb-0.5">AI Analysis</p>
            <p className="text-sm text-slate-300 leading-relaxed">{latestScan.summary}</p>
          </div>
        </div>
      )}

      <DataSourcesFooter />
    </div>
  );
}