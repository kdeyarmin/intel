// @vitest-environment jsdom
/**
 * Tests for CareMetric Intel marketing landing page (src/pages/Landing.jsx).
 *
 * Validates:
 * - Core messaging & value proposition
 * - Responsive navigation and brand elements
 * - Interactive pricing toggle (monthly vs annual 2-month discount)
 * - Pricing tiers (Starter $199, Professional $499, Enterprise Custom)
 * - Competitive comparison against enterprise data vendors
 * - Interactive Request Demo modal with accessible form controls
 * - CTA navigation paths (Sign In -> /login, Start Free Trial -> /login?signup=true)
 * - Healthcare data disclaimers and compliance disclosures
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from '../src/pages/Landing';
import { CAREMETRIC_LOGO_URL } from '../src/lib/branding';
import Login from '../src/pages/Login';
import AuthShell from '../src/components/auth/AuthShell';
import { DataUsePage, PrivacyPage, TermsPage } from '../src/components/auth/LegalPages';
import SessionUnavailable from '../src/components/auth/SessionUnavailable';

afterEach(cleanup);

const mockAuth = vi.hoisted(() => ({
  user: null,
  isAuthenticated: false,
  isLoadingAuth: false,
}));

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

function renderLanding() {
  return render(
    <MemoryRouter initialEntries={['/landing']}>
      <Landing />
    </MemoryRouter>
  );
}

describe('Landing Page', () => {
  it('renders hero with exact value proposition and key platform branding', () => {
    renderLanding();

    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
    expect(h1.textContent).toContain('Stop guessing which providers to target.');
    expect(h1.textContent).toContain('Turn CMS & NPPES data');
    expect(h1.textContent).toContain('into ranked leads, referral maps, and AI insights.');

    // Platform branding
    expect(screen.getAllByText(/CareMetric/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Intel/i).length).toBeGreaterThan(0);
  });

  it('displays the key platform statistics and metrics', () => {
    renderLanding();

    expect(screen.getByText('6.2M+')).toBeInTheDocument();
    expect(screen.getByText(/Verified Providers/i)).toBeInTheDocument();
    expect(screen.getByText('46M+')).toBeInTheDocument();
    expect(screen.getByText('3,140+')).toBeInTheDocument();
    expect(screen.getByText('4.2x')).toBeInTheDocument();
  });

  it('uses the shared full-logo reference in the header and footer', () => {
    renderLanding();
    const logos = screen.getAllByRole('img', { name: 'CareMetric Healthcare Advisors' });
    expect(logos).toHaveLength(2);
    logos.forEach((logo) => expect(logo).toHaveAttribute('src', CAREMETRIC_LOGO_URL));
    expect(CAREMETRIC_LOGO_URL).not.toMatch(/favicon/i);
  });

  it('renders the "Who It\'s For" audience section', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: /Designed for healthcare growth & business development leaders/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Home Health Agencies/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Hospice & Palliative Care/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Skilled Nursing & Rehab/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /BD, Sales & Marketing Teams/i })).toBeInTheDocument();
  });

  it('renders the "How It Works" 4-step workflow', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: /How CareMetric Intel turns raw healthcare datasets into growth/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Ingest Fresh Data/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Score & Prioritize/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Build Target Lists/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Engage & Outreach/i })).toBeInTheDocument();
  });

  it('displays the competitor comparison against Definitive Healthcare and ZoomInfo', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: /Why healthcare teams switch from legacy vendors/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Definitive Healthcare/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ZoomInfo/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/CarePrecise/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$30,000/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$15,000/i).length).toBeGreaterThan(0);
  });

  it('renders fair market pricing tiers with monthly and annual toggle', () => {
    renderLanding();

    expect(screen.getByText(/These packages and annual discounts are not available through self-service checkout yet/)).toBeInTheDocument();
    // Check pricing tier cards
    expect(screen.getByRole('heading', { name: 'Starter' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Professional' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Enterprise' })).toBeInTheDocument();

    // Default annual prices reflect two months free, rounded to whole dollars.
    expect(screen.getAllByText('$166').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$416').length).toBeGreaterThan(0);
    expect(screen.getByText('Billed annually ($1,990/yr)')).toBeInTheDocument();
    expect(screen.getByText('Billed annually ($4,990/yr – Save $998)')).toBeInTheDocument();
    expect(screen.getAllByText(/Custom/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Save 17%/i).length).toBeGreaterThan(0);

    // Toggle to monthly billing
    const monthlyBtn = screen.getByRole('button', { name: /Monthly Billing/i });
    fireEvent.click(monthlyBtn);

    // Monthly prices
    expect(screen.getAllByText('$199').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$499').length).toBeGreaterThan(0);

    // Toggle back to annual billing
    const annualBtn = screen.getByRole('button', { name: /Annual Billing/i });
    fireEvent.click(annualBtn);

    expect(screen.getAllByText('$166').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$416').length).toBeGreaterThan(0);
  });

  it('opens, validates, and closes the Request Demo modal', async () => {
    renderLanding();

    // Find and click a "Schedule Live Demo" button or "Request Demo"
    const demoButtons = screen.getAllByRole('button', { name: /Request Demo|Schedule Live Demo/i });
    fireEvent.click(demoButtons[0]);

    // Modal dialog is displayed
    const dialog = screen.getByRole('dialog', { name: /Request a CareMetric Intel Demo/i });
    expect(dialog).toBeInTheDocument();

    // Form inputs exist with accessible labels
    const nameInput = screen.getByLabelText(/Full Name/i);
    const emailInput = screen.getByLabelText(/Work Email/i);
    const orgInput = screen.getByLabelText(/Organization \/ Agency/i);
    const lineSelect = screen.getByLabelText(/Primary Care Setting/i);

    expect(nameInput).toBeInTheDocument();
    expect(emailInput).toBeInTheDocument();
    expect(orgInput).toBeInTheDocument();
    expect(lineSelect).toBeInTheDocument();

    // Fill out form
    fireEvent.change(nameInput, { target: { value: 'Dr. Jane Smith' } });
    fireEvent.change(emailInput, { target: { value: 'jane@hospicecare.org' } });
    fireEvent.change(orgInput, { target: { value: 'Horizon Hospice' } });
    fireEvent.change(lineSelect, { target: { value: 'hospice' } });

    // Prepare a request without falsely claiming that it was sent.
    const submitBtn = screen.getByRole('button', { name: /Prepare Demo Request/i });
    fireEvent.click(submitBtn);

    // Shows an email handoff after preparation.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Your demo request is ready/i })).toBeInTheDocument();
    });
    const email = new URL(screen.getByRole('link', { name: /Email Demo Request/ }).href);
    expect(email.pathname).toBe('sales@caremetricintel.com');
    expect(email.searchParams.get('subject')).toBe('CareMetric Intel demo request');
    expect(email.searchParams.get('body')).toContain('Dr. Jane Smith');
    expect(email.searchParams.get('body')).toContain('jane@hospicecare.org');
    expect(screen.getByText(/Your details have not been submitted yet/)).toBeInTheDocument();

    // Close modal
    const closeBtn = screen.getByRole('button', { name: /Done/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('provides direct links to free trial signup and sign in', () => {
    renderLanding();

    const trialLinks = screen.getAllByRole('link', { name: /Start Free Trial|Start 14-Day Free Trial/i });
    expect(trialLinks.length).toBeGreaterThan(0);
    expect(trialLinks[0]).toHaveAttribute('href', '/login?signup=true');

    const signInLinks = screen.getAllByRole('link', { name: /Sign In/i });
    expect(signInLinks.length).toBeGreaterThan(0);
    expect(signInLinks[0]).toHaveAttribute('href', '/login');
  });

  it('renders footer with contact email and public healthcare data disclaimer', () => {
    renderLanding();

    expect(screen.getByRole('link', { name: 'support@caremetricintel.com' })).toHaveAttribute('href', 'mailto:support@caremetricintel.com');
    expect(screen.getByRole('link', { name: 'sales@caremetricintel.com' })).toHaveAttribute('href', 'mailto:sales@caremetricintel.com');
    expect(screen.getByRole('link', { name: 'caremetricintel.com' })).toHaveAttribute('href', 'https://caremetricintel.com/');
    expect(screen.getByText('CareMetric Intel by CareMetric Healthcare Advisors')).toBeInTheDocument();
    expect(screen.getByText(/© .*CareMetric Healthcare Advisors/)).toBeInTheDocument();
    expect(screen.getByText(/Data & Compliance Disclaimer:/i)).toBeInTheDocument();
    expect(screen.getByText(/CareMetric Intel aggregates and synthesizes public data releases/i)).toBeInTheDocument();
  });

  describe('Public account and legal branding', () => {
    it.each([
      ['login', Login],
      ['signed-out screens', AuthShell],
      ['terms', TermsPage],
      ['privacy', PrivacyPage],
      ['data use', DataUsePage],
    ])('preserves the actual logo and company attribution on %s', (_, Page) => {
      render(<MemoryRouter><Page /></MemoryRouter>);
      expect(screen.getByRole('img', { name: 'CareMetric Healthcare Advisors' })).toHaveAttribute('src', CAREMETRIC_LOGO_URL);
      expect(screen.getByRole('link', { name: 'caremetricintel.com' })).toHaveAttribute('href', 'https://caremetricintel.com/');
      expect(document.body.textContent).toContain('CareMetric Intel');
      expect(document.body.textContent).toContain('CareMetric Healthcare Advisors');
      expect(document.body.textContent).not.toMatch(/CareMetric\s+AI|caremetric\.(ai|com)\b/);
    });

    it('provides branded, actionable language when a session cannot be checked', () => {
      const retry = vi.fn();
      render(<SessionUnavailable onRetry={retry} />);
      expect(screen.getByRole('alert')).toHaveTextContent('CareMetric Intel is temporarily unavailable');
      expect(screen.getByRole('alert')).toHaveTextContent('Please try again in a moment.');
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
      expect(retry).toHaveBeenCalledOnce();
    });
  });
});
