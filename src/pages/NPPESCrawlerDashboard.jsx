import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Bot } from 'lucide-react';

import CrawlProgressSummary from '../components/crawlerDashboard/CrawlProgressSummary';
import CrawlProgressChart from '../components/crawlerDashboard/CrawlProgressChart';
import RecentCrawlActivity from '../components/crawlerDashboard/RecentCrawlActivity';
import ErrorRateTrend from '../components/crawlerDashboard/ErrorRateTrend';
import ProcessingStates from '../components/crawlerDashboard/ProcessingStates';
import CrawlerKPIs from '../components/crawlerDashboard/CrawlerKPIs';
import ProcessingTimeChart from '../components/crawlerDashboard/ProcessingTimeChart';
import ApiUsageChart from '../components/crawlerDashboard/ApiUsageChart';
import LastFiveRunsMetrics from '../components/crawlerDashboard/LastFiveRunsMetrics';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
  'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

export default function NPPESCrawlerDashboard() {
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

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
          <Bot className="w-6 h-6 text-teal-600" />
          NPPES Crawler Dashboard
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">Real-time monitoring of NPPES registry crawl operations</p>
      </div>

      <CrawlerKPIs nppesImports={nppesImports} loading={loading} />

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