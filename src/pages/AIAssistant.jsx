import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { useUrlState } from '@/hooks/useUrlState';
import { useAssistantStream } from '@/hooks/useAssistantStream';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Send, Square, AlertTriangle, MessagesSquare } from 'lucide-react';
import AssistantTurn from '../components/assistant/AssistantTurn';
import ConversationList from '../components/assistant/ConversationList';
import DataSourcesFooter from '../components/compliance/DataSourcesFooter';

const MAX_CHARS = 8000;
// ?c=<id> is the open conversation, so a conversation can be linked to.
const URL_DEFAULTS = { c: '' };

const STARTERS = [
  'Who are the highest-scored cardiologists in Allegheny County, PA?',
  'Summarize the provider landscape in Franklin County, OH.',
  'Which providers in Pennsylvania receive the most shared Medicare patients?',
  'What do my lead lists look like right now?',
];

function EmptyState({ onPick, disabled }) {
  return (
    <div className="mx-auto max-w-xl py-8 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-violet-900/30">
        <Sparkles className="h-5 w-5 text-violet-400" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold text-white">Ask about providers, places and your lead lists</h2>
      <p className="mt-1 text-sm text-slate-400">
        The assistant looks things up in the app’s data and says when a figure is an estimate or a sample.
        It can propose a lead list; nothing is created until you confirm it.
      </p>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {STARTERS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="rounded-lg border border-slate-700 bg-slate-800/40 px-3 py-2 text-left text-xs text-slate-300 hover:border-violet-500/40 hover:bg-slate-800 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AIAssistantPage() {
  const [url, setUrl] = useUrlState(URL_DEFAULTS);
  const selectedId = /^\d+$/.test(url.c) ? Number(url.c) : null;
  const [input, setInput] = useState('');
  const [showList, setShowList] = useState(false);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const scrollRef = useRef(null);
  const pinnedRef = useRef(true);

  const status = useQuery({ queryKey: ['assistantStatus'], queryFn: () => base44.assistant.status(), staleTime: 60000 });
  const conversations = useQuery({ queryKey: ['assistantConversations'], queryFn: () => base44.assistant.listConversations() });
  const conversation = useQuery({
    queryKey: ['assistantConversation', selectedId],
    queryFn: () => base44.assistant.getConversation(selectedId),
    enabled: selectedId != null,
    refetchOnWindowFocus: false,
    refetchInterval: (q) => (q.state.data?.running ? 3000 : false),
  });

  const onSettled = useCallback(async (conversationId, { turnId, failedText }) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['assistantConversation', conversationId] }),
      queryClient.invalidateQueries({ queryKey: ['assistantConversations'] }),
      queryClient.invalidateQueries({ queryKey: ['assistantStatus'] }),
    ]);
    // A question the server never accepted goes back in the box to retry.
    if (turnId == null && failedText) setInput((cur) => cur || failedText);
  }, [queryClient]);
  const { draft, send, stop, clear, streaming } = useAssistantStream({ onSettled });

  const serverTurns = conversation.data?.turns || [];
  const draftHere = draft && draft.conversationId === selectedId ? draft : null;
  const turns = useMemo(() => {
    if (!draftHere) return serverTurns.map((t) => ({ turn: t, live: false }));
    const saved = draftHere.turnId != null && serverTurns.some((t) => t.id === draftHere.turnId);
    if (saved && !streaming) return serverTurns.map((t) => ({ turn: t, live: false }));
    return [
      ...serverTurns.filter((t) => t.id !== draftHere.turnId).map((t) => ({ turn: t, live: false })),
      { turn: { ...draftHere, id: draftHere.turnId ?? 'draft' }, live: draftHere.status === 'streaming' },
    ];
  }, [serverTurns, draftHere, streaming]);

  // Drop the draft once the saved turn has loaded.
  useEffect(() => {
    if (draft && !streaming && draft.turnId != null && serverTurns.some((t) => t.id === draft.turnId)) clear();
  }, [draft, streaming, serverTurns, clear]);

  // Follow the answer as it streams, unless the user has scrolled up to read.
  const lastItem = draftHere?.items[draftHere.items.length - 1];
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [turns.length, draftHere?.items.length, lastItem?.text, selectedId]);
  useEffect(() => {
    pinnedRef.current = true;
  }, [selectedId]);

  const configured = status.data?.configured !== false;
  const ask = async (text) => {
    const question = text.trim();
    if (!question || streaming || !configured) return;
    if (question.length > MAX_CHARS) {
      toast.error(`Questions can be up to ${MAX_CHARS.toLocaleString()} characters.`);
      return;
    }
    let id = selectedId;
    if (id == null) {
      try {
        const res = await base44.assistant.createConversation();
        id = res.conversation.id;
        queryClient.invalidateQueries({ queryKey: ['assistantConversations'] });
        setUrl({ c: String(id) });
      } catch (e) {
        toast.error(e?.message || 'Couldn’t start a conversation.');
        return;
      }
    }
    setInput('');
    send(id, question);
  };

  const remove = async (c) => {
    const ok = await confirm({
      title: 'Delete this conversation?',
      description: `“${c.title || 'New conversation'}” and its answers will be removed. Lead lists you created from it stay.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await base44.assistant.deleteConversation(c.id);
      if (c.id === selectedId) setUrl({ c: '' });
      queryClient.invalidateQueries({ queryKey: ['assistantConversations'] });
    } catch (e) {
      toast.error(e?.message || 'Couldn’t delete the conversation.');
    }
  };

  const rename = async (id, title) => {
    try {
      await base44.assistant.renameConversation(id, title);
      queryClient.invalidateQueries({ queryKey: ['assistantConversations'] });
    } catch (e) {
      toast.error(e?.message || 'Couldn’t rename the conversation.');
    }
  };

  const list = (
    <ConversationList
      conversations={conversations.data?.conversations || []}
      loading={conversations.isLoading}
      selectedId={selectedId}
      onSelect={(id) => { setUrl({ c: String(id) }); setShowList(false); }}
      onNew={() => { setUrl({ c: '' }); setShowList(false); }}
      onRename={rename}
      onDelete={remove}
    />
  );

  const usedShare = status.data?.daily_budget ? status.data.used_today / status.data.daily_budget : 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">AI Assistant</h1>
          <p className="text-sm text-slate-300 mt-0.5">Answers from the app’s provider, Medicare and lead-list data</p>
        </div>
        <Button variant="outline" size="sm" className="lg:hidden border-slate-700 bg-transparent text-slate-300" onClick={() => setShowList((v) => !v)} aria-expanded={showList}>
          <MessagesSquare className="mr-1.5 h-4 w-4" aria-hidden="true" /> Conversations
        </Button>
      </div>

      {!configured && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-900/20 p-3 text-sm text-amber-300" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          The AI Assistant isn’t set up on this server yet. An admin needs to add an ANTHROPIC_API_KEY to the server’s environment.
        </div>
      )}

      {showList && <div className="mb-4 max-h-72 rounded-lg border border-slate-700/60 bg-slate-900/60 p-2 lg:hidden">{list}</div>}

      {/* Fixed height so the question box stays in view; the conversation scrolls inside. */}
      <div className="flex h-[calc(100dvh-12rem)] min-h-[440px] gap-4">
        <aside className="hidden w-64 shrink-0 rounded-lg border border-slate-700/60 bg-slate-900/40 p-2 lg:block">{list}</aside>

        <section aria-label="Conversation" className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-slate-700/60 bg-slate-900/40">
          <div
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            className="min-h-0 flex-1 space-y-6 overflow-y-auto p-3 sm:p-5"
            aria-live="polite"
            aria-busy={streaming}
          >
            {selectedId != null && conversation.isLoading && <Skeleton className="h-24 w-full" />}
            {selectedId != null && conversation.isError && (
              <p className="text-sm text-red-400" role="alert">Couldn’t load this conversation: {conversation.error?.message}</p>
            )}
            {(selectedId == null || (conversation.isSuccess && turns.length === 0)) && !draftHere && (
              <EmptyState onPick={ask} disabled={!configured || streaming} />
            )}
            {turns.map(({ turn, live }) => (
              <AssistantTurn key={turn.id} turn={turn} live={live} conversationId={selectedId} />
            ))}
          </div>

          <form
            className="border-t border-slate-700/60 p-3"
            onSubmit={(e) => { e.preventDefault(); ask(input); }}
          >
            <div className="flex items-end gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    ask(input);
                  }
                }}
                placeholder={configured ? 'Ask about a provider, a county, a referral network or a lead list…' : 'The assistant isn’t set up yet'}
                aria-label="Your question"
                disabled={!configured}
                rows={2}
                className="min-h-[44px] max-h-40 flex-1 resize-y bg-slate-900 border-slate-700 text-sm text-slate-100"
              />
              {streaming ? (
                <Button type="button" onClick={stop} variant="outline" className="border-slate-600 bg-transparent text-slate-200" aria-label="Stop answering">
                  <Square className="h-4 w-4" aria-hidden="true" />
                </Button>
              ) : (
                <Button type="submit" disabled={!input.trim() || !configured} className="bg-violet-600 hover:bg-violet-500 text-white" aria-label="Send">
                  <Send className="h-4 w-4" aria-hidden="true" />
                </Button>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[11px] text-slate-400">
              <span>Enter to send, Shift+Enter for a new line. Answers can be wrong; check figures on the linked pages.</span>
              {input.length > MAX_CHARS * 0.8 && <span>{input.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}</span>}
              {usedShare >= 0.5 && <span>{Math.min(100, Math.round(usedShare * 100))}% of today’s assistant limit used</span>}
            </div>
          </form>
        </section>
      </div>

      <div className="mt-4">
        <DataSourcesFooter />
      </div>
    </div>
  );
}
