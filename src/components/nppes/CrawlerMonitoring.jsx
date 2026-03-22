import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { AlertCircle, Clock, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function CrawlerMonitoring({ status }) {
  if (!status) return null;

  const { metricsData, errorData, batchPerformanceData } = useMemo(() => {
    const liveMetrics = Object.entries(status.granular_metrics || {}).map(([state, data]) => ({
      state,
      avgTime: (data.avg_prefix_time_ms || 0) / 1000,
      rateLimits: data.rate_limit_hits || 0,
      pendingItems: data.pending_items || 0,
      completedItems: data.completed_items || 0
    })).sort((a, b) => b.avgTime - a.avgTime);

    const liveErrors = (status.errors || []).map(err => ({
      message: (err.original_message || 'Unknown error').length > 30 ? (err.original_message || 'Unknown error').substring(0, 30) + '...' : (err.original_message || 'Unknown error'),
      count: err.count,
      statesCount: (err.affected_states || []).length
    })).slice(0, 5);

    const batches = status.batches || [];
    const batchPerf = [];
    const batchErrorMap = {};
    
    if (batches.length > 0) {
      for (const b of batches) {
        const rp = b.retry_params || {};
        if (rp.completed_items > 0 && rp.total_time_ms > 0) {
          batchPerf.push({
            state: b.state || 'Unknown',
            avgTime: Math.round((rp.total_time_ms / rp.completed_items) / 100) / 10,
            rateLimits: b.rate_limit_count || 0,
            completedItems: rp.completed_items || 0,
            status: b.status,
          });
        }
        if (b.status === 'failed' && b.error_message) {
          const msg = (b.error_message || '').substring(0, 40);
          if (!batchErrorMap[msg]) batchErrorMap[msg] = { count: 0, message: msg };
          batchErrorMap[msg].count++;
        }
      }
    }

    const historicalErrors = Object.values(batchErrorMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const stateMetrics = {};
    for (const bp of batchPerf) {
      if (!stateMetrics[bp.state] || bp.completedItems > stateMetrics[bp.state].completedItems) {
        stateMetrics[bp.state] = bp;
      }
    }
    const dedupedBatchPerf = Object.values(stateMetrics)
      .sort((a, b) => b.avgTime - a.avgTime)
      .slice(0, 15);

    return {
      metricsData: liveMetrics.length > 0 ? liveMetrics : dedupedBatchPerf,
      errorData: liveErrors.length > 0 ? liveErrors : historicalErrors,
      batchPerformanceData: dedupedBatchPerf,
    };
  }, [status]);

  const isLive = (status.crawler_status === 'running' || status.processing > 0);
  const hasHighErrorRate = status.completed > 0 && status.failed > (status.completed * 0.2) && status.failed > 5;
  const hasLongProcessing = metricsData.some(m => m.avgTime > 120);

  const tooltipStyle = { backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#f8fafc' };

  return (
    <div className="space-y-6 mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">
            {isLive ? 'Real-Time Telemetry' : 'Processing Telemetry'}
          </h2>
          <p className="text-sm text-slate-500">
            {isLive ? 'Live performance & error monitoring' : 'Historical performance from completed batches'}
          </p>
        </div>
        <div className="flex gap-2">
          {isLive && (
            <Badge className="bg-emerald-900/30 text-emerald-300 border-emerald-700/50 gap-1.5 py-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live
            </Badge>
          )}
          {hasHighErrorRate && (
            <Badge className="bg-red-900/30 text-red-300 border-red-700/50 gap-1.5 py-1">
              <AlertCircle className="w-3.5 h-3.5" /> High Error Rate
            </Badge>
          )}
          {hasLongProcessing && (
            <Badge className="bg-amber-900/30 text-amber-300 border-amber-700/50 gap-1.5 py-1">
              <Clock className="w-3.5 h-3.5" /> Slow Processing
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[#141d30] border-slate-700/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-500" />
              {isLive ? 'Avg Processing Time (sec/prefix)' : 'Avg Processing Time by State (sec)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              {metricsData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metricsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                    <XAxis dataKey="state" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}s`} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value, name) => [`${value}s`, name]}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Bar dataKey="avgTime" name="Avg Time" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-1">
                  <Clock className="w-5 h-5 text-slate-600" />
                  <span>No processing data yet</span>
                  <span className="text-xs text-slate-600">Run the crawler to generate telemetry</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#141d30] border-slate-700/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              Rate Limits & Throttling
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              {metricsData.filter(m => m.rateLimits > 0).length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metricsData.filter(m => m.rateLimits > 0)} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                    <XAxis dataKey="state" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#94a3b8' }} />
                    <Area type="monotone" dataKey="rateLimits" name="Rate Limit Hits" stroke="#f59e0b" fillOpacity={1} fill="url(#colorRate)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-1">
                  <div className="flex items-center gap-2 text-emerald-400 text-sm">
                    <Zap className="w-4 h-4" />
                    No Rate Limiting
                  </div>
                  <span className="text-xs text-slate-600">
                    {metricsData.length > 0 ? 'No throttling detected across processed states' : 'Run the crawler to track rate limits'}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#141d30] border-slate-700/50 shadow-sm lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              Top Error Frequencies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              {errorData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={errorData} layout="vertical" margin={{ top: 10, right: 30, left: 30, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis dataKey="message" type="category" tick={{ fontSize: 10, fill: '#64748b' }} width={180} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: '#94a3b8' }} />
                    <Bar dataKey="count" name="Error Count" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-1">
                  <div className="flex items-center gap-2 text-emerald-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    No Errors Detected
                  </div>
                  <span className="text-xs text-slate-600">
                    {status.completed > 0 ? `${status.completed} states completed without errors` : 'No crawl errors recorded'}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
