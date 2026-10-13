import React, { useId, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Bell, BellOff, CheckCircle2, XCircle, Clock, Save, Settings
} from 'lucide-react';
import { toast } from 'sonner';
import { CAREMETRIC_FAVICON_URL } from '@/lib/branding';

const STORAGE_KEY = 'import_alert_settings';

const DEFAULT_SETTINGS = {
  enabled: true,
  onSuccess: true,
  onFailure: true,
  onStall: true,
  stallThresholdMinutes: 15,
  showBrowserNotifications: true,
};

export function getAlertSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export function checkAndNotify(batch, previousStatus) {
  const settings = getAlertSettings();
  if (!settings.enabled) return;

  const label = batch.import_type || 'Import';

  // Success notification
  if (settings.onSuccess && batch.status === 'completed' && previousStatus !== 'completed') {
    toast.success(`${label} completed`, {
      description: `${(batch.imported_rows || 0).toLocaleString()} rows imported successfully`,
      duration: 8000,
    });
    if (settings.showBrowserNotifications && Notification.permission === 'granted') {
      new Notification(`Import Complete: ${label}`, {
        body: `${(batch.imported_rows || 0).toLocaleString()} rows imported`,
        icon: CAREMETRIC_FAVICON_URL,
      });
    }
  }

  // Failure notification
  if (settings.onFailure && batch.status === 'failed' && previousStatus !== 'failed') {
    const errorCount = (batch.error_samples || []).length;
    toast.error(`${label} failed`, {
      description: errorCount > 0 ? `${errorCount} errors found` : 'Import failed before processing',
      duration: 12000,
    });
    if (settings.showBrowserNotifications && Notification.permission === 'granted') {
      new Notification(`Import Failed: ${label}`, {
        body: errorCount > 0 ? `${errorCount} errors found` : 'Check the error log',
        icon: CAREMETRIC_FAVICON_URL,
      });
    }
  }
}

export default function AlertNotificationSettings() {
  const uid = useId();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setSettings(getAlertSettings());
  }, []);

  const update = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setIsDirty(false);
    toast.success('Alert settings saved');
  };

  const requestBrowserPermission = async () => {
    if ('Notification' in window) {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        update('showBrowserNotifications', true);
        toast.success('Browser notifications enabled');
      } else {
        toast.error('Browser notifications denied');
      }
    }
  };

  const notifPermission = typeof Notification !== 'undefined' ? Notification.permission : 'denied';

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-slate-200">
          <Bell className="w-4 h-4 text-cyan-400" />
          Alert Notifications
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Master toggle */}
        <div className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700/30 rounded-lg">
          <div className="flex items-center gap-2">
            {settings.enabled ? <Bell className="w-4 h-4 text-cyan-400" /> : <BellOff className="w-4 h-4 text-slate-400" />}
            <div>
              <p id={`${uid}-enabled`} className="text-sm font-medium text-slate-200">Import Alerts</p>
              <p className="text-[10px] text-slate-400">Get notified about import job status changes</p>
            </div>
          </div>
          <Switch aria-labelledby={`${uid}-enabled`} checked={settings.enabled} onCheckedChange={(v) => update('enabled', v)} />
        </div>

        {settings.enabled && (
          <>
            {/* Event toggles */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400">Notify me when:</p>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span id={`${uid}-on-success`} className="text-sm text-slate-300">Import completes successfully</span>
                  </div>
                  <Switch aria-labelledby={`${uid}-on-success`} checked={settings.onSuccess} onCheckedChange={(v) => update('onSuccess', v)} />
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/30">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                    <span id={`${uid}-on-failure`} className="text-sm text-slate-300">Import fails</span>
                  </div>
                  <Switch aria-labelledby={`${uid}-on-failure`} checked={settings.onFailure} onCheckedChange={(v) => update('onFailure', v)} />
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-800/30">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span id={`${uid}-on-stall`} className="text-sm text-slate-300">Import stalls (no progress)</span>
                  </div>
                  <Switch aria-labelledby={`${uid}-on-stall`} checked={settings.onStall} onCheckedChange={(v) => update('onStall', v)} />
                </div>
              </div>
            </div>

            {/* Stall threshold */}
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-stall-threshold`} id={`${uid}-stall-threshold-label`} className="text-xs text-slate-400">Stall detection threshold (minutes)</Label>
              <Input
                id={`${uid}-stall-threshold`}
                aria-labelledby={`${uid}-stall-threshold-label`}
                type="number"
                min={5}
                max={120}
                value={settings.stallThresholdMinutes}
                onChange={(e) => update('stallThresholdMinutes', Number(e.target.value) || 15)}
                className="h-8 w-24 text-sm bg-slate-800/50 border-slate-700 text-slate-300"
              />
            </div>

            {/* Browser notifications */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400">Delivery Methods</p>
              <div className="flex items-center justify-between p-2.5 bg-slate-800/50 border border-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Bell className="w-3.5 h-3.5 text-slate-400" />
                  <div>
                    <span className="text-sm text-slate-300">In-app toast notifications</span>
                    <p className="text-[10px] text-slate-400">Always active when alerts are enabled</p>
                  </div>
                </div>
                <Badge className="bg-emerald-900/15 text-emerald-400 text-[9px]">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-800/50 border border-slate-700/30 rounded-lg">
                <div className="flex items-center gap-2">
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                  <div>
                    <span id={`${uid}-browser-push`} className="text-sm text-slate-300">Browser push notifications</span>
                    <p className="text-[10px] text-slate-400">
                      {notifPermission === 'granted' ? 'Enabled' : notifPermission === 'denied' ? 'Blocked by browser' : 'Not yet requested'}
                    </p>
                  </div>
                </div>
                {notifPermission === 'granted' ? (
                  <Switch aria-labelledby={`${uid}-browser-push`} checked={settings.showBrowserNotifications} onCheckedChange={(v) => update('showBrowserNotifications', v)} />
                ) : notifPermission !== 'denied' ? (
                  <Button size="sm" variant="outline" className="h-7 text-xs bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800" onClick={requestBrowserPermission}>
                    Enable
                  </Button>
                ) : (
                  <Badge className="bg-red-900/15 text-red-400 text-[9px]">Blocked</Badge>
                )}
              </div>
            </div>
          </>
        )}

        {/* Save */}
        {isDirty && (
          <Button onClick={handleSave} className="w-full bg-cyan-700 hover:bg-cyan-800 text-white">
            <Save className="w-4 h-4 mr-2" />
            Save Alert Settings
          </Button>
        )}
      </CardContent>
    </Card>
  );
}