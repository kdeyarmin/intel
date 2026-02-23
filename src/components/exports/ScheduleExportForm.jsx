import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Clock, Mail, X, Plus, Calendar } from 'lucide-react';
import { toast } from 'sonner';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function ScheduleExportForm({ dataset, format, selectedColumns, filters, onClose }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('weekly');
  const [scheduleDay, setScheduleDay] = useState('Mon');
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [recipients, setRecipients] = useState([]);
  const [emailInput, setEmailInput] = useState('');
  const [includeSummary, setIncludeSummary] = useState(false);

  const addRecipient = () => {
    const email = emailInput.trim();
    if (email && email.includes('@') && !recipients.includes(email)) {
      setRecipients(prev => [...prev, email]);
      setEmailInput('');
    }
  };

  const removeRecipient = (email) => {
    setRecipients(prev => prev.filter(e => e !== email));
  };

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ScheduledExport.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduledExports'] });
      toast.success('Scheduled export created');
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!name.trim() || recipients.length === 0) return;
    createMutation.mutate({
      name: name.trim(),
      dataset,
      format,
      columns: selectedColumns,
      filters: filters || {},
      frequency,
      schedule_day: scheduleDay,
      schedule_time: scheduleTime,
      recipients,
      include_summary: includeSummary,
    });
  };

  return (
    <div className="space-y-4 border border-slate-700 rounded-lg p-4 bg-slate-800/30">
      <div className="flex items-center gap-2 text-cyan-400 font-medium text-sm">
        <Calendar className="w-4 h-4" />
        Schedule Recurring Export
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-slate-300">Schedule Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Weekly Provider Export"
          className="bg-slate-800 border-slate-600 text-slate-100 h-8 text-sm"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-slate-300">Frequency</Label>
          <Select value={frequency} onValueChange={setFrequency}>
            <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-600 text-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {frequency === 'weekly' && (
          <div className="space-y-1">
            <Label className="text-xs text-slate-300">Day</Label>
            <Select value={scheduleDay} onValueChange={setScheduleDay}>
              <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-600 text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS_OF_WEEK.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {frequency === 'monthly' && (
          <div className="space-y-1">
            <Label className="text-xs text-slate-300">Day of Month</Label>
            <Select value={scheduleDay} onValueChange={setScheduleDay}>
              <SelectTrigger className="h-8 text-xs bg-slate-800 border-slate-600 text-slate-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                  <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs text-slate-300">Time</Label>
          <Input
            type="time"
            value={scheduleTime}
            onChange={(e) => setScheduleTime(e.target.value)}
            className="h-8 text-xs bg-slate-800 border-slate-600 text-slate-100"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-slate-300">Recipients</Label>
        <div className="flex gap-2">
          <Input
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="email@example.com"
            className="bg-slate-800 border-slate-600 text-slate-100 h-8 text-sm flex-1"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient())}
          />
          <Button variant="outline" size="sm" onClick={addRecipient} className="h-8 border-slate-600 text-slate-300">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
        {recipients.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {recipients.map(email => (
              <Badge key={email} variant="secondary" className="text-xs py-0.5 pl-2 pr-1 gap-1 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Mail className="w-3 h-3" />
                {email}
                <button onClick={() => removeRecipient(email)} className="hover:bg-cyan-500/20 rounded-full p-0.5">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs text-slate-300">Include AI summary in email</Label>
        <Switch checked={includeSummary} onCheckedChange={setIncludeSummary} />
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onClose} className="border-slate-600 text-slate-300">Cancel</Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!name.trim() || recipients.length === 0 || createMutation.isPending}
          className="bg-cyan-600 hover:bg-cyan-700"
        >
          <Clock className="w-3.5 h-3.5 mr-1.5" />
          {createMutation.isPending ? 'Creating...' : 'Create Schedule'}
        </Button>
      </div>
    </div>
  );
}