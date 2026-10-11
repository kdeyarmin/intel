import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { ListPlus, Check, X, Clock, Loader2 } from 'lucide-react';

const STATUS_NOTE = {
  cancelled: { icon: X, text: 'Cancelled. The list was not created.', className: 'text-slate-400' },
  expired: { icon: Clock, text: 'This proposal expired. Ask the assistant to propose the list again.', className: 'text-amber-400' },
};

/**
 * A lead list the assistant proposed. Nothing is created until the user
 * presses Create list; the server makes each proposal single-use.
 */
export default function ActionConfirmCard({ action: initial, conversationId }) {
  const [action, setAction] = useState(initial);
  // The conversation refetches with the server's latest state (confirmed,
  // cancelled or expired, maybe in another tab); adopt it when it changes.
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setAction(initial);
  }
  const [pending, setPending] = useState(null);
  const queryClient = useQueryClient();
  const count = Number(action.count) || 0;
  const preview = Array.isArray(action.preview) ? action.preview : [];
  const more = Math.max(0, count - preview.length);

  const decide = async (kind) => {
    setPending(kind);
    try {
      const res = kind === 'confirm' ? await base44.assistant.confirmAction(action.id) : await base44.assistant.cancelAction(action.id);
      setAction(res.action);
      if (kind === 'confirm') {
        toast.success(`Created “${res.action.result?.name || action.name}” with ${(res.action.result?.member_count ?? count).toLocaleString()} providers`);
        queryClient.invalidateQueries({ queryKey: ['leadLists'] });
      }
      queryClient.invalidateQueries({ queryKey: ['assistantConversation', conversationId] });
    } catch (e) {
      if (e?.data?.action) setAction(e.data.action);
      toast.error(e?.message || 'That didn’t work. Try again.');
    } finally {
      setPending(null);
    }
  };

  const note = STATUS_NOTE[action.status];
  return (
    <section aria-label={`Proposed lead list: ${action.name}`} className="my-2 rounded-lg border border-violet-500/30 bg-violet-900/10 p-3 sm:p-4">
      <div className="flex items-start gap-2">
        <ListPlus className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-violet-400">Proposed lead list</p>
          <p className="font-semibold text-white break-words">{action.name}</p>
          <p className="text-xs text-slate-400">{count.toLocaleString()} providers{action.reason ? ` · ${action.reason}` : ''}</p>
          {action.description && <p className="mt-1 text-xs text-slate-300">{action.description}</p>}
        </div>
      </div>

      {preview.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-700/50 rounded-md border border-slate-700/50 text-xs">
          {preview.map((p) => (
            <li key={p.npi} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-2 py-1.5">
              <Link to={`/ProviderDetail?npi=${p.npi}`} className="min-w-0 truncate text-cyan-400 hover:text-cyan-300">{p.name}</Link>
              <span className="text-slate-400">
                {[p.specialty, [p.city, p.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                {' · '}
                {p.score == null ? 'Unscored' : `Score ${p.score}`}
              </span>
            </li>
          ))}
          {more > 0 && <li className="px-2 py-1.5 text-slate-400">and {more.toLocaleString()} more</li>}
        </ul>
      )}

      <div className="mt-3">
        {action.status === 'proposed' && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => decide('confirm')} disabled={pending != null} className="bg-violet-600 hover:bg-violet-500 text-white">
              {pending === 'confirm' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />}
              Create list
            </Button>
            <Button size="sm" variant="outline" onClick={() => decide('cancel')} disabled={pending != null} className="border-slate-600 bg-transparent text-slate-300 hover:bg-slate-800">
              Cancel
            </Button>
          </div>
        )}
        {action.status === 'confirmed' && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-400">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Created
            {action.result?.list_id ? (
              <Link to={`/LeadLists?list=${action.result.list_id}`} className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2">
                {action.result.name}
              </Link>
            ) : ` ${action.name}`}
            {action.result?.member_count != null && ` with ${action.result.member_count.toLocaleString()} providers`}
          </p>
        )}
        {note && (
          <p className={`flex items-center gap-1.5 text-xs ${note.className}`}>
            <note.icon className="h-3.5 w-3.5" aria-hidden="true" /> {note.text}
          </p>
        )}
      </div>
    </section>
  );
}
