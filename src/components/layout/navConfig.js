import {
  LayoutDashboard, Upload, Users, ListCheck, Settings, Shield, BarChart3, MapPin,
  Activity, GitBranch, Bot, FileBarChart2, TrendingUp, Network, Megaphone, Target,
  Database, HelpCircle, Server, ShieldCheck, Brain, Building2, Heart, HeartHandshake,
  Home, HeartPulse, BedDouble, Package, Building, Briefcase, Stethoscope, ClipboardCheck,
} from 'lucide-react';

// Single source of truth for the sidebar and for page-level access control.
// `roles` lists who may open a page; ProtectedRoute and global search both
// consult it, so hiding a page from the nav also blocks it by URL.
export const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard', roles: ['admin', 'user'] },
      { name: 'AI Assistant', icon: Bot, page: 'AIAssistant', roles: ['admin', 'user'] },
      { name: 'Help', icon: HelpCircle, page: 'Help', roles: ['admin', 'user'] },
    ]
  },
  {
    label: 'Directory',
    items: [
      { name: 'All Providers', icon: Users, page: 'Providers', roles: ['admin', 'user'] },
      { name: 'Organizations', icon: Briefcase, page: 'Organizations', roles: ['admin', 'user'] },
      { name: 'Locations', icon: MapPin, page: 'Locations', roles: ['admin', 'user'] },
    ]
  },
  {
    label: 'Facilities',
    items: [
      { name: 'Hospitals', icon: Building2, page: 'Hospitals', roles: ['admin', 'user'] },
      { name: 'Home Health', icon: Heart, page: 'HomeHealthAgencies', roles: ['admin', 'user'] },
      { name: 'Hospice', icon: HeartHandshake, page: 'Hospices', roles: ['admin', 'user'] },
      { name: 'Nursing Homes', icon: Home, page: 'NursingHomes', roles: ['admin', 'user'] },
      { name: 'Inpatient Rehab', icon: HeartPulse, page: 'InpatientRehab', roles: ['admin', 'user'] },
      { name: 'Long Term Hospital', icon: BedDouble, page: 'LongTermCare', roles: ['admin', 'user'] },
      { name: 'DME Suppliers', icon: Package, page: 'DMESuppliers', roles: ['admin', 'user'] },
      { name: 'DME Report', icon: FileBarChart2, page: 'DMEProviderReport', roles: ['admin', 'user'] },
      { name: 'Community Health', icon: Building, page: 'CommunityHealthCenters', roles: ['admin', 'user'] },
    ]
  },
  {
    label: 'Analytics',
    items: [
      { name: 'Analytics', icon: TrendingUp, page: 'AdvancedAnalytics', roles: ['admin', 'user'] },
      { name: 'CMS Data', icon: BarChart3, page: 'CMSAnalytics', roles: ['admin', 'user'] },
      { name: 'Utilization', icon: Stethoscope, page: 'Utilization', roles: ['admin', 'user'] },
      { name: 'Referral Network', icon: Network, page: 'ReferralNetworkIntelligence', roles: ['admin', 'user'] },
      { name: 'Territory Map', icon: MapPin, page: 'TerritoryIntelligence', roles: ['admin', 'user'] },
      { name: 'County Intel', icon: MapPin, page: 'CountyIntelligence', roles: ['admin', 'user'] },
      { name: 'Reports', icon: FileBarChart2, page: 'CustomReports', roles: ['admin', 'user'] },
    ]
  },
  {
    label: 'Sales & Outreach',
    items: [
      { name: 'Lead Lists', icon: ListCheck, page: 'LeadLists', roles: ['admin', 'user'] },
      { name: 'Intelligence', icon: Brain, page: 'ProviderIntelligence', roles: ['admin'] },
      { name: 'Campaigns', icon: Megaphone, page: 'ProviderOutreach', roles: ['admin'] },
    ]
  },
  {
    label: 'Data Operations',
    items: [
      { name: 'Data Center', icon: Upload, page: 'DataCenter', roles: ['admin'] },
      { name: 'CMS Catalog', icon: Database, page: 'CMSDataSources', roles: ['admin'] },
      { name: 'API Connectors', icon: Server, page: 'APIConnectors', roles: ['admin'] },
      { name: 'Imports', icon: Activity, page: 'ImportMonitoring', roles: ['admin'] },
      { name: 'NPPES Crawler', icon: Bot, page: 'NPPESCrawler', roles: ['admin'] },
      { name: 'Crawler Settings', icon: Settings, page: 'NPPESCrawlerSettings', roles: ['admin'] },
      { name: 'Reconciliation', icon: GitBranch, page: 'ReconciliationDashboard', roles: ['admin'] },
      { name: 'Data Quality', icon: Shield, page: 'DataQuality', roles: ['admin'] },
      { name: 'Provider Matching', icon: ClipboardCheck, page: 'ProviderLocationMatching', roles: ['admin'] },
    ]
  },
  {
    label: 'Settings',
    items: [
      { name: 'Scoring Rules', icon: Target, page: 'ScoringRules', roles: ['admin'] },
      { name: 'Security Audit', icon: ShieldCheck, page: 'SecurityAudit', roles: ['admin'] },
      { name: 'Admin Settings', icon: Settings, page: 'AdminSettings', roles: ['admin'] },
    ]
  },
];

// Pages without a sidebar entry (detail pages and legacy alias routes). Each
// inherits access from the nav page it belongs to, and that nav item is
// highlighted while the secondary page is open.
export const SECONDARY_PAGES = {
  ProviderDetail: 'Providers',
  OrganizationDetail: 'Organizations',
  LocationDetail: 'Locations',
  FacilityDetail: 'Hospitals',
  LeadListBuilder: 'LeadLists',
  Campaigns: 'ProviderOutreach',
  EmailSearchBot: 'ProviderIntelligence',
  EnrichmentHub: 'ProviderIntelligence',
};

const NAV_ITEMS_BY_PAGE = new Map(
  NAV_SECTIONS.flatMap((section) => section.items.map((item) => [item.page, item])),
);

export function normalizeRole(role) {
  return role === 'admin' ? 'admin' : 'user';
}

// FacilityDetail serves every facility type, so no single sidebar item
// represents it; it only borrows Hospitals' access rule.
const UNHIGHLIGHTED_PAGES = new Set(['FacilityDetail']);

function getParentPage(page) {
  if (NAV_ITEMS_BY_PAGE.has(page)) return page;
  return SECONDARY_PAGES[page] || null;
}

/** The sidebar item to highlight for `page` (itself, or its parent for detail/alias pages). */
export function getNavPageFor(page) {
  if (UNHIGHLIGHTED_PAGES.has(page)) return null;
  return getParentPage(page);
}

/** Whether a user with `role` may open `page`. Unknown pages are admin-only (default-deny). */
export function canAccessPage(page, role) {
  const navPage = getParentPage(page);
  const item = navPage ? NAV_ITEMS_BY_PAGE.get(navPage) : null;
  const normalized = normalizeRole(role);
  if (!item) return normalized === 'admin';
  return item.roles.includes(normalized);
}

/** Sidebar sections filtered to what `role` may open. */
export function getVisibleNavSections(role) {
  const normalized = normalizeRole(role);
  return NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(normalized)),
    }))
    .filter((section) => section.items.length > 0);
}
