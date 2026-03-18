import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarClock, Play, Pause, Save, Clock, Zap } from 'lucide-react';
import { toast } from 'sonner';

const STORAGE_KEY = 'email_search_schedule';

const DEFAULT_SCHEDULE = {
  enabled: false,
  frequency: 'daily',
  batchSize: 10,
  skipSearched: true,
  maxProvidersPerRun: 100,
  preferredTime: '02:00',
  lastRun: null,
  lastRunResult: null,
};

export function getEmailSearchSchedule() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_SCHEDULE, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_SCHEDULE;
}

export default function EmailSearchScheduler({ stats, onTriggerRun }) {
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setSchedule(getEmailSearchSchedule());
  }, []);

  const update = (key, value) => {
    setSchedule(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
    setIsDirty(false);
    toast.success('Email search schedule saved');
  };

  const handleToggle = () => {
    const next = { ...schedule, enabled: !schedule.enabled };
    setSchedule(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setIsDirty(false);
    toast.success(next.enabled ? 'Automated search enabled' : 'Automated search paused');
  };

  const estimatedRuns = stats?.remaining > 0 && schedule.maxProvidersPerRun > 0
    ? Math.ceil(stats.remaining / schedule.maxProvidersPerRun)
    : 0;

  const frequencyLabel = {
    hourly: 'Every hour',
    daily: 'Every day',
    twice_daily: 'Twice a day',
    weekly: 'Every week',
  }[schedule.frequency] || schedule.frequency;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-slate-200">
            <CalendarClock className="w-4 h-4 text-violet-400" />
            Automated Search Schedule
          </CardTitle>
          <Button
            variant={schedule.enabled ? "destructive" : "default"}
            size="sm"
            className={schedule.enabled
              ? "h-7 text-xs"
              : "h-7 text-xs bg-violet-600 hover:bg-violet-700"
            }
            onClick={handleToggle}
          >
            {schedule.enabled
              ? <><Pause className="w-3 h-3 mr-1" /> Pause</>
              : <><Play className="w-3 h-3 mr-1" /> Enable</>
            }
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status banner */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
          schedule.enabled
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            : 'bg-slate-800/50 border-slate-700/50 text-slate-400'
        }`}>
          <div className={`w-2 h-2 rounded-full ${schedule.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          {schedule.enabled
            ? `Active — runs ${frequencyLabel.toLowerCase()} at ${schedule.preferredTime}`
            : 'Paused — enable to start automated searches'
          }
          {schedule.lastRun && (
            <span className="ml-auto text-slate-500">
              Last: {new Date(schedule.lastRun).toLocaleDateString()}
            </span>
          )}
        </div>

        {/* Config */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Frequency</Label>
            <Select value={schedule.frequency} onValueChange={(v) => update('frequency', v)}>
              <SelectTrigger className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Every Hour</SelectItem>
                <SelectItem value="twice_daily">Twice Daily</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Preferred Time</Label>
            <Input
              type="time"
              value={schedule.preferredTime}
              onChange={(e) => update('preferredTime', e.target.value)}
              className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Batch Size</Label>
            <Input
              type="number" min={1} max={500}
              value={schedule.batchSize}
              onChange={(e) => update('batchSize', Math.min(500, parseInt(e.target.value) || 10))}
              className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-400">Max Providers / Run</Label>
            <Input
              type="number" min={1} max={5000}
              value={schedule.maxProvidersPerRun}
              onChange={(e) => update('maxProvidersPerRun', Math.min(5000, parseInt(e.target.value) || 100))}
              className="h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300"
            />
          </div>
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <Label className="text-sm text-slate-300">Skip Already Searched</Label>
            <p className="text-[10px] text-slate-400">Only search providers without prior email lookups</p>
          </div>
          <Switch checked={schedule.skipSearched} onCheckedChange={(v) => update('skipSearched', v)} />
        </div>

        {/* Estimate */}
        {stats?.remaining > 0 && (
          <div className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-3 text-xs text-slate-400">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3 h-3 text-cyan-400" />
              <span className="text-slate-300 font-medium">Estimated Completion</span>
            </div>
            <p>
              {stats.remaining.toLocaleString()} providers remaining at {schedule.maxProvidersPerRun}/run
              → ~{estimatedRuns} {schedule.frequency === 'hourly' ? 'hours' : schedule.frequency === 'daily' ? 'days' : schedule.frequency === 'twice_daily' ? `runs (~${Math.ceil(estimatedRuns / 2)} days)` : 'weeks'} to complete
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {isDirty && (
            <Button onClick={handleSave} className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white" size="sm">
              <Save className="w-3.5 h-3.5 mr-1.5" /> Save Schedule
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-violet-400"
            onClick={onTriggerRun}
          >
            <Zap className="w-3.5 h-3.5 mr-1.5" /> Run Now
          </Button>
        </div>

        {/* Last run result */}
        {schedule.lastRunResult && (
          <div className="text-[10px] text-slate-500 border-t border-slate-700/50 pt-2">
            Last result: Searched {schedule.lastRunResult.searched}, found {schedule.lastRunResult.found} emails
          </div>
        )}
      </CardContent>
    </Card>
  );
}