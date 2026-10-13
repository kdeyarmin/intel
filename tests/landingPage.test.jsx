// @vitest-environment jsdom
/**
 * Tests for the CareMetric Healthcare Advisors landing page.
 *
 * Validates:
 * - Core messaging & value proposition
 * - Responsive navigation and brand elements
 * - Interactive pricing toggle (monthly vs annual 2-month discount)
 * - Pricing tiers (Starter $199, Professional $499, Enterprise Custom)
 * - Responsible vendor evaluation guidance
 * - Interactive Request Demo modal with accessible form controls
 * - CTA navigation paths (Sign In -> /login, Start Free Trial -> /login?signup=true)
 * - Healthcare data disclaimers and compliance disclosures
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from '../src/pages/Landing';
import { CAREMETRIC_LOGO_URL, CAREMETRIC_NAME } from '../src/lib/branding';

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
    expect(h1).toHaveTextContent('Understand your market. Plan provider outreach with public healthcare data.');

    // Platform branding
    expect(screen.getAllByText(new RegExp(CAREMETRIC_NAME)).length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent(/CareMetric (Intel|AI)/i);
  });

  it('labels the preview as illustrative instead of claiming verified scale or performance', () => {
    renderLanding();

    expect(screen.getByText('Illustrative sample — not live data')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Provider research' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Territory planning' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/6\.2M\+|46M\+|4\.2x|Live Sync|2026 CMS|100% verified/i);
  });

  it('uses the shared full-logo reference in the header and footer', () => {
    renderLanding();
    const logos = screen.getAllByRole('img', { name: CAREMETRIC_NAME });
    expect(logos).toHaveLength(2);
    logos.forEach((logo) => expect(logo).toHaveAttribute('src', CAREMETRIC_LOGO_URL));
    logos.forEach((logo) => expect(logo).toHaveClass('bg-white', 'text-slate-900'));
    expect(CAREMETRIC_LOGO_URL).not.toMatch(/favicon/i);
    logos.forEach((logo) => expect(logo.parentElement.textContent.trim()).toBe(''));
  });

  it('renders the "Who It\'s For" audience section', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: /Designed for healthcare managers and provider relations teams/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Home Health Agencies/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Hospice & Palliative Care/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Skilled Nursing & Rehab/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Provider Relations & Outreach Teams/i })).toBeInTheDocument();
  });

  it('renders the "How It Works" 4-step workflow', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: /From public data to a coordinated outreach plan/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Review Source Data/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Score & Prioritize/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Build Target Lists/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Engage & Outreach/i })).toBeInTheDocument();
  });

  it('offers vendor evaluation questions without unverifiable competitor claims', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: /Questions to ask when evaluating healthcare intelligence/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'What to confirm' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/Definitive Healthcare|ZoomInfo|CarePrecise|CSV Dumps|enterprise extortion|deep Medicare claims/i);
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
    const dialog = screen.getByRole('dialog', { name: `Request a ${CAREMETRIC_NAME} Demo` });
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
    expect(email.pathname).toBe('sales@caremetric.ai');
    expect(email.searchParams.get('body')).toContain('Dr. Jane Smith');
    expect(email.searchParams.get('body')).toContain('jane@hospicecare.org');
    expect(email.searchParams.get('subject')).toBe(`${CAREMETRIC_NAME} demo request`);
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

    expect(screen.getByText(/support@caremetric\.ai/i)).toBeInTheDocument();
    expect(screen.getByText(/sales@caremetric\.ai/i)).toBeInTheDocument();
    expect(screen.getByText(/Data & Use Disclaimer:/i)).toBeInTheDocument();
    expect(screen.getByText(/uses public CMS, NPPES, and U.S. Census Bureau releases/i)).toBeInTheDocument();
  });

  it('presents use cases rather than attributed testimonials or numeric outcome claims', () => {
    renderLanding();
    expect(screen.getByText('Illustrative Use Cases')).toBeInTheDocument();
    expect(screen.getByText(/not customer testimonials or measured performance results/i)).toBeInTheDocument();
    expect(screen.getAllByText('Illustrative workflow')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Use Cases' })).toHaveAttribute('href', '#testimonials');
    expect(document.body).not.toHaveTextContent(/Sarah Jenkins|David Rodriguez|Elena Rostova|40%|knocking on offices|game-changers/i);
  });

  it('provides mobile navigation and closes it after selecting a section', () => {
    renderLanding();
    const menu = screen.getByRole('button', { name: 'Open navigation menu' });
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(menu);
    expect(screen.getByRole('navigation', { name: 'Mobile Navigation' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('link', { name: 'Use Cases' })[1]);
    expect(screen.queryByRole('navigation', { name: 'Mobile Navigation' })).not.toBeInTheDocument();
  });

  it('qualifies shared-patient, privacy, freshness, and trial claims in FAQ answers', () => {
    renderLanding();
    expect(screen.getByText(/Public aggregate shared-patient patterns are not confirmed referrals or transfers/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Do shared-patient patterns prove that a referral occurred?' }));
    expect(screen.getByRole('region')).toHaveTextContent('They do not confirm individual referrals, transfers, referral direction, or causation.');
    fireEvent.click(screen.getByRole('button', { name: 'Does the public intelligence data include patient records?' }));
    expect(screen.getByRole('region')).toHaveTextContent('Public data use does not establish HIPAA compliance for your organization');
    expect(screen.getByRole('region')).not.toHaveTextContent(/100%|HIPAA public intelligence standards/i);
    fireEvent.click(screen.getByRole('button', { name: 'How frequently is the database updated?' }));
    expect(screen.getByRole('region')).toHaveTextContent('a recent import does not mean the underlying data describes current activity');
    fireEvent.click(screen.getByRole('button', { name: 'What is included in the 14-day free trial?' }));
    expect(screen.getByRole('region')).toHaveTextContent('Account approval, territory selection, seat limits, and usage quotas may apply');
  });
});
