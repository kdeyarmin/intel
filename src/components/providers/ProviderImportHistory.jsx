import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react';

const IMPORT_TYPE_LABELS = {
  'nppes_monthly': 'NPPES Monthly', 'nppes_registry': 'NPPES Registry',
  'cms_utilization': 'CMS Utilization', 'cms_part_d': 'CMS Part D',
  'cms_order_referring': 'Order & Referring', 'hospice_enrollments': 'Hospice Enrollments',
  'home_health_enrollments': 'HH Enrollments', 'provider_service_utilization': 'Provider Service Util',
  'medicare_hha_stats': 'Medicare HHA Stats', 'medicare_ma_inpatient': 'Medicare MA Inpatient',
  'medicare_part_d_stats': 'Medicare Part D Stats', 'medicare_snf_stats': 'Medicare SNF Stats',
};

const statusConfig = {
  processing: { icon: Loader2, color: 'bg-blue-500/15 text-blue-400', spin: true },
  validating: { icon: Clock, color: 'bg-yellow-500/15 text-yellow-400' },
  completed: { icon: CheckCircle2, color: 'bg-emerald-500/15 text-emerald-400' },
  failed: { icon: XCircle, color: 'bg-red-500/15 text-red-400' },
};

function formatDate(ts) {
  if (!ts) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(ts));
}

export default function ProviderImportHistory({ _npi }) {
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['importBatchesAll'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 50),
    staleTime: 60000,
  });

  // Filter to batches that likely imported this NPI's data type
  const relevantTypes = ['nppes_registry', 'nppes_monthly', 'cms_utilization', 'cms_order_referring', 'provider_service_utilization'];
  const relevantBatches = batches
    .filter(b => relevantTypes.includes(b.import_type) && b.status === 'completed')
    .slice(0, 5);

  if (isLoading) return null;
  if (relevantBatches.length === 0) return null;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-slate-200">
          <FileText className="w-4 h-4 text-cyan-400" />
          Related Import Batches
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {relevantBatches.map(b => {
          const cfg = statusConfig[b.status] || statusConfig.completed;
          const Icon = cfg.icon;
          return (
            <Link
              key={b.id}
              to={createPageUrl('ImportMonitoring')}
              className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-700/40 hover:bg-slate-800/40 transition-colors"
            >
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${cfg.spin ? 'animate-spin text-blue-400' : ''}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-300 truncate">
                  {IMPORT_TYPE_LABELS[b.import_type] || b.import_type}
                </p>
                <p className="text-[10px] text-slate-500 truncate">{b.file_name}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {b.imported_rows > 0 && (
                  <span className="text-[10px] text-blue-400">{b.imported_rows.toLocaleString()} rows</span>
                )}
                <span className="text-[10px] text-slate-500">{formatDate(b.created_date)}</span>
              </div>
            </Link>
          );
        })}
        <Link
          to={createPageUrl('ImportMonitoring')}
          className="block text-center text-[11px] text-cyan-500 hover:text-cyan-400 pt-1"
        >
          View all imports →
        </Link>
      </CardContent>
    </Card>
  );
}