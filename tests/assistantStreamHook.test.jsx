// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { streamMessage } = vi.hoisted(() => ({ streamMessage: vi.fn() }));
vi.mock('@/api/base44Client', () => ({ base44: { assistant: { streamMessage: (...a) => streamMessage(...a) } } }));

import { useAssistantStream } from '../src/hooks/useAssistantStream';
import AssistantTurn from '../src/components/assistant/AssistantTurn';
import ActionConfirmCard from '../src/components/assistant/ActionConfirmCard';

const abortError = () => Object.assign(new Error('aborted'), { name: 'AbortError' });

describe('useAssistantStream', () => {
  it("doesn't let a replaced request touch the new draft or settle", async () => {
    const onSettled = vi.fn();
    let second;
    // The first request emits a late event and then fails with its abort.
    streamMessage.mockImplementationOnce((_c, _t, { signal, onEvent }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => { onEvent('text', { delta: 'old' }); reject(abortError()); });
    }));
    streamMessage.mockImplementationOnce((_c, _t, { onEvent }) => new Promise((resolve) => { second = { onEvent, resolve }; }));
    const { result } = renderHook(() => useAssistantStream({ onSettled }));
    let first;
    act(() => { first = result.current.send(1, 'first'); });
    let next;
    act(() => { next = result.current.send(1, 'second'); });
    await act(async () => { await first; });
    expect(result.current.draft).toMatchObject({ question: 'second', status: 'streaming', items: [] });
    expect(onSettled).not.toHaveBeenCalled();

    await act(async () => {
      second.onEvent('text', { delta: 'new' });
      second.onEvent('done', { status: 'complete' });
      second.resolve();
      await next;
    });
    expect(result.current.draft.items).toEqual([{ type: 'text', text: 'new' }]);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});

describe('AssistantTurn', () => {
  it("doesn't show a saved tool call that never ran as a success", () => {
    render(
      <MemoryRouter>
        <AssistantTurn turn={{ question: 'q', status: 'refused', items: [{ type: 'tool', id: 't', name: 'search_providers', label: 'Searched', ok: null }] }} />
      </MemoryRouter>,
    );
    expect(screen.getByText('(not run)')).toBeInTheDocument();
  });
});

describe('ActionConfirmCard', () => {
  it("follows the server's state when the conversation refetches", () => {
    const client = new QueryClient();
    const card = (action) => (
      <QueryClientProvider client={client}>
        <MemoryRouter><ActionConfirmCard action={action} conversationId={1} /></MemoryRouter>
      </QueryClientProvider>
    );
    const base = { id: 'a1', name: 'PA cardiology', count: 2, preview: [], expires_at: '2999-01-01' };
    const view = render(card({ ...base, status: 'proposed' }));
    expect(screen.getByRole('button', { name: /Create list/ })).toBeInTheDocument();
    view.rerender(card({ ...base, status: 'cancelled' }));
    expect(screen.queryByRole('button', { name: /Create list/ })).toBeNull();
    expect(screen.getByText(/Cancelled/)).toBeInTheDocument();
  });
});
