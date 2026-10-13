// @vitest-environment jsdom
/**
 * The Help page: every topic points at a page that exists, search opens the
 * matching topics, and a topic links to its page only when the reader may
 * open it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';
import { LEGACY_REDIRECTS } from '../src/components/layout/navConfig';
import { extractGuideSections } from '../scripts/generate-help-inventory.mjs';

afterEach(cleanup);

const { auth } = vi.hoisted(() => ({ auth: { value: { user: { role: 'user' } } } }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => auth.value, useOptionalAuth: () => auth.value }));

import Help from '../src/pages/Help';

const helpSource = fs.readFileSync(path.resolve(__dirname, '../src/pages/Help.jsx'), 'utf8');
const guideBlock = helpSource.slice(helpSource.indexOf('const GUIDE_SECTIONS = ['), helpSource.indexOf('\n];', helpSource.indexOf('const GUIDE_SECTIONS = [')));

function renderHelp(role) {
  auth.value = { user: { role } };
  return render(<MemoryRouter><Help /></MemoryRouter>);
}

describe('guide content', () => {
  it('gives every topic a page that exists and is not an old redirected URL', () => {
    const topicCount = extractGuideSections(helpSource).reduce((n, s) => n + s.topics.length, 0);
    const pages = [...guideBlock.matchAll(/\bpage: '([A-Za-z]+)'/g)].map((m) => m[1]);
    expect(pages).toHaveLength(topicCount);
    for (const page of pages) {
      expect(fs.existsSync(path.resolve(__dirname, `../src/pages/${page}.jsx`)), page).toBe(true);
      expect(LEGACY_REDIRECTS[page], page).toBeUndefined();
    }
  });

  it('no longer promises features the app does not have', () => {
    for (const claim of [/Sales Rep/i, /dry[- ]run/i, /Enrichment Hub/i, /cleaning rules/i]) {
      expect(guideBlock).not.toMatch(claim);
    }
  });

  it('documents radius search as approximate ZIP-center distances with capped provider results', () => {
    expect(guideBlock).toMatch(/ZIP radius search/);
    expect(guideBlock).toMatch(/5, 10, 25 or 50 miles/);
    expect(guideBlock).toMatch(/not street-address or driving distances/);
    expect(guideBlock).toMatch(/Provider results are capped at 300/);
  });
});

describe('Help page', () => {
  it('search opens the sections with matching topics and hides the rest', () => {
    renderHelp('user');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search help topics' }), { target: { value: 'unsubscribe' } });
    const toggles = screen.getAllByRole('button', { expanded: true });
    expect(toggles).toHaveLength(1);
    expect(toggles[0]).toHaveTextContent('Lead Lists & Outreach');
    expect(toggles[0]).toHaveTextContent('1 of 5 topics');
    expect(screen.getByRole('heading', { level: 3, name: 'Campaigns (owners)' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Lead lists' })).not.toBeInTheDocument();
    // Search keeps matching sections open, so the open/close controls are off.
    expect(toggles[0]).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Collapse All' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Expand All' })).toBeDisabled();
  });

  it('links topics to their pages, but not to pages the reader cannot open', () => {
    renderHelp('user');
    fireEvent.click(screen.getByRole('button', { name: 'Expand All' }));
    expect(screen.getAllByRole('link', { name: 'Go to Lead Lists' })[0]).toHaveAttribute('href', '/LeadLists');
    expect(screen.getAllByRole('link', { name: 'Go to Territory & County › County' })[0]).toHaveAttribute('href', '/CountyIntelligence');
    expect(screen.queryByRole('link', { name: /Go to Campaigns/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Go to Data Center/ })).not.toBeInTheDocument();
  });

  it('shows admins the links to admin pages', () => {
    renderHelp('admin');
    const admin = screen.getByRole('button', { name: /Administration/ });
    fireEvent.click(admin);
    const section = document.getElementById('admin');
    expect(within(section).getByRole('link', { name: 'Go to Admin Settings › Scoring rules' })).toHaveAttribute('href', '/ScoringRules');
  });
});

describe('topic text', () => {
  it('renders "• item" lines as a list', () => {
    renderHelp('user');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search help topics' }), { target: { value: 'Summarize Franklin' } });
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[1]).toHaveTextContent('"Summarize Franklin County, OH."');
  });
});
