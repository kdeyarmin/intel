// @vitest-environment jsdom
/**
 * The email panels count an address as checked only once a DNS check of it
 * ran (email_analyzed_at), the same marker bulkVerifyEmails' modes select on.
 * The AI email search writes a guessed status without one; those addresses
 * used to count as verified, so "Unverified" showed 0 while the check still
 * had them to do.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);

vi.mock('@/api/functionResult', () => ({ invokeOrThrow: vi.fn(), toastFunctionError: vi.fn() }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), info: vi.fn(), error: vi.fn() }) }));

import EmailVerificationPanel from '../src/components/emailBot/EmailVerificationPanel';
import ProblematicEmailsPanel from '../src/components/emailBot/ProblematicEmailsPanel';
import { checkedEmailStatus, emailCheckStats } from '../src/components/emailBot/emailCheck';

const at = '2026-10-10T12:00:00Z';
const p = (id, fields) => ({ id, npi: String(1000000000 + id), entity_type: 'Individual', first_name: `Doc${id}`, last_name: 'X', ...fields });
const providers = [
  p(1, { email: 'ai.valid@clinic.org', email_validation_status: 'valid', email_source: 'ai' }),
  p(2, { email: 'ai.risky@clinic.org', email_validation_status: 'risky', email_source: 'ai' }),
  p(3, { email: 'dns.risky@clinic.org', email_validation_status: 'risky', email_analyzed_at: at }),
  p(4, { email: 'dns.valid@clinic.org', email_validation_status: 'valid', email_analyzed_at: at }),
  p(5, { email: null }),
];

describe('email check marker', () => {
  it('counts AI-guessed statuses as unchecked', () => {
    expect(emailCheckStats(providers)).toEqual({ withEmail: 4, analyzed: 2, unanalyzed: 2, valid: 1, risky: 1, invalid: 0 });
    expect(checkedEmailStatus(providers[1])).toBeNull();
    expect(checkedEmailStatus(providers[2])).toBe('risky');
  });

  it('shows the unchecked addresses the Unverified mode will pick up', () => {
    render(<EmailVerificationPanel providers={providers} />);
    expect(screen.getByText('2 emails never checked')).toBeTruthy();
    expect(screen.getByText('1 risky emails')).toBeTruthy();
    expect(screen.getByText('2 / 4 (50%)')).toBeTruthy();
  });

  it('lists only addresses a DNS check flagged as problematic', () => {
    render(<ProblematicEmailsPanel providers={providers} />);
    expect(screen.getByText('dns.risky@clinic.org')).toBeTruthy();
    expect(screen.queryByText('ai.risky@clinic.org')).toBeNull();
  });
});
