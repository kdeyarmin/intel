/**
 * Tests for the NAV_SECTIONS structure in AppLayout.jsx
 *
 * PR changes:
 *   - 'Providers' section renamed to 'Directory'
 *   - 'Admin' section split into 'Data Operations' + 'Settings'
 *   - 'Analytics' section now includes Territory Map, County Intel, Referral Network
 *     (previously split between Admin and Providers sections)
 *   - 'Help' item moved from Admin section to Overview section
 *   - 'Organizations' item added to Directory
 *   - 'Provider Matching' item added to Data Operations
 *   - New icons added (Briefcase, Stethoscope, ClipboardCheck)
 *   - Territory Map and County Intel moved out of the old Providers section
 *
 * NAV_SECTIONS lives in src/components/layout/navConfig.js (shared by the
 * sidebar, route guard and global search), so these tests import the real
 * config rather than a hand-kept mirror.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  NAV_SECTIONS,
  SECONDARY_PAGES,
  canAccessPage,
  getNavPageFor,
  getVisibleNavSections,
} from '../src/components/layout/navConfig';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sectionByLabel = (label: string) => NAV_SECTIONS.find(s => s.label === label);
const allItems = NAV_SECTIONS.flatMap(s => s.items);
const itemsByPage = (page: string) => allItems.filter(i => i.page === page);

// ===========================================================================
// Tests
// ===========================================================================

describe('NAV_SECTIONS – section labels', () => {
  it('has exactly 7 top-level sections', () => {
    expect(NAV_SECTIONS).toHaveLength(7);
  });

  it('contains Overview section', () => {
    expect(sectionByLabel('Overview')).toBeDefined();
  });

  it('contains Directory section (renamed from Providers)', () => {
    expect(sectionByLabel('Directory')).toBeDefined();
  });

  it('does NOT have a "Providers" section (renamed to Directory)', () => {
    expect(sectionByLabel('Providers')).toBeUndefined();
  });

  it('contains Facilities section', () => {
    expect(sectionByLabel('Facilities')).toBeDefined();
  });

  it('contains Analytics section', () => {
    expect(sectionByLabel('Analytics')).toBeDefined();
  });

  it('contains Sales & Outreach section', () => {
    expect(sectionByLabel('Sales & Outreach')).toBeDefined();
  });

  it('contains Data Operations section (renamed from Admin)', () => {
    expect(sectionByLabel('Data Operations')).toBeDefined();
  });

  it('does NOT have an "Admin" section (renamed to Data Operations)', () => {
    expect(sectionByLabel('Admin')).toBeUndefined();
  });

  it('contains Settings section (split from old Admin)', () => {
    expect(sectionByLabel('Settings')).toBeDefined();
  });
});

describe('NAV_SECTIONS – Overview section', () => {
  it('contains Help item', () => {
    const overview = sectionByLabel('Overview')!;
    expect(overview.items.some(i => i.page === 'Help')).toBe(true);
  });

  it('contains Dashboard item', () => {
    const overview = sectionByLabel('Overview')!;
    expect(overview.items.some(i => i.page === 'Dashboard')).toBe(true);
  });
});

describe('NAV_SECTIONS – Directory section', () => {
  it('contains All Providers item', () => {
    const dir = sectionByLabel('Directory')!;
    expect(dir.items.some(i => i.page === 'Providers')).toBe(true);
  });

  it('contains Organizations item (newly added)', () => {
    const dir = sectionByLabel('Directory')!;
    expect(dir.items.some(i => i.page === 'Organizations')).toBe(true);
  });

  it('contains Locations item', () => {
    const dir = sectionByLabel('Directory')!;
    expect(dir.items.some(i => i.page === 'Locations')).toBe(true);
  });

  it('does NOT contain Territory Map (moved to Analytics)', () => {
    const dir = sectionByLabel('Directory')!;
    expect(dir.items.some(i => i.page === 'TerritoryIntelligence')).toBe(false);
  });

  it('does NOT contain County Intel (moved to Analytics)', () => {
    const dir = sectionByLabel('Directory')!;
    expect(dir.items.some(i => i.page === 'CountyIntelligence')).toBe(false);
  });
});

describe('NAV_SECTIONS – Analytics section', () => {
  it('contains AdvancedAnalytics', () => {
    const analytics = sectionByLabel('Analytics')!;
    expect(analytics.items.some(i => i.page === 'AdvancedAnalytics')).toBe(true);
  });

  it('contains ReferralNetworkIntelligence (moved from old Analytics section)', () => {
    const analytics = sectionByLabel('Analytics')!;
    expect(analytics.items.some(i => i.page === 'ReferralNetworkIntelligence')).toBe(true);
  });

  it('contains TerritoryIntelligence (moved from old Providers section)', () => {
    const analytics = sectionByLabel('Analytics')!;
    expect(analytics.items.some(i => i.page === 'TerritoryIntelligence')).toBe(true);
  });

  it('contains CountyIntelligence (moved from old Providers section)', () => {
    const analytics = sectionByLabel('Analytics')!;
    expect(analytics.items.some(i => i.page === 'CountyIntelligence')).toBe(true);
  });

  it('contains Utilization item', () => {
    const analytics = sectionByLabel('Analytics')!;
    expect(analytics.items.some(i => i.page === 'Utilization')).toBe(true);
  });

  it('contains Reports item', () => {
    const analytics = sectionByLabel('Analytics')!;
    expect(analytics.items.some(i => i.page === 'CustomReports')).toBe(true);
  });
});

describe('NAV_SECTIONS – Data Operations section', () => {
  it('contains DataCenter', () => {
    const ops = sectionByLabel('Data Operations')!;
    expect(ops.items.some(i => i.page === 'DataCenter')).toBe(true);
  });

  it('contains NPPESCrawler', () => {
    const ops = sectionByLabel('Data Operations')!;
    expect(ops.items.some(i => i.page === 'NPPESCrawler')).toBe(true);
  });

  it('contains ImportMonitoring', () => {
    const ops = sectionByLabel('Data Operations')!;
    expect(ops.items.some(i => i.page === 'ImportMonitoring')).toBe(true);
  });

  it('contains ProviderLocationMatching (newly added)', () => {
    const ops = sectionByLabel('Data Operations')!;
    expect(ops.items.some(i => i.page === 'ProviderLocationMatching')).toBe(true);
  });

  it('does NOT contain Help (moved to Overview)', () => {
    const ops = sectionByLabel('Data Operations')!;
    expect(ops.items.some(i => i.page === 'Help')).toBe(false);
  });
});

describe('NAV_SECTIONS – Settings section', () => {
  it('contains ScoringRules', () => {
    const settings = sectionByLabel('Settings')!;
    expect(settings.items.some(i => i.page === 'ScoringRules')).toBe(true);
  });

  it('contains SecurityAudit', () => {
    const settings = sectionByLabel('Settings')!;
    expect(settings.items.some(i => i.page === 'SecurityAudit')).toBe(true);
  });

  it('contains AdminSettings', () => {
    const settings = sectionByLabel('Settings')!;
    expect(settings.items.some(i => i.page === 'AdminSettings')).toBe(true);
  });
});

describe('NAV_SECTIONS – each page appears at most once', () => {
  it('no page is registered in multiple sections', () => {
    const pagesSeen = new Set<string>();
    const duplicates: string[] = [];
    allItems.forEach(item => {
      if (pagesSeen.has(item.page)) {
        duplicates.push(item.page);
      }
      pagesSeen.add(item.page);
    });
    expect(duplicates).toHaveLength(0);
  });
});

describe('NAV_SECTIONS – role assignments', () => {
  it('all Overview items are accessible to both admin and user', () => {
    const overview = sectionByLabel('Overview')!;
    overview.items.forEach(item => {
      expect(item.roles).toContain('admin');
      expect(item.roles).toContain('user');
    });
  });

  it('all Data Operations items are admin-only', () => {
    const ops = sectionByLabel('Data Operations')!;
    ops.items.forEach(item => {
      expect(item.roles).toContain('admin');
      expect(item.roles).not.toContain('user');
    });
  });

  it('all Settings items are admin-only', () => {
    const settings = sectionByLabel('Settings')!;
    settings.items.forEach(item => {
      expect(item.roles).toContain('admin');
      expect(item.roles).not.toContain('user');
    });
  });

  it('all Analytics items are accessible to both admin and user', () => {
    const analytics = sectionByLabel('Analytics')!;
    analytics.items.forEach(item => {
      expect(item.roles).toContain('admin');
      expect(item.roles).toContain('user');
    });
  });
});
// ---------------------------------------------------------------------------
// Page access (route guard + global search)
// ---------------------------------------------------------------------------
function registeredPageKeys(): string[] {
  const src = readFileSync(fileURLToPath(new URL('../src/pages.config.js', import.meta.url)), 'utf8');
  const block = src.slice(src.indexOf('export const PAGE_LOADERS = {'));
  const body = block.slice(0, block.indexOf('};'));
  return [...body.matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
}

describe('page access rules', () => {
  it('every registered page is either a nav item or a declared secondary page', () => {
    const navPages = new Set(allItems.map((i) => i.page));
    const keys = registeredPageKeys();
    expect(keys.length).toBeGreaterThan(30);
    const uncovered = keys.filter((k) => !navPages.has(k) && !(k in SECONDARY_PAGES));
    expect(uncovered).toEqual([]);
  });

  it('every secondary page points at a real nav page', () => {
    const navPages = new Set(allItems.map((i) => i.page));
    for (const parent of Object.values(SECONDARY_PAGES)) {
      expect(navPages.has(parent)).toBe(true);
    }
  });

  it('admins can open every page', () => {
    for (const key of registeredPageKeys()) {
      expect(canAccessPage(key, 'admin')).toBe(true);
    }
  });

  it('regular users can open directory and detail pages but not admin tools', () => {
    expect(canAccessPage('Providers', 'user')).toBe(true);
    expect(canAccessPage('ProviderDetail', 'user')).toBe(true);
    expect(canAccessPage('FacilityDetail', 'user')).toBe(true);
    expect(canAccessPage('LeadListBuilder', 'user')).toBe(true);
    expect(canAccessPage('ImportMonitoring', 'user')).toBe(false);
    expect(canAccessPage('AdminSettings', 'user')).toBe(false);
    // Alias routes inherit their target's rule.
    expect(canAccessPage('Campaigns', 'user')).toBe(false);
    expect(canAccessPage('EnrichmentHub', 'user')).toBe(false);
  });

  it('treats unknown roles as regular users and unknown pages as admin-only', () => {
    expect(canAccessPage('ImportMonitoring', undefined)).toBe(false);
    expect(canAccessPage('Providers', 'viewer')).toBe(true);
    expect(canAccessPage('NotARealPage', 'user')).toBe(false);
    expect(canAccessPage('NotARealPage', 'admin')).toBe(true);
  });

  it('highlights the parent nav item for detail pages', () => {
    expect(getNavPageFor('ProviderDetail')).toBe('Providers');
    expect(getNavPageFor('LeadListBuilder')).toBe('LeadLists');
    expect(getNavPageFor('Providers')).toBe('Providers');
    // FacilityDetail serves all facility types, so it highlights nothing.
    expect(getNavPageFor('FacilityDetail')).toBeNull();
  });

  it('getVisibleNavSections hides admin-only sections from users', () => {
    const labels = getVisibleNavSections('user').map((s) => s.label);
    expect(labels).not.toContain('Data Operations');
    expect(labels).not.toContain('Settings');
    const userPages = getVisibleNavSections('user').flatMap((s) => s.items.map((i) => i.page));
    expect(userPages).not.toContain('ProviderOutreach');
    expect(userPages).toContain('LeadLists');
  });
});
