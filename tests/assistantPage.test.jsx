// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const { api } = vi.hoisted(() => ({
  api: {
    status: vi.fn(),
    listConversations: vi.fn(),
    createConversation: vi.fn(),
    getConversation: vi.fn(),
    renameConversation: vi.fn(),
    deleteConversation: vi.fn(),
    confirmAction: vi.fn(),
    cancelAction: vi.fn(),
    streamMessage: vi.fn(),
  },
}));
vi.mock('@/api/base44Client', () => ({ base44: { assistant: api } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../src/components/compliance/DataSourcesFooter', () => ({ default: () => null }));
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => async () => true }));

import AIAssistantPage from '../src/pages/AIAssistant';
import AssistantMarkdown from '../src/components/assistant/AssistantMarkdown';
import { applyAssistantEvent } from '../src/hooks/useAssistantStream';

function Probe() {
  return <output data-testid="url">{useLocation().search}</output>;
}

function renderPage(path = '/AIAssistant') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path="/AIAssistant" element={<><AIAssistantPage /><Probe /></>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ACTION = {
  id: 'a1', kind: 'create_lead_list', status: 'proposed', name: 'PA cardiology', description: null, reason: 'Highest scores',
  count: 12, preview: [{ npi: '1000000001', name: 'Ann Chen, MD', specialty: 'Cardiology', city: 'Pittsburgh', state: 'PA', score: null }],
  expires_at: '2999-01-01T00:00:00.000Z', result: null,
};

const CONVERSATION = {
  conversation: { id: 5, title: 'Cardiology', updated_at: '2026-10-10T10:00:00Z' },
  running: false,
  turns: [{
    id: 9, status: 'complete', error: null, question: 'Find cardiologists',
    items: [
      { type: 'progress', text: 'Searching Pennsylvania' },
      { type: 'tool', id: 't1', name: 'propose_lead_list', label: 'Prepared the list “PA cardiology” for your approval', ok: true },
      { type: 'action', action: ACTION },
      { type: 'text', text: 'Review the **card** to create it. See [Ann Chen](/ProviderDetail?npi=1000000001).' },
    ],
  }],
};

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  Element.prototype.scrollIntoView = vi.fn();
  api.status.mockResolvedValue({ configured: true, daily_budget: 100, used_today: 0 });
  api.listConversations.mockResolvedValue({ conversations: [CONVERSATION.conversation] });
  api.getConversation.mockResolvedValue(CONVERSATION);
});

describe('AI Assistant page', () => {
  it('shows a saved conversation with progress, tool chips, the proposal card and app links', async () => {
    renderPage('/AIAssistant?c=5');
    expect(await screen.findByText('Find cardiologists')).toBeInTheDocument();
    expect(api.getConversation).toHaveBeenCalledWith(5);
    expect(screen.getByText('Searching Pennsylvania')).toBeInTheDocument();
    expect(screen.getByText('Prepared the list “PA cardiology” for your approval')).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'Proposed lead list: PA cardiology' });
    expect(within(card).getByText('Unscored', { exact: false })).toBeInTheDocument();
    expect(within(card).getByText('and 11 more')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ann Chen' })).toHaveAttribute('href', '/ProviderDetail?npi=1000000001');
  });

  it('creates the list only when the user confirms', async () => {
    api.confirmAction.mockResolvedValue({ action: { ...ACTION, status: 'confirmed', result: { list_id: 44, name: 'PA cardiology', member_count: 12 } } });
    renderPage('/AIAssistant?c=5');
    fireEvent.click(await screen.findByRole('button', { name: /Create list/ }));
    expect(api.confirmAction).toHaveBeenCalledWith('a1');
    expect(await screen.findByRole('link', { name: 'PA cardiology' })).toHaveAttribute('href', '/LeadLists?list=44');
    expect(screen.queryByRole('button', { name: /Create list/ })).not.toBeInTheDocument();
  });

  it('starts a conversation from a suggestion and streams the answer', async () => {
    api.listConversations.mockResolvedValue({ conversations: [] });
    api.createConversation.mockResolvedValue({ conversation: { id: 8 } });
    api.getConversation.mockResolvedValue({ conversation: { id: 8 }, turns: [], running: false });
    let finish;
    api.streamMessage.mockImplementation(async (id, text, { onEvent }) => {
      onEvent('turn', { turn_id: 1, conversation_id: id });
      onEvent('tool_start', { id: 't1', name: 'get_area_summary' });
      onEvent('tool_call', { id: 't1', name: 'get_area_summary', label: 'Summarized Allegheny, PA' });
      onEvent('tool_result', { id: 't1', ok: true });
      onEvent('text_start', {});
      onEvent('text', { delta: 'Allegheny has ' });
      onEvent('text', { delta: '≈4,200 providers.' });
      await new Promise((r) => { finish = r; });
      onEvent('done', { turn_id: 1, status: 'complete', error: null });
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /highest-scored cardiologists in Allegheny/ }));
    await waitFor(() => expect(api.streamMessage).toHaveBeenCalledWith(8, expect.stringMatching(/Allegheny County/), expect.any(Object)));
    await waitFor(() => expect(screen.getByTestId('url').textContent).toBe('?c=8'));
    expect(await screen.findByText('Allegheny has ≈4,200 providers.')).toBeInTheDocument();
    expect(screen.getByText('Summarized Allegheny, PA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop answering' })).toBeInTheDocument();
    finish();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument());
  });

  it('creates one conversation when a suggestion is clicked again while it is being created', async () => {
    api.listConversations.mockResolvedValue({ conversations: [] });
    let created;
    api.createConversation.mockImplementation(() => new Promise((r) => { created = () => r({ conversation: { id: 8 } }); }));
    api.getConversation.mockResolvedValue({ conversation: { id: 8 }, turns: [], running: false });
    api.streamMessage.mockImplementation(() => new Promise(() => {}));
    renderPage();
    const first = await screen.findByRole('button', { name: /highest-scored cardiologists in Allegheny/ });
    const other = screen.getByRole('button', { name: /Franklin County, OH/ });
    fireEvent.click(first);
    fireEvent.click(first);
    fireEvent.click(other);
    // The question box stays editable, but Enter doesn't start another one.
    const box = screen.getByRole('textbox', { name: 'Your question' });
    fireEvent.change(box, { target: { value: 'Another question' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(api.createConversation).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(other).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    created();
    await waitFor(() => expect(api.streamMessage).toHaveBeenCalledTimes(1));
    expect(api.streamMessage).toHaveBeenCalledWith(8, expect.stringMatching(/Allegheny County/), expect.any(Object));
    expect(api.createConversation).toHaveBeenCalledTimes(1);
  });

  it('puts a rejected question back in the box with the reason', async () => {
    api.streamMessage.mockRejectedValue(Object.assign(new Error('You’ve reached today’s assistant usage limit.'), { status: 429 }));
    renderPage('/AIAssistant?c=5');
    const box = await screen.findByRole('textbox', { name: 'Your question' });
    fireEvent.change(box, { target: { value: 'One more?' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(await screen.findByText('You’ve reached today’s assistant usage limit.')).toBeInTheDocument();
    await waitFor(() => expect(box).toHaveValue('One more?'));
  });

  it('explains when the assistant is not set up', async () => {
    api.status.mockResolvedValue({ configured: false });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/ANTHROPIC_API_KEY/);
    expect(screen.getByRole('textbox', { name: 'Your question' })).toBeDisabled();
  });
});

describe('AssistantMarkdown', () => {
  it('never loads images, shows where outside links go and drops script links', () => {
    const { container } = render(
      <MemoryRouter>
        <AssistantMarkdown>{'![x](https://evil.example/p.png?d=secret) [docs](https://www.cms.gov/data) [bad](javascript:alert(1))\n\n| a | b |\n|---|---|\n| 1 | 2 |'}</AssistantMarkdown>
      </MemoryRouter>,
    );
    expect(container.querySelector('img')).toBeNull();
    const link = screen.getByRole('link', { name: /docs/ });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    expect(link).toHaveTextContent('(www.cms.gov)');
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull();
    expect(container.querySelector('table')).not.toBeNull();
  });
});

describe('applyAssistantEvent', () => {
  const start = { items: [], status: 'streaming' };
  const run = (events) => events.reduce((d, [e, data]) => applyAssistantEvent(d, e, data), start);

  it('places a proposal card after its tool chip and drops text streamed before a retry', () => {
    const d = run([
      ['tool_start', { id: 't1', name: 'propose_lead_list' }],
      ['text_start', {}], ['text', { delta: 'partial' }],
      ['action', { tool_use_id: 't1', action: { id: 'a1' } }],
      ['retry', {}],
    ]);
    expect(d.items.map((i) => i.type)).toEqual(['tool', 'action']);
  });

  it("drops a failed attempt's unfinished tool call on retry, keeping completed ones", () => {
    const d = run([
      ['tool_start', { id: 't1', name: 'search_providers' }],
      ['tool_result', { id: 't1', ok: true }],
      ['tool_start', { id: 't2', name: 'search_providers' }],
      ['retry', {}],
    ]);
    expect(d.items.map((i) => i.id)).toEqual(['t1']);
  });

  it('records the final status', () => {
    expect(run([['done', { status: 'refused', error: 'Declined' }]])).toMatchObject({ status: 'refused', error: 'Declined' });
    expect(run([['done', { status: 'complete' }]]).status).toBe('done');
  });
});
