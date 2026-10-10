import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

/**
 * Folds one streamed event into the in-progress turn. Items match what the
 * server renders for saved turns: text, progress notes, tool chips and
 * proposal cards.
 */
export function applyAssistantEvent(draft, event, data) {
  if (!draft) return draft;
  const items = [...draft.items];
  const last = items[items.length - 1];
  switch (event) {
    case 'turn':
      return { ...draft, turnId: data.turn_id };
    case 'text_start':
      return { ...draft, items: [...items, { type: 'text', text: '' }] };
    case 'text':
      if (last?.type === 'text') items[items.length - 1] = { ...last, text: last.text + data.delta };
      else items.push({ type: 'text', text: data.delta });
      return { ...draft, items };
    case 'progress_start':
      return { ...draft, items: [...items, { type: 'progress', text: '' }] };
    case 'progress':
      if (last?.type === 'progress') items[items.length - 1] = { ...last, text: last.text + data.delta };
      else items.push({ type: 'progress', text: data.delta });
      return { ...draft, items };
    case 'tool_start':
      return { ...draft, items: [...items, { type: 'tool', id: data.id, name: data.name, label: null, ok: null }] };
    case 'tool_call':
    case 'tool_result':
      return {
        ...draft,
        items: items.map((it) => (it.type === 'tool' && it.id === data.id
          ? { ...it, ...(event === 'tool_call' ? { label: data.label } : { ok: data.ok }) }
          : it)),
      };
    case 'action': {
      const at = items.findIndex((it) => it.type === 'tool' && it.id === data.tool_use_id);
      const card = { type: 'action', action: data.action };
      if (at === -1) items.push(card);
      else items.splice(at + 1, 0, card);
      return { ...draft, items };
    }
    case 'retry': {
      // The server re-asks the model; drop what it streamed since the last tool.
      let cut = items.length;
      while (cut > 0 && (items[cut - 1].type === 'text' || items[cut - 1].type === 'progress')) cut -= 1;
      return { ...draft, items: items.slice(0, cut) };
    }
    case 'done':
      return { ...draft, status: data.status === 'complete' ? 'done' : data.status, error: data.error || null };
    default:
      return draft;
  }
}

/**
 * Sends a question and keeps the streamed answer as a draft turn until the
 * saved conversation catches up. `onSettled(conversationId, { turnId, failedText })`
 * runs when the stream ends, however it ends; `turnId` is null when the server
 * never started the turn, and `failedText` is the question when it failed.
 */
export function useAssistantStream({ onSettled } = {}) {
  const [draft, setDraft] = useState(null);
  const controllerRef = useRef(null);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  useEffect(() => () => controllerRef.current?.abort(), []);

  const send = useCallback(async (conversationId, text) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    let turnId = null;
    let failed = false;
    setDraft({ conversationId, question: text, items: [], status: 'streaming', error: null, turnId: null });
    try {
      await base44.assistant.streamMessage(conversationId, text, {
        signal: controller.signal,
        onEvent: (event, data) => {
          if (event === 'turn') turnId = data.turn_id;
          setDraft((d) => applyAssistantEvent(d, event, data));
        },
      });
      setDraft((d) => (d && d.status === 'streaming' ? { ...d, status: 'interrupted', error: 'The connection closed before the answer finished.' } : d));
    } catch (e) {
      if (e?.name === 'AbortError') {
        setDraft((d) => (d ? { ...d, status: 'interrupted', error: null } : d));
      } else {
        failed = true;
        setDraft((d) => (d ? { ...d, status: 'failed', error: e?.message || 'The assistant could not answer.' } : d));
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      await settledRef.current?.(conversationId, { turnId, failedText: failed ? text : null });
    }
  }, []);

  const stop = useCallback(() => controllerRef.current?.abort(), []);
  const clear = useCallback(() => setDraft(null), []);

  return { draft, send, stop, clear, streaming: draft?.status === 'streaming' };
}
