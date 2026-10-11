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
  effectiveRole,
  roleLabel,
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

  it('keeps every Administration entry admin-only, except Admin Settings which an organization’s owner opens too', () => {
    for (const item of NAV_SECTIONS.find((s) => s.label === 'Administration')!.items) {
      expect(item.roles, item.page).toEqual(item.page === 'AdminSettings' ? ['admin', 'owner'] : ['admin']);
    }
  });

  it('shows an organization’s owner everything a member sees, plus campaigns and Admin Settings', () => {
    const ownerPages = getVisibleNavSections('owner').flatMap((s) => s.items.map((i) => i.page));
    const userPages = getVisibleNavSections('user').flatMap((s) => s.items.map((i) => i.page));
    // An owner is a member of their organization first: the dashboard, directory and analytics are theirs too.
    expect(userPages.filter((p) => !ownerPages.includes(p))).toEqual([]);
    expect(ownerPages.filter((p) => !userPages.includes(p))).toEqual(['ProviderOutreach', 'AdminSettings']);
    // …but not the platform's own pages.
    for (const page of ['ProviderIntelligence', 'DataCenter', 'APIConnectors', 'NPPESCrawler', 'DataQuality']) expect(ownerPages).not.toContain(page);
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
    for (const { type, legacyPage } of FACILITY_TYPES.filter((t) => t.legacyPage)) {
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
    expect(canAccessPage('NotARealPage', 'owner')).toBe(false);
  });

  it('reads the role from a session user: platform admins, organization owners, everyone else', () => {
    expect(effectiveRole({ role: 'user', orgRole: 'member' })).toBe('user');
    expect(effectiveRole({ role: 'user', orgRole: 'owner' })).toBe('owner');
    expect(effectiveRole({ role: 'user', orgRole: 'member', isPlatformAdmin: true })).toBe('admin');
    expect(effectiveRole({ role: 'admin' })).toBe('admin');
    expect(effectiveRole(null)).toBe('user');
    expect(effectiveRole('owner')).toBe('owner');
    const owner = { role: 'user', orgRole: 'owner' };
    expect(canAccessPage('Billing', owner)).toBe(true);
    expect(canAccessPage('AdminSettings', owner)).toBe(true);
    expect(canAccessPage('ProviderOutreach', owner)).toBe(true);
    expect(canAccessPage('DataCenter', owner)).toBe(false);
    expect(canAccessPage('ProviderIntelligence', owner)).toBe(false);
    expect(canAccessPage('Billing', { role: 'user', orgRole: 'member' })).toBe(false);
  });

  it('names the role a session acts with', () => {
    expect(roleLabel({ role: 'user', orgRole: 'member' })).toBe('Member');
    expect(roleLabel({ role: 'user', orgRole: 'owner' })).toBe('Owner');
    expect(roleLabel({ role: 'admin', orgRole: 'owner' })).toBe('Platform admin');
    expect(roleLabel({ role: 'user', isPlatformAdmin: true })).toBe('Platform admin');
    expect(roleLabel(null)).toBe('Member');
    expect(roleLabel('owner')).toBe('Owner');
  });

  it('lets an owner open every page a member can (an owner is a member of their organization)', () => {
    const owner = { role: 'user', orgRole: 'owner' };
    const member = { role: 'user', orgRole: 'member' };
    const memberPages = [...pages].filter((key) => canAccessPage(key, member));
    expect(memberPages.length).toBeGreaterThan(10);
    for (const key of memberPages) expect(canAccessPage(key, owner), key).toBe(true);
    // The route guard hands the guard the session user, so a server-side owner is not locked out of Dashboard.
    expect(canAccessPage('Dashboard', owner)).toBe(true);
    expect(canAccessPage('Providers', owner)).toBe(true);
    expect(canAccessPage('TerritoryIntelligence', owner)).toBe(true);
    expect(canAccessPage('MarketIntelligence', owner)).toBe(true);
  });

  it('applies the roles a tab names for itself: scoring rules are platform configuration, not an owner’s', () => {
    const admin = { role: 'admin' };
    const owner = { role: 'user', orgRole: 'owner' };
    const member = { role: 'user', orgRole: 'member' };
    expect(canAccessPage('ScoringRules', admin)).toBe(true);
    expect(canAccessPage('ScoringRules', owner)).toBe(false);
    expect(canAccessPage('ScoringRules', member)).toBe(false);
    for (const page of ['Billing', 'SecurityAudit']) {
      expect(canAccessPage(page, admin), page).toBe(true);
      expect(canAccessPage(page, owner), page).toBe(true);
      expect(canAccessPage(page, member), page).toBe(false);
    }
    // A tab with no roles of its own follows its group's first page.
    expect(canAccessPage('AdminSettings', owner)).toBe(true);
    expect(canAccessPage('AdminSettings', member)).toBe(false);
    for (const group of Object.values(PAGE_GROUPS)) {
      for (const tab of group.pages) {
        // A tab never opens to someone its group's own entry closes to, unless it says so on purpose.
        if (!(tab as { roles?: string[] }).roles) expect(canAccessPage(tab.page, member), tab.page).toBe(canAccessPage(group.pages[0].page, member));
      }
    }
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
