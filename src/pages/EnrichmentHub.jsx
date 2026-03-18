import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Shield } from 'lucide-react';
import BulkEnrichmentRunner from '../components/enrichment/BulkEnrichmentRunner';
import ProactiveEnrichmentScanner from '../components/enrichment/ProactiveEnrichmentScanner';
import EnrichmentReviewQueue from '../components/enrichment/EnrichmentReviewQueue';
import EnrichmentStats from '../components/enrichment/EnrichmentStats';
import EnrichmentActionability from '../components/enrichment/EnrichmentActionability';
import BatchProviderUpdater from '../components/enrichment/BatchProviderUpdater';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';
import PageHeader from '../components/shared/PageHeader';

export default function EnrichmentHub() {
  // Use dashboard stats for accurate total count
  const { data: stats } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getDashboardStats');
      return res.data;
    },
    staleTime: 120000,
  });

  // Fetch a working sample for the enrichment runners
  const { data: providers = [] } = useQuery({
    queryKey: ['enrichProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 5000),
    staleTime: 120000,
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title="Data Enrichment Hub"
        subtitle="Enrich provider records with third-party data, review additions, and track enrichment quality"
        icon={Sparkles}
        breadcrumbs={[{ label: 'Admin', page: 'DataCenter' }, { label: 'Enrichment' }]}
      />

      {/* Source info */}
      <div className="bg-gradient-to-r from-violet-500/10 to-cyan-500/10 border border-violet-500/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-violet-300 mb-1">Data Sources</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-400">
              <div>
                <p className="font-medium text-slate-300">NPPES Registry</p>
                <p>Credentials, addresses, taxonomy codes from CMS official NPI database</p>
              </div>
              <div>
                <p className="font-medium text-slate-300">AI Web Search</p>
                <p>Hospital affiliations, group memberships, board certifications from public directories</p>
              </div>
              <div>
                <p className="font-medium text-slate-300">Review Aggregation</p>
                <p>Patient review scores from Healthgrades, Vitals, and other public sources</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats overview */}
      <EnrichmentStats />

      {/* Runner + Scanner + Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <BulkEnrichmentRunner providers={providers} totalProviders={stats?.totalProviders || providers.length} />
          <ProactiveEnrichmentScanner providers={providers} totalProviders={stats?.totalProviders || providers.length} />
          <EnrichmentActionability />
        </div>
        <div className="lg:col-span-2 space-y-4">
          <BatchProviderUpdater />
          <EnrichmentReviewQueue />
        </div>
      </div>

      <DataSourcesFooter />
    </div>
  );
}