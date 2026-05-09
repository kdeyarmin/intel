import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Activity, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

import CrawlProgressSummary from '../components/crawlerDashboard/CrawlProgressSummary';
import CrawlProgressChart from '../components/crawlerDashboard/CrawlProgressChart';
import RecentCrawlActivity from '../components/crawlerDashboard/RecentCrawlActivity';
import ErrorRateTrend from '../components/crawlerDashboard/ErrorRateTrend';
import ProcessingStates from '../components/crawlerDashboard/ProcessingStates';
import CrawlerKPIs from '../components/crawlerDashboard/CrawlerKPIs';
import CrawlerGranularMetrics from '../components/crawlerDashboard/CrawlerGranularMetrics';
import ProcessingTimeChart from '../components/crawlerDashboard/ProcessingTimeChart';
import ApiUsageChart from '../components/crawlerDashboard/ApiUsageChart';
import LastFiveRunsMetrics from '../components/crawlerDashboard/LastFiveRunsMetrics';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

export default function NPPESCrawlerDashboard() {
  const queryClient = useQueryClient();
  const { data: crawlStatus, isLoading: loadingStatus } = useQuery({
    queryKey: ['crawlerDashStatus'],
    queryFn: async () => {
      const res = await base44.functions.invoke('nppesCrawler', { action: 'status' });
      return res.data;
    },
    refetchInterval: 15000,
  });

  const { data: nppesImports = [], isLoading: loadingImports } = useQuery({
    queryKey: ['nppesImportBatchesDash'],
    queryFn: () => base44.entities.ImportBatch.filter({ import_type: 'nppes_registry' }, '-created_date', 200),
    staleTime: 30000,
  });

  const { data: auditEvents = [], isLoading: loadingAudit } = useQuery({
    queryKey: ['nppesAuditEvents'],
    queryFn: async () => {
      const all = await base44.entities.AuditEvent.filter({ event_type: 'import' }, '-created_date', 100);
      return all.filter(e => {
        const d = e.details || {};
        return d.entity === 'nppes_registry' || d.action?.toLowerCase().includes('nppes') || d.action?.toLowerCase().includes('crawl');
      });
    },
    staleTime: 30000,
  });

  const loading = loadingStatus || loadingImports;

  // #6 — surface supervisor activity (workers respawned by superviseNPPESCrawler)
  // so admins can spot batches that needed intervention.
  const supervisorRespawns = useMemo(() => {
    const items = [];
    for (const b of nppesImports) {
      const rp = b.retry_params || {};
      if (rp.supervisor_respawns) {
        items.push({
          batch_id: b.id,
          import_type: b.import_type,
          file_name: b.file_name,
          respawns: rp.supervisor_respawns,
          last_respawn_at: rp.supervisor_last_respawn_at,
          reason: rp.supervisor_last_reason,
          status: b.status,
        });
      }
    }
    return items.sort((a, b) => new Date(b.last_respawn_at || 0) - new Date(a.last_respawn_at || 0));
  }, [nppesImports]);

  const [supervising, setSupervising] = useState(false);
  const runSupervisor = async () => {
    setSupervising(true);
    try {
      const res = await base44.functions.invoke('superviseNPPESCrawler', {});
      const data = res.data || res;
      if (data.respawned > 0) {
        toast.success(`Supervisor respawned ${data.respawned} worker pool(s)`);
      } else {
        toast.info(`Supervisor checked ${data.checked} batch(es); nothing needed restarting`);
      }
      // Refresh the queries that drive the supervisor banner + KPIs so the user
      // sees the new respawn count without waiting for the 15s poll.
      queryClient.invalidateQueries({ queryKey: ['nppesImportBatchesDash'] });
      queryClient.invalidateQueries({ queryKey: ['crawlerDashStatus'] });
    } catch (e) {
      toast.error(`Supervisor failed: ${e.message}`);
    } finally {
      setSupervising(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Bot className="w-6 h-6 text-teal-400" />
            NPPES Crawler Dashboard
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Real-time monitoring of NPPES registry crawl operations</p>
        </div>
        <Button
          onClick={runSupervisor}
          disabled={supervising}
          variant="outline"
          size="sm"
          className="border-amber-500/40 text-amber-300 hover:bg-amber-950/30"
          title="Detect abandoned crawl batches and respawn worker pools"
        >
          <RefreshCw className={`w-4 h-4 mr-1.5 ${supervising ? 'animate-spin' : ''}`} />
          {supervising ? 'Checking…' : 'Run Supervisor'}
        </Button>
      </div>

      {supervisorRespawns.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-start gap-2">
            <Activity className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-xs text-amber-200">
              <p className="font-semibold mb-1">
                Supervisor restarted {supervisorRespawns.length} batch{supervisorRespawns.length !== 1 ? 'es' : ''}
              </p>
              <ul className="text-amber-300/80 space-y-0.5">
                {supervisorRespawns.slice(0, 5).map(s => (
                  <li key={s.batch_id}>
                    {s.file_name || s.batch_id} — {s.respawns} respawn{s.respawns !== 1 ? 's' : ''}
                    {s.reason ? ` (${s.reason})` : ''}
                  </li>
                ))}
                {supervisorRespawns.length > 5 && <li>…and {supervisorRespawns.length - 5} more</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      <CrawlerKPIs nppesImports={nppesImports} loading={loading} />

      <CrawlerGranularMetrics crawlStatus={crawlStatus} loading={loadingStatus} />

      <CrawlProgressSummary
        crawlStatus={crawlStatus}
        nppesImports={nppesImports}
        totalStates={US_STATES.length}
        loading={loading}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ProcessingTimeChart nppesImports={nppesImports} loading={loadingImports} />
        <ApiUsageChart nppesImports={nppesImports} loading={loadingImports} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         <CrawlProgressChart
          crawlStatus={crawlStatus}
          totalStates={US_STATES.length}
          loading={loadingStatus}
        />
         <ErrorRateTrend
          nppesImports={nppesImports}
          loading={loadingImports}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LastFiveRunsMetrics nppesImports={nppesImports} loading={loadingImports} />
        <RecentCrawlActivity
          nppesImports={nppesImports}
          auditEvents={auditEvents}
          loading={loadingImports || loadingAudit}
        />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <ProcessingStates
          crawlStatus={crawlStatus}
          nppesImports={nppesImports}
          loading={loading}
        />
      </div>
    </div>
  );
}