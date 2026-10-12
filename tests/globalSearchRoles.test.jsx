// @vitest-environment jsdom
/**
 * The pages the search offers are the ones the session may open. An owner and a platform admin are made on the
 * server (orgRole, isPlatformAdmin) while user.role stays "user", so a promotion has to reach the list.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const h = vi.hoisted(() => ({ user: { role: 'user', orgRole: 'member' } }));

vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('@/api/base44Client', () => ({
  base44: {
    functions: { invoke: () => Promise.resolve({ data: { providers: [] } }) },
    entities: new Proxy({}, { get: () => ({ filter: () => Promise.resolve([]), list: () => Promise.resolve([]) }) }),
  },
}));
vi.mock('@/pages.config.js', () => ({
  pagesConfig: { Pages: { Dashboard: () => null, Providers: () => null }, preloadPage: () => {} },
}));

import GlobalSearchDialog from '../src/components/search/GlobalSearchDialog';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const dialog = () => (
  <QueryClientProvider client={client}>
    <MemoryRouter><GlobalSearchDialog open onOpenChange={() => {}} /></MemoryRouter>
  </QueryClientProvider>
);

describe('the pages global search offers', () => {
  it('follow the role the session acts with, without a reload, when the account is promoted', () => {
    h.user = { role: 'user', orgRole: 'member' };
    const view = render(dialog());
    fireEvent.change(screen.getByRole('combobox', { name: 'Search' }), { target: { value: 'campaigns' } });
    // Campaigns is an owner's page: a member isn't offered it.
    expect(screen.queryByRole('option', { name: /Campaigns/ })).toBeNull();

    // Made an owner: user.role is still "user", the organization role changed.
    h.user = { role: 'user', orgRole: 'owner' };
    view.rerender(dialog());
    expect(screen.getByRole('option', { name: /Campaigns/ })).toBeInTheDocument();

    // And back to a member: the page goes away again.
    h.user = { role: 'user', orgRole: 'member' };
    view.rerender(dialog());
    expect(screen.queryByRole('option', { name: /Campaigns/ })).toBeNull();
  });

  it('offers a platform admin the platform pages though user.role says "user"', () => {
    h.user = { role: 'user', orgRole: 'member' };
    const view = render(dialog());
    fireEvent.change(screen.getByRole('combobox', { name: 'Search' }), { target: { value: 'data center' } });
    expect(screen.queryByRole('option', { name: /Data Center/ })).toBeNull();
    h.user = { role: 'user', orgRole: 'member', isPlatformAdmin: true };
    view.rerender(dialog());
    expect(screen.getByRole('option', { name: /Data Center/ })).toBeInTheDocument();
  });
});
