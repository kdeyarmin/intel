// @vitest-environment jsdom
/**
 * Tests for the Providers page covering the PR change that removed the
 * "Org" button (link to OrganizationDetail) for organization-type providers,
 * leaving only the "View" button (link to ProviderDetail) for all providers.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

afterEach(cleanup);

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@/api/base44Client', () => ({
  base44: { entities: {}, auth: { me: vi.fn(() => Promise.resolve({ email: 'test@test.com' })) }, functions: { invoke: vi.fn(() => Promise.resolve({ data: { providers: [] } })) } },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  keepPreviousData: undefined,
}));

// Stub complex child components.
vi.mock('../src/components/search/TypeAheadSearch', () => ({ default: () => null }));
vi.mock('../src/components/filters/ProviderAdvancedFilters', () => ({ default: () => null }));
vi.mock('../src/components/filters/SortControl', () => ({ default: () => null }));
vi.mock('../src/components/exports/ExportDialog', () => ({ default: () => null }));
vi.mock('../src/components/filters/SavedFilterBar', () => ({ default: () => null }));
vi.mock('../src/components/shared/PageHeader', () => ({ default: () => null }));
vi.mock('../src/components/providers/EnrichProviderButton', () => ({ default: () => null }));
vi.mock('../src/components/providers/AINPIFinder', () => ({ default: () => null }));
vi.mock('../src/components/providers/AIDuplicateDetector', () => ({ default: () => null }));
vi.mock('../src/components/providers/AIProfileAugmenter', () => ({ default: () => null }));
vi.mock('../src/components/filters/TextMatchFilter', () => ({
  default: () => null,
  applyTextFilters: (arr) => arr,
}));
vi.mock('../src/components/filters/DateRangeFilterInline', () => ({
  default: () => null,
  applyDateRangeFilter: (arr) => arr,
}));
vi.mock('../src/components/filters/FilterPresets', () => ({ default: () => null }));
vi.mock('../src/components/providers/ProviderComparison', () => ({ default: () => null }));
vi.mock('../src/components/territory/InteractiveProviderMap', () => ({ default: () => null }));

import { useQuery } from '@tanstack/react-query';
import Providers from '../src/pages/Providers';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeOrg = (npi, name) => ({
  id: npi,
  npi,
  entity_type: 'Organization',
  organization_name: name,
  status: 'Active',
  email: null,
});

const makeIndividual = (npi, first, last) => ({
  id: npi,
  npi,
  entity_type: 'Individual',
  first_name: first,
  last_name: last,
  status: 'Active',
  email: null,
});

function setupMocks({ providers = [], scores = [], locations = [], taxonomies = [], savedFilters = [] } = {}) {
  useQuery.mockImplementation(({ queryKey }) => {
    const key = Array.isArray(queryKey) ? queryKey[0] : queryKey;
    if (key === 'providersPage') return { data: providers, isLoading: false };
    if (key === 'providersPageScores') return { data: scores, isLoading: false };
    if (key === 'providersPageLocations') return { data: locations, isLoading: false };
    if (key === 'providersPageTaxonomies') return { data: taxonomies, isLoading: false };
    if (key === 'savedFilters') return { data: savedFilters, isLoading: false };
    return { data: [], isLoading: false };
  });
}

function renderProviders() {
  return render(
    <MemoryRouter>
      <Providers />
    </MemoryRouter>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Providers page – removed "Org" button for organizations', () => {
  it('does not render an "Org" link for organization-type providers', () => {
    setupMocks({ providers: [makeOrg('1111111111', 'Downtown Clinic')] });
    renderProviders();
    // The old "Org" button text should not appear anywhere
    expect(screen.queryByRole('link', { name: /^org$/i })).toBeNull();
    expect(screen.queryByText(/^org$/i)).toBeNull();
  });

  it('renders a "View" link for organization-type providers pointing to ProviderDetail', () => {
    setupMocks({ providers: [makeOrg('1111111111', 'Downtown Clinic')] });
    renderProviders();
    const viewLinks = screen.getAllByRole('link', { name: /^view$/i });
    // At least one "View" link for the org row
    expect(viewLinks.length).toBeGreaterThanOrEqual(1);
    const orgViewLink = viewLinks.find(l => l.getAttribute('href') === '/ProviderDetail?npi=1111111111');
    expect(orgViewLink).toBeDefined();
  });

  it('does not include an OrganizationDetail href for any provider row', () => {
    setupMocks({
      providers: [
        makeOrg('1111111111', 'Downtown Clinic'),
        makeIndividual('2222222222', 'Jane', 'Doe'),
      ],
    });
    renderProviders();
    const allLinks = screen.getAllByRole('link');
    const orgDetailLinks = allLinks.filter(l =>
      l.getAttribute('href')?.includes('OrganizationDetail'),
    );
    expect(orgDetailLinks).toHaveLength(0);
  });

  it('renders only a single action button ("View") per org row, not two', () => {
    const orgNpi = '1111111111';
    setupMocks({ providers: [makeOrg(orgNpi, 'Downtown Clinic')] });
    renderProviders();
    // With the PR change there should be exactly one "View" link for the org row
    const viewLinks = screen.getAllByRole('link', { name: /^view$/i });
    expect(viewLinks).toHaveLength(1);
  });

  it('renders "View" links for individual providers too, pointing to ProviderDetail', () => {
    const indNpi = '2222222222';
    setupMocks({ providers: [makeIndividual(indNpi, 'Jane', 'Doe')] });
    renderProviders();
    const viewLinks = screen.getAllByRole('link', { name: /^view$/i });
    const indViewLink = viewLinks.find(l => l.getAttribute('href') === `/ProviderDetail?npi=${indNpi}`);
    expect(indViewLink).toBeDefined();
  });

  it('renders "No providers found" when the provider list is empty', () => {
    setupMocks({ providers: [] });
    renderProviders();
    expect(screen.getByText('No providers found')).toBeInTheDocument();
  });

  it('renders a single "View" link for each of multiple org providers (no extra Org buttons)', () => {
    setupMocks({
      providers: [
        makeOrg('1111111111', 'Clinic A'),
        makeOrg('2222222222', 'Clinic B'),
      ],
    });
    renderProviders();
    const viewLinks = screen.getAllByRole('link', { name: /^view$/i });
    // One per org = 2; no extra "Org" buttons
    expect(viewLinks).toHaveLength(2);
  });
});
