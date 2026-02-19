import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, Building2, Heart, Users, TrendingUp, Activity } from 'lucide-react';

import CMSKPIRow from '../components/cmsAnalytics/CMSKPIRow';
import MAEnrollmentChart from '../components/cmsAnalytics/MAEnrollmentChart';
import HospitalUtilizationChart from '../components/cmsAnalytics/HospitalUtilizationChart';
import ProviderPerformanceChart from '../components/cmsAnalytics/ProviderPerformanceChart';
import HHAStatsChart from '../components/cmsAnalytics/HHAStatsChart';
import PartDStatsChart from '../components/cmsAnalytics/PartDStatsChart';
import SNFStatsChart from '../components/cmsAnalytics/SNFStatsChart';
import DatasetOverview from '../components/cmsAnalytics/DatasetOverview';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

export default function CMSAnalytics() {
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedDataset, setSelectedDataset] = useState('all');

  // Fetch data from all CMS datasets
  const { data: maInpatient = [], isLoading: loadingMA } = useQuery({
    queryKey: ['maInpatient'],
    queryFn: () => base44.entities.MedicareMAInpatient.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: hhaStats = [], isLoading: loadingHHA } = useQuery({
    queryKey: ['hhaStats'],
    queryFn: () => base44.entities.MedicareHHAStats.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: inpatientDRG = [], isLoading: loadingDRG } = useQuery({
    queryKey: ['inpatientDRG'],
    queryFn: () => base44.entities.InpatientDRG.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: utilization = [], isLoading: loadingUtil } = useQuery({
    queryKey: ['cmsAnalyticsUtil'],
    queryFn: () => base44.entities.CMSUtilization.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: referrals = [], isLoading: loadingRef } = useQuery({
    queryKey: ['cmsAnalyticsRef'],
    queryFn: () => base44.entities.CMSReferral.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: partDStats = [], isLoading: loadingPartD } = useQuery({
    queryKey: ['partDStats'],
    queryFn: () => base44.entities.MedicarePartDStats.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: snfStats = [], isLoading: loadingSNF } = useQuery({
    queryKey: ['snfStats'],
    queryFn: () => base44.entities.MedicareSNFStats.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: importBatches = [] } = useQuery({
    queryKey: ['cmsAnalyticsBatches'],
    queryFn: () => base44.entities.ImportBatch.filter({ status: 'completed' }, '-created_date', 50),
    staleTime: 120000,
  });

  const loading = loadingMA || loadingHHA || loadingDRG || loadingUtil || loadingRef || loadingPartD || loadingSNF;

  // Collect available years from all datasets
  const availableYears = [...new Set([
    ...maInpatient.map(r => r.data_year),
    ...hhaStats.map(r => r.data_year),
    ...inpatientDRG.map(r => r.data_year),
    ...utilization.map(r => r.year),
    ...referrals.map(r => r.year),
    ...partDStats.map(r => r.data_year),
    ...snfStats.map(r => r.data_year),
  ])].filter(Boolean).sort((a, b) => b - a);

  // Filter data by year
  const filterByYear = (data, yearField = 'data_year') => {
    if (selectedYear === 'all') return data;
    return data.filter(r => r[yearField] === parseInt(selectedYear));
  };

  const filteredMA = filterByYear(maInpatient);
  const filteredHHA = filterByYear(hhaStats);
  const filteredDRG = filterByYear(inpatientDRG);
  const filteredUtil = filterByYear(utilization, 'year');
  const filteredRef = filterByYear(referrals, 'year');
  const filteredPartD = filterByYear(partDStats);
  const filteredSNF = filterByYear(snfStats);

  const datasets = [
    { id: 'all', label: 'All Datasets' },
    { id: 'ma_inpatient', label: 'MA Inpatient Hospital' },
    { id: 'hha_stats', label: 'HHA Use & Payments' },
    { id: 'inpatient_drg', label: 'Inpatient DRG' },
    { id: 'utilization', label: 'Provider Utilization' },
    { id: 'referrals', label: 'Referral Patterns' },
    { id: 'part_d', label: 'Part D Use & Payments' },
    { id: 'snf', label: 'SNF Use & Payments' },
  ];

  const showDataset = (id) => selectedDataset === 'all' || selectedDataset === id;

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">CMS Data Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Visualize Medicare datasets across programs and years</p>
        </div>
        <div className="flex gap-3">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {availableYears.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedDataset} onValueChange={setSelectedDataset}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Dataset" />
            </SelectTrigger>
            <SelectContent>
              {datasets.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Row */}
      <CMSKPIRow
        maInpatient={filteredMA}
        hhaStats={filteredHHA}
        inpatientDRG={filteredDRG}
        utilization={filteredUtil}
        referrals={filteredRef}
        loading={loading}
      />

      {/* Dataset counts */}
      <DatasetOverview importBatches={importBatches} loading={loading} />

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {showDataset('ma_inpatient') && (
          <MAEnrollmentChart data={filteredMA} loading={loadingMA} />
        )}
        {showDataset('hha_stats') && (
          <HHAStatsChart data={filteredHHA} loading={loadingHHA} />
        )}
        {showDataset('inpatient_drg') && (
          <HospitalUtilizationChart data={filteredDRG} loading={loadingDRG} />
        )}
        {showDataset('utilization') && (
          <ProviderPerformanceChart
            utilization={filteredUtil}
            referrals={filteredRef}
            loading={loadingUtil || loadingRef}
          />
        )}
        {showDataset('part_d') && (
          <PartDStatsChart data={filteredPartD} loading={loadingPartD} />
        )}
        {showDataset('snf') && (
          <SNFStatsChart data={filteredSNF} loading={loadingSNF} />
        )}
      </div>

      <DataSourcesFooter />
    </div>
  );
}