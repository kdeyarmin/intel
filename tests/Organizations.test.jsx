// @vitest-environment jsdom
/**
 * Tests for the Organizations page. Organization rows link to the dedicated
 * OrganizationDetail page (org-specific KPIs, utilization, referrals, affiliated
 * providers) rather than the individual-oriented ProviderDetail page.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';

afterEach(cleanup);

// ─── Minimal stubs for heavy dependencies ────────────────────────────────────

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn(() => Promise.resolve({ data: { providers: [], truncated: false, mode: 'contains' } })) }));
vi.mock('@/api/base44Client', () => ({ base44: { entities: {}, auth: {}, functions: { invoke } } }));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  keepPreviousData: undefined,
}));
vi.mock('../src/components/leadlists/AddToLeadListDialog', () => ({ default: () => null }));

// Stub child components that pull in their own heavy deps.
vi.mock('../src/components/search/TypeAheadSearch', () => ({
  default: ({ value, onChange }) => <input aria-label="Search" value={value} onChange={(e) => onChange(e.target.value)} />,
}));
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
    if (key === 'organizationsPage') return { data: { providers }, isLoading: false };
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

  it('explains an empty organization list', () => {
    setupMocks({ providers: [] });
    renderOrganizations();
    expect(screen.getByText('No organizations match the current filters.')).toBeInTheDocument();
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
describe('Organizations page – server-side search', () => {
  it('sends the state filter to the server while searching', async () => {
    const calls = [];
    useQuery.mockImplementation((opts) => {
      calls.push(opts);
      return { data: opts.queryKey[0] === 'organizationsPage' ? { providers: [mockOrg], truncated: true, mode: 'contains' } : [], isLoading: false };
    });
    render(
      <MemoryRouter initialEntries={['/Organizations?q=mercy&state=PA']}>
        <Organizations />
      </MemoryRouter>,
    );
    const search = calls.find((c) => c.queryKey[0] === 'organizationsPage' && c.queryKey[1] === 'mercy');
    expect(search.queryKey).toEqual(['organizationsPage', 'mercy', 'PA']);
    await search.queryFn();
    expect(invoke).toHaveBeenCalledWith('searchProviders', { q: 'mercy', entity_type: 'Organization', limit: 300, state: 'PA' });
  });
});

function UrlProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="url-search">{location.search}</span>
      <button onClick={() => navigate(`${location.pathname}?q=mercy`)}>open mercy link</button>
      <button onClick={() => navigate(-1)}>go back</button>
    </div>
  );
}

describe('Organizations page – search kept in the URL', () => {
  function renderWithProbe(entries) {
    setupMocks({ providers: [] });
    render(
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Organizations />
        <UrlProbe />
      </MemoryRouter>,
    );
  }
  const urlSearch = () => screen.getByTestId('url-search').textContent;
  const settleDebounce = () => act(() => new Promise((resolve) => setTimeout(resolve, 400)));

  it('takes the search from a same-page link instead of writing the old one back', async () => {
    renderWithProbe(['/Organizations?q=city']);
    fireEvent.click(screen.getByRole('button', { name: 'open mercy link' }));
    expect(urlSearch()).toBe('?q=mercy');
    await settleDebounce();
    expect(urlSearch()).toBe('?q=mercy');
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveValue('mercy');
  });

  it('takes the search from Back', async () => {
    renderWithProbe(['/Organizations?q=city', '/Organizations?q=mercy']);
    fireEvent.click(screen.getByRole('button', { name: 'go back' }));
    expect(urlSearch()).toBe('?q=city');
    await settleDebounce();
    expect(urlSearch()).toBe('?q=city');
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveValue('city');
  });
});
