// @vitest-environment jsdom
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

describe('AffiliatedProvidersCard', () => {
  // ─── null / empty-state cases ─────────────────────────────────────────────

  it('renders nothing when no locations are provided', () => {
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

  it('renders nothing when matching providers are not Individual entity_type', () => {
    const orgProvider = makeProvider('2222222222', { entity_type: 'Organization', organization_name: 'Clinic Co' });
    const { container } = renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: [orgProvider],
      allLocations: [makeLocation('2222222222', '100 Main St', 'Boston', 'MA')],
    });
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when all own locations have a blank address_1', () => {
    const { container } = renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '', 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222')],
      allLocations: [makeLocation('2222222222', '', 'Boston', 'MA')],
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
    // The badge text is the count
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  // ─── address matching logic ────────────────────────────────────────────────

  it('matches on full address_1 + city + state key (not just city/state)', () => {
    // Different street address in same city/state should NOT match
    const { container } = renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '100 Main St', 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222')],
      allLocations: [makeLocation('2222222222', '999 Other Rd', 'Boston', 'MA')],
    });
    expect(container.firstChild).toBeNull();
  });

  it('does not include the organization itself as an affiliated provider', () => {
    // Give the org its own entry in allProviders+allLocations as an Individual
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
    // Only the other provider should appear, not the org itself
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

  it('does not spuriously match when org locations all have blank address_1 even if others also blank', () => {
    // Both have blank address — should not match (guard against blank-address pollution)
    const { container } = renderCard({
      npi: ORG_NPI,
      locations: [makeLocation(ORG_NPI, '', 'Boston', 'MA'), makeLocation(ORG_NPI, null, 'Boston', 'MA')],
      allProviders: [makeProvider('2222222222')],
      allLocations: [makeLocation('2222222222', '', 'Boston', 'MA')],
    });
    expect(container.firstChild).toBeNull();
  });

  // ─── View link uses ProviderDetail URL ─────────────────────────────────────

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

  // ─── status badge styling ─────────────────────────────────────────────────

  it('renders the provider status text in the table', () => {
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

  // ─── default prop behaviour ───────────────────────────────────────────────

  it('renders nothing with all default empty-array props (no crash)', () => {
    const { container } = renderCard({ npi: ORG_NPI });
    expect(container.firstChild).toBeNull();
  });
});