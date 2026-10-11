// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

afterEach(cleanup);

const { invokeOrThrow } = vi.hoisted(() => ({ invokeOrThrow: vi.fn() }));
vi.mock('@/api/functionResult', () => ({ invokeOrThrow, toastFunctionError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import AIPredictiveOutreachCard from '../src/components/outreach/AIPredictiveOutreachCard';

const A = { npi: '1111111111', ai_outreach_score: 20, ai_outreach_strategy: 'Stored strategy for A' };
const B = { npi: '2222222222', ai_outreach_score: 64, ai_outreach_strategy: 'Stored strategy for B' };

describe('AIPredictiveOutreachCard', () => {
  it("doesn't carry one provider's new score over to the next provider", async () => {
    invokeOrThrow.mockResolvedValueOnce({ success: true, npi: A.npi, score: 91, strategy: 'Fresh strategy for A', factors: [] });
    const { rerender } = render(<AIPredictiveOutreachCard provider={A} />);
    fireEvent.click(screen.getByRole('button', { name: /Recalculate/ }));
    expect(await screen.findByText('91')).toBeInTheDocument();

    rerender(<AIPredictiveOutreachCard provider={B} />);
    expect(screen.getByText('64')).toBeInTheDocument();
    expect(screen.getByText('Stored strategy for B')).toBeInTheDocument();
    expect(screen.queryByText('91')).not.toBeInTheDocument();
  });

  it('ignores a response that arrives after switching to another provider', async () => {
    let resolve;
    invokeOrThrow.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const { rerender } = render(<AIPredictiveOutreachCard provider={A} />);
    fireEvent.click(screen.getByRole('button', { name: /Recalculate/ }));
    rerender(<AIPredictiveOutreachCard provider={B} />);
    await act(async () => {
      resolve({ success: true, npi: A.npi, score: 91, strategy: 'Fresh strategy for A', factors: [] });
    });
    expect(screen.getByText('64')).toBeInTheDocument();
    expect(screen.queryByText('Fresh strategy for A')).not.toBeInTheDocument();
  });
});
