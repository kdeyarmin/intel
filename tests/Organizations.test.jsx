// @vitest-environment jsdom
/**
 * Tests for the Organizations page. Organization rows link to the dedicated
 * OrganizationDetail page (org-specific KPIs, utilization, referrals, affiliated
 * providers) rather than the individual-oriented ProviderDetail page.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

afterEach(cleanup);

// ─── Minimal stubs for heavy dependencies ────────────────────────────────────

vi.mock('@/api/base44Client', () => ({ base44: { entities: {}, auth: {}, functions: {} } }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

// Stub child components that pull in their own heavy deps.
vi.mock('../src/components/search/TypeAheadSearch', () => ({ default: () => null }));
vi.mock('../src/components/filters/SortControl', () => ({ default: () => null }));
vi.mock('../src/components/exports/ExportDialog', () => ({ default: () => null }));
vi.mock('../src/components/filters/SavedFilterBar', () => ({ default: () => null }));
vi.mock('../src/components/compliance/DataSourcesFooter', () => ({ default: () => null }));
vi.mock('../src/components/providers/EnrichProviderButton', () => ({ default: () => null }));
vi.mock('../src/components/providers/AINPIFinder', () => ({ default: () => null }));
vi.mock('../src/components/providers/AIProfileAugmenter', () => ({ default: () => null }));
vi.mock('../src/components/providers/AIDuplicateDetector', () => ({ default: () => null }));
vi.mock('../src/components/shared/PageHeader', () => ({ default: () => null }));

import { useQuery } from '@tanstack/react-query';
import Organizations from '../src/pages/Organizations';

const ORG_NPI = '9876543210';

const mockOrg = {
  id: 'org-1',
  npi: ORG_NPI,
  entity_type: 'Organization',
  organization_name: 'City Health Clinic',
  status: 'Active',
  email: null,
};

function setupMocks({ providers = [], scores = [], locations = [], taxonomies = [], savedFilters = [] } = {}) {
  useQuery.mockImplementation(({ queryKey }) => {
    const key = Array.isArray(queryKey) ? queryKey[0] : queryKey;
    if (key === 'organizationsPage') return { data: providers, isLoading: false };
    if (key === 'organizationsPageScores') return { data: scores, isLoading: false };
    if (key === 'organizationsPageLocations') return { data: locations, isLoading: false };
    if (key === 'organizationsPageTaxonomies') return { data: taxonomies, isLoading: false };
    if (key === 'savedFilters') return { data: savedFilters, isLoading: false };
    return { data: [], isLoading: false };
  });
}

function renderOrganizations() {
  return render(
    <MemoryRouter>
      <Organizations />
    </MemoryRouter>,
  );
}

describe('Organizations page – link URLs after PR change', () => {
  beforeEach(() => {
    setupMocks({ providers: [mockOrg] });
  });

  it('organization name link points to OrganizationDetail', () => {
    renderOrganizations();
    const orgNameLink = screen.getByRole('link', { name: 'City Health Clinic' });
    expect(orgNameLink.getAttribute('href')).toBe(`/OrganizationDetail?npi=${ORG_NPI}`);
  });

  it('"View Details" button link points to OrganizationDetail', () => {
    renderOrganizations();
    const viewDetailsLink = screen.getByRole('link', { name: /view details/i });
    expect(viewDetailsLink.getAttribute('href')).toBe(`/OrganizationDetail?npi=${ORG_NPI}`);
  });

  it('both links for the same org share the same OrganizationDetail URL', () => {
    renderOrganizations();
    const links = screen.getAllByRole('link');
    const detailLinks = links.filter(l =>
      l.getAttribute('href')?.includes('OrganizationDetail') &&
      l.getAttribute('href')?.includes(ORG_NPI),
    );
    // org name link + "View Details" link = 2
    expect(detailLinks.length).toBeGreaterThanOrEqual(2);
  });

  it('renders "No organizations found" when provider list is empty', () => {
    setupMocks({ providers: [] });
    renderOrganizations();
    expect(screen.getByText('No organizations found')).toBeInTheDocument();
  });

  it('renders multiple org rows with OrganizationDetail links for each', () => {
    const orgs = [
      { ...mockOrg, id: 'org-1', npi: '1111111111', organization_name: 'Clinic A' },
      { ...mockOrg, id: 'org-2', npi: '2222222222', organization_name: 'Clinic B' },
    ];
    setupMocks({ providers: orgs });
    renderOrganizations();

    const linkA = screen.getByRole('link', { name: 'Clinic A' });
    const linkB = screen.getByRole('link', { name: 'Clinic B' });
    expect(linkA.getAttribute('href')).toBe('/OrganizationDetail?npi=1111111111');
    expect(linkB.getAttribute('href')).toBe('/OrganizationDetail?npi=2222222222');
  });
});