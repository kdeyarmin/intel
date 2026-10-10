// @vitest-environment jsdom
/**
 * Regression tests for render-time crashes that took down the whole app via
 * the top-level ErrorBoundary:
 *  - CampaignBuilder's Template step rendered `{{merge_fields}}` as JSX code.
 *  - ProviderLocationMatching read `filtered` before its declaration (TDZ).
 *  - react-markdown v10 throws when given a `className` prop (ImportAgentChat,
 *    DQAssistant).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

afterEach(cleanup);

const invoke = vi.fn();

vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: new Proxy({}, {
      get: () => ({
        list: vi.fn(() => Promise.resolve([])),
        filter: vi.fn(() => Promise.resolve([])),
        update: vi.fn(() => Promise.resolve({})),
      }),
    }),
    functions: { invoke: (...args) => invoke(...args) },
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({ data: [], isLoading: false })),
  useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

import CampaignBuilder from '../src/components/outreach/CampaignBuilder';
import ProviderLocationMatching from '../src/pages/ProviderLocationMatching';
import ImportAgentChat from '../src/components/imports/ImportAgentChat';
import DQAssistant from '../src/components/dataQuality/DQAssistant';

describe('CampaignBuilder', () => {
  it('renders the Template step with merge-field hints as text', async () => {
    render(<CampaignBuilder onCampaignCreated={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Next: Create Template/i }));
    expect(await screen.findByText(/Use \{\{merge_fields\}\} for personalization/)).toBeInTheDocument();
    expect(screen.getByText(/\{\{provider_name\}\}, \{\{first_name\}\}/)).toBeInTheDocument();
  });
});

describe('ProviderLocationMatching', () => {
  it('mounts without a ReferenceError', () => {
    render(<ProviderLocationMatching />);
    expect(screen.getAllByText(/Match/i).length).toBeGreaterThan(0);
  });
});

describe('markdown chat replies', () => {
  it('ImportAgentChat renders an assistant reply as markdown', async () => {
    invoke.mockResolvedValueOnce({ data: { reply: 'All **3** imports are healthy.' } });
    render(<ImportAgentChat />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'status?' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    const sendButtons = screen.getAllByRole('button');
    fireEvent.click(sendButtons[sendButtons.length - 1]);
    await waitFor(() => expect(screen.getByText('3').tagName).toBe('STRONG'));
  });

  it('DQAssistant renders an assistant reply as markdown', async () => {
    invoke.mockResolvedValue({ data: { success: true, response: { answer: 'Fix **emails** first.' } } });
    render(<DQAssistant />);
    fireEvent.click(screen.getByRole('button', { name: /What needs fixing\?/i }));
    await waitFor(() => expect(screen.getByText('emails').tagName).toBe('STRONG'));
  });
});
