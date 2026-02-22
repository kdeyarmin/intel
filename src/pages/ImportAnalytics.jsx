import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Loader2, BarChart3 } from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';
import AnalyticsKPIs from '../components/imports/analytics/AnalyticsKPIs';
import AnalyticsFilters from '../components/imports/analytics/AnalyticsFilters';
import ImportVolumeChart from '../components/imports/analytics/ImportVolumeChart';
import SuccessRateTrendChart from '../components/imports/analytics/SuccessRateTrendChart';
import ProcessingTimeChart from '../components/imports/analytics/ProcessingTimeChart';
import ErrorTypeDistributionChart from '../components/imports/analytics/ErrorTypeDistributionChart';
import ImportTypeBreakdownChart from '../components/imports/analytics/ImportTypeBreakdownChart';

export default function ImportAnalytics() {
  const [filters, setFilters] = useState({ dateStart: '', dateEnd: '', importType: '', status: '' });

  const { data: allBatches = [], isLoading } = useQuery({
    queryKey: ['importAnalyticsBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 500),
  });

  const importTypes = useMemo(() => {
    const types = new Set(allBatches.map(b => b.import_type).filter(Boolean));
    return Array.from(types).sort();
  }, [allBatches]);

  const filteredBatches = useMemo(() => {
    let result = allBatches;
    if (filters.dateStart) {
      const start = new Date(filters.dateStart);
      result = result.filter(b => new Date(b.created_date) >= start);
    }
    if (filters.dateEnd) {
      const end = new Date(filters.dateEnd);
      end.setHours(23, 59, 59, 999);
      result = result.filter(b => new Date(b.created_date) <= end);
    }
    if (filters.importType) {
      result = result.filter(b => b.import_type === filters.importType);
    }
    if (filters.status) {
      result = result.filter(b => b.status === filters.status);
    }
    return result;
  }, [allBatches, filters]);

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <PageHeader
        title="Import Analytics"
        subtitle="Performance trends, success rates, and error analysis across all imports"
        icon={BarChart3}
        breadcrumbs={[{ label: 'Admin', page: 'DataCenter' }, { label: 'Import Monitor', page: 'ImportMonitoring' }, { label: 'Analytics' }]}
      />

      <AnalyticsFilters filters={filters} onChange={setFilters} importTypes={importTypes} />

      <AnalyticsKPIs batches={filteredBatches} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ImportVolumeChart batches={filteredBatches} />
        <SuccessRateTrendChart batches={filteredBatches} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProcessingTimeChart batches={filteredBatches} />
        <ErrorTypeDistributionChart batches={filteredBatches} />
      </div>

      <ImportTypeBreakdownChart batches={filteredBatches} />
    </div>
  );
}