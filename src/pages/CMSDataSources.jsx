import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Database, Plus, Edit2, Trash2, RefreshCw, AlertCircle, CheckCircle2, Sparkles } from 'lucide-react';

const IMPORT_TYPES = [
  "cms_utilization",
  "cms_order_referring",
  "opt_out_physicians",
  "provider_service_utilization",
  "home_health_enrollments",
  "hospice_enrollments",
  "nppes_registry",
  "medicare_hha_stats",
  "medicare_ma_inpatient",
  "medicare_part_d_stats",
  "medicare_snf_stats"
];

export default function CMSDataSources() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [formData, setFormData] = useState({});
  const [testingId, setTestingId] = useState(null);

  const { data: configs, isLoading } = useQuery({
    queryKey: ['importScheduleConfigs'],
    queryFn: () => base44.entities.ImportScheduleConfig.list()
  });

  const saveConfig = useMutation({
    mutationFn: async (data) => {
      if (editingConfig) {
        return await base44.entities.ImportScheduleConfig.update(editingConfig.id, data);
      } else {
        return await base44.entities.ImportScheduleConfig.create(data);
      }
    },
    onSuccess: () => {
      toast.success('Configuration saved successfully');
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['importScheduleConfigs'] });
    },
    onError: (error) => {
      toast.error(`Error saving config: ${error.message}`);
    }
  });

  const deleteConfig = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.ImportScheduleConfig.delete(id);
    },
    onSuccess: () => {
      toast.success('Configuration deleted');
      queryClient.invalidateQueries({ queryKey: ['importScheduleConfigs'] });
    },
    onError: (error) => {
      toast.error(`Error deleting config: ${error.message}`);
    }
  });

  const testConfig = async (id) => {
    setTestingId(id);
    try {
      const res = await base44.functions.invoke('testCMSUrl', { id });
      if (res.data.success && res.data.isValid) {
        toast.success('URL is valid and accessible');
      } else {
        toast.error(res.data.config?.last_run_summary || 'URL validation failed');
      }
      queryClient.invalidateQueries({ queryKey: ['importScheduleConfigs'] });
    } catch (e) {
      toast.error(`Failed to test URL: ${e.message}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleOpenModal = (config = null) => {
    setEditingConfig(config);
    if (config) {
      setFormData({
        import_type: config.import_type,
        label: config.label,
        data_year: config.data_year || '',
        api_url: config.api_url,
        schedule_frequency: config.schedule_frequency,
        depends_on_import_type: config.depends_on_import_type || '',
        schedule_time: config.schedule_time || '02:00',
        is_active: config.is_active
      });
    } else {
      setFormData({
        import_type: 'medicare_hha_stats',
        label: '',
        data_year: new Date().getFullYear(),
        api_url: '',
        schedule_frequency: 'weekly',
        depends_on_import_type: '',
        schedule_time: '02:00',
        is_active: true
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveConfig.mutate({
      ...formData,
      data_year: formData.data_year ? parseInt(formData.data_year, 10) : undefined
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="CMS Data Sources"
        icon={Database}
        breadcrumbs={[
          { label: 'Admin', path: '#' },
          { label: 'CMS Data Sources' }
        ]}
      >
        <Button onClick={() => handleOpenModal()} className="bg-cyan-600 hover:bg-cyan-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Add Data Source
        </Button>
      </PageHeader>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <Table>
          <TableHeader className="bg-slate-800/50">
            <TableRow className="border-slate-800">
              <TableHead className="text-slate-300">Label / Type</TableHead>
              <TableHead className="text-slate-300">Year</TableHead>
              <TableHead className="text-slate-300">Schedule</TableHead>
              <TableHead className="text-slate-300">URL Status</TableHead>
              <TableHead className="text-slate-300 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-slate-500">Loading sources...</TableCell>
              </TableRow>
            ) : configs?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-slate-500">No data sources configured.</TableCell>
              </TableRow>
            ) : (
              configs?.map((config) => (
                <TableRow key={config.id} className="border-slate-800/50 hover:bg-slate-800/20">
                  <TableCell>
                    <div className="font-medium text-slate-200">{config.label}</div>
                    <div className="text-xs text-slate-500">{config.import_type}</div>
                  </TableCell>
                  <TableCell className="text-slate-300">
                    {config.data_year || '-'}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-slate-300 capitalize">
                      {config.schedule_frequency === 'on_completion' 
                        ? `After ${config.depends_on_import_type}` 
                        : `${config.schedule_frequency} at ${config.schedule_time}`}
                    </div>
                    <Badge variant={config.is_active ? 'default' : 'secondary'} className={config.is_active ? 'bg-cyan-500/20 text-cyan-400 mt-1' : 'mt-1'}>
                      {config.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {config.last_verified_at ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          {config.cms_metadata ? (
                            <CheckCircle2 className="w-3 h-3 text-green-400" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-red-400" />
                          )}
                          <span>Verified: {format(new Date(config.last_verified_at), 'MMM d, h:mm a')}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 italic">Never verified</span>
                      )}
                      {config.cms_metadata && (
                        <span className="text-[10px] text-slate-500 ml-4.5">
                          Size: {Math.round((config.cms_metadata.content_length || 0) / 1024 / 1024)} MB
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={testingId !== null}
                        onClick={() => testConfig(config.id)}
                        className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/30"
                        title="Test URL"
                      >
                        <RefreshCw className={`w-4 h-4 ${testingId === config.id ? 'animate-spin' : ''}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenModal(config)}
                        className="text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (window.confirm('Delete this configuration?')) {
                            deleteConfig.mutate(config.id);
                          }
                        }}
                        className="text-red-400 hover:text-red-300 hover:bg-red-950/30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
          <DialogHeader>
            <DialogTitle>{editingConfig ? 'Edit Data Source' : 'Add Data Source'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Label / Name</Label>
                <Input
                  required
                  placeholder="e.g. Medicare HHA 2023"
                  value={formData.label || ''}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  className="bg-slate-950 border-slate-800"
                />
              </div>
              <div className="space-y-2">
                <Label>Import Type</Label>
                <Select
                  value={formData.import_type}
                  onValueChange={(v) => setFormData({ ...formData, import_type: v })}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                    {IMPORT_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data Year (Optional)</Label>
                <Input
                  type="number"
                  placeholder="2023"
                  value={formData.data_year || ''}
                  onChange={(e) => setFormData({ ...formData, data_year: e.target.value })}
                  className="bg-slate-950 border-slate-800"
                />
              </div>
              <div className="space-y-2 flex flex-col justify-end">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active || false}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-cyan-500/20"
                  />
                  <span className="text-sm font-medium">Active Schedule</span>
                </label>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Source URL</Label>
              <div className="flex gap-2">
                <Input
                  required
                  placeholder="https://data.cms.gov/..."
                  value={formData.api_url || ''}
                  onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
                  className="bg-slate-950 border-slate-800 flex-1"
                />
                <Button 
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    if (!formData.api_url) {
                      toast.error("Please enter a URL first");
                      return;
                    }
                    const toastId = toast.loading("Analyzing format with AI...");
                    try {
                      const res = await base44.functions.invoke('predictImportFormat', { url: formData.api_url });
                      if (res.data.success && res.data.prediction) {
                        const { import_type, data_year, explanation } = res.data.prediction;
                        setFormData(prev => ({
                          ...prev,
                          import_type: import_type || prev.import_type,
                          data_year: data_year || prev.data_year
                        }));
                        toast.success("Format detected successfully", { id: toastId });
                        if (explanation) toast(explanation);
                      } else {
                        toast.error(res.data.error || "Failed to predict format", { id: toastId });
                      }
                    } catch {
                      toast.error("Error connecting to AI", { id: toastId });
                    }
                  }}
                  className="bg-slate-900 border-slate-700 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/30"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Auto-Detect
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select
                  value={formData.schedule_frequency}
                  onValueChange={(v) => setFormData({ ...formData, schedule_frequency: v })}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-800">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="on_completion">On Completion</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {formData.schedule_frequency === 'on_completion' ? (
                <div className="space-y-2">
                  <Label>Depends On (Wait for)</Label>
                  <Select
                    value={formData.depends_on_import_type}
                    onValueChange={(v) => setFormData({ ...formData, depends_on_import_type: v })}
                  >
                    <SelectTrigger className="bg-slate-950 border-slate-800">
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-slate-200">
                      {IMPORT_TYPES.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Time (HH:MM)</Label>
                  <Input
                    required
                    type="time"
                    value={formData.schedule_time || ''}
                    onChange={(e) => setFormData({ ...formData, schedule_time: e.target.value })}
                    className="bg-slate-950 border-slate-800"
                  />
                </div>
              )}
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saveConfig.isPending} className="bg-cyan-600 hover:bg-cyan-700 text-white">
                {saveConfig.isPending ? 'Saving...' : 'Save Configuration'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}