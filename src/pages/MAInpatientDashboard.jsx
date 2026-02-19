import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Building2 } from 'lucide-react';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';
import MAInpatientKPIs from '../components/maInpatient/MAInpatientKPIs';
import MAInpatientFilters from '../components/maInpatient/MAInpatientFilters';
import ExportCSVButton from '../components/maInpatient/ExportCSVButton';
import DischargeTrendChart from '../components/maInpatient/DischargeTrendChart';
import ALOSTrendChart from '../components/maInpatient/ALOSTrendChart';
import EnrolleeTrendChart from '../components/maInpatient/EnrolleeTrendChart';
import HospitalTypeBreakdown from '../components/maInpatient/HospitalTypeBreakdown';
import DataHealthPanel from '../components/maInpatient/DataHealthPanel';

export default function MAInpatientDashboard() {
  const [filters, setFilters] = useState({
    hospital_type: 'all',
    entitlement_type: 'all',
    table_name: 'all',
  });

  const { data: rawData = [], isLoading } = useQuery({
    queryKey: ['ma-inpatient-all'],
    queryFn: () => base44.entities.MedicareMAInpatient.list('-created_date', 10000),
    staleTime: 120000,
  });

  const { data: recentBatches = [] } = useQuery({
    queryKey: ['ma-import-batches'],
    queryFn: () => base44.entities.ImportBatch.filter({ import_type: 'medicare_ma_inpatient' }, '-created_date', 10),
    staleTime: 120000,
  });

  const filteredData = useMemo(() => {
    return rawData.filter(r => {
      if (filters.table_name !== 'all' && r.table_name !== filters.table_name) return false;
      if (filters.hospital_type !== 'all' && r.hospital_type !== filters.hospital_type) return false;
      if (filters.entitlement_type !== 'all' && r.entitlement_type !== filters.entitlement_type) return false;
      return true;
    });
  }, [rawData, filters]);

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-blue-50">
            <Building2 className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Medicare Advantage Inpatient</h1>
            <p className="text-sm text-slate-500">Hospital utilization trends, discharge patterns & data health</p>
          </div>
        </div>
        <ExportCSVButton data={filteredData} />
      </div>

      {/* Filters */}
      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <MAInpatientFilters data={rawData} filters={filters} onChange={setFilters} />
      )}

      {/* KPIs */}
      <MAInpatientKPIs data={filteredData} loading={isLoading} />

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DischargeTrendChart data={filteredData} />
        <ALOSTrendChart data={filteredData} />
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <EnrolleeTrendChart data={filteredData} />
        </div>
        <HospitalTypeBreakdown data={filteredData} />
      </div>

      {/* Data Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DataHealthPanel data={filteredData} recentBatches={recentBatches} />
      </div>

      <DataSourcesFooter />
    </div>
  );
}