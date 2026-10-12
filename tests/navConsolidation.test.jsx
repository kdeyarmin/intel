// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

afterEach(cleanup);

const { auth } = vi.hoisted(() => ({ auth: { value: { user: { role: 'user' } } } }));
vi.mock('@/lib/AuthContext', () => ({ useOptionalAuth: () => auth.value }));
vi.mock('@/components/facilities/FacilityListPage', () => ({
  default: ({ facilityGroup, title }) => <div data-testid="list">{facilityGroup}:{title}</div>,
}));

import PageTabs from '../src/components/layout/PageTabs';
import Facilities from '../src/pages/Facilities';

function Probe() {
  const { pathname, search } = useLocation();
  return <output data-testid="url">{pathname + search}</output>;
}

function renderAt(path, element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="*" element={<>{element}<Probe /></>} /></Routes>
    </MemoryRouter>,
  );
}

describe('PageTabs', () => {
  it('links the pages of a group and marks the current one', () => {
    renderAt('/CountyIntelligence', <PageTabs current="CountyIntelligence" />);
    const nav = screen.getByRole('navigation', { name: 'Territory views' });
    expect(within(nav).getByRole('link', { name: 'Territory map' })).toHaveAttribute('href', '/TerritoryIntelligence');
    expect(within(nav).getByRole('link', { name: 'County' })).toHaveAttribute('aria-current', 'page');
  });

  it("hides tabs the user can't open, and the strip when one tab is left", () => {
    auth.value = { user: { role: 'user' } };
    const { container } = renderAt('/ImportMonitoring', <PageTabs current="ImportMonitoring" />);
    expect(container.querySelector('nav')).toBeNull();
    cleanup();
    auth.value = { user: { role: 'admin' } };
    renderAt('/ImportMonitoring', <PageTabs current="ImportMonitoring" />);
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Import', 'Dataset catalog', 'Import monitor']);
  });

  it('renders nothing for pages outside a group', () => {
    const { container } = renderAt('/Providers', <PageTabs current="Providers" />);
    expect(container.querySelector('nav')).toBeNull();
  });

  it("shows an organization's owner the admin tabs that are theirs, and a platform admin all of them", () => {
    auth.value = { user: { role: 'user', orgRole: 'owner' } };
    renderAt('/Billing', <PageTabs current="Billing" />);
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Users', 'Billing', 'Security audit']);
    cleanup();
    auth.value = { user: { role: 'admin' } };
    renderAt('/Billing', <PageTabs current="Billing" />);
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Users', 'Billing', 'Scoring rules', 'Security audit']);
    cleanup();
    auth.value = { user: { role: 'user', orgRole: 'member' } };
    const { container } = renderAt('/Billing', <PageTabs current="Billing" />);
    expect(container.querySelector('nav')).toBeNull();
    auth.value = { user: { role: 'user' } };
  });
});

describe('Facilities', () => {
  it('lists the type from the URL and starts a new type on page 1', () => {
    auth.value = { user: { role: 'user' } };
    renderAt('/Facilities?type=hospice&page=4&state=PA', <Facilities />);
    expect(screen.getByTestId('list')).toHaveTextContent('hospice:Hospices');
    expect(screen.getByRole('button', { name: 'Hospice' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Nursing Homes' }));
    expect(screen.getByTestId('list')).toHaveTextContent('snf:Nursing Homes & SNFs');
    const url = new URL(`http://x${screen.getByTestId('url').textContent}`);
    expect(url.searchParams.get('type')).toBe('snf');
    expect(url.searchParams.get('page')).toBeNull();
    expect(url.searchParams.get('state')).toBe('PA');
  });

  it('falls back to hospitals for an unknown type', () => {
    renderAt('/Facilities?type=spaceport', <Facilities />);
    expect(screen.getByTestId('list')).toHaveTextContent('hospital:Hospitals');
  });

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'falls back to hospitals for ?type=%s instead of an inherited property',
    (type) => {
      renderAt(`/Facilities?type=${type}`, <Facilities />);
      expect(screen.getByTestId('list')).toHaveTextContent('hospital:Hospitals');
      expect(screen.getByRole('button', { name: 'Hospitals' })).toHaveAttribute('aria-pressed', 'true');
    },
  );
});
