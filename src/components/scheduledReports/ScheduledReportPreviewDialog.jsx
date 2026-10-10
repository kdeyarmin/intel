import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { invokeOrThrow } from '@/api/functionResult';
import QueryErrorState from '../shared/QueryErrorState';

const fmt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v ?? '');
};

/** Shows what a scheduled report would email right now, without sending it. */
export default function ScheduledReportPreviewDialog({ report, onClose }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['scheduledReportPreview', report?.id],
    queryFn: () => invokeOrThrow('generateScheduledReport', { action: 'preview', report_id: report.id }),
    enabled: !!report,
    staleTime: 0,
    gcTime: 0,
  });
  const p = data?.preview;

  return (
    <Dialog open={!!report} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100">{p?.subject || report?.name}</DialogTitle>
          <DialogDescription className="text-slate-400">Preview only: nothing is sent.</DialogDescription>
        </DialogHeader>
        {isLoading && <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" />Building the report…</p>}
        {isError && <QueryErrorState title="Couldn't build the report" error={error} onRetry={refetch} />}
        {p && (
          <div className="space-y-3 text-sm">
            {p.summary && <p className="text-slate-300">{p.summary}</p>}
            {p.rows.length === 0 ? (
              <p className="text-slate-400">No records match this report's filters.</p>
            ) : (
              <div className="max-h-80 overflow-auto rounded border border-slate-700">
                <table className="w-full text-left">
                  <thead className="bg-slate-800 text-xs text-slate-400">
                    <tr>
                      <th className="px-3 py-2">{p.group_label}</th>
                      {p.metrics.map(m => <th key={m.key} className="px-3 py-2 text-right">{m.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {p.rows.map(r => (
                      <tr key={r.group} className="border-t border-slate-800 text-slate-200">
                        <td className="px-3 py-1.5">{r.group}</td>
                        {p.metrics.map(m => <td key={m.key} className="px-3 py-1.5 text-right">{fmt(r[m.key])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-slate-500">
              Based on the latest {fmt(p.source_row_count)} records.
              {' '}Goes to: {p.recipients.length ? p.recipients.join(', ') : 'nobody yet'}
              {p.blocked_recipients.length > 0 && ` · Won't send to ${p.blocked_recipients.join(', ')} (reports go only to active app users)`}
              {' '}· Next run {new Date(p.next_run_at).toLocaleString()}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
