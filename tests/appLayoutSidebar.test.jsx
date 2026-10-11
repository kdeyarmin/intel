// @vitest-environment jsdom
/**
 * A closed sidebar stays mounted (it animates to zero width), so it must be
 * inert: its links and buttons can't be tabbed to or read out, at any width.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

afterEach(cleanup);

vi.mock('@/lib/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, email: 'rep@example.com', role: 'user' }, logout: () => {} }),
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
  render(
    <MemoryRouter initialEntries={['/Dashboard']}>
      <AppLayout currentPageName="Dashboard"><p>page</p></AppLayout>
    </MemoryRouter>,
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
