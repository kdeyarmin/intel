import React from 'react';
import { Check, AlertTriangle, Loader2, MinusCircle, Sparkles, User } from 'lucide-react';
import AssistantMarkdown from './AssistantMarkdown';
import ActionConfirmCard from './ActionConfirmCard';

const TOOL_FALLBACK_LABELS = {
  search_providers: 'Searching providers',
  get_provider_profile: 'Opening a provider',
  get_area_summary: 'Summarizing an area',
  get_referral_network: 'Loading a referral network',
  get_dashboard_stats: 'Reading the dashboard numbers',
  list_lead_lists: 'Listing lead lists',
  get_lead_list: 'Opening a lead list',
  propose_lead_list: 'Preparing a lead list',
};

function ToolChip({ item, live }) {
  const running = item.ok == null && live;
  // A saved tool call with no result was never run (the turn was stopped,
  // refused or cut off): don't show it as a success.
  const notRun = item.ok == null && !live;
  const label = item.label || TOOL_FALLBACK_LABELS[item.name] || item.name;
  return (
    <div className="my-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-700/60 bg-slate-800/60 px-2.5 py-1 text-[11px] text-slate-300">
      {running ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-cyan-400" aria-hidden="true" />
        : item.ok === true ? <Check className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
          : item.ok === false ? <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400" aria-hidden="true" />
            : <MinusCircle className="h-3 w-3 shrink-0 text-slate-400" aria-hidden="true" />}
      <span className="truncate">{label}{running ? '…' : ''}</span>
      {item.ok === false && <span className="sr-only">(failed)</span>}
      {notRun && <span className="sr-only">(not run)</span>}
    </div>
  );
}

const STATUS_TEXT = {
  interrupted: 'Stopped before the answer finished. This question isn’t part of the conversation the assistant remembers; ask it again if you need it.',
  refused: 'The assistant declined this request.',
  error: 'The assistant couldn’t finish this answer.',
  failed: 'The assistant couldn’t answer.',
  running: 'Still answering in another window…',
};

/** One question and its answer. `live` while it is streaming. */
export default function AssistantTurn({ turn, conversationId, live = false }) {
  const items = turn.items.filter((it) => !((it.type === 'text' || it.type === 'progress') && !it.text));
  const thinking = live && (items.length === 0 || items[items.length - 1].type === 'tool' || items[items.length - 1].type === 'progress');
  const problem = turn.status && turn.status !== 'complete' && turn.status !== 'done' && turn.status !== 'streaming';
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-end gap-2">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-cyan-900/30 border border-cyan-500/20 px-3.5 py-2 text-sm text-slate-100 whitespace-pre-wrap break-words">
          {turn.question}
        </div>
        <User className="mt-2 h-4 w-4 shrink-0 text-slate-400" aria-label="You" />
      </div>
      <div className="flex items-start gap-2">
        <Sparkles className="mt-1.5 h-4 w-4 shrink-0 text-violet-400" aria-label="Assistant" />
        <div className="min-w-0 flex-1 space-y-1">
          {items.map((item, i) => {
            if (item.type === 'text') return <AssistantMarkdown key={i}>{item.text}</AssistantMarkdown>;
            if (item.type === 'progress') return <p key={i} className="text-xs italic text-slate-400">{item.text}</p>;
            if (item.type === 'tool') return <div key={item.id}><ToolChip item={item} live={live} /></div>;
            if (item.type === 'action') return <ActionConfirmCard key={item.action.id} action={item.action} conversationId={conversationId} />;
            return null;
          })}
          {thinking && (
            <p className="flex items-center gap-1.5 text-xs text-slate-400" role="status">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Working…
            </p>
          )}
          {problem && (
            <p className={`text-xs ${turn.status === 'interrupted' || turn.status === 'running' ? 'text-slate-400' : 'text-amber-400'}`} role={turn.status === 'running' ? 'status' : undefined}>
              {turn.error && turn.status !== 'interrupted' ? turn.error : STATUS_TEXT[turn.status] || turn.error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
