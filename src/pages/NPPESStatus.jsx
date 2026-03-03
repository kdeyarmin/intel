import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { Activity, Play, Pause, Square, RotateCcw, Users, Server, CheckCircle2 } from 'lucide-react';
import moment from 'moment';

export default function NPPESStatus() {
  const queryClient = useQueryClient();

  const { data: statusData, isLoading, refetch } = useQuery({
    queryKey: ['nppes-crawler-status'],
    queryFn: async () => {
      const { data } = await base44.functions.invoke('nppesCrawler', { action: 'status' });
      return data;
    },
    refetchInterval: 5000,
  });

  const crawlerMutation = useMutation({
    mutationFn: async (action) => {
      const { data } = await base44.functions.invoke('nppesCrawler', { action });
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data, action) => {
      toast.success(`Crawler ${action.replace('batch_', '')} successful`);
      queryClient.invalidateQueries({ queryKey: ['nppes-crawler-status'] });
    },
    onError: (err) => {
      toast.error(`Failed: ${err.message}`);
    }
  });

  const handleAction = (action) => {
    crawlerMutation.mutate(action);
  };

  if (isLoading && !statusData) {
    return <div className="p-8 text-center text-slate-400">Loading crawler status...</div>;
  }

  const s = statusData || {};
  const isRunning = s.crawler_status === 'running';
  const isPaused = s.crawler_status === 'paused';

  const completionRate = s.total_states ? Math.round((s.completed / s.total_states) * 100) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader 
        title="NPPES Crawler Status" 
        subtitle="Real-time monitoring and control of the NPPES directory crawler"
        breadcrumbs={[{ label: 'Admin' }, { label: 'NPPES Status' }]}
        action={
          <div className="flex gap-2">
            {!isRunning && !isPaused && (
              <Button onClick={() => handleAction('batch_start')} disabled={crawlerMutation.isPending} className="bg-green-600 hover:bg-green-700">
                <Play className="w-4 h-4 mr-2" /> Start Crawl
              </Button>
            )}
            {isRunning && (
              <Button onClick={() => handleAction('batch_pause')} disabled={crawlerMutation.isPending} variant="secondary" className="bg-amber-600 hover:bg-amber-700 text-white border-none">
                <Pause className="w-4 h-4 mr-2" /> Pause
              </Button>
            )}
            {isPaused && (
              <Button onClick={() => handleAction('batch_resume')} disabled={crawlerMutation.isPending} className="bg-green-600 hover:bg-green-700">
                <Play className="w-4 h-4 mr-2" /> Resume
              </Button>
            )}
            {(isRunning || isPaused) && (
              <Button onClick={() => handleAction('batch_stop')} disabled={crawlerMutation.isPending} variant="destructive">
                <Square className="w-4 h-4 mr-2" /> Stop
              </Button>
            )}
            <Button onClick={() => refetch()} variant="outline" size="icon">
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-[#111827] border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400 font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isRunning ? 'bg-green-500/20 text-green-400' : isPaused ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-500/20 text-slate-400'}`}>
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white capitalize">{s.crawler_status || 'Idle'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-[#111827] border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400 font-medium">Active Workers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400">
                <Server className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{s.active_workers || 0}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#111827] border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400 font-medium">States Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <div className="text-2xl font-bold text-white">{s.completed}/{s.total_states}</div>
                <Progress value={completionRate} className="h-1 mt-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#111827] border-slate-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400 font-medium">Total Processed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{(s.totals?.processed || 0).toLocaleString()}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[#111827] border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Active Processing</CardTitle>
            <CardDescription className="text-slate-400">States currently being crawled</CardDescription>
          </CardHeader>
          <CardContent>
            {s.processing_states?.length > 0 ? (
              <div className="space-y-4">
                {s.processing_states.map(st => {
                  const metrics = s.granular_metrics?.[st] || {};
                  const isSlow = metrics.rate_limit_hits > 0;
                  return (
                    <div key={st} className="flex flex-col gap-2 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-slate-800 text-slate-200 border-slate-600">{st}</Badge>
                          {isSlow && <Badge variant="destructive" className="bg-red-900/50 text-red-300">Rate Limited</Badge>}
                        </div>
                        <span className="text-xs text-slate-400">
                          {metrics.pending_items || 0} prefixes pending
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Avg time: {metrics.avg_prefix_time_ms ? (metrics.avg_prefix_time_ms / 1000).toFixed(1) + 's' : 'N/A'}</span>
                        <span>Est. remaining: {metrics.estimated_remaining_ms ? moment.duration(metrics.estimated_remaining_ms).humanize() : 'Calculating...'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-slate-500 italic py-4">No states currently processing.</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#111827] border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Recent Batches</CardTitle>
            <CardDescription className="text-slate-400">Latest crawler job history</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[400px] overflow-auto scrollbar-dark">
            <div className="space-y-3">
              {s.batches?.slice(0, 10).map(b => (
                <div key={b.id} className="flex justify-between items-start p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
                  <div>
                    <div className="font-medium text-slate-200 text-sm">{b.file_name}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {moment(b.created_date).fromNow()} • {(b.imported_rows || 0) + (b.updated_rows || 0)} processed
                    </div>
                  </div>
                  <Badge variant="outline" className={
                    b.status === 'completed' ? 'border-green-500/30 text-green-400 bg-green-500/10' :
                    b.status === 'failed' ? 'border-red-500/30 text-red-400 bg-red-500/10' :
                    b.status === 'processing' ? 'border-blue-500/30 text-blue-400 bg-blue-500/10' :
                    'border-slate-500/30 text-slate-400 bg-slate-500/10'
                  }>
                    {b.status}
                  </Badge>
                </div>
              ))}
              {!s.batches?.length && <div className="text-sm text-slate-500 italic">No batches found.</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}