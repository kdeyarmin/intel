import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { Loader2, Activity, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';

const COLORS = ['#10b981', '#f43f5e', '#3b82f6', '#f59e0b', '#8b5cf6'];

export default function ReconciliationAnalyticsPanel() {
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['reconciliationJobsAll'],
    queryFn: () => base44.entities.ReconciliationJob.list('-created_date', 100),
  });

  const { data: apiLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['apiInteractionLogsAll'],
    queryFn: () => base44.entities.ApiInteractionLog.list('-created_date', 1000),
  });

  const analytics = useMemo(() => {
    if (!jobs || !apiLogs) return null;

    // Jobs Trends
    const trendsData = [...jobs].reverse().map(job => ({
      date: format(parseISO(job.created_date), 'MMM dd HH:mm'),
      matched: job.matched || 0,
      discrepancies: job.discrepancies_found || 0,
      ai_suggestions: job.ai_suggestions_generated || 0,
      total: job.total_providers || 0
    }));

    const totalMatched = jobs.reduce((acc, job) => acc + (job.matched || 0), 0);
    const totalDiscrepancies = jobs.reduce((acc, job) => acc + (job.discrepancies_found || 0), 0);
    const matchVsDiscData = [
      { name: 'Matched', value: totalMatched },
      { name: 'Discrepancies', value: totalDiscrepancies }
    ];

    // API Stats
    const apiStatsBySource = {};
    apiLogs.forEach(log => {
      if (!apiStatsBySource[log.source]) {
        apiStatsBySource[log.source] = { source: log.source, success: 0, error: 0, totalTime: 0, count: 0, errors: {} };
      }
      const stat = apiStatsBySource[log.source];
      stat.count++;
      if (log.is_success) stat.success++;
      else {
        stat.error++;
        if (log.error_message) {
          stat.errors[log.error_message] = (stat.errors[log.error_message] || 0) + 1;
        }
      }
      stat.totalTime += (log.response_time_ms || 0);
    });

    const apiPerformanceData = Object.values(apiStatsBySource).map(stat => ({
      source: stat.source.toUpperCase(),
      successRate: Math.round((stat.success / stat.count) * 100) || 0,
      avgTime: Math.round(stat.totalTime / stat.count) || 0,
      totalCalls: stat.count,
      errorCount: stat.error,
      topErrors: Object.entries(stat.errors).sort((a, b) => b[1] - a[1]).slice(0, 3)
    }));

    const commonErrors = [];
    apiPerformanceData.forEach(source => {
      source.topErrors.forEach(err => {
        commonErrors.push({ source: source.source, message: err[0], count: err[1] });
      });
    });
    commonErrors.sort((a, b) => b.count - a.count);

    return {
      trendsData,
      matchVsDiscData,
      apiPerformanceData,
      commonErrors,
      totalJobs: jobs.length,
      totalApiCalls: apiLogs.length
    };
  }, [jobs, apiLogs]);

  if (jobsLoading || logsLoading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  }

  if (!analytics) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2 text-slate-400">
              <Activity className="w-4 h-4" />
              <h3 className="text-sm font-medium">Total Reconciliations</h3>
            </div>
            <p className="text-2xl font-bold text-white">{analytics.totalJobs}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2 text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              <h3 className="text-sm font-medium">Overall Match Rate</h3>
            </div>
            <p className="text-2xl font-bold text-white">
              {analytics.matchVsDiscData[0].value + analytics.matchVsDiscData[1].value > 0 
                ? Math.round((analytics.matchVsDiscData[0].value / (analytics.matchVsDiscData[0].value + analytics.matchVsDiscData[1].value)) * 100) 
                : 0}%
            </p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2 text-blue-400">
              <Activity className="w-4 h-4" />
              <h3 className="text-sm font-medium">Total API Calls</h3>
            </div>
            <p className="text-2xl font-bold text-white">{analytics.totalApiCalls}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2 text-amber-400">
              <Clock className="w-4 h-4" />
              <h3 className="text-sm font-medium">Avg API Latency</h3>
            </div>
            <p className="text-2xl font-bold text-white">
              {analytics.apiPerformanceData.length > 0 
                ? Math.round(analytics.apiPerformanceData.reduce((acc, curr) => acc + curr.avgTime, 0) / analytics.apiPerformanceData.length)
                : 0} ms
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Reconciliation Trends</CardTitle>
            <CardDescription>Matched records, discrepancies, and AI suggestions over recent jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.trendsData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickFormatter={(v) => v.split(' ')[0]} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                    itemStyle={{ color: '#f8fafc' }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="matched" name="Matched" stroke="#10b981" strokeWidth={2} />
                  <Line type="monotone" dataKey="discrepancies" name="Discrepancies" stroke="#f43f5e" strokeWidth={2} />
                  <Line type="monotone" dataKey="ai_suggestions" name="AI Suggestions" stroke="#3b82f6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Match Distribution</CardTitle>
            <CardDescription>Overall ratio of matched vs discrepancy</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.matchVsDiscData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {analytics.matchVsDiscData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>API Source Performance</CardTitle>
            <CardDescription>Success rates and average latency by source</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.apiPerformanceData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="source" stroke="#94a3b8" />
                  <YAxis yAxisId="left" stroke="#10b981" orientation="left" />
                  <YAxis yAxisId="right" stroke="#f59e0b" orientation="right" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                    cursor={{ fill: '#334155' }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="successRate" name="Success Rate (%)" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="avgTime" name="Avg Latency (ms)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              Common API Errors
            </CardTitle>
            <CardDescription>Most frequent errors encountered during data fetch</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.commonErrors.length > 0 ? (
              <div className="space-y-4">
                {analytics.commonErrors.map((err, idx) => (
                  <div key={idx} className="flex items-start justify-between p-3 bg-slate-800/50 border border-slate-700 rounded-lg">
                    <div>
                      <Badge variant="outline" className="mb-2">{err.source}</Badge>
                      <p className="text-sm text-slate-300 font-mono break-all">{err.message}</p>
                    </div>
                    <Badge variant="destructive" className="ml-4 flex-shrink-0">{err.count} occurrences</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[200px] text-slate-500">
                <CheckCircle2 className="w-8 h-8 mb-2 text-green-500/50" />
                <p>No recent API errors recorded</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}