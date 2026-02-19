import React, { useState, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileBarChart2 } from 'lucide-react';

import ReportBuilderForm from '../components/customReports/ReportBuilderForm';
import ReportChart, { aggregateData } from '../components/customReports/ReportChart';
import ReportDataTable from '../components/customReports/ReportDataTable';
import SavedReportsList from '../components/customReports/SavedReportsList';
import { DATASET_CONFIG } from '../components/customReports/reportConfig';

const EMPTY_CONFIG = { name: '', dataset: '', metrics: [], group_by: '', chart_type: 'bar', filters: {} };

export default function CustomReports() {
  const queryClient = useQueryClient();
  const [config, setConfig] = useState({ ...EMPTY_CONFIG });
  const [rawData, setRawData] = useState([]);
  const [runLoading, setRunLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  // Saved reports
  const { data: savedReports = [], isLoading: loadingSaved } = useQuery({
    queryKey: ['customReports'],
    queryFn: () => base44.entities.CustomReport.list('-created_date', 100),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.CustomReport.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customReports'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CustomReport.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customReports'] }),
  });

  const favMutation = useMutation({
    mutationFn: (report) => base44.entities.CustomReport.update(report.id, { is_favorite: !report.is_favorite }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customReports'] }),
  });

  // Run report — fetch data from selected entity
  const handleRun = useCallback(async () => {
    const dsConfig = DATASET_CONFIG[config.dataset];
    if (!dsConfig) return;
    setRunLoading(true);
    setHasRun(true);
    const entity = base44.entities[dsConfig.entity];
    const data = await entity.list('-created_date', 500);
    setRawData(data);
    setRunLoading(false);
  }, [config.dataset]);

  // Save report
  const handleSave = useCallback(() => {
    const { name, dataset, metrics, group_by, chart_type, filters } = config;
    saveMutation.mutate({ name, dataset, metrics, group_by, chart_type, filters, description: '' });
  }, [config]);

  // Load saved report into builder
  const handleLoad = useCallback((report) => {
    setConfig({
      name: report.name,
      dataset: report.dataset,
      metrics: report.metrics || [],
      group_by: report.group_by || '',
      chart_type: report.chart_type || 'bar',
      filters: report.filters || {},
    });
    setHasRun(false);
    setRawData([]);
  }, []);

  const chartData = useMemo(() => {
    if (!hasRun || !rawData.length) return [];
    return aggregateData(rawData, config);
  }, [rawData, config, hasRun]);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-violet-100">
          <FileBarChart2 className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Custom Reports</h1>
          <p className="text-xs text-slate-500">Build personalized data visualizations from CMS datasets</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: builder + saved */}
        <div className="lg:col-span-4 space-y-4">
          <ReportBuilderForm
            config={config}
            onChange={setConfig}
            onRun={handleRun}
            onSave={handleSave}
            saving={saveMutation.isPending}
          />
          <SavedReportsList
            reports={savedReports}
            loading={loadingSaved}
            onLoad={handleLoad}
            onDelete={(r) => deleteMutation.mutate(r.id)}
            onToggleFavorite={(r) => favMutation.mutate(r)}
          />
        </div>

        {/* Right: results */}
        <div className="lg:col-span-8 space-y-4">
          {!hasRun && (
            <div className="flex items-center justify-center h-72 border-2 border-dashed border-slate-200 rounded-xl">
              <div className="text-center">
                <FileBarChart2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Select a dataset, pick metrics, and click <strong>Run Report</strong></p>
              </div>
            </div>
          )}
          {hasRun && (
            <>
              <ReportChart rawData={rawData} config={config} loading={runLoading} />
              {!runLoading && <ReportDataTable chartData={chartData} config={config} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}