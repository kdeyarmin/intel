import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Calendar, Clock, Mail, Play, Pencil, Trash2, Loader2,
  CheckCircle2, XCircle
} from 'lucide-react';
import moment from 'moment';

const DATASET_LABELS = {
  cms_utilization: 'CMS Utilization',
  cms_referrals: 'CMS Referrals',
  ma_inpatient: 'MA Inpatient',
  hha_stats: 'HHA Stats',
  inpatient_drg: 'Inpatient DRG',
  part_d_stats: 'Part D',
  snf_stats: 'SNF Stats',
  providers: 'Providers',
  locations: 'Locations',
};

const FREQ_COLORS = {
  daily: 'bg-blue-100 text-blue-700',
  weekly: 'bg-purple-100 text-purple-700',
  monthly: 'bg-amber-100 text-amber-700',
};

export default function ScheduledReportsList({
  reports,
  loading,
  onEdit,
  onDelete,
  onToggleActive,
  onRunNow,
  runningId,
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  if (!reports.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Calendar className="w-10 h-10 text-slate-300 mb-2" />
          <p className="text-sm text-slate-400">No scheduled reports yet</p>
          <p className="text-xs text-slate-300">Create one to start receiving automatic reports</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map(report => (
        <Card key={report.id} className={`transition-all ${!report.is_active ? 'opacity-60' : ''}`}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-slate-800 truncate">{report.name}</h3>
                  <Badge className={`text-[10px] ${FREQ_COLORS[report.frequency] || 'bg-slate-100 text-slate-600'}`}>
                    {report.frequency}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {DATASET_LABELS[report.dataset] || report.dataset}
                  </Badge>
                </div>

                {report.description && (
                  <p className="text-xs text-slate-500 mb-2 truncate">{report.description}</p>
                )}

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {report.recipients?.length || 0} recipient{(report.recipients?.length || 0) !== 1 ? 's' : ''}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {report.schedule_time || '08:00'} ET
                    {report.frequency === 'weekly' && report.schedule_day ? ` • ${report.schedule_day}` : ''}
                    {report.frequency === 'monthly' && report.schedule_day ? ` • Day ${report.schedule_day}` : ''}
                  </span>
                  {report.last_run_at && (
                    <span className="flex items-center gap-1">
                      {report.last_run_status === 'success' ? (
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                      ) : report.last_run_status === 'failed' ? (
                        <XCircle className="w-3 h-3 text-red-500" />
                      ) : null}
                      Last run: {moment(report.last_run_at).fromNow()}
                    </span>
                  )}
                </div>

                {report.last_run_summary && (
                  <p className="text-[11px] text-slate-400 mt-1 truncate">{report.last_run_summary}</p>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <Switch
                  checked={report.is_active}
                  onCheckedChange={() => onToggleActive(report)}
                  className="scale-75"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onRunNow(report)}
                  disabled={runningId === report.id}
                  title="Run now"
                >
                  {runningId === report.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5 text-green-600" />
                  )}
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(report)} title="Edit">
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(report)} title="Delete">
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}