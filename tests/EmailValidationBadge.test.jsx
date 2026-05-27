// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import EmailValidationBadge from '@/components/emailBot/EmailValidationBadge';

// Reset the rendered DOM between tests (RTL doesn't auto-clean without globals).
afterEach(cleanup);

describe('EmailValidationBadge', () => {
  it('shows the validation status label', () => {
    render(<EmailValidationBadge status="valid" />);
    expect(screen.getByText('Valid')).toBeInTheDocument();
  });

  it('marks AI-inferred emails with an "AI" (unverified) badge alongside status', () => {
    render(<EmailValidationBadge status="risky" source="ai_inferred" />);
    expect(screen.getByText('Risky')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
  });

  it('treats the legacy ai_search source as AI too', () => {
    render(<EmailValidationBadge status="valid" source="ai_search" />);
    expect(screen.getByText('AI')).toBeInTheDocument();
  });

  it('does NOT show the AI marker for sourced (non-AI) emails', () => {
    render(<EmailValidationBadge status="valid" source="nppes" />);
    expect(screen.queryByText('AI')).toBeNull();
  });

  it('falls back to "Unknown" when status is missing', () => {
    render(<EmailValidationBadge />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});
