// @vitest-environment jsdom
/**
 * Tests for OrgAffiliatedProvidersCard reflecting the PR change that removed
 * the blank-address guard.
 *
 * OLD behaviour (before this PR):
 *   - Org locations with a blank address_1 were filtered out of orgAddresses.
 *   - If all org locations had blank address_1, affiliatedNPIs returned [] immediately.
 *   - Matching used Set.has().
 *
 * NEW behaviour (this PR):
 *   - ALL org locations are included (no address_1 filter).
 *   - Blank org addresses DO match other providers with blank address_1.
 *   - Matching uses Array.includes().
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OrgAffiliatedProvidersCard from '@/components/providers/OrgAffiliatedProvidersCard';

afterEach(cleanup);

const ORG_NPI = '1111111111';

const makeLocation = (npi, address_1, city, state) => ({ npi, address_1, city, state });
const makeProvider = (npi, overrides = {}) => ({
  id: npi,
  npi,
  first_name: 'Jane',
  last_name: 'Smith',
  entity_type: 'Individual',
  status: 'Active',
  credential: 'MD',
  ...overrides,
});

function renderCard(props) {
  return render(
    <MemoryRouter>
      <OrgAffiliatedProvidersCard {...props} />
    </MemoryRouter>,
  );
}

describe('OrgAffiliatedProvidersCard', () => {
  // ─── null / empty-state cases ─────────────────────────────────────────────

  it('renders nothing when locations is empty', () => {
    const { container } = renderCard({
      npi: ORG_NPI,
      locations: [],
      allProviders: [makeProvider('2222222222')],
      allLocations: [makeLocation('2222222222', '100 Main St', 'Boston', 'MA')],
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when allLocations is empty', () => {
    const { container } = renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222')],
      allLocations: [],
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no other providers share the address', () => {
    const { container } = renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222')],
      allLocations: [makeLocation('2222222222', '200 Other Ave', 'Boston', 'MA')],
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when allProviders is empty', () => {
    const { container } = renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: [],
      allLocations: [makeLocation('2222222222', '100 Main St', 'Boston', 'MA')],
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing with default empty-array props (no crash)', () => {
    const { container } = renderCard({ npi: ORG_NPI });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when matching providers are not Individual entity_type', () => {
    const orgProvider = makeProvider('2222222222', {
      entity_type: 'Organization',
      organization_name: 'Clinic Co',
    });
    const { container } = renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: [orgProvider],
      allLocations: [makeLocation('2222222222', '100 Main St', 'Boston', 'MA')],
    });
    expect(container.firstChild).toBeNull();
  });

  // ─── basic rendering ───────────────────────────────────────────────────────

  it('renders the "Affiliated Providers" heading when matches exist', () => {
    renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222')],
      allLocations: [makeLocation('2222222222', '100 Main St', 'Boston', 'MA')],
    });
    expect(screen.getByText('Affiliated Providers')).toBeInTheDocument();
  });

  it('shows provider name, NPI, and credential in the table', () => {
    renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222', { first_name: 'Alice', last_name: 'Brown', credential: 'DO' })],
      allLocations: [makeLocation('2222222222', '100 Main St', 'Boston', 'MA')],
    });
    expect(screen.getByText('2222222222')).toBeInTheDocument();
    expect(screen.getByText('Brown, Alice')).toBeInTheDocument();
    expect(screen.getByText('DO')).toBeInTheDocument();
  });

  it('shows "-" in the credential column when credential is absent', () => {
    renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222', { credential: '' })],
      allLocations: [makeLocation('2222222222', '100 Main St', 'Boston', 'MA')],
    });
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('displays a count badge equal to the number of affiliated providers', () => {
    const providers = [
      makeProvider('2222222222', { first_name: 'Alice', last_name: 'A' }),
      makeProvider('3333333333', { first_name: 'Bob', last_name: 'B' }),
    ];
    const allLocations = [
      makeLocation('2222222222', '100 Main St', 'Boston', 'MA'),
      makeLocation('3333333333', '100 Main St', 'Boston', 'MA'),
    ];
    renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: providers,
      allLocations,
    });
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  // ─── address matching logic ────────────────────────────────────────────────

  it('matches on full address_1 + city + state key (not just city/state)', () => {
    const { container } = renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222')],
      allLocations: [makeLocation('2222222222', '999 Other Rd', 'Boston', 'MA')],
    });
    expect(container.firstChild).toBeNull();
  });

  it('does not include the organization NPI itself as an affiliated provider', () => {
    const selfProvider = makeProvider(ORG_NPI, { first_name: 'Self', last_name: 'Org' });
    renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: [selfProvider, makeProvider('2222222222', { first_name: 'Other', last_name: 'Doc' })],
      allLocations: [
        makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA'),
        makeLocation('2222222222', '100 Main St', 'Boston', 'MA'),
      ],
    });
    expect(screen.queryByText('Org, Self')).toBeNull();
    expect(screen.getByText('Doc, Other')).toBeInTheDocument();
  });

  it('matches providers across multiple org locations', () => {
    const providers = [
      makeProvider('2222222222', { first_name: 'Alice', last_name: 'A' }),
      makeProvider('3333333333', { first_name: 'Bob', last_name: 'B' }),
    ];
    const allLocations = [
      makeLocation('2222222222', '100 Main St', 'Boston', 'MA'),
      makeLocation('3333333333', '200 Second Ave', 'Cambridge', 'MA'),
    ];
    renderCard({
      npi: ORG_NPI,
      locations: [
        makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA'),
        makeLocation(ORG_NPI, '200 Second Ave', 'Cambridge', 'MA'),
      ],
      allProviders: providers,
      allLocations,
    });
    expect(screen.getByText('A, Alice')).toBeInTheDocument();
    expect(screen.getByText('B, Bob')).toBeInTheDocument();
  });

  // ─── NEW blank-address behaviour (PR change) ───────────────────────────────

  it('blank org address_1 matches a provider that also has a blank address_1 (guard removed)', () => {
    // PR removed the filter that excluded blank addresses.
    // A blank address on both sides now produces the key "|Boston|MA" which matches.
    renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '', 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222')],
      allLocations: [makeLocation('2222222222', '', 'Boston', 'MA')],
    });
    expect(screen.getByText('Affiliated Providers')).toBeInTheDocument();
    expect(screen.getByText('2222222222')).toBeInTheDocument();
  });

  it('blank org address_1 does NOT match a provider at a real address in the same city/state', () => {
    // The blank address_1 key is "|Boston|MA"; a real address produces "100 Main St|Boston|MA".
    const { container } = renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '', 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222')],
      allLocations: [makeLocation('2222222222', '100 Main St', 'Boston', 'MA')],
    });
    expect(container.firstChild).toBeNull();
  });

  it('null address_1 is treated the same as blank (both yield "null|city|state" key pattern)', () => {
    // Both sides have null address_1, so keys are identical and they match.
    renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, null, 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222')],
      allLocations: [makeLocation('2222222222', null, 'Boston', 'MA')],
    });
    expect(screen.getByText('Affiliated Providers')).toBeInTheDocument();
  });

  it('real-address org does not match a blank-address provider', () => {
    const { container } = renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222')],
      allLocations: [makeLocation('2222222222', '', 'Boston', 'MA')],
    });
    expect(container.firstChild).toBeNull();
  });

  // ─── View link ─────────────────────────────────────────────────────────────

  it('each provider row has a "View" link pointing to ProviderDetail', () => {
    renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222')],
      allLocations: [makeLocation('2222222222', '100 Main St', 'Boston', 'MA')],
    });
    const viewLink = screen.getByRole('link', { name: /view/i });
    expect(viewLink.getAttribute('href')).toBe('/ProviderDetail?npi=2222222222');
  });

  it('View link does NOT point to OrganizationDetail', () => {
    renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222')],
      allLocations: [makeLocation('2222222222', '100 Main St', 'Boston', 'MA')],
    });
    const viewLink = screen.getByRole('link', { name: /view/i });
    expect(viewLink.getAttribute('href')).not.toContain('OrganizationDetail');
  });

  // ─── 50-provider cap ──────────────────────────────────────────────────────

  it('renders at most 50 rows even when more than 50 affiliates exist', () => {
    const manyProviders = Array.from({ length: 60 }, (_, i) => {
      const npi = String(2000000000 + i);
      return makeProvider(npi, { first_name: 'Doc', last_name: `${i}` });
    });
    const manyLocations = manyProviders.map(p =>
      makeLocation(p.npi, '100 Main St', 'Boston', 'MA'),
    );
    renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: manyProviders,
      allLocations: manyLocations,
    });
    const viewLinks = screen.getAllByRole('link', { name: /view/i });
    expect(viewLinks).toHaveLength(50);
  });

  // ─── status badge ─────────────────────────────────────────────────────────

  it('renders the provider status text (Active) in the table', () => {
    renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222', { status: 'Active' })],
      allLocations: [makeLocation('2222222222', '100 Main St', 'Boston', 'MA')],
    });
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders a deactivated provider status correctly', () => {
    renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222', { status: 'Deactivated' })],
      allLocations: [makeLocation('2222222222', '100 Main St', 'Boston', 'MA')],
    });
    expect(screen.getByText('Deactivated')).toBeInTheDocument();
  });
});