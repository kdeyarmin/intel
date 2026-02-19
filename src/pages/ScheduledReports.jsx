import React, { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Plus, FileBarChart2, BookTemplate } from 'lucide-react';
import { toast } from 'sonner';

import ReportScheduleForm from '../components/scheduledReports/ReportScheduleForm';
import ScheduledReportsList from '../components/scheduledReports/ScheduledReportsList';
import ReportTemplateLibrary from '../components/scheduledReports/ReportTemplateLibrary';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

export default function ScheduledReports() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [runningId, setRunningId] = useState(null);
  const [activeTab, setActiveTab] = useState('reports');

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['scheduledReports'],
    queryFn: () => base44.entities.ScheduledReport.list('-created_date', 100),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ScheduledReport.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledReports'] });
      setShowForm(false);
      setEditingReport(null);
      toast.success('Report scheduled successfully');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ScheduledReport.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledReports'] });
      setShowForm(false);
      setEditingReport(null);
      toast.success('Report updated');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ScheduledReport.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledReports'] });
      toast.success('Report deleted');
    },
  });

  const handleSave = useCallback((formData) => {
    if (editingReport?.id) {
      updateMutation.mutate({ id: editingReport.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  }, [editingReport]);

  const handleEdit = useCallback((report) => {
    setEditingReport(report);
    setShowForm(true);
    setActiveTab('reports');
  }, []);

  const handleDelete = useCallback((report) => {
    if (window.confirm(`Delete "${report.name}"?`)) {
      deleteMutation.mutate(report.id);
    }
  }, []);

  const handleToggleActive = useCallback((report) => {
    updateMutation.mutate({ id: report.id, data: { is_active: !report.is_active } });
  }, []);

  const handleRunNow = useCallback(async (report) => {
    setRunningId(report.id);
    try {
      const res = await base44.functions.invoke('generateScheduledReport', {
        action: 'run_single',
        report_id: report.id,
      });
      toast.success(`Report sent to ${res.data.emails_sent} recipient(s)`);
      queryClient.invalidateQueries({ queryKey: ['scheduledReports'] });
    } catch (err) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setRunningId(null);
    }
  }, []);

  const handleUseTemplate = useCallback((template) => {
    setEditingReport({
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
    setShowForm(true);
    setActiveTab('reports');
  }, []);

  const activeCount = reports.filter(r => r.is_active).length;

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100">
            <Calendar className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Scheduled Reports</h1>
            <p className="text-xs text-slate-500">
              Automate report generation and email distribution
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {activeCount} active / {reports.length} total
          </Badge>
          <Button
            onClick={() => { setEditingReport(null); setShowForm(!showForm); setActiveTab('reports'); }}
            className="gap-2"
            size="sm"
          >
            <Plus className="w-4 h-4" />
            New Report
          </Button>
        </div>
      </div>

      {/* Form (collapsible) */}
      {showForm && (
        <ReportScheduleForm
          initialData={editingReport}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditingReport(null); }}
          saving={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="reports" className="gap-1.5">
            <FileBarChart2 className="w-3.5 h-3.5" />
            My Reports
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5">
            <BookTemplate className="w-3.5 h-3.5" />
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="mt-4">
          <ScheduledReportsList
            reports={reports}
            loading={isLoading}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleActive={handleToggleActive}
            onRunNow={handleRunNow}
            runningId={runningId}
          />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <ReportTemplateLibrary onUseTemplate={handleUseTemplate} />
        </TabsContent>
      </Tabs>

      <DataSourcesFooter />
    </div>
  );
}