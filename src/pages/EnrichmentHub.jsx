import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Database, Shield } from 'lucide-react';
import BulkEnrichmentRunner from '../components/enrichment/BulkEnrichmentRunner';
import ProactiveEnrichmentScanner from '../components/enrichment/ProactiveEnrichmentScanner';
import EnrichmentReviewQueue from '../components/enrichment/EnrichmentReviewQueue';
import EnrichmentStats from '../components/enrichment/EnrichmentStats';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

export default function EnrichmentHub() {
  const { data: providers = [] } = useQuery({
    queryKey: ['enrichProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 10000),
    staleTime: 120000,
  });

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-violet-400" />
          Data Enrichment Hub
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Enrich provider records with third-party data, review additions, and track enrichment quality
        </p>
      </div>

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
          <BulkEnrichmentRunner providers={providers} />
          <ProactiveEnrichmentScanner providers={providers} />
        </div>
        <div className="lg:col-span-2">
          <EnrichmentReviewQueue />
        </div>
      </div>

      <DataSourcesFooter />
    </div>
  );
}