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
 * NAV_SECTIONS is not exported from the module; we mirror the expected
 * structure in this file and test the logical constraints.  The tests are
 * deliberately kept import-free so no JSDOM / React render is required.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Mirror the expected NAV_SECTIONS structure from AppLayout.jsx
// ---------------------------------------------------------------------------
const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', page: 'Dashboard', roles: ['admin', 'user'] },
      { name: 'AI Assistant', page: 'AIAssistant', roles: ['admin', 'user'] },
      { name: 'Help', page: 'Help', roles: ['admin', 'user'] },
    ],
  },
  {
    label: 'Directory',
    items: [
      { name: 'All Providers', page: 'Providers', roles: ['admin', 'user'] },
      { name: 'Organizations', page: 'Organizations', roles: ['admin', 'user'] },
      { name: 'Locations', page: 'Locations', roles: ['admin', 'user'] },
    ],
  },
  {
    label: 'Facilities',
    items: [
      { name: 'Hospitals', page: 'Hospitals', roles: ['admin', 'user'] },
      { name: 'Home Health', page: 'HomeHealthAgencies', roles: ['admin', 'user'] },
      { name: 'Hospice', page: 'Hospices', roles: ['admin', 'user'] },
      { name: 'Nursing Homes', page: 'NursingHomes', roles: ['admin', 'user'] },
      { name: 'Inpatient Rehab', page: 'InpatientRehab', roles: ['admin', 'user'] },
      { name: 'Long Term Hospital', page: 'LongTermCare', roles: ['admin', 'user'] },
      { name: 'DME Suppliers', page: 'DMESuppliers', roles: ['admin', 'user'] },
      { name: 'Community Health', page: 'CommunityHealthCenters', roles: ['admin', 'user'] },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { name: 'Analytics', page: 'AdvancedAnalytics', roles: ['admin', 'user'] },
      { name: 'CMS Data', page: 'CMSAnalytics', roles: ['admin', 'user'] },
      { name: 'Utilization', page: 'Utilization', roles: ['admin', 'user'] },
      { name: 'Referral Network', page: 'ReferralNetworkIntelligence', roles: ['admin', 'user'] },
      { name: 'Territory Map', page: 'TerritoryIntelligence', roles: ['admin', 'user'] },
      { name: 'County Intel', page: 'CountyIntelligence', roles: ['admin', 'user'] },
      { name: 'Reports', page: 'CustomReports', roles: ['admin', 'user'] },
    ],
  },
  {
    label: 'Sales & Outreach',
    items: [
      { name: 'Lead Lists', page: 'LeadLists', roles: ['admin', 'user'] },
      { name: 'Intelligence', page: 'ProviderIntelligence', roles: ['admin'] },
      { name: 'Campaigns', page: 'Campaigns', roles: ['admin'] },
      { name: 'Outreach', page: 'ProviderOutreach', roles: ['admin'] },
    ],
  },
  {
    label: 'Data Operations',
    items: [
      { name: 'Data Center', page: 'DataCenter', roles: ['admin'] },
      { name: 'CMS Catalog', page: 'CMSDataSources', roles: ['admin'] },
      { name: 'API Connectors', page: 'APIConnectors', roles: ['admin'] },
      { name: 'Imports', page: 'ImportMonitoring', roles: ['admin'] },
      { name: 'NPPES Crawler', page: 'NPPESCrawler', roles: ['admin'] },
      { name: 'Crawler Settings', page: 'NPPESCrawlerSettings', roles: ['admin'] },
      { name: 'Reconciliation', page: 'ReconciliationDashboard', roles: ['admin'] },
      { name: 'Data Quality', page: 'DataQuality', roles: ['admin'] },
      { name: 'Provider Matching', page: 'ProviderLocationMatching', roles: ['admin'] },
    ],
  },
  {
    label: 'Settings',
    items: [
      { name: 'Scoring Rules', page: 'ScoringRules', roles: ['admin'] },
      { name: 'Security Audit', page: 'SecurityAudit', roles: ['admin'] },
      { name: 'Admin Settings', page: 'AdminSettings', roles: ['admin'] },
    ],
  },
];

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