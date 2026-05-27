// @vitest-environment jsdom
/**
 * Tests for the ProviderDetail page covering the PR change that conditionally
 * renders AffiliatedProvidersCard for Organization-type providers only.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

afterEach(cleanup);

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/api/base44Client', () => ({ base44: { entities: {}, auth: {}, functions: { invoke: vi.fn(() => Promise.resolve(null)) } } }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

// Stub OrgAffiliatedProvidersCard with a recognisable test-id so we can assert
// whether it was mounted without depending on its internal rendering logic.
vi.mock('../src/components/providers/OrgAffiliatedProvidersCard', () => ({
  default: (props) => (
    <div
      data-testid="affiliated-providers-card"
      data-npi={props.npi}
    />
  ),
}));

// Stub all other child components that have their own complex dependencies.
vi.mock('../src/components/providers/BasicProfile', () => ({ default: () => null }));
vi.mock('../src/components/providers/ProviderKPIRow', () => ({ default: () => null }));
vi.mock('../src/components/providers/UtilizationInsights', () => ({ default: () => null }));
vi.mock('../src/components/providers/UtilizationTrendChart', () => ({ default: () => null }));
vi.mock('../src/components/providers/ReferralTrendChart', () => ({ default: () => null }));
vi.mock('../src/components/providers/ReferralLikelihoodSignals', () => ({ default: () => null }));
vi.mock('../src/components/providers/PatientPopulationFingerprint', () => ({ default: () => null }));
vi.mock('../src/components/providers/WhyThisProvider', () => ({ default: () => null }));
vi.mock('../src/components/providers/ScoreBreakdown', () => ({ default: () => null }));
vi.mock('../src/components/providers/LocationsTable', () => ({ default: () => null }));
vi.mock('../src/components/providers/TaxonomyList', () => ({ default: () => null }));
vi.mock('../src/components/providers/TerritoryIntelligence', () => ({ default: () => null }));
vi.mock('../src/components/providers/RelatedLocations', () => ({ default: () => null }));
vi.mock('../src/components/providers/AISummary', () => ({ default: () => null }));
vi.mock('../src/components/providers/AIEmailFinder', () => ({ default: () => null }));
vi.mock('../src/components/compliance/ComplianceDisclaimer', () => ({ default: () => null }));
vi.mock('../src/components/providers/UtilizationSummaryCard', () => ({ default: () => null }));
vi.mock('../src/components/providers/ReferralSummaryCard', () => ({ default: () => null }));
vi.mock('../src/components/providers/DataQualityInsightsCard', () => ({ default: () => null }));
vi.mock('../src/components/ai/AIContactEnrichment', () => ({ default: () => null }));
vi.mock('../src/components/ai/AIRelatedProviders', () => ({ default: () => null }));
vi.mock('../src/components/ai/AIMarketInsights', () => ({ default: () => null }));
vi.mock('../src/components/ai/AIDataEnrichmentPanel', () => ({ default: () => null }));
vi.mock('../src/components/emailBot/SingleEmailVerifier', () => ({ default: () => null }));
vi.mock('../src/components/providers/ProviderAffiliations', () => ({ default: () => null }));
vi.mock('../src/components/providers/AINetworkFitCard', () => ({ default: () => null }));
vi.mock('../src/components/providers/ProviderMessaging', () => ({ default: () => null }));
vi.mock('../src/components/providers/ProviderImportHistory', () => ({ default: () => null }));
vi.mock('../src/components/providers/ProviderAIQualityInsights', () => ({ default: () => null }));
vi.mock('../src/components/enrichment/ExternalDataDisplay', () => ({ default: () => null }));
vi.mock('../src/components/outreach/AIPredictiveOutreachCard', () => ({ default: () => null }));
vi.mock('../src/components/providers/MIPSPerformanceCard', () => ({ default: () => null }));
vi.mock('../src/components/providers/LinkedFacilitiesCard', () => ({ default: () => null }));
vi.mock('../src/components/providers/ProviderCMSDataCard', () => ({ default: () => null }));
vi.mock('../src/components/providers/ReferralPartnersCard', () => ({ default: () => null }));
vi.mock('../src/components/reports/ComprehensiveReport', () => ({ default: () => null }));

import { useQuery } from '@tanstack/react-query';
import ProviderDetail from '../src/pages/ProviderDetail';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeOrgProvider(npi = '9999999999') {
  return {
    id: 'p-1',
    npi,
    entity_type: 'Organization',
    organization_name: 'Sunrise Health Group',
    status: 'Active',
  };
}

function makeIndividualProvider(npi = '8888888888') {
  return {
    id: 'p-2',
    npi,
    entity_type: 'Individual',
    first_name: 'Alice',
    last_name: 'Walker',
    status: 'Active',
  };
}

function setupMocks({ provider } = {}) {
  useQuery.mockImplementation(({ queryKey }) => {
    const key = Array.isArray(queryKey) ? queryKey[0] : queryKey;
    if (key === 'provider') return { data: provider ? [provider] : [], isLoading: false };
    if (key === 'allProvsForAI') return { data: [], isLoading: false };
    if (key === 'allLocsForAI') return { data: [], isLoading: false };
    if (key === 'allTaxForAI') return { data: [], isLoading: false };
    return { data: [], isLoading: false };
  });
}

function renderProviderDetail(npi = '9999999999') {
  return render(
    <MemoryRouter initialEntries={[`/ProviderDetail?npi=${npi}`]}>
      <ProviderDetail />
    </MemoryRouter>,
  );
}

// AffiliatedProvidersCard lives in the Network tab; Radix only mounts the
// active tab's content, so activate it before asserting on the card.
async function openNetworkTab() {
  await userEvent.setup().click(screen.getByRole('tab', { name: /network/i }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ProviderDetail page – AffiliatedProvidersCard conditional rendering', () => {
  it('renders AffiliatedProvidersCard when provider entity_type is Organization', async () => {
    const orgNpi = '9999999999';
    setupMocks({ provider: makeOrgProvider(orgNpi) });
    renderProviderDetail(orgNpi);
    await openNetworkTab();
    // The card should be present in the DOM (even if it renders null internally
    // because allProviders/allLocations are empty — our stub always renders it)
    expect(screen.getByTestId('affiliated-providers-card')).toBeInTheDocument();
  });

  it('passes the correct npi prop to AffiliatedProvidersCard', async () => {
    const orgNpi = '9999999999';
    setupMocks({ provider: makeOrgProvider(orgNpi) });
    renderProviderDetail(orgNpi);
    await openNetworkTab();
    expect(screen.getByTestId('affiliated-providers-card').dataset.npi).toBe(orgNpi);
  });

  it('does NOT render AffiliatedProvidersCard when provider entity_type is Individual', async () => {
    const indNpi = '8888888888';
    setupMocks({ provider: makeIndividualProvider(indNpi) });
    renderProviderDetail(indNpi);
    await openNetworkTab();
    expect(screen.queryByTestId('affiliated-providers-card')).toBeNull();
  });

  it('shows "Provider not found" message when no provider data is returned', () => {
    setupMocks({ provider: null });
    renderProviderDetail('0000000000');
    expect(screen.getByText('Provider not found')).toBeInTheDocument();
  });

  it('does not render AffiliatedProvidersCard when provider is not found', () => {
    setupMocks({ provider: null });
    renderProviderDetail('0000000000');
    expect(screen.queryByTestId('affiliated-providers-card')).toBeNull();
  });
});