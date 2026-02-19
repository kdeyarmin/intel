import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Database, CheckCircle2, Clock } from 'lucide-react';

const DATASET_LABELS = {
  medicare_ma_inpatient: 'MA Inpatient Hospital',
  medicare_hha_stats: 'HHA Use & Payments',
  inpatient_drg: 'Inpatient DRG',
  cms_utilization: 'Provider Utilization',
  cms_order_referring: 'Order & Referring',
  nppes_registry: 'NPPES Registry',
  provider_service_utilization: 'Provider Service Util.',
  home_health_enrollments: 'HH Enrollments',
  hospice_enrollments: 'Hospice Enrollments',
  provider_ownership: 'Provider Ownership',
  home_health_pdgm: 'Home Health PDGM',
  home_health_cost_reports: 'HH Cost Reports',
};

export default function DatasetOverview({ importBatches, loading }) {
  const datasetStats = useMemo(() => {
    const stats = {};
    importBatches.forEach(b => {
      const type = b.import_type;
      if (!stats[type]) {
        stats[type] = {
          type,
          label: DATASET_LABELS[type] || type?.replace(/_/g, ' '),
          lastImport: b.completed_at || b.created_date,
          totalImported: 0,
          importCount: 0,
        };
      }
      stats[type].totalImported += b.imported_rows || 0;
      stats[type].importCount += 1;
      const bDate = b.completed_at || b.created_date;
      if (bDate > stats[type].lastImport) stats[type].lastImport = bDate;
    });
    return Object.values(stats).sort((a, b) => b.totalImported - a.totalImported);
  }, [importBatches]);

  if (loading) return <Card><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="w-4 h-4 text-slate-500" />
          Dataset Import Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        {datasetStats.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-4">No completed imports yet</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {datasetStats.map(d => (
              <div key={d.type} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{d.label}</p>
                  <p className="text-xs text-slate-500">
                    {d.totalImported.toLocaleString()} rows • {d.importCount} imports
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}