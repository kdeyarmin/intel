import {
  LayoutDashboard, Upload, Users, ListCheck, Settings, Shield, BarChart3, MapPin, Map as MapIcon,
  GitBranch, Bot, FileBarChart2, TrendingUp, Network, Megaphone,
  HelpCircle, Server, Brain, Building2, Briefcase, Stethoscope, ClipboardCheck,
} from 'lucide-react';

// Single source of truth for the sidebar and for page-level access control.
// `roles` lists who may open a page; ProtectedRoute and global search both
// consult it, so hiding a page from the nav also blocks it by URL. Roles:
// 'user' (anyone in an organization), 'owner' (administers their own
// organization: people, billing, campaigns) and 'admin' (platform admins,
// who operate the shared data and see every organization).
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
      { name: 'Facilities', icon: Building2, page: 'Facilities', roles: ['admin', 'user'] },
    ]
  },
  {
    label: 'Analytics',
    items: [
      { name: 'Analytics', icon: TrendingUp, page: 'AdvancedAnalytics', roles: ['admin', 'user'] },
      { name: 'CMS Data', icon: BarChart3, page: 'CMSAnalytics', roles: ['admin', 'user'] },
      { name: 'Utilization', icon: Stethoscope, page: 'Utilization', roles: ['admin', 'user'] },
      { name: 'Referral Network', icon: Network, page: 'ReferralNetworkIntelligence', roles: ['admin', 'user'] },
      { name: 'Territory & County', icon: MapIcon, page: 'TerritoryIntelligence', roles: ['admin', 'user'] },
      { name: 'Reports', icon: FileBarChart2, page: 'MarketBriefs', roles: ['admin', 'user'] },
    ]
  },
  {
    label: 'Sales & Outreach',
    items: [
      { name: 'Lead Lists', icon: ListCheck, page: 'LeadLists', roles: ['admin', 'user'] },
      { name: 'Intelligence', icon: Brain, page: 'ProviderIntelligence', roles: ['admin'] },
      { name: 'Campaigns', icon: Megaphone, page: 'ProviderOutreach', roles: ['admin', 'owner'] },
      { name: 'Team Marketing', icon: Users, page: 'TeamMarketing', roles: ['admin', 'owner'] },
    ]
  },
  {
    label: 'Administration',
    items: [
      { name: 'Data Center', icon: Upload, page: 'DataCenter', roles: ['admin'] },
      { name: 'API Connectors', icon: Server, page: 'APIConnectors', roles: ['admin'] },
      { name: 'NPPES Crawler', icon: Bot, page: 'NPPESCrawler', roles: ['admin'] },
      { name: 'Reconciliation', icon: GitBranch, page: 'ReconciliationDashboard', roles: ['admin'] },
      { name: 'Data Quality', icon: Shield, page: 'DataQuality', roles: ['admin'] },
      { name: 'Provider Matching', icon: ClipboardCheck, page: 'ProviderLocationMatching', roles: ['admin'] },
      { name: 'Admin Settings', icon: Settings, page: 'AdminSettings', roles: ['admin', 'owner'] },
    ]
  },
];

// Pages that share one sidebar entry (the first page of each group) and are
// switched with a tab strip at the top of the page (PageTabs). Each keeps its
// own URL, so bookmarks and links still work.
export const PAGE_GROUPS = {
  reports: {
    label: 'Report views',
    pages: [
      { page: 'MarketBriefs', label: 'Reports' },
      { page: 'CustomReports', label: 'Builder' },
    ],
  },
  lists: {
    label: 'List views',
    pages: [
      { page: 'LeadLists', label: 'Lead lists' },
      { page: 'CallSheets', label: 'Call sheets' },
      { page: 'Marketing', label: 'Marketing' },
    ],
  },
  facilities: {
    label: 'Facility views',
    pages: [
      { page: 'Facilities', label: 'Directory' },
      { page: 'DMEProviderReport', label: 'DME report' },
    ],
  },
  territory: {
    label: 'Territory views',
    pages: [
      { page: 'TerritoryIntelligence', label: 'Territory map' },
      { page: 'CountyIntelligence', label: 'County' },
      { page: 'MarketIntelligence', label: 'Market' },
    ],
  },
  dataCenter: {
    label: 'Data Center sections',
    pages: [
      { page: 'DataCenter', label: 'Import' },
      { page: 'CMSDataSources', label: 'Dataset catalog' },
      { page: 'ImportMonitoring', label: 'Import monitor' },
    ],
  },
  crawler: {
    label: 'NPPES Crawler sections',
    pages: [
      { page: 'NPPESCrawler', label: 'Crawler' },
      { page: 'NPPESCrawlerSettings', label: 'Settings' },
    ],
  },
  // A tab may name its own `roles`; without them it inherits its group's first page.
  admin: {
    label: 'Admin sections',
    pages: [
      { page: 'AdminSettings', label: 'Users' },
      { page: 'Billing', label: 'Billing', roles: ['admin', 'owner'] },
      // Scoring rules are platform configuration (one scoring job serves every customer).
      { page: 'ScoringRules', label: 'Scoring rules', roles: ['admin'] },
      { page: 'SecurityAudit', label: 'Security audit', roles: ['admin', 'owner'] },
    ],
  },
};

// Facility types served by the Facilities page (?type=), with the page that
// used to list each type.
export const FACILITY_TYPES = [
  { type: 'hospital', label: 'Hospitals', legacyPage: 'Hospitals' },
  { type: 'home_health', label: 'Home Health', legacyPage: 'HomeHealthAgencies' },
  { type: 'hospice', label: 'Hospice', legacyPage: 'Hospices' },
  { type: 'snf', label: 'Nursing Homes', legacyPage: 'NursingHomes' },
  { type: 'irf', label: 'Inpatient Rehab', legacyPage: 'InpatientRehab' },
  { type: 'ltch', label: 'Long-Term Care Hospitals', legacyPage: 'LongTermCare' },
  { type: 'dme', label: 'DME Suppliers', legacyPage: 'DMESuppliers' },
  { type: 'community_health', label: 'Community Health', legacyPage: 'CommunityHealthCenters' },
  // State-licensed homes (personal care, assisted living) from licensing exports; never had its own page.
  { type: 'licensed', label: 'Licensed Homes', legacyPage: null },
];

// Old page URLs and where they live now. `params` select the right view on
// the target and win over the same keys in the old URL; every other query
// parameter is kept, so old bookmarks and shared links still land in place.
export const LEGACY_REDIRECTS = {
  ...Object.fromEntries(FACILITY_TYPES.filter(({ legacyPage }) => legacyPage).map(({ type, legacyPage }) => [legacyPage, { page: 'Facilities', params: { type } }])),
  OrganizationDetail: { page: 'ProviderDetail' },
  Campaigns: { page: 'ProviderOutreach' },
  EmailSearchBot: { page: 'ProviderIntelligence', params: { tab: 'email' } },
  EnrichmentHub: { page: 'ProviderIntelligence', params: { tab: 'intelligence' } },
};

/** Where an old page URL now lives, as a path with query string, or null if `page` isn't a legacy page. */
export function resolveLegacyRedirect(page, search = '') {
  const target = LEGACY_REDIRECTS[page];
  if (!target) return null;
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(target.params || {})) params.set(key, value);
  const query = params.toString();
  return `/${target.page}${query ? `?${query}` : ''}`;
}

// Detail pages without a sidebar entry. Each inherits access from the nav
// page it belongs to, and that nav item is highlighted while it is open.
const DETAIL_PAGES = {
  ProviderDetail: 'Providers',
  LocationDetail: 'Locations',
  FacilityDetail: 'Facilities',
  LeadListBuilder: 'LeadLists',
  Landing: 'Dashboard',
};

export const SECONDARY_PAGES = {
  ...DETAIL_PAGES,
  ...Object.fromEntries(Object.values(PAGE_GROUPS).flatMap((group) => {
    const [first, ...rest] = group.pages;
    return rest.map(({ page }) => [page, first.page]);
  })),
};

/** The tab group `page` belongs to, if any. */
export function getPageGroup(page) {
  return Object.values(PAGE_GROUPS).find((group) => group.pages.some((p) => p.page === page)) || null;
}

const NAV_ITEMS_BY_PAGE = new Map(
  NAV_SECTIONS.flatMap((section) => section.items.map((item) => [item.page, item])),
);

export function normalizeRole(role) {
  if (role === 'admin' || role === 'owner') return role;
  return 'user';
}

/**
 * The role a signed-in account acts with: 'admin' for platform admins (and
 * the legacy admin role), 'owner' for an organization's owners, else 'user'.
 * Accepts a role string as well, so callers may pass either.
 */
export function effectiveRole(userOrRole) {
  if (typeof userOrRole === 'string' || userOrRole == null) return normalizeRole(userOrRole);
  if (userOrRole.isPlatformAdmin || userOrRole.role === 'admin') return 'admin';
  if (userOrRole.orgRole === 'owner') return 'owner';
  return 'user';
}

/** What to call the role a session acts with, for the sidebar and account dialog. */
export function roleLabel(userOrRole) {
  const role = effectiveRole(userOrRole);
  return role === 'admin' ? 'Platform admin' : role === 'owner' ? 'Owner' : 'Member';
}

// Pages that only name 'admin' are platform-level; everything an owner may
// open names 'owner' too, and a platform admin may open everything. An owner
// is a member of their organization as well, so a page for 'user' is theirs.
function roleAllowed(roles, role) {
  if (role === 'admin') return true;
  if (role === 'owner') return roles.includes('owner') || roles.includes('user');
  return roles.includes(role);
}

// The roles a tab names for itself (PAGE_GROUPS), by page.
const TAB_ROLES = new Map(
  Object.values(PAGE_GROUPS).flatMap((group) => group.pages.filter((p) => p.roles).map((p) => [p.page, p.roles])),
);

function getParentPage(page) {
  const current = LEGACY_REDIRECTS[page]?.page || page;
  if (NAV_ITEMS_BY_PAGE.has(current)) return current;
  return SECONDARY_PAGES[current] || null;
}

/** The sidebar item to highlight for `page` (itself, or its parent for detail, grouped and legacy pages). */
export function getNavPageFor(page) {
  return getParentPage(page);
}

const DETAIL_PAGE_LABELS = {
  ProviderDetail: 'Provider profile',
  LocationDetail: 'Location',
  FacilityDetail: 'Facility',
  LeadListBuilder: 'Lead Builder',
};

/**
 * What to call `page` in links: its sidebar name, "Parent › Tab" for a tab of
 * a grouped page, or "Parent › Detail" for a detail page.
 */
export function getPageLabel(page) {
  const item = NAV_ITEMS_BY_PAGE.get(page);
  if (item) return item.name;
  const parent = getParentPage(page);
  const parentName = parent ? NAV_ITEMS_BY_PAGE.get(parent)?.name : null;
  const tab = getPageGroup(page)?.pages.find((p) => p.page === page)?.label;
  const own = tab || DETAIL_PAGE_LABELS[page];
  if (parentName && own) return `${parentName} › ${own}`;
  return own || parentName || page;
}

/** Whether `user` (a session user, or a role string) may open `page`. Unknown pages are admin-only (default-deny). */
export function canAccessPage(page, user) {
  const role = effectiveRole(user);
  const own = TAB_ROLES.get(LEGACY_REDIRECTS[page]?.page || page);
  if (own) return roleAllowed(own, role);
  const navPage = getParentPage(page);
  const item = navPage ? NAV_ITEMS_BY_PAGE.get(navPage) : null;
  if (!item) return role === 'admin';
  return roleAllowed(item.roles, role);
}

/** Sidebar sections filtered to what `user` (a session user, or a role string) may open. */
export function getVisibleNavSections(user) {
  const role = effectiveRole(user);
  return NAV_SECTIONS
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => roleAllowed(item.roles, role)),
    }))
    .filter((section) => section.items.length > 0);
}
