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
import { Calendar, Plus, Trash2, Power, PowerOff } from 'lucide-react';

const importTypeOptions = [
  { 
    value: 'cms_utilization', 
    label: 'CMS Provider Utilization',
    apiUrl: 'https://data.cms.gov/data-api/v1/dataset/4c394e8d-c6b0-4e9f-8e98-3f85c1ea5d12/data'
  },
  { 
    value: 'cms_order_referring', 
    label: 'Order & Referring Providers',
    apiUrl: 'https://data.cms.gov/data-api/v1/dataset/26e73b72-9e86-4af7-bd35-dedb33f1e986/data'
  },
  { 
    value: 'opt_out_physicians', 
    label: 'Medicare Opt-Out Physicians',
    apiUrl: 'https://data.cms.gov/data-api/v1/dataset/6bd6b1dd-208c-4f9c-88b8-b15fec6db548/data'
  },
  { 
    value: 'provider_service_utilization', 
    label: 'Provider Service Utilization',
    apiUrl: 'https://data.cms.gov/data-api/v1/dataset/e38967e5-4acc-4f3c-a0dd-8c0d038e2b51/data'
  },
  { 
    value: 'home_health_enrollments', 
    label: 'Home Health Enrollments',
    apiUrl: 'https://data.cms.gov/data-api/v1/dataset/8c52eb6b-1cce-4913-a16d-c2fa59c6ca67/data'
  },
  { 
    value: 'hospice_enrollments', 
    label: 'Hospice Enrollments',
    apiUrl: 'https://data.cms.gov/data-api/v1/dataset/41f3f9fb-1d06-4b69-b8e2-f3d8c3c9b6a1/data'
  },
];

export default function ImportSchedule() {
  const [open, setOpen] = useState(false);
  const [importType, setImportType] = useState('cms_utilization');
  const [scheduleType, setScheduleType] = useState('daily');
  const [scheduleTime, setScheduleTime] = useState('02:00');
  const [runNow, setRunNow] = useState(true);

  const selectedImportType = importTypeOptions.find(opt => opt.value === importType);
  const scheduleName = `Auto Import - ${selectedImportType?.label || ''}`;
  const fileUrl = selectedImportType?.apiUrl || '';

  const queryClient = useQueryClient();

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ['importAutomations'],
    queryFn: async () => {
      const response = await fetch('/.well-known/base44/automations');
      const data = await response.json();
      return data.filter(a => a.function_name === 'autoImportCMSData');
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('createImportSchedule', {
        import_type: importType,
        schedule_type: scheduleType,
        schedule_time: scheduleTime,
        runNow: runImmediate,
      });

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      return response.data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries(['importAutomations']);
      
      // If "Run Now" is checked, trigger the import immediately
      if (runNow) {
        try {
          await base44.functions.invoke('autoImportCMSData', {
            import_type: importType,
            file_url: fileUrl,
            year: new Date().getFullYear(),
            dry_run: false,
          });
          alert('Schedule created and import started!');
        } catch (error) {
          console.error('Failed to start immediate import:', error);
          alert('Schedule created but immediate import failed: ' + error.message);
        }
      }
      
      setOpen(false);
    },
    onError: (error) => {
      console.error('Failed to create schedule:', error);
      alert('Failed to create schedule: ' + error.message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (automationId) => {
      const response = await fetch(`/.well-known/base44/automations/${automationId}/toggle`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to toggle automation');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['importAutomations']);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (automationId) => {
      const response = await fetch(`/.well-known/base44/automations/${automationId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete automation');
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['importAutomations']);
    },
  });

  const getScheduleDescription = (auto) => {
    if (auto.repeat_unit === 'days') return 'Daily';
    if (auto.repeat_unit === 'weeks') return 'Weekly';
    if (auto.repeat_unit === 'months') return 'Monthly';
    return 'Custom';
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Import Schedules</h1>
          <p className="text-gray-600 mt-1">Configure automated data import schedules</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-teal-600 hover:bg-teal-700">
              <Plus className="w-4 h-4 mr-2" />
              New Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create Import Schedule</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Import Type</Label>
                <Select value={importType} onValueChange={setImportType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {importTypeOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  Schedule name: {scheduleName}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Schedule Frequency</Label>
                  <Select value={scheduleType} onValueChange={setScheduleType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Run Time</Label>
                  <Input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="space-y-0.5">
                    <Label>Run import immediately</Label>
                    <p className="text-xs text-gray-500">
                      Start the import now and schedule for recurring imports
                    </p>
                  </div>
                  <Switch checked={runNow} onCheckedChange={setRunNow} />
                </div>
                <p className="text-xs text-gray-500">
                  The schedule will automatically import new data from CMS at the specified time.
                </p>
              </div>

              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="w-full bg-teal-600 hover:bg-teal-700"
              >
                {runNow ? 'Create Schedule & Import Now' : 'Create Schedule'}
              </Button>
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
          ) : automations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No schedules configured</p>
              <p className="text-sm mt-1">Create your first automated import schedule</p>
            </div>
          ) : (
            <div className="space-y-3">
              {automations.map((auto) => (
                <div
                  key={auto.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold">{auto.name}</h3>
                      <Badge variant={auto.is_active ? 'default' : 'outline'}>
                        {auto.is_active ? 'Active' : 'Paused'}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>Import Type: {auto.function_args?.import_type?.replace(/_/g, ' ')}</p>
                      <p>Frequency: {getScheduleDescription(auto)} at {auto.start_time || 'N/A'}</p>
                      {auto.function_args?.file_url && (
                        <p className="text-xs truncate max-w-md">URL: {auto.function_args.file_url}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => toggleMutation.mutate(auto.id)}
                      disabled={toggleMutation.isPending}
                    >
                      {auto.is_active ? (
                        <PowerOff className="w-4 h-4" />
                      ) : (
                        <Power className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        if (confirm('Delete this schedule?')) {
                          deleteMutation.mutate(auto.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}