// @vitest-environment jsdom
/**
 * A closed sidebar stays mounted (it animates to zero width), so it must be
 * inert: its links and buttons can't be tabbed to or read out, at any width.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CAREMETRIC_LOGO_URL } from '../src/lib/branding';

afterEach(cleanup);

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, email: 'rep@example.com', role: 'user', orgId: 2 }, logout: () => {} }),
}));
vi.mock('@/pages.config.js', () => ({ pagesConfig: { preloadPage: () => {} } }));
vi.mock('../src/components/shared/NotificationBell', () => ({ default: () => null }));

import AppLayout from '../src/components/layout/AppLayout';

function setWidth(width) {
  window.innerWidth = width;
  window.matchMedia = (query) => ({
    matches: /min-width: 1024px/.test(query) ? width >= 1024 : false,
    media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
}

function renderLayout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/Dashboard']}>
        <AppLayout currentPageName="Dashboard"><p>page</p></AppLayout>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return screen.getByRole('complementary', { name: 'Sidebar', hidden: true });
}

beforeEach(() => {
  // jsdom doesn't implement scrolling.
  Element.prototype.scrollTo = () => {};
  window.scrollTo = () => {};
  localStorage.clear();
});

describe('closed sidebar', () => {
  it('starts closed and inert on a small screen, and is usable once opened', () => {
    setWidth(500);
    const aside = renderLayout();
    expect(aside).toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Open sidebar' }));
    expect(aside).not.toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(aside).toHaveAttribute('inert');
  });

  it('is inert when collapsed on a wide screen', () => {
    setWidth(1280);
    const aside = renderLayout();
    expect(aside).not.toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    expect(aside).toHaveAttribute('inert');
  });
});

describe('sidebar footer', () => {
  it('uses the current brand and company logo without requesting billing status', async () => {
    setWidth(1280);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const aside = renderLayout();
    expect(aside).toHaveTextContent('CareMetric Intel');
    expect(screen.getByText('CareMetric Intel')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'caremetricintel.com' })) {
      expect(link).toHaveAttribute('href', 'https://caremetricintel.com/');
    }
    for (const image of document.querySelectorAll('img')) {
      expect(image).toHaveAttribute('src', CAREMETRIC_LOGO_URL);
    }
    expect(document.body).not.toHaveTextContent(/CareMetric\s+AI/);
    expect(document.body).not.toHaveTextContent('AI requests today');
    await Promise.resolve();
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes('/billing/status'))).toBe(false);
    fetchSpy.mockRestore();
  });

  it('names the role the account acts with, not the raw user role', () => {
    setWidth(1280);
    const aside = renderLayout();
    expect(aside).toHaveTextContent('rep@example.com');
    expect(aside).toHaveTextContent('Member');
    expect(aside).not.toHaveTextContent(/\buser\b/);
  });
});
