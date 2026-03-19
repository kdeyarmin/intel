import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDateTimeET } from '../utils/dateUtils';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export default function ScanHistoryPanel({ scans = [] }) {
  if (scans.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Scan History</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400 text-center py-4">No scans have been run yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Scan History</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-80 overflow-auto">
          {scans.map(scan => (
            <div key={scan.id} className="flex items-start gap-3 p-3 border rounded-lg bg-slate-800/30">
              {scan.status === 'completed' ? (
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              ) : scan.status === 'running' ? (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin mt-0.5 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-slate-700">
                    {scan.completed_at ? formatDateTimeET(scan.completed_at) : 'Running...'}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">{scan.status}</Badge>
                </div>
                {scan.scores && (
                  <div className="flex gap-3 text-[10px] text-slate-500">
                    <span>Overall: <strong className="text-slate-700">{scan.scores.overall}%</strong></span>
                    <span>Alerts: <strong className="text-slate-700">{scan.alerts_generated || 0}</strong></span>
                    <span>Records: <strong className="text-slate-700">{(scan.total_records_scanned || 0).toLocaleString()}</strong></span>
                  </div>
                )}
                {scan.summary && (
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{scan.summary}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}