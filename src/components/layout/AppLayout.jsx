import React, { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';
import { pagesConfig } from '@/pages.config.js';
import { LogOut, Search, ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationBell from '../shared/NotificationBell';
import AccountDialog from '../auth/AccountDialog';
import { CAREMETRIC_LOGO_URL, CAREMETRIC_NAME } from '@/lib/branding';
import BusinessLineSelect from '@/components/shared/BusinessLineSelect';
import { getNavPageFor, getVisibleNavSections, roleLabel } from './navConfig';

const loadGlobalSearchDialog = () => import('../search/GlobalSearchDialog');
const GlobalSearchDialog = lazy(loadGlobalSearchDialog);


const getInitialSidebarState = () => {
  // On small screens the sidebar overlays the page, so always start closed.
  if (!window.matchMedia('(min-width: 1024px)').matches) return false;
  const saved = localStorage.getItem('caremetric_sidebar');
  if (saved !== null) return saved === 'true';
  return window.matchMedia('(min-width: 1024px)').matches;
};

const SearchDialogFallback = () => null;

export default function AppLayout({ children, currentPageName }) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(getInitialSidebarState);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const mainRef = React.useRef(null);
  const asideRef = React.useRef(null);
  const openButtonRef = React.useRef(null);
  const closeButtonRef = React.useRef(null);
  const wasOpen = React.useRef(sidebarOpen);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => {
      const next = !prev;
      localStorage.setItem('caremetric_sidebar', String(next));
      return next;
    });
  }, []);

  React.useLayoutEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 });
    window.scrollTo(0, 0);
  }, [currentPageName]);

  // A closed sidebar is still in the DOM (it animates to zero width): keep its
  // links out of the tab order and away from screen readers.
  React.useEffect(() => {
    asideRef.current?.toggleAttribute('inert', !sidebarOpen);
  }, [sidebarOpen]);

  // Move focus with the sidebar when it opens or closes (at any width: the
  // toggle pressed is replaced, and a collapsed sidebar is inert), so keyboard
  // users aren't left on a control that just disappeared.
  React.useEffect(() => {
    if (wasOpen.current === sidebarOpen) return;
    wasOpen.current = sidebarOpen;
    if (sidebarOpen) closeButtonRef.current?.focus();
    else openButtonRef.current?.focus();
  }, [sidebarOpen]);

  // Escape closes the overlay sidebar on small screens.
  React.useEffect(() => {
    if (!sidebarOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape' && window.innerWidth < 1024) setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  const skipToMain = useCallback((event) => {
    event.preventDefault();
    mainRef.current?.focus();
  }, []);

  const toggleSection = useCallback((label) => {
    setCollapsedSections(prev => ({ ...prev, [label]: !prev[label] }));
  }, []);

  const visibleNavSections = useMemo(() => getVisibleNavSections(user), [user]);
  const activeNavPage = getNavPageFor(currentPageName);

  const handleMobileNavClick = useCallback(() => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  }, []);

  const preloadRoute = useCallback((page) => {
    pagesConfig.preloadPage?.(page);
  }, []);

  const openSearch = useCallback(() => {
    loadGlobalSearchDialog();
    setSearchOpen(true);
  }, []);

  React.useEffect(() => {
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [openSearch]);

  return (
    <div className="flex h-dvh bg-background print:block print:h-auto print:bg-white">
      <a
        href="#main-content"
        onClick={skipToMain}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-cyan-700 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>
      <style>{`
        .scrollbar-dark::-webkit-scrollbar { width: 6px; }
        .scrollbar-dark::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-dark::-webkit-scrollbar-thumb { background: rgba(99,116,158,0.4); border-radius: 3px; }
        .scrollbar-dark::-webkit-scrollbar-thumb:hover { background: rgba(99,116,158,0.6); }
        .scrollbar-dark { scrollbar-width: thin; scrollbar-color: rgba(99,116,158,0.4) transparent; }
      `}</style>
      {/* Mobile overlay */}
      {/* Mobile overlay (Escape also closes the sidebar) */}
      {sidebarOpen && (
        <div role="presentation" className="fixed inset-0 bg-black/50 z-30 lg:hidden print:hidden" onClick={toggleSidebar} />
      )}

      {/* Sidebar */}
      <aside ref={asideRef} aria-label="Sidebar" className={`${sidebarOpen ? 'w-64 fixed lg:relative z-40' : 'w-0 overflow-hidden'} bg-[#0b1120] text-slate-400 border-r border-slate-800/60 transition-all duration-300 motion-reduce:transition-none flex flex-col h-full flex-shrink-0 print:hidden`}>
        {/* Logo */}
        <div className="px-4 py-5 flex items-center justify-between gap-3 border-b border-slate-800/60 min-w-[16rem]">
          <Link to={createPageUrl('Dashboard')} onClick={handleMobileNavClick} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <img
              src={CAREMETRIC_LOGO_URL}
              alt={CAREMETRIC_NAME}
              className="w-44 h-14 rounded-md object-contain bg-white text-slate-900 p-1.5"
            />
          </Link>
          <Button
            ref={closeButtonRef}
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="Collapse sidebar"
            aria-expanded="true"
            className="text-slate-400 hover:text-white hover:bg-slate-800/60 h-7 w-7"
          >
            <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
          </Button>
        </div>

        <BusinessLineSelect compact />

        {/* Search Button */}
        <div className="px-3 py-2 min-w-[16rem]">
          <button
            type="button"
            onClick={openSearch}
            onMouseEnter={loadGlobalSearchDialog}
            onFocus={loadGlobalSearchDialog}
            className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg border border-slate-700/60 bg-slate-900 text-sm text-slate-300 hover:text-white hover:border-slate-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left">Search providers</span>
            <kbd className="text-[10px] text-slate-400 border border-slate-700 rounded px-1 py-0.5" aria-hidden="true">⌘K</kbd>
          </button>
        </div>

        {/* Nav */}
        <nav aria-label="Main" className="flex-1 overflow-y-auto py-3 px-3 space-y-2 scrollbar-dark min-w-[16rem]">
          {visibleNavSections.map((section) => {
            const isCollapsed = collapsedSections[section.label];
            const listId = `nav-section-${section.label.replace(/\W+/g, '-').toLowerCase()}`;

            return (
              <div key={section.label} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleSection(section.label)}
                  aria-expanded={!isCollapsed}
                  aria-controls={listId}
                  className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-300 transition-colors"
                >
                  {section.label}
                  {isCollapsed ? <ChevronRight className="w-3 h-3" aria-hidden="true" /> : <ChevronDown className="w-3 h-3" aria-hidden="true" />}
                </button>
                <div id={listId}>
                {!isCollapsed && section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeNavPage === item.page;
                  return (
                    <Link
                      key={item.name}
                      to={createPageUrl(item.page)}
                      title={item.name}
                      onClick={handleMobileNavClick}
                      onMouseEnter={() => preloadRoute(item.page)}
                      onFocus={() => preloadRoute(item.page)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isActive
                          ? 'bg-blue-900/30 text-blue-300 font-semibold ring-1 ring-inset ring-blue-500/30'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-400' : ''}`} aria-hidden="true" />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  );
                })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-slate-800/60 min-w-[16rem]">
          <div className="mb-2 px-2 flex items-center justify-between">
            <div>
              {user && <p className="text-xs font-medium text-slate-300 truncate">{user.full_name || user.email}</p>}
              {user && <p className="text-[10px] text-slate-400">{roleLabel(user)}</p>}
            </div>
            <NotificationBell />
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              onClick={() => setAccountOpen(true)}
              className="flex-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 justify-start h-8 text-xs"
            >
              <UserCog className="w-4 h-4" aria-hidden="true" />
              <span className="ml-2">Account</span>
            </Button>
            <Button
              variant="ghost"
              onClick={logout}
              className="flex-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 justify-start h-8 text-xs"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span className="ml-2">Sign Out</span>
            </Button>
          </div>
        </div>
      </aside>

      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} />

      {searchOpen && (
        <Suspense fallback={<SearchDialogFallback />}>
          <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
        </Suspense>
      )}

      {/* Top bar when sidebar is closed */}
      {!sidebarOpen && (
        <div className="fixed top-0 left-0 right-0 z-20 bg-[#0b1120] border-b border-slate-800/60 px-3 py-2 flex items-center gap-3 print:hidden">
          <Button ref={openButtonRef} variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Open sidebar" aria-expanded="false" className="text-slate-400 hover:text-white hover:bg-slate-800/60 h-8 w-8">
            <PanelLeftOpen className="w-5 h-5" aria-hidden="true" />
          </Button>
          <Link to={createPageUrl('Dashboard')} className="mr-auto rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <img src={CAREMETRIC_LOGO_URL} alt={CAREMETRIC_NAME} className="w-36 h-10 rounded object-contain bg-white text-slate-900 p-1" />
          </Link>
          <button type="button" onClick={openSearch} onMouseEnter={loadGlobalSearchDialog} onFocus={loadGlobalSearchDialog} aria-label="Search" className="text-slate-400 hover:text-cyan-400 transition-colors p-1.5">
            <Search className="w-4 h-4" aria-hidden="true" />
          </button>
          <NotificationBell />
        </div>
      )}

      {/* Main content */}
      <main id="main-content" tabIndex={-1} ref={mainRef} className={`flex-1 min-w-0 focus:outline-none overflow-x-hidden overflow-y-auto bg-background flex flex-col w-full ${!sidebarOpen ? 'pt-16' : ''} print:block print:overflow-visible print:bg-white print:pt-0`}>
        <div className="flex-1">
          {children}
        </div>
        <div className="px-4 sm:px-8 py-2.5 border-t border-slate-800/60 bg-[#0b1120]/80 backdrop-blur-sm print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span className="font-medium">{CAREMETRIC_NAME}</span>
            <a href="https://www.caremetric.ai" target="_blank" rel="noopener noreferrer" className="hover:text-blue-300 hover:underline">caremetric.ai</a>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 leading-relaxed max-w-4xl">
            Data Sources: All data is derived from publicly available CMS Medicare datasets and NPPES National Provider files; county and ZIP geography from the U.S. Census Bureau (2020 Gazetteer and ZCTA relationship files). Insights are estimates based on public data patterns and do not represent confirmed referral relationships.
          </p>
        </div>
      </main>
    </div>
  );
}