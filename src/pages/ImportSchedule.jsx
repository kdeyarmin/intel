import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Calendar, Plus, Trash2, Power, PowerOff, Edit, History, Loader2, Play } from 'lucide-react';
import ImportHistoryPanel from '../components/imports/ImportHistoryPanel';
import NPPESScheduleForm from '../components/imports/NPPESScheduleForm';

const importTypeOptions = [
  { value: 'nppes_registry', label: 'NPPES Registry (Providers)', apiUrl: '' },
  { value: 'cms_utilization', label: 'CMS Provider Utilization', apiUrl: 'https://data.cms.gov/data-api/v1/dataset/92396110-2aed-4d63-a6a2-5d6207d46a29/data' },
  { value: 'cms_order_referring', label: 'Order & Referring Providers', apiUrl: 'https://data.cms.gov/data-api/v1/dataset/c99b5865-1119-4436-bb80-c5af2773ea1f/data' },
  { value: 'opt_out_physicians', label: 'Medicare Opt-Out Physicians', apiUrl: 'https://data.cms.gov/data-api/v1/dataset/9887a515-7552-4693-bf58-735c77af46d7/data' },
  { value: 'provider_service_utilization', label: 'Provider Service Utilization', apiUrl: 'https://data.cms.gov/data-api/v1/dataset/92396110-2aed-4d63-a6a2-5d6207d46a29/data' },
  { value: 'home_health_enrollments', label: 'Home Health Enrollments', apiUrl: 'https://data.cms.gov/data-api/v1/dataset/15f64ab4-3172-4a27-b589-ebd67a6d28aa/data' },
  { value: 'hospice_enrollments', label: 'Hospice Enrollments', apiUrl: 'https://data.cms.gov/data-api/v1/dataset/25704213-e833-4b8b-9dbc-58dd17149209/data' },
];

export default function ImportSchedule() {
  const [open, setOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [importType, setImportType] = useState('cms_utilization');
  const [scheduleFrequency, setScheduleFrequency] = useState('daily');
  const [scheduleTime, setScheduleTime] = useState('02:00');
  const [runNow, setRunNow] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState({});
  const [nppesConfig, setNppesConfig] = useState({
    state: '', taxonomy_description: '', entity_type: '', city: '', postal_code: '', crawl_all_states: true,
  });

  const queryClient = useQueryClient();

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['importSchedules'],
    queryFn: () => base44.entities.ImportScheduleConfig.list('-created_date'),
    initialData: [],
  });

  const { data: importBatches = [] } = useQuery({
    queryKey: ['importBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 100),
    initialData: [],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const selected = importTypeOptions.find(opt => opt.value === importType);
      const now = new Date();
      const [hours, minutes] = scheduleTime.split(':').map(Number);
      const nextRun = new Date(now);
      nextRun.setDate(nextRun.getDate() + 1);
      nextRun.setHours(hours, minutes, 0, 0);

      const isNppes = importType === 'nppes_registry';
      const label = isNppes
        ? `NPPES Registry${nppesConfig.crawl_all_states ? ' (All States)' : nppesConfig.state ? ` - ${nppesConfig.state}` : ''}${nppesConfig.taxonomy_description ? ` - ${nppesConfig.taxonomy_description}` : ''}`
        : selected.label;

      const data = {
        import_type: importType,
        label,
        api_url: selected.apiUrl,
        schedule_frequency: scheduleFrequency,
        schedule_time: scheduleTime,
        is_active: true,
        next_run_at: nextRun.toISOString(),
        notify_on_complete: true,
        notify_on_failure: true,
      };

      if (isNppes) {
        data.nppes_config = {
          state: nppesConfig.state || '',
          taxonomy_description: nppesConfig.taxonomy_description || '',
          entity_type: nppesConfig.entity_type || '',
          city: nppesConfig.city || '',
          postal_code: nppesConfig.postal_code || '',
          crawl_all_states: nppesConfig.crawl_all_states || false,
        };
      }

      if (editingSchedule) {
        await base44.entities.ImportScheduleConfig.update(editingSchedule.id, data);
      } else {
        await base44.entities.ImportScheduleConfig.create(data);
      }

      return { selected, now, isNppes };
    },
    onSuccess: ({ selected, now, isNppes }) => {
      queryClient.invalidateQueries({ queryKey: ['importSchedules'] });
      queryClient.invalidateQueries({ queryKey: ['importBatches'] });
      setOpen(false);
      setEditingSchedule(null);

      // Fire-and-forget: trigger immediate import in background
      if (runNow && !editingSchedule) {
        if (isNppes) {
          if (nppesConfig.crawl_all_states) {
            base44.functions.invoke('nppesStateCrawler', {
              action: 'process_next',
              taxonomy_description: nppesConfig.taxonomy_description || '',
              entity_type: nppesConfig.entity_type || '',
              dry_run: false,
            }).catch(err => console.error('Background NPPES crawl failed:', err));
          } else {
            base44.functions.invoke('importNPPESRegistry', {
              state: nppesConfig.state || '',
              taxonomy_description: nppesConfig.taxonomy_description || '',
              entity_type: nppesConfig.entity_type || '',
              city: nppesConfig.city || '',
              postal_code: nppesConfig.postal_code || '',
              dry_run: false,
            }).catch(err => console.error('Background NPPES import failed:', err));
          }
        } else {
          base44.functions.invoke('autoImportCMSData', {
            import_type: importType,
            file_url: selected.apiUrl,
            year: now.getFullYear(),
            dry_run: false,
          }).catch(err => console.error('Background import failed:', err));
        }
        setTimeout(() => queryClient.invalidateQueries({ queryKey: ['importBatches'] }), 5000);
      }
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (schedule) => {
      await base44.entities.ImportScheduleConfig.update(schedule.id, { is_active: !schedule.is_active });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['importSchedules'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.ImportScheduleConfig.delete(id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['importSchedules'] }),
  });

  const [runningScheduleId, setRunningScheduleId] = useState(null);

  const runNowMutation = useMutation({
    mutationFn: async (schedule) => {
      setRunningScheduleId(schedule.id);
      if (schedule.import_type === 'nppes_registry') {
        const cfg = schedule.nppes_config || {};
        if (cfg.crawl_all_states) {
          await base44.functions.invoke('nppesStateCrawler', {
            action: 'process_next',
            taxonomy_description: cfg.taxonomy_description || '',
            entity_type: cfg.entity_type || '',
            dry_run: false,
          });
        } else {
          await base44.functions.invoke('importNPPESRegistry', {
            state: cfg.state || '',
            taxonomy_description: cfg.taxonomy_description || '',
            entity_type: cfg.entity_type || '',
            city: cfg.city || '',
            postal_code: cfg.postal_code || '',
            dry_run: false,
          });
        }
      } else {
        await base44.functions.invoke('autoImportCMSData', {
          import_type: schedule.import_type,
          file_url: schedule.api_url,
          year: new Date().getFullYear(),
          dry_run: false,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['importBatches'] });
      setRunningScheduleId(null);
    },
    onError: () => {
      setRunningScheduleId(null);
    },
  });

  const handleEdit = (schedule) => {
    setEditingSchedule(schedule);
    setImportType(schedule.import_type);
    setScheduleFrequency(schedule.schedule_frequency);
    setScheduleTime(schedule.schedule_time || '02:00');
    setRunNow(false);
    if (schedule.nppes_config) {
      setNppesConfig(schedule.nppes_config);
    } else {
      setNppesConfig({ state: '', taxonomy_description: '', entity_type: '', city: '', postal_code: '', crawl_all_states: true });
    }
    setOpen(true);
  };

  const getScheduleHistory = (importType) => {
    return importBatches.filter(batch => batch.import_type === importType);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Import Schedules</h1>
          <p className="text-gray-600 mt-1">Configure automated data import schedules</p>
        </div>
        <Dialog open={open} onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) { setEditingSchedule(null); setRunNow(true); }
        }}>
          <DialogTrigger asChild>
            <Button className="bg-teal-600 hover:bg-teal-700">
              <Plus className="w-4 h-4 mr-2" /> New Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingSchedule ? 'Edit Import Schedule' : 'Create Import Schedule'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Import Type</Label>
                <Select value={importType} onValueChange={setImportType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {importTypeOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select value={scheduleFrequency} onValueChange={setScheduleFrequency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Run Time</Label>
                  <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
                </div>
              </div>

              {!editingSchedule && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <Label>Run import immediately</Label>
                    <p className="text-xs text-gray-500">Start the import now and schedule for recurring imports</p>
                  </div>
                  <Switch checked={runNow} onCheckedChange={setRunNow} />
                </div>
              )}

              {importType === 'nppes_registry' && (
                <NPPESScheduleForm config={nppesConfig} onChange={setNppesConfig} />
              )}

              <p className="text-xs text-gray-500">
                The schedule will automatically import data at the specified time. {importType === 'nppes_registry' ? 'NPPES crawls may take several hours for all states.' : ''}
              </p>

              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="w-full bg-teal-600 hover:bg-teal-700"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingSchedule ? 'Update Schedule' : (runNow ? 'Create Schedule & Import Now' : 'Create Schedule')}
              </Button>

              {createMutation.isError && (
                <p className="text-sm text-red-600">Error: {createMutation.error?.message}</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Schedules</CardTitle>
          <CardDescription>Manage your automated import schedules</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : schedules.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No schedules configured</p>
              <p className="text-sm mt-1">Create your first automated import schedule</p>
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map((schedule) => {
                const history = getScheduleHistory(schedule.import_type);
                const isExpanded = expandedHistory[schedule.id];

                return (
                  <Card key={schedule.id} className="border-2">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold">{schedule.label}</h3>
                          <Badge variant={schedule.is_active ? 'default' : 'outline'}>
                            {schedule.is_active ? 'Active' : 'Paused'}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>Frequency: {schedule.schedule_frequency} at {schedule.schedule_time}</p>
                          {schedule.last_run_at && (
                            <p className="text-xs text-gray-500">
                              Last run: {new Date(schedule.last_run_at).toLocaleString()}
                              {schedule.last_run_status && (
                                <Badge variant={schedule.last_run_status === 'success' ? 'default' : schedule.last_run_status === 'partial' ? 'secondary' : 'destructive'} className="ml-2 text-[10px] px-1 py-0">
                                  {schedule.last_run_status}
                                </Badge>
                              )}
                            </p>
                          )}
                          {schedule.last_run_summary && (
                            <p className="text-xs text-gray-400">{schedule.last_run_summary}</p>
                          )}
                          {schedule.next_run_at && (
                            <p className="text-xs text-gray-500">Next run: {new Date(schedule.next_run_at).toLocaleString()}</p>
                          )}
                          {schedule.nppes_config && (
                            <p className="text-xs text-blue-600">
                              NPPES: {schedule.nppes_config.crawl_all_states ? 'All states' : schedule.nppes_config.state || 'Any'}
                              {schedule.nppes_config.taxonomy_description ? ` • ${schedule.nppes_config.taxonomy_description}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => runNowMutation.mutate(schedule)}
                          disabled={runningScheduleId === schedule.id}
                          title="Run Now"
                        >
                          {runningScheduleId === schedule.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 text-green-600" />}
                        </Button>

                        <Button variant="outline" size="icon" onClick={() => handleEdit(schedule)} title="Edit">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => setExpandedHistory(p => ({ ...p, [schedule.id]: !p[schedule.id] }))} title="History">
                          <History className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => toggleMutation.mutate(schedule)} title={schedule.is_active ? 'Pause' : 'Activate'}>
                          {schedule.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                        </Button>
                        <Button variant="outline" size="icon" onClick={() => { if (confirm('Delete this schedule?')) deleteMutation.mutate(schedule.id); }} title="Delete">
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <ImportHistoryPanel batches={history} />
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}