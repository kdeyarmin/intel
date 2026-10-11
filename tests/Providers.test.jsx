// @vitest-environment jsdom
/**
 * Tests for the Providers page covering the PR change that removed the
 * "Org" button (link to OrganizationDetail) for organization-type providers,
 * leaving only the "View" button (link to ProviderDetail) for all providers.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';

afterEach(cleanup);

const applied = vi.hoisted(() => ({ textFilters: null, dateRange: null, stateOptions: null }));

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
vi.mock('../src/components/search/TypeAheadSearch', () => ({
  default: ({ value, onChange }) => <input aria-label="Search" value={value} onChange={(e) => onChange(e.target.value)} />,
}));
vi.mock('../src/components/filters/ProviderAdvancedFilters', () => ({
  default: ({ stateOptions }) => { applied.stateOptions = stateOptions; return null; },
}));
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
  applyTextFilters: (arr, filters) => { applied.textFilters = filters; return arr; },
}));
vi.mock('../src/components/filters/DateRangeFilterInline', () => ({
  default: () => null,
  applyDateRangeFilter: (arr, _col, range) => { applied.dateRange = range; return arr; },
}));
vi.mock('../src/components/filters/FilterPresets', () => ({ default: () => null }));
vi.mock('../src/components/providers/ProviderComparison', () => ({ default: () => null }));
vi.mock('../src/components/territory/InteractiveProviderMap', () => ({ default: () => null }));

import { useQuery } from '@tanstack/react-query';
import Providers from '../src/pages/Providers';
import { US_STATES } from '../src/lib/usStates';

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
    if (key === 'providersPage') return { data: { providers }, isLoading: false };
    if (key === 'providersPageScores') return { data: scores, isLoading: false };
    if (key === 'providersPageLocations') return { data: locations, isLoading: false };
    if (key === 'providersPageTaxonomies') return { data: taxonomies, isLoading: false };
    if (key === 'savedFilters') return { data: savedFilters, isLoading: false };
    return { data: [], isLoading: false };
  });
}

function renderProviders(path = '/Providers') {
  return render(
    <MemoryRouter initialEntries={[path]}>
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

  it('explains an empty result instead of a bare "not found"', () => {
    setupMocks({ providers: [] });
    renderProviders();
    expect(screen.getByText('No providers match the current filters.')).toBeInTheDocument();
  });

  it('shows a retryable error instead of an empty table when loading fails', () => {
    const refetch = vi.fn();
    useQuery.mockImplementation(({ queryKey }) => {
      const key = Array.isArray(queryKey) ? queryKey[0] : queryKey;
      if (key === 'providersPage') return { data: undefined, isLoading: false, isError: true, error: new Error('timeout'), refetch };
      return { data: [], isLoading: false };
    });
    renderProviders();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load providers");
    screen.getByRole('button', { name: /try again/i }).click();
    expect(refetch).toHaveBeenCalled();
  });

  it('applies filters from the URL (so Back restores them)', () => {
    setupMocks({
      providers: [
        { ...makeIndividual('2222222222', 'Jane', 'Doe'), status: 'Active' },
        { ...makeIndividual('3333333333', 'Old', 'Record'), status: 'Deactivated' },
      ],
    });
    renderProviders('/Providers?status=Deactivated');
    expect(screen.queryByText('Doe, Jane')).toBeNull();
    expect(screen.getByText('Record, Old')).toBeInTheDocument();
  });

  it('describes the default view as the newest providers, not the total', () => {
    setupMocks({ providers: [makeIndividual('2222222222', 'Jane', 'Doe')] });
    renderProviders();
    expect(screen.queryByText(/total providers/)).toBeNull();
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

describe('Providers page – filters kept in the URL', () => {
  it('restores text-match and date filters from the URL so Back and shared links keep them', () => {
    setupMocks({ providers: [makeOrg('1111111111', 'Downtown Clinic')] });
    const textFilter = { id: 'f1', column: 'organization_name', mode: 'contains', term: 'Downtown' };
    const tf = encodeURIComponent(JSON.stringify([textFilter]));
    renderProviders(`/Providers?tf=${tf}&range=custom&from=2026-01-01&to=2026-02-01`);
    expect(applied.textFilters).toEqual([textFilter]);
    expect(applied.dateRange).toEqual({ preset: 'custom', startDate: '2026-01-01', endDate: '2026-02-01' });
  });

  it('ignores a malformed text-filter parameter', () => {
    setupMocks({ providers: [makeOrg('1111111111', 'Downtown Clinic')] });
    renderProviders('/Providers?tf=%7Bnot-json');
    expect(applied.textFilters).toEqual([]);
    expect(applied.dateRange).toEqual({ preset: 'all', startDate: '', endDate: '' });
  });
});

function UrlProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="url-search">{location.search}</span>
      <button onClick={() => navigate(`${location.pathname}?q=ortho`)}>open ortho link</button>
      <button onClick={() => navigate(-1)}>go back</button>
    </div>
  );
}

const settleDebounce = () => act(() => new Promise((resolve) => setTimeout(resolve, 400)));

describe('Providers page – search kept in the URL', () => {
  function renderWithProbe(entries, index = entries.length - 1) {
    setupMocks({ providers: [] });
    return render(
      <MemoryRouter initialEntries={entries} initialIndex={index}>
        <Providers />
        <UrlProbe />
      </MemoryRouter>,
    );
  }
  const urlSearch = () => screen.getByTestId('url-search').textContent;

  it('takes the search from a same-page link instead of writing the old one back', async () => {
    renderWithProbe(['/Providers?q=cardio']);
    fireEvent.click(screen.getByRole('button', { name: 'open ortho link' }));
    expect(urlSearch()).toBe('?q=ortho');
    await settleDebounce();
    expect(urlSearch()).toBe('?q=ortho');
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveValue('ortho');
  });

  it('takes the search from Back', async () => {
    renderWithProbe(['/Providers?q=cardio', '/Providers?q=ortho']);
    fireEvent.click(screen.getByRole('button', { name: 'go back' }));
    expect(urlSearch()).toBe('?q=cardio');
    await settleDebounce();
    expect(urlSearch()).toBe('?q=cardio');
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveValue('cardio');
  });

  it('writes a typed search to the URL once typing settles', async () => {
    renderWithProbe(['/Providers']);
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: ' neuro ' } });
    expect(urlSearch()).toBe('');
    await settleDebounce();
    expect(urlSearch()).toBe('?q=neuro');
  });
});

describe('Providers page – row selection labels', () => {
  it('names each checkbox after the provider, or its NPI when the name is missing', () => {
    setupMocks({
      providers: [
        makeIndividual('3333333333', 'Ann', 'Lee'),
        makeIndividual('4444444444', null, null),
        makeOrg('5555555555', null),
      ],
    });
    renderProviders();
    expect(screen.getByRole('checkbox', { name: 'Select Ann Lee' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select NPI 4444444444' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select NPI 5555555555' })).toBeInTheDocument();
  });
});

describe('Providers page – server search results', () => {
  it("keeps the server's matches instead of re-filtering them in the browser", () => {
    // "John Smith" matches no single name column, and the provider's PA
    // location isn't among the capped locations loaded for the page.
    setupMocks({ providers: [makeIndividual('6666666666', 'John', 'Smith')], locations: [] });
    renderProviders('/Providers?q=john%20smith&state=PA');
    expect(screen.getByText('Smith, John')).toBeInTheDocument();
  });

  it('offers every state while searching, not just those among the loaded locations', () => {
    const locations = [{ npi: '6666666666', state: 'PA', location_type: 'Practice' }];
    setupMocks({ providers: [makeIndividual('6666666666', 'John', 'Smith')], locations });
    renderProviders('/Providers?q=smith');
    const searching = applied.stateOptions.map((o) => o.value);
    expect(searching).toContain('WY');
    expect(searching).toHaveLength(US_STATES.length);
    cleanup();

    // The newest-providers view filters the loaded rows, so it offers their states.
    renderProviders('/Providers');
    expect(applied.stateOptions).toEqual([{ value: 'PA', label: 'PA' }]);
  });
});
