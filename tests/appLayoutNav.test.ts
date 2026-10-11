/**
 * Navigation structure, page access and legacy redirects
 * (src/components/layout/navConfig.js, shared by the sidebar, the route guard
 * and global search).
 *
 * The sidebar has five sections and 23 entries. Related pages share one entry
 * and a tab strip (PAGE_GROUPS); merged or renamed pages redirect
 * (LEGACY_REDIRECTS).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  FACILITY_TYPES,
  LEGACY_REDIRECTS,
  NAV_SECTIONS,
  PAGE_GROUPS,
  SECONDARY_PAGES,
  canAccessPage,
  getNavPageFor,
  getPageGroup,
  getVisibleNavSections,
  resolveLegacyRedirect,
} from '../src/components/layout/navConfig';

const allItems = NAV_SECTIONS.flatMap((s) => s.items);
const navPages = new Set(allItems.map((i) => i.page));

function registeredPageKeys(): string[] {
  const src = readFileSync(fileURLToPath(new URL('../src/pages.config.js', import.meta.url)), 'utf8');
  const block = src.slice(src.indexOf('export const PAGE_LOADERS = {'));
  const body = block.slice(0, block.indexOf('};'));
  return [...body.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
}

function pageFiles(): string[] {
  return readdirSync(fileURLToPath(new URL('../src/pages', import.meta.url)))
    .filter((f) => f.endsWith('.jsx'))
    .map((f) => f.replace(/\.jsx$/, ''));
}

const pages = new Set(registeredPageKeys());

describe('sidebar', () => {
  it('has five sections and at most 23 entries, each page once', () => {
    expect(NAV_SECTIONS.map((s) => s.label)).toEqual(['Overview', 'Directory', 'Analytics', 'Sales & Outreach', 'Administration']);
    expect(allItems.length).toBeLessThanOrEqual(23);
    expect(navPages.size).toBe(allItems.length);
  });

  it('shows regular users the everyday pages only', () => {
    const userPages = getVisibleNavSections('user').flatMap((s) => s.items.map((i) => i.page));
    expect(userPages).toEqual([
      'Dashboard', 'AIAssistant', 'Help',
      'Providers', 'Organizations', 'Locations', 'Facilities',
      'AdvancedAnalytics', 'CMSAnalytics', 'Utilization', 'ReferralNetworkIntelligence', 'TerritoryIntelligence', 'CustomReports',
      'LeadLists',
    ]);
    expect(getVisibleNavSections('user').map((s) => s.label)).not.toContain('Administration');
  });

  it('keeps every Administration entry admin-only', () => {
    for (const item of NAV_SECTIONS.find((s) => s.label === 'Administration')!.items) {
      expect(item.roles).toEqual(['admin']);
    }
  });
});

describe('page inventory', () => {
  it('pages.config.js registers exactly the page files (Login is routed directly)', () => {
    expect([...pages].sort()).toEqual(pageFiles().filter((p) => p !== 'Login').sort());
  });

  it('every nav, secondary and grouped page exists', () => {
    for (const page of navPages) expect(pages.has(page), page).toBe(true);
    for (const [page, parent] of Object.entries(SECONDARY_PAGES)) {
      expect(pages.has(page), page).toBe(true);
      expect(navPages.has(parent), parent).toBe(true);
    }
    for (const group of Object.values(PAGE_GROUPS)) {
      expect(navPages.has(group.pages[0].page), group.label).toBe(true);
      for (const { page } of group.pages) expect(pages.has(page), page).toBe(true);
    }
  });

  it('has no orphan pages: every page is in the sidebar or belongs to one', () => {
    const orphans = [...pages].filter((p) => !navPages.has(p) && !(p in SECONDARY_PAGES));
    expect(orphans).toEqual([]);
  });

  it('each page is in at most one tab group', () => {
    const seen = Object.values(PAGE_GROUPS).flatMap((g) => g.pages.map((p) => p.page));
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('legacy redirects', () => {
  it('never shadow a real page and always land on one', () => {
    for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
      expect(pages.has(from), from).toBe(false);
      expect(pages.has(to.page), to.page).toBe(true);
    }
  });

  it('send every old facility page to Facilities with its type', () => {
    for (const { type, legacyPage } of FACILITY_TYPES) {
      expect(resolveLegacyRedirect(legacyPage)).toBe(`/Facilities?type=${type}`);
    }
  });

  it('keep other query parameters, and the target view wins over the same key', () => {
    expect(resolveLegacyRedirect('NursingHomes', '?state=OH&q=mercy&page=2&type=bogus'))
      .toBe('/Facilities?state=OH&q=mercy&page=2&type=snf');
    expect(resolveLegacyRedirect('OrganizationDetail', '?npi=1234567890')).toBe('/ProviderDetail?npi=1234567890');
    expect(resolveLegacyRedirect('EmailSearchBot', '')).toBe('/ProviderIntelligence?tab=email');
    expect(resolveLegacyRedirect('Campaigns', '?leadList=4')).toBe('/ProviderOutreach?leadList=4');
    expect(resolveLegacyRedirect('Providers', '?q=x')).toBeNull();
  });
});

describe('page access', () => {
  it('admins can open every page', () => {
    for (const key of pages) expect(canAccessPage(key, 'admin')).toBe(true);
  });

  it('grouped, detail and legacy pages inherit their nav entry’s rule', () => {
    expect(canAccessPage('CountyIntelligence', 'user')).toBe(true);
    expect(canAccessPage('DMEProviderReport', 'user')).toBe(true);
    expect(canAccessPage('FacilityDetail', 'user')).toBe(true);
    expect(canAccessPage('Hospitals', 'user')).toBe(true);
    expect(canAccessPage('OrganizationDetail', 'user')).toBe(true);
    expect(canAccessPage('ImportMonitoring', 'user')).toBe(false);
    expect(canAccessPage('CMSDataSources', 'user')).toBe(false);
    expect(canAccessPage('NPPESCrawlerSettings', 'user')).toBe(false);
    expect(canAccessPage('ScoringRules', 'user')).toBe(false);
    expect(canAccessPage('SecurityAudit', 'user')).toBe(false);
    expect(canAccessPage('Campaigns', 'user')).toBe(false);
    expect(canAccessPage('EnrichmentHub', 'user')).toBe(false);
  });

  it('treats unknown roles as regular users and unknown pages as admin-only', () => {
    expect(canAccessPage('ImportMonitoring', undefined)).toBe(false);
    expect(canAccessPage('Providers', 'viewer')).toBe(true);
    expect(canAccessPage('NotARealPage', 'user')).toBe(false);
    expect(canAccessPage('NotARealPage', 'admin')).toBe(true);
  });

  it('highlights the nav entry a page belongs to', () => {
    expect(getNavPageFor('ProviderDetail')).toBe('Providers');
    expect(getNavPageFor('FacilityDetail')).toBe('Facilities');
    expect(getNavPageFor('CountyIntelligence')).toBe('TerritoryIntelligence');
    expect(getNavPageFor('ImportMonitoring')).toBe('DataCenter');
    expect(getNavPageFor('SecurityAudit')).toBe('AdminSettings');
    expect(getNavPageFor('Hospices')).toBe('Facilities');
    expect(getNavPageFor('Providers')).toBe('Providers');
    expect(getPageGroup('NPPESCrawlerSettings')?.pages.map((p) => p.page)).toEqual(['NPPESCrawler', 'NPPESCrawlerSettings']);
    expect(getPageGroup('Providers')).toBeNull();
  });
});
