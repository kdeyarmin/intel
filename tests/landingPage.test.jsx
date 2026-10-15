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

  it('describes the data with verifiable facts instead of unsupported stats', () => {
    renderLanding();

    expect(screen.getByText('Weekly')).toBeInTheDocument();
    expect(screen.getByText(/NPPES registry refresh/i)).toBeInTheDocument();
    expect(screen.getByText('3,140+')).toBeInTheDocument();
    expect(screen.getByText(/Source & data year on every figure/i)).toBeInTheDocument();
    expect(screen.queryByText('4.2x')).not.toBeInTheDocument();
    expect(screen.queryByText(/100% verified/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/HIPAA compliant/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Provider Intelligence & Referral Mapping/)).toBeInTheDocument();
  });

  it('labels the hero provider card as sample data', () => {
    renderLanding();

    expect(screen.getByText(/Sample data \(fictional provider\)/)).toBeInTheDocument();
    expect(screen.queryByText(/St\. Vincent|UPMC/)).not.toBeInTheDocument();
    expect(screen.queryByText(/readmission risk/i)).not.toBeInTheDocument();
  });

  it('shows the CareMetric Intel wordmark rather than the legacy logo image', () => {
    renderLanding();

    expect(screen.queryAllByRole('img', { name: 'CareMetric Healthcare Advisors' })).toHaveLength(0);
    expect(screen.getAllByText(/Intel/).length).toBeGreaterThan(0);
  });

  it('does not show unverified customer testimonials', () => {
    renderLanding();

    expect(screen.queryByText(/Sarah Jenkins|David Rodriguez|Elena Rostova/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reviews' })).not.toBeInTheDocument();
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

  it('compares against tool categories without naming competitors', () => {
    renderLanding();

    expect(screen.getByRole('heading', { name: /How CareMetric Intel compares/i })).toBeInTheDocument();
    expect(screen.getByText('Enterprise healthcare databases')).toBeInTheDocument();
    expect(screen.getByText('General B2B contact databases')).toBeInTheDocument();
    expect(screen.getByText('Raw CMS files')).toBeInTheDocument();
    expect(screen.queryByText(/Definitive Healthcare|ZoomInfo|CarePrecise/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/extortion/i)).not.toBeInTheDocument();
  });

  it('renders pricing tiers with monthly billing by default and an annual toggle', () => {
    renderLanding();

    expect(screen.getByText(/annual billing is arranged through our sales team/)).toBeInTheDocument();
    expect(screen.queryByText(/proposed packages/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Starter' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Professional' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Enterprise' })).toBeInTheDocument();
    expect(screen.getByText('Priced to your territory and team size')).toBeInTheDocument();
    expect(screen.getAllByText('$199').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$499').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Annual Billing/i }));
    expect(screen.getAllByText('$166').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$416').length).toBeGreaterThan(0);
    expect(screen.getByText('Billed annually ($1,990/yr)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Monthly Billing/i }));
    expect(screen.getAllByText('$199').length).toBeGreaterThan(0);
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

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);
    fireEvent.click(screen.getByRole('button', { name: /Send Demo Request/i }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Demo request sent/i })).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/public/demo-request', expect.objectContaining({ method: 'POST' }));
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.fullName).toBe('Dr. Jane Smith');
    expect(sent.workEmail).toBe('jane@hospicecare.org');
    vi.unstubAllGlobals();

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

    expect(screen.getByText(/support@caremetricintel\.com/i)).toBeInTheDocument();
    expect(screen.getByText(/sales@caremetricintel\.com/i)).toBeInTheDocument();
    expect(screen.getByText(/Data & Compliance Disclaimer:/i)).toBeInTheDocument();
    expect(screen.getByText(/CareMetric Intel aggregates and synthesizes public data releases/i)).toBeInTheDocument();
  });
});
