import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Activity, Clock, AlertTriangle, Cpu, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export default function CrawlerGranularMetrics({ crawlStatus, loading }) {
  if (loading || !crawlStatus) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Real-Time Granular Metrics</CardTitle>
          <CardDescription>Loading crawler metrics...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { active_workers = 0, granular_metrics = {}, processing_states = [] } = crawlStatus;

  const formatTime = (ms) => {
    if (!ms || ms === 0) return '0s';
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    if (m < 60) return `${m}m ${rs}s`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  };

  return (
    <Card className="col-span-full overflow-hidden border-teal-500/20 shadow-md shadow-teal-500/5 bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800">
      <CardHeader className="pb-3 border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="w-5 h-5 text-teal-500" />
              Granular Operations Monitoring
            </CardTitle>
            <CardDescription className="mt-1 text-slate-500 dark:text-slate-400">
              Live metrics for current crawler tasks, performance, and API health
            </CardDescription>
          </div>
          <div className="flex flex-col items-end">
             <div className="flex items-center gap-2">
               <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Active Workers:</span>
               <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800 gap-1.5 px-2.5">
                 <Cpu className="w-3.5 h-3.5" />
                 {active_workers}
               </Badge>
             </div>
             {active_workers > 0 && <span className="text-[10px] text-slate-400 mt-1 flex items-center gap-1"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span></span> Processing active</span>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {processing_states.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center">
            <Zap className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No states currently processing</p>
            <p className="text-sm text-slate-400 mt-1">Start a new crawl to see real-time granular metrics.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {processing_states.map(state => {
              const metrics = granular_metrics[state] || {};
              const avgTime = metrics.avg_prefix_time_ms || 0;
              const estRemaining = metrics.estimated_remaining_ms || 0;
              const rateLimits = metrics.rate_limit_hits || 0;
              const pending = metrics.pending_items || 0;
              const completed = metrics.completed_items || 0;
              const total = pending + completed;
              const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

              return (
                <div key={state} className="p-5 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                      <span className="w-8 h-8 rounded-md bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-400 flex items-center justify-center text-sm font-bold">
                        {state}
                      </span>
                      State Progress
                    </h3>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Items Processed</p>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{completed} / {total}</p>
                      </div>
                      <div className="w-32">
                         <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                           <span>Progress</span>
                           <span>{progressPct}%</span>
                         </div>
                         <Progress value={progressPct} className="h-1.5 bg-slate-100 dark:bg-slate-800" indicatorClassName="bg-teal-500" />
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-blue-500" />
                          Avg. Time per Prefix
                        </span>
                      </div>
                      <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                        {formatTime(avgTime)}
                      </p>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-violet-500" />
                          Est. Time Remaining
                        </span>
                      </div>
                      <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">
                        {formatTime(estRemaining)}
                      </p>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                          <AlertTriangle className={rateLimits > 0 ? "w-3.5 h-3.5 text-amber-500" : "w-3.5 h-3.5 text-emerald-500"} />
                          API Rate Limits Hit
                        </span>
                      </div>
                      <p className={`text-lg font-semibold ${rateLimits > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {rateLimits.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}