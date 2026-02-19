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
  BarChart3, Clock, Sparkles, ListChecks, ShieldAlert
} from 'lucide-react';
import QualityScoreCard from '../components/dataQuality/QualityScoreCard';
import RuleResultsTable from '../components/dataQuality/RuleResultsTable';
import AlertsList from '../components/dataQuality/AlertsList';
import ScanHistoryPanel from '../components/dataQuality/ScanHistoryPanel';
import AlertTrendChart from '../components/dataQuality/AlertTrendChart';
import ProactiveAIScanner from '../components/dataQuality/ProactiveAIScanner';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

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
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-teal-600" />
            Data Quality Center
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Automated quality monitoring, alerts, and AI-powered corrections
          </p>
        </div>
        <div className="flex items-center gap-3">
          {latestScan?.completed_at && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Last scan: {new Date(latestScan.completed_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} ET
            </span>
          )}
          <Button
            onClick={() => runScanMutation.mutate()}
            disabled={runScanMutation.isPending}
            className="bg-teal-600 hover:bg-teal-700"
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
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-24" />)}
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
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-amber-600">Open Alerts</p>
              <p className="text-2xl font-bold text-amber-800">{openAlerts.length}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-amber-400" />
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-red-600">Critical / High</p>
              <p className="text-2xl font-bold text-red-800">{criticalAlerts.length}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </CardContent>
        </Card>
        <Card className="bg-violet-50 border-violet-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-violet-600">AI Suggestions</p>
              <p className="text-2xl font-bold text-violet-800">{withSuggestions.length}</p>
            </div>
            <Sparkles className="w-8 h-8 text-violet-400" />
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Rule Results</TabsTrigger>
          <TabsTrigger value="alerts">
            Alerts
            {openAlerts.length > 0 && (
              <Badge className="ml-1.5 bg-amber-500 text-white text-[10px] h-4 px-1.5">{openAlerts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="proactive" className="gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" /> AI Scanner
          </TabsTrigger>
          <TabsTrigger value="history">Scan History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Quality Rules ({latestRuleResults.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {latestRuleResults.length > 0 ? (
                    <RuleResultsTable results={latestRuleResults} />
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-8">Run a scan to see rule results</p>
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

        <TabsContent value="proactive" className="mt-4">
          <ProactiveAIScanner />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <ScanHistoryPanel scans={scans} />
        </TabsContent>
      </Tabs>

      {/* AI Summary Banner */}
      {latestScan?.summary && (
        <div className="bg-gradient-to-r from-violet-50 to-blue-50 border border-violet-200 rounded-xl p-4 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-violet-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-violet-800 mb-0.5">AI Analysis</p>
            <p className="text-sm text-violet-700 leading-relaxed">{latestScan.summary}</p>
          </div>
        </div>
      )}

      <DataSourcesFooter />
    </div>
  );
}