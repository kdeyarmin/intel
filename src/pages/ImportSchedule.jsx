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
import { Calendar, Plus, Trash2, Power, PowerOff, Edit, History, ChevronDown, ChevronUp, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

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
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [importType, setImportType] = useState('cms_utilization');
  const [scheduleType, setScheduleType] = useState('daily');
  const [scheduleTime, setScheduleTime] = useState('02:00');
  const [runNow, setRunNow] = useState(true);
  const [expandedHistory, setExpandedHistory] = useState({});

  const selectedImportType = importTypeOptions.find(opt => opt.value === importType);
  const scheduleName = `Auto Import - ${selectedImportType?.label || ''}`;
  const fileUrl = selectedImportType?.apiUrl || '';

  const queryClient = useQueryClient();

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ['importAutomations'],
    queryFn: async () => {
      const response = await fetch('/api/automations');
      const data = await response.json();
      return data.filter(a => a.function_name === 'autoImportCMSData');
    },
  });

  const { data: importBatches = [] } = useQuery({
    queryKey: ['importBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 100),
    initialData: [],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      // Get config from backend function
      const response = await base44.functions.invoke('createImportSchedule', {
        import_type: importType,
        schedule_type: scheduleType,
        schedule_time: scheduleTime,
      });

      if (response.data.error) {
        throw new Error(response.data.error);
      }

      const scheduleConfig = response.data.config;

      if (editingSchedule) {
        // Update existing automation via API
        const updateResponse = await fetch(`/api/automations/${editingSchedule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scheduleConfig),
        });
        if (!updateResponse.ok) throw new Error('Failed to update automation');
      } else {
        // Create new automation via API
        const createResponse = await fetch(`/api/automations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scheduleConfig),
        });
        if (!createResponse.ok) throw new Error('Failed to create automation');
      }
    },
    onSuccess: async () => {
      queryClient.invalidateQueries(['importAutomations']);
      
      // If "Run Now" is checked and creating new schedule, trigger import immediately
      if (runNow && !editingSchedule) {
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
      } else {
        alert(editingSchedule ? 'Schedule updated successfully!' : 'Schedule created successfully!');
      }
      
      setOpen(false);
      setEditingSchedule(null);
    },
    onError: (error) => {
      console.error('Failed to create schedule:', error);
      alert('Failed to create schedule: ' + error.message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (automationId) => {
      const response = await fetch(`/api/automations/${automationId}/toggle`, {
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
      const response = await fetch(`/api/automations/${automationId}`, {
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

  const handleEdit = (automation) => {
    setEditingSchedule(automation);
    const scheduleTypeMap = {
      'days': 'daily',
      'weeks': 'weekly',
      'months': 'monthly'
    };
    setImportType(automation.function_args?.import_type || 'cms_utilization');
    setScheduleType(scheduleTypeMap[automation.repeat_unit] || 'daily');
    setScheduleTime(automation.start_time || '02:00');
    setRunNow(false);
    setOpen(true);
  };

  const getScheduleHistory = (importType) => {
    return importBatches.filter(batch => batch.import_type === importType);
  };

  const toggleHistory = (automationId) => {
    setExpandedHistory(prev => ({
      ...prev,
      [automationId]: !prev[automationId]
    }));
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
          if (!isOpen) {
            setEditingSchedule(null);
            setRunNow(true);
          }
        }}>
          <DialogTrigger asChild>
            <Button className="bg-teal-600 hover:bg-teal-700">
              <Plus className="w-4 h-4 mr-2" />
              New Schedule
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

              {!editingSchedule && (
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
                {editingSchedule ? 'Update Schedule' : (runNow ? 'Create Schedule & Import Now' : 'Create Schedule')}
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
              {automations.map((auto) => {
                const history = getScheduleHistory(auto.function_args?.import_type);
                const isExpanded = expandedHistory[auto.id];
                
                return (
                  <Card key={auto.id} className="border-2">
                    <div className="flex items-center justify-between p-4">
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
                          {history.length > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                              Last run: {new Date(history[0].created_date).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleEdit(auto)}
                          title="Edit schedule"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => toggleHistory(auto.id)}
                          title="View history"
                        >
                          <History className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => toggleMutation.mutate(auto.id)}
                          disabled={toggleMutation.isPending}
                          title={auto.is_active ? "Pause" : "Activate"}
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
                          title="Delete"
                        >
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
                                    {batch.status === 'completed' ? (
                                      <CheckCircle className="w-4 h-4 text-green-600" />
                                    ) : batch.status === 'failed' ? (
                                      <XCircle className="w-4 h-4 text-red-600" />
                                    ) : (
                                      <Clock className="w-4 h-4 text-yellow-600" />
                                    )}
                                    <Badge 
                                      variant={batch.status === 'completed' ? 'default' : batch.status === 'failed' ? 'destructive' : 'outline'}
                                    >
                                      {batch.status}
                                    </Badge>
                                  </div>
                                  <span className="text-xs text-gray-500">
                                    {new Date(batch.created_date).toLocaleString()}
                                  </span>
                                </div>
                                <div className="text-sm space-y-1">
                                  <p className="text-gray-700">{batch.file_name}</p>
                                  {batch.total_rows && (
                                    <div className="flex gap-4 text-xs text-gray-600">
                                      <span>Total: {batch.total_rows}</span>
                                      <span className="text-green-600">Valid: {batch.valid_rows || 0}</span>
                                      <span className="text-red-600">Invalid: {batch.invalid_rows || 0}</span>
                                      {batch.imported_rows !== undefined && (
                                        <span className="text-blue-600">Imported: {batch.imported_rows}</span>
                                      )}
                                    </div>
                                  )}
                                  {batch.error_samples && batch.error_samples.length > 0 && (
                                    <div className="mt-2 p-2 bg-red-50 rounded text-xs">
                                      <p className="font-medium text-red-800 mb-1">Errors:</p>
                                      <ul className="space-y-1 text-red-700">
                                        {batch.error_samples.slice(0, 3).map((error, idx) => (
                                          <li key={idx}>• {error.error || JSON.stringify(error)}</li>
                                        ))}
                                        {batch.error_samples.length > 3 && (
                                          <li className="text-red-600">+ {batch.error_samples.length - 3} more errors</li>
                                        )}
                                      </ul>
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