import React, { useState, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileBarChart2, Calendar, BookTemplate, Plus } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

import ReportBuilderForm from '../components/customReports/ReportBuilderForm';
import ReportChart, { aggregateData } from '../components/customReports/ReportChart';
import ReportDataTable from '../components/customReports/ReportDataTable';
import SavedReportsList from '../components/customReports/SavedReportsList';
import ReportScheduleForm from '../components/scheduledReports/ReportScheduleForm';
import ScheduledReportsList from '../components/scheduledReports/ScheduledReportsList';
import ReportTemplateLibrary from '../components/scheduledReports/ReportTemplateLibrary';
import { DATASET_CONFIG } from '../components/customReports/reportConfig';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

const EMPTY_CONFIG = { name: '', dataset: '', metrics: [], group_by: '', chart_type: 'bar', filters: {} };

export default function CustomReports() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('builder');
  
  // Custom Report State
  const [config, setConfig] = useState({ ...EMPTY_CONFIG });
  const [rawData, setRawData] = useState([]);
  const [runLoading, setRunLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  // Scheduled Report State
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [runningScheduleId, setRunningScheduleId] = useState(null);

  // Queries
  const { data: savedReports = [], isLoading: loadingSaved } = useQuery({
    queryKey: ['customReports'],
    queryFn: () => base44.entities.CustomReport.list('-created_date', 100),
  });

  const { data: scheduledReports = [], isLoading: loadingScheduled } = useQuery({
    queryKey: ['scheduledReports'],
    queryFn: () => base44.entities.ScheduledReport.list('-created_date', 100),
  });

  // Mutations (Custom)
  const saveCustomMutation = useMutation({
    mutationFn: (data) => base44.entities.CustomReport.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customReports'] });
      toast.success('Report saved');
    },
  });

  const deleteCustomMutation = useMutation({
    mutationFn: (id) => base44.entities.CustomReport.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customReports'] });
      toast.success('Report deleted');
    },
  });

  const favCustomMutation = useMutation({
    mutationFn: (report) => base44.entities.CustomReport.update(report.id, { is_favorite: !report.is_favorite }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customReports'] }),
  });

  // Mutations (Scheduled)
  const createScheduleMutation = useMutation({
    mutationFn: (data) => base44.entities.ScheduledReport.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledReports'] });
      setShowScheduleForm(false);
      setEditingSchedule(null);
      toast.success('Schedule created');
    },
  });

  const updateScheduleMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ScheduledReport.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledReports'] });
      setShowScheduleForm(false);
      setEditingSchedule(null);
      toast.success('Schedule updated');
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: (id) => base44.entities.ScheduledReport.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledReports'] });
      toast.success('Schedule deleted');
    },
  });

  // Custom Report Handlers
  const handleRunCustom = useCallback(async () => {
    const dsConfig = DATASET_CONFIG[config.dataset];
    if (!dsConfig) return;
    setRunLoading(true);
    setHasRun(true);
    const entity = base44.entities[dsConfig.entity];
    const data = await entity.list('-created_date', 500);
    setRawData(data);
    setRunLoading(false);
  }, [config.dataset]);

  const handleSaveCustom = useCallback(() => {
    const { name, dataset, metrics, group_by, chart_type, filters } = config;
    if (!name) return toast.error('Please name your report');
    saveCustomMutation.mutate({ name, dataset, metrics, group_by, chart_type, filters, description: '' });
  }, [config]);

  const handleLoadCustom = useCallback((report) => {
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
    setActiveTab('builder');
  }, []);

  const chartData = useMemo(() => {
    if (!hasRun || !rawData.length) return [];
    return aggregateData(rawData, config);
  }, [rawData, config, hasRun]);

  // Scheduled Report Handlers
  const handleSaveSchedule = useCallback((formData) => {
    if (editingSchedule?.id) {
      updateScheduleMutation.mutate({ id: editingSchedule.id, data: formData });
    } else {
      createScheduleMutation.mutate(formData);
    }
  }, [editingSchedule]);

  const handleEditSchedule = useCallback((report) => {
    setEditingSchedule(report);
    setShowScheduleForm(true);
  }, []);

  const handleRunScheduleNow = useCallback(async (report) => {
    setRunningScheduleId(report.id);
    try {
      const res = await base44.functions.invoke('generateScheduledReport', {
        action: 'run_single',
        report_id: report.id,
      });
      toast.success(`Sent to ${res.data.emails_sent} recipient(s)`);
      queryClient.invalidateQueries({ queryKey: ['scheduledReports'] });
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setRunningScheduleId(null);
    }
  }, []);

  const handleUseTemplate = useCallback((template) => {
    setEditingSchedule({
      name: template.name,
      description: template.description,
      dataset: template.dataset,
      metrics: template.metrics,
      group_by: template.group_by,
      chart_type: template.chart_type,
      frequency: template.frequency,
      schedule_day: template.schedule_day,
      filters: template.filters || {},
    });
    setShowScheduleForm(true);
    setActiveTab('schedules');
  }, []);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-violet-100">
            <FileBarChart2 className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Reports & Analytics</h1>
            <p className="text-xs text-slate-500">Create custom visualizations and schedule automated emails</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="flex justify-between items-center">
          <TabsList>
            <TabsTrigger value="builder" className="gap-2">
              <FileBarChart2 className="w-4 h-4" /> Custom Builder
            </TabsTrigger>
            <TabsTrigger value="schedules" className="gap-2">
              <Calendar className="w-4 h-4" /> Scheduled Reports
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <BookTemplate className="w-4 h-4" /> Templates
            </TabsTrigger>
          </TabsList>
          
          {activeTab === 'schedules' && (
            <Button size="sm" onClick={() => { setEditingSchedule(null); setShowScheduleForm(true); }}>
              <Plus className="w-4 h-4 mr-2" /> New Schedule
            </Button>
          )}
        </div>

        {/* CUSTOM BUILDER TAB */}
        <TabsContent value="builder" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-4 space-y-4">
              <ReportBuilderForm
                config={config}
                onChange={setConfig}
                onRun={handleRunCustom}
                onSave={handleSaveCustom}
                saving={saveCustomMutation.isPending}
              />
              <SavedReportsList
                reports={savedReports}
                loading={loadingSaved}
                onLoad={handleLoadCustom}
                onDelete={(r) => deleteCustomMutation.mutate(r.id)}
                onToggleFavorite={(r) => favCustomMutation.mutate(r)}
              />
            </div>
            <div className="lg:col-span-8 space-y-4">
              {!hasRun && (
                <div className="flex items-center justify-center h-72 border-2 border-dashed border-slate-200 rounded-xl">
                  <div className="text-center">
                    <FileBarChart2 className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">Select data, pick metrics, and <strong>Run Report</strong></p>
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
        </TabsContent>

        {/* SCHEDULES TAB */}
        <TabsContent value="schedules" className="mt-0">
          {showScheduleForm ? (
            <ReportScheduleForm
              initialData={editingSchedule}
              onSave={handleSaveSchedule}
              onCancel={() => { setShowScheduleForm(false); setEditingSchedule(null); }}
              saving={createScheduleMutation.isPending || updateScheduleMutation.isPending}
            />
          ) : (
            <ScheduledReportsList
              reports={scheduledReports}
              loading={loadingScheduled}
              onEdit={handleEditSchedule}
              onDelete={(r) => { if(confirm('Delete schedule?')) deleteScheduleMutation.mutate(r.id); }}
              onToggleActive={(r) => updateScheduleMutation.mutate({ id: r.id, data: { is_active: !r.is_active } })}
              onRunNow={handleRunScheduleNow}
              runningId={runningScheduleId}
            />
          )}
        </TabsContent>

        {/* TEMPLATES TAB */}
        <TabsContent value="templates" className="mt-0">
          <ReportTemplateLibrary onUseTemplate={handleUseTemplate} />
        </TabsContent>
      </Tabs>

      <DataSourcesFooter />
    </div>
  );
}