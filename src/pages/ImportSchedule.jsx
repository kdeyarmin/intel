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
import { Calendar, Plus, Trash2, Power, PowerOff, Edit, History, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';

const importTypeOptions = [
  { value: 'cms_utilization', label: 'CMS Provider Utilization', apiUrl: 'https://data.cms.gov/data-api/v1/dataset/4c394e8d-c6b0-4e9f-8e98-3f85c1ea5d12/data' },
  { value: 'cms_order_referring', label: 'Order & Referring Providers', apiUrl: 'https://data.cms.gov/data-api/v1/dataset/26e73b72-9e86-4af7-bd35-dedb33f1e986/data' },
  { value: 'opt_out_physicians', label: 'Medicare Opt-Out Physicians', apiUrl: 'https://data.cms.gov/data-api/v1/dataset/6bd6b1dd-208c-4f9c-88b8-b15fec6db548/data' },
  { value: 'provider_service_utilization', label: 'Provider Service Utilization', apiUrl: 'https://data.cms.gov/data-api/v1/dataset/e38967e5-4acc-4f3c-a0dd-8c0d038e2b51/data' },
  { value: 'home_health_enrollments', label: 'Home Health Enrollments', apiUrl: 'https://data.cms.gov/data-api/v1/dataset/8c52eb6b-1cce-4913-a16d-c2fa59c6ca67/data' },
  { value: 'hospice_enrollments', label: 'Hospice Enrollments', apiUrl: 'https://data.cms.gov/data-api/v1/dataset/41f3f9fb-1d06-4b69-b8e2-f3d8c3c9b6a1/data' },
];

export default function ImportSchedule() {
  const [open, setOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [importType, setImportType] = useState('cms_utilization');
  const [scheduleFrequency, setScheduleFrequency] = useState('daily');
  const [scheduleTime, setScheduleTime] = useState('02:00');
  const [runNow, setRunNow] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState({});

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

      const data = {
        import_type: importType,
        label: selected.label,
        api_url: selected.apiUrl,
        schedule_frequency: scheduleFrequency,
        schedule_time: scheduleTime,
        is_active: true,
        next_run_at: nextRun.toISOString(),
      };

      if (editingSchedule) {
        await base44.entities.ImportScheduleConfig.update(editingSchedule.id, data);
      } else {
        await base44.entities.ImportScheduleConfig.create(data);
      }

      return { selected, now };
    },
    onSuccess: ({ selected, now }) => {
      queryClient.invalidateQueries({ queryKey: ['importSchedules'] });
      queryClient.invalidateQueries({ queryKey: ['importBatches'] });
      setOpen(false);
      setEditingSchedule(null);

      // Fire-and-forget: trigger immediate import in background
      if (runNow && !editingSchedule) {
        base44.functions.invoke('autoImportCMSData', {
          import_type: importType,
          file_url: selected.apiUrl,
          year: now.getFullYear(),
          dry_run: false,
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ['importBatches'] });
        }).catch((err) => {
          console.error('Background import failed:', err);
        });
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

  const handleEdit = (schedule) => {
    setEditingSchedule(schedule);
    setImportType(schedule.import_type);
    setScheduleFrequency(schedule.schedule_frequency);
    setScheduleTime(schedule.schedule_time || '02:00');
    setRunNow(false);
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

              <p className="text-xs text-gray-500">
                The schedule will automatically import new data from CMS at the specified time.
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
                            <p className="text-xs text-gray-500">Last run: {new Date(schedule.last_run_at).toLocaleString()}</p>
                          )}
                          {schedule.next_run_at && (
                            <p className="text-xs text-gray-500">Next run: {new Date(schedule.next_run_at).toLocaleString()}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
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
                      <div className="border-t px-4 py-3 bg-gray-50">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-sm">Import History</h4>
                          <Badge variant="outline">{history.length} runs</Badge>
                        </div>
                        {history.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-4">No import history yet</p>
                        ) : (
                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            {history.map((batch) => (
                              <div key={batch.id} className="bg-white p-3 rounded-lg border">
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    {batch.status === 'completed' ? <CheckCircle className="w-4 h-4 text-green-600" /> :
                                     batch.status === 'failed' ? <XCircle className="w-4 h-4 text-red-600" /> :
                                     <Clock className="w-4 h-4 text-yellow-600" />}
                                    <Badge variant={batch.status === 'completed' ? 'default' : batch.status === 'failed' ? 'destructive' : 'outline'}>
                                      {batch.status}
                                    </Badge>
                                  </div>
                                  <span className="text-xs text-gray-500">{new Date(batch.created_date).toLocaleString()}</span>
                                </div>
                                <div className="text-sm space-y-1">
                                  <p className="text-gray-700">{batch.file_name}</p>
                                  {batch.total_rows && (
                                    <div className="flex gap-4 text-xs text-gray-600">
                                      <span>Total: {batch.total_rows}</span>
                                      <span className="text-green-600">Valid: {batch.valid_rows || 0}</span>
                                      <span className="text-red-600">Invalid: {batch.invalid_rows || 0}</span>
                                      {batch.imported_rows !== undefined && <span className="text-blue-600">Imported: {batch.imported_rows}</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
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