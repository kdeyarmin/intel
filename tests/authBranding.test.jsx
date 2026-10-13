// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { CAREMETRIC_LOGO_URL } from '../src/lib/branding';
import AuthShell from '../src/components/auth/AuthShell';
import AuthLayout from '../src/components/AuthLayout';
import SessionUnavailable from '../src/components/auth/SessionUnavailable';
import PendingApproval from '../src/components/auth/PendingApproval';
import { DataUsePage, PrivacyPage, TermsPage } from '../src/components/auth/LegalPages';

const { checkAppState, logout } = vi.hoisted(() => ({
  checkAppState: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'new@example.org', full_name: 'Alex', status: 'pending' },
    isAuthenticated: true,
    isLoadingAuth: false,
    checkAppState,
    logout,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const BRAND = 'CareMetric Healthcare Advisors';

describe('authentication branding', () => {
  it('uses the shared logo and full brand without duplicating its accessible name', () => {
    const { container } = render(<AuthShell title="Reset your password"><p>Form content</p></AuthShell>);
    expect(screen.getByRole('heading', { level: 1, name: BRAND })).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', CAREMETRIC_LOGO_URL);
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    expect(screen.getByRole('heading', { level: 2, name: 'Reset your password' })).toBeInTheDocument();
  });

  it('brands AuthLayout while preserving its screen title and content', () => {
    render(<AuthLayout icon={Lock} title="Sign in" subtitle="Access your account" footer="Support"><button>Continue</button></AuthLayout>);
    expect(screen.getByRole('img', { name: BRAND })).toHaveAttribute('src', CAREMETRIC_LOGO_URL);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    expect(screen.getByText('Support')).toBeInTheDocument();
  });

  it('keeps approval requirements and approval controls intact', () => {
    render(<MemoryRouter><PendingApproval /></MemoryRouter>);
    expect(screen.getByText(/An administrator must approve/)).toHaveTextContent(BRAND);
    expect(screen.getByText(/every 30 seconds/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(checkAppState).toHaveBeenCalledOnce();
    expect(logout).toHaveBeenCalledOnce();
  });

  it('keeps outage details and the retry action intact', () => {
    const retry = vi.fn();
    render(<SessionUnavailable message="Unable to verify your session." onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent(`${BRAND} is temporarily unavailable`);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to verify your session.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it.each([TermsPage, PrivacyPage, DataUsePage])('brands legal pages and preserves navigation', (Page) => {
    const { container } = render(<MemoryRouter><Page /></MemoryRouter>);
    expect(screen.getByRole('link', { name: BRAND })).toHaveAttribute('href', '/login');
    expect(container.querySelector('header img')).toHaveAttribute('src', CAREMETRIC_LOGO_URL);
    expect(screen.getByRole('navigation', { name: 'Legal pages' })).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/CareMetric AI|CareMetric Intel/);
  });

  it('retains the public-data and shared-patient limitations', () => {
    render(<MemoryRouter><DataUsePage /></MemoryRouter>);
    expect(screen.getByText(/not CMS publications/)).toBeInTheDocument();
    expect(screen.getByText(/CMS suppresses counts under 11/)).toBeInTheDocument();
    expect(screen.getByText(/they are not confirmed referrals/)).toBeInTheDocument();
    expect(screen.getByText(/No patient-level or beneficiary-level data is used/)).toBeInTheDocument();
  });
});
