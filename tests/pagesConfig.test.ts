/**
 * Tests for src/pages.config.js
 *
 * PR changes: The following page registrations were REMOVED from the PAGES map
 * (the corresponding source files were also deleted):
 *   - ImportAnalytics
 *   - ImportOverview
 *   - MAInpatientDashboard
 *   - NPPESCrawlerDashboard
 *   - ReferralPathwayAnalysis
 *   - ProjectManagement
 *
 * We mock all page imports (vi.mock is hoisted before static imports by
 * vitest) so we never pull in the full React component tree, then assert
 * which keys are and are not present in PAGES.
 */
import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Stub every page component so importing pages.config.js works without a
// full browser environment.  vi.mock calls are hoisted before the static
// imports below, so the mocks are in place when the module resolves.
// Note: factory functions must be self-contained (no references to variables
// declared outside the factory, as those are hoisted away from their init).
// ---------------------------------------------------------------------------
vi.mock('../src/pages/AIAssistant.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/APIConnectors.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/AdminSettings.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/AdvancedAnalytics.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/CMSAnalytics.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/CMSDataSources.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/Campaigns.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/CountyIntelligence.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/CustomReports.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/Dashboard.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/DataCenter.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/DataQuality.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/CommunityHealthCenters.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/DMESuppliers.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/ProviderIntelligence.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/FacilityDetail.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/Help.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/HomeHealthAgencies.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/Hospices.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/Hospitals.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/InpatientRehab.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/ImportMonitoring.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/LeadListBuilder.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/LeadLists.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/LocationDetail.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/Locations.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/LongTermCare.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/NursingHomes.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/NPPESCrawler.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/NPPESCrawlerSettings.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/Organizations.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/ProviderDetail.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/ProviderLocationMatching.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/ProviderOutreach.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/Providers.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/ReconciliationDashboard.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/ReferralNetworkIntelligence.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/ScoringRules.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/SecurityAudit.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/TerritoryIntelligence.jsx', () => ({ default: () => null }));
vi.mock('../src/pages/Utilization.jsx', () => ({ default: () => null }));
vi.mock('../src/Layout.jsx', () => ({ default: () => null }));

// Static import is resolved AFTER vi.mock hoisting, so all mocks are set up.
import { PAGES, pagesConfig } from '../src/pages.config.js';

// ===========================================================================
// Tests
// ===========================================================================

describe('pages.config.js – PAGES registry', () => {
  // -------------------------------------------------------------------------
  // Pages removed in this PR must NOT appear in the PAGES registry
  // -------------------------------------------------------------------------
  describe('removed page registrations', () => {
    it('does not contain ImportAnalytics (file deleted)', () => {
      expect('ImportAnalytics' in PAGES).toBe(false);
    });

    it('does not contain ImportOverview (file deleted)', () => {
      expect('ImportOverview' in PAGES).toBe(false);
    });

    it('does not contain MAInpatientDashboard (file deleted)', () => {
      expect('MAInpatientDashboard' in PAGES).toBe(false);
    });

    it('does not contain NPPESCrawlerDashboard (renamed → CrawlerAnalyticsView component)', () => {
      expect('NPPESCrawlerDashboard' in PAGES).toBe(false);
    });

    it('does not contain ReferralPathwayAnalysis (renamed → SingleProviderPathway component)', () => {
      expect('ReferralPathwayAnalysis' in PAGES).toBe(false);
    });

    it('does not contain ProjectManagement (file deleted)', () => {
      expect('ProjectManagement' in PAGES).toBe(false);
    });

    it('does not contain OrganizationDetail (unified into ProviderDetail)', () => {
      expect('OrganizationDetail' in PAGES).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Pages that must remain registered after the refactor
  // -------------------------------------------------------------------------
  describe('retained page registrations', () => {
    const retainedPages = [
      'AIAssistant',
      'APIConnectors',
      'AdminSettings',
      'AdvancedAnalytics',
      'CMSAnalytics',
      'CMSDataSources',
      'Campaigns',
      'CountyIntelligence',
      'CustomReports',
      'Dashboard',
      'DataCenter',
      'DataQuality',
      'CommunityHealthCenters',
      'DMESuppliers',
      'ProviderIntelligence',
      'FacilityDetail',
      'Help',
      'HomeHealthAgencies',
      'Hospices',
      'Hospitals',
      'InpatientRehab',
      'ImportMonitoring',
      'LeadListBuilder',
      'LeadLists',
      'LocationDetail',
      'Locations',
      'LongTermCare',
      'NursingHomes',
      'NPPESCrawler',
      'NPPESCrawlerSettings',
      'Organizations',
      'ProviderDetail',
      'ProviderLocationMatching',
      'ProviderOutreach',
      'Providers',
      'ReconciliationDashboard',
      'ReferralNetworkIntelligence',
      'ScoringRules',
      'SecurityAudit',
      'TerritoryIntelligence',
      'Utilization',
    ];

    retainedPages.forEach(name => {
      it(`contains ${name}`, () => {
        expect(name in PAGES).toBe(true);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Structure invariants
  // -------------------------------------------------------------------------
  describe('structure invariants', () => {
    it('every registered page value is a function', () => {
      for (const [key, component] of Object.entries(PAGES)) {
        expect(typeof component, `${key} should be a function`).toBe('function');
      }
    });

    it('has at least 30 registered pages', () => {
      expect(Object.keys(PAGES).length).toBeGreaterThanOrEqual(30);
    });
  });
});

describe('pages.config.js – pagesConfig', () => {
  it('sets mainPage to Dashboard', () => {
    expect(pagesConfig.mainPage).toBe('Dashboard');
  });

  it('includes a Layout component', () => {
    expect(pagesConfig.Layout).toBeTruthy();
  });

  it('Pages property references the PAGES object', () => {
    expect(pagesConfig.Pages).toBe(PAGES);
  });
});