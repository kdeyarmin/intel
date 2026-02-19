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
import { Calendar, Plus, Trash2, Power, PowerOff } from 'lucide-react';

const importTypeOptions = [
  { value: 'cms_utilization', label: 'CMS Provider Utilization' },
  { value: 'cms_order_referring', label: 'Order & Referring Providers' },
  { value: 'cms_part_d', label: 'CMS Part D Prescriber' },
  { value: 'nursing_home_chains', label: 'Nursing Home Chains' },
  { value: 'hospice_enrollments', label: 'Hospice Enrollments' },
  { value: 'home_health_enrollments', label: 'Home Health Enrollments' },
  { value: 'home_health_cost_reports', label: 'Home Health Cost Reports' },
  { value: 'cms_service_utilization', label: 'Medicare Service Utilization' },
  { value: 'provider_service_utilization', label: 'Provider Service Utilization' },
  { value: 'home_health_pdgm', label: 'Home Health PDGM' },
  { value: 'inpatient_drg', label: 'Inpatient DRG' },
  { value: 'provider_ownership', label: 'Provider Ownership' },
];

export default function ImportSchedule() {
  const [open, setOpen] = useState(false);
  const [scheduleName, setScheduleName] = useState('');
  const [importType, setImportType] = useState('cms_utilization');
  const [fileUrl, setFileUrl] = useState('');
  const [year, setYear] = useState('2023');
  const [scheduleType, setScheduleType] = useState('daily');
  const [scheduleTime, setScheduleTime] = useState('02:00');

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
    mutationFn: async (scheduleData) => {
      const [hour, minute] = scheduleTime.split(':');
      
      let scheduleConfig = {
        automation_type: 'scheduled',
        name: scheduleName,
        function_name: 'autoImportCMSData',
        function_args: {
          import_type: importType,
          file_url: fileUrl,
          year: parseInt(year),
          dry_run: false,
        },
        is_active: true,
      };

      if (scheduleType === 'daily') {
        scheduleConfig.repeat_interval = 1;
        scheduleConfig.repeat_unit = 'days';
        scheduleConfig.start_time = scheduleTime;
      } else if (scheduleType === 'weekly') {
        scheduleConfig.repeat_unit = 'weeks';
        scheduleConfig.repeat_on_days = [1]; // Monday
        scheduleConfig.start_time = scheduleTime;
      } else if (scheduleType === 'monthly') {
        scheduleConfig.repeat_unit = 'months';
        scheduleConfig.repeat_on_day_of_month = 1;
        scheduleConfig.start_time = scheduleTime;
      }

      const response = await fetch('/.well-known/base44/automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleConfig),
      });

      if (!response.ok) throw new Error('Failed to create schedule');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['importAutomations']);
      setOpen(false);
      setScheduleName('');
      setFileUrl('');
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
                <Label>Schedule Name</Label>
                <Input
                  placeholder="e.g., Daily CMS Utilization Import"
                  value={scheduleName}
                  onChange={(e) => setScheduleName(e.target.value)}
                />
              </div>

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
              </div>

              <div className="space-y-2">
                <Label>File URL</Label>
                <Input
                  placeholder="https://data.cms.gov/..."
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                />
                <p className="text-xs text-gray-500">URL to the CMS data file or API endpoint</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data Year</Label>
                  <Input
                    type="number"
                    placeholder="2023"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                  />
                </div>

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
              </div>

              <div className="space-y-2">
                <Label>Run Time</Label>
                <Input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
                <p className="text-xs text-gray-500">Time in your local timezone (America/New_York)</p>
              </div>

              <Button
                onClick={() => createMutation.mutate()}
                disabled={!scheduleName || !fileUrl || createMutation.isPending}
                className="w-full bg-teal-600 hover:bg-teal-700"
              >
                Create Schedule
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