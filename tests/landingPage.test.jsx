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

    // Check pricing tier cards
    expect(screen.getByRole('heading', { name: 'Starter' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Professional' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Enterprise' })).toBeInTheDocument();

    // Default annual prices reflect 2 months free (~$165/mo and ~$415/mo)
    expect(screen.getAllByText('$165').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$415').length).toBeGreaterThan(0);
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

    expect(screen.getAllByText('$165').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$415').length).toBeGreaterThan(0);
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

    // Submit demo request
    const submitBtn = screen.getByRole('button', { name: /Submit Demo Request/i });
    fireEvent.click(submitBtn);

    // Shows success state after submission
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Demo Request Received!/i })).toBeInTheDocument();
    });

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
    expect(screen.getByText(/Data & Compliance Disclaimer:/i)).toBeInTheDocument();
    expect(screen.getByText(/CareMetric Intel aggregates and synthesizes public data releases/i)).toBeInTheDocument();
  });
});
