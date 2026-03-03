import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  Menu, X, LayoutDashboard, Upload, Users, ListCheck, FileText, Settings,
  Shield, LogOut, BarChart3, MapPin, Activity, GitBranch, Sparkles, Mail,
  Search, Bot, ChevronDown, ChevronRight, FileBarChart2, Building2, TrendingUp, Network, Megaphone, Target, Calendar, Database, Wrench, HelpCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import GlobalSearchDialog from '../search/GlobalSearchDialog';
import NotificationBell from '../shared/NotificationBell';

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard', roles: ['admin', 'user'] },
      { name: 'AI Assistant', icon: Bot, page: 'AIAssistant', roles: ['admin', 'user'] },
    ]
  },
  {
    label: 'Providers',
    items: [
      { name: 'All Providers', icon: Users, page: 'Providers', roles: ['admin', 'user'] },
      { name: 'Locations', icon: MapPin, page: 'Locations', roles: ['admin', 'user'] },
      { name: 'Territory Map', icon: MapPin, page: 'TerritoryIntelligence', roles: ['admin', 'user'] },
    ]
  },
  {
    label: 'Sales & Outreach',
    items: [
      { name: 'Lead Lists', icon: ListCheck, page: 'LeadLists', roles: ['admin', 'user'] },
      { name: 'Email Bot', icon: Mail, page: 'EmailSearchBot', roles: ['admin'] },
      { name: 'Campaigns', icon: Megaphone, page: 'Campaigns', roles: ['admin'] },
      { name: 'Outreach', icon: Mail, page: 'ProviderOutreach', roles: ['admin'] },
    ]
  },
  {
    label: 'Analytics',
    items: [
      { name: 'Analytics', icon: TrendingUp, page: 'AdvancedAnalytics', roles: ['admin', 'user'] },
      { name: 'CMS Data', icon: BarChart3, page: 'CMSAnalytics', roles: ['admin', 'user'] },
      { name: 'Network', icon: Network, page: 'ReferralNetworkIntelligence', roles: ['admin', 'user'] },
      { name: 'Reports', icon: FileBarChart2, page: 'CustomReports', roles: ['admin', 'user'] },
    ]
  },
  {
    label: 'Admin',
    items: [
      { name: 'Data Center', icon: Upload, page: 'DataCenter', roles: ['admin'] },
      { name: 'CMS Data Sources', icon: Database, page: 'CMSDataSources', roles: ['admin'] },
      { name: 'API Connectors', icon: Server, page: 'APIConnectors', roles: ['admin'] },
      { name: 'Imports', icon: Activity, page: 'ImportMonitoring', roles: ['admin'] },
      { name: 'NPPES Crawler', icon: Bot, page: 'NPPESCrawler', roles: ['admin'] },
      { name: 'Enrichment', icon: Database, page: 'EnrichmentHub', roles: ['admin'] },
      { name: 'Data Quality', icon: Shield, page: 'DataQuality', roles: ['admin'] },
      { name: 'Scoring Rules', icon: Target, page: 'ScoringRules', roles: ['admin'] },
      { name: 'Audit Log', icon: Wrench, page: 'AuditLog', roles: ['admin'] },
      { name: 'Admin Settings', icon: Settings, page: 'AdminSettings', roles: ['admin'] },
      { name: 'Help', icon: HelpCircle, page: 'Help', roles: ['admin', 'user'] },
    ]
  },
];

export default function AppLayout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [searchOpen, setSearchOpen] = useState(false);
  const mainRef = React.useRef(null);

  useEffect(() => {
    // Scroll main container to top
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
    // Also scroll window in case of nested scrolling
    window.scrollTo(0, 0);
    // Retry after render in case content loads async
    const t = setTimeout(() => {
      if (mainRef.current) {
        mainRef.current.scrollTop = 0;
      }
    }, 50);
    return () => clearTimeout(t);
  }, [currentPageName]);

  // Auto-expand sidebar on large screens
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setSidebarOpen(mq.matches);
    const handler = (e) => setSidebarOpen(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
      } catch (error) {
        console.error('Failed to load user', error);
      }
    };
    loadUser();
  }, []);

  const toggleSection = (label) => {
    setCollapsedSections(prev => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="flex h-screen bg-[#0f1729]">
      <style>{`
        .scrollbar-dark::-webkit-scrollbar { width: 6px; }
        .scrollbar-dark::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-dark::-webkit-scrollbar-thumb { background: rgba(99,116,158,0.4); border-radius: 3px; }
        .scrollbar-dark::-webkit-scrollbar-thumb:hover { background: rgba(99,116,158,0.6); }
        .scrollbar-dark { scrollbar-width: thin; scrollbar-color: rgba(99,116,158,0.4) transparent; }
      `}</style>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-52 fixed lg:relative z-40' : 'w-0 lg:w-14 overflow-hidden lg:overflow-visible'} bg-[#0b1120] text-slate-400 border-r border-slate-800/60 transition-all duration-300 flex flex-col h-full`} onClick={(e) => { if (window.innerWidth < 1024 && sidebarOpen && e.target.tagName === 'A') setSidebarOpen(false); }}>
        {/* Logo */}
        <div className="p-4 flex items-center justify-between border-b border-slate-800/60">
          {sidebarOpen ? (
            <div className="flex items-center gap-3">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6993c62145573ca8a97ad4a9/553986bd4_CareMetric_favicon_256x256.png"
                alt="CareMetric AI"
                className="w-10 h-10 rounded-xl flex-shrink-0"
                style={{ background: 'transparent', mixBlendMode: 'screen' }}
              />
              <div>
                <h1 className="text-sm font-bold text-white leading-tight tracking-tight">CareMetric <span className="text-cyan-400">AI</span></h1>
                <p className="text-[10px] text-slate-500 font-medium tracking-wider uppercase">Intelligence</p>
              </div>
            </div>
          ) : (
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6993c62145573ca8a97ad4a9/553986bd4_CareMetric_favicon_256x256.png"
              alt="CareMetric AI"
              className="w-10 h-10 rounded-xl mx-auto"
              style={{ background: 'transparent', mixBlendMode: 'screen' }}
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-slate-500 hover:text-white hover:bg-slate-800/60 h-7 w-7"
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>

        {/* Search Button */}
        <div className="px-2 py-2">
          <button
            onClick={() => setSearchOpen(true)}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-cyan-400 hover:bg-slate-800/50 transition-colors ${sidebarOpen ? '' : 'justify-center'}`}
          >
            <Search className="w-4 h-4 shrink-0" />
            {sidebarOpen && (
              <>
                <span className="flex-1 text-left">Search...</span>
                <kbd className="text-[10px] text-slate-500 border border-slate-700 rounded px-1 py-0.5">⌘K</kbd>
              </>
            )}
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1 scrollbar-dark">
          {NAV_SECTIONS.map((section) => {
            const filteredItems = user?.role
              ? section.items.filter(item => item.roles.includes(user.role))
              : section.items;
            if (filteredItems.length === 0) return null;
            const isCollapsed = collapsedSections[section.label];

            return (
              <div key={section.label} className="mb-1">
                {sidebarOpen && (
                  <button
                    onClick={() => toggleSection(section.label)}
                    className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {section.label}
                    {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
                {!isCollapsed && filteredItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPageName === item.page;
                  return (
                    <Link
                      key={item.name}
                      to={createPageUrl(item.page)}
                      title={item.name}
                      onClick={() => { if (window.innerWidth < 1024) setSidebarOpen(false); }}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] transition-all duration-150 ${
                        isActive
                          ? 'bg-cyan-500/10 text-cyan-400 font-medium border-l-2 border-cyan-400 ml-0.5'
                          : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-cyan-400' : ''}`} />
                      {sidebarOpen && <span className="truncate">{item.name}</span>}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="p-3 border-t border-slate-800/60">
          {sidebarOpen && (
            <div className="mb-2 px-2 flex items-center justify-between">
              <div>
                {user && <p className="text-xs font-medium text-slate-300 truncate">{user.full_name || user.email}</p>}
                {user && <p className="text-[10px] text-slate-500 capitalize">{user.role?.replace('_', ' ')}</p>}
              </div>
              <NotificationBell />
            </div>
          )}
          {!sidebarOpen && (
            <div className="flex justify-center mb-2">
              <NotificationBell />
            </div>
          )}
          <Button
            variant="ghost"
            onClick={() => base44.auth.logout()}
            className="w-full text-slate-500 hover:text-slate-200 hover:bg-slate-800/50 justify-start h-8 text-xs"
          >
            <LogOut className="w-4 h-4" />
            {sidebarOpen && <span className="ml-2">Sign Out</span>}
          </Button>
        </div>
      </aside>

      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-20 bg-[#0b1120] border-b border-slate-800/60 px-3 py-2 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-400 hover:text-white hover:bg-slate-800/60 h-8 w-8">
          <Menu className="w-5 h-5" />
        </Button>
        <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6993c62145573ca8a97ad4a9/553986bd4_CareMetric_favicon_256x256.png" alt="CareMetric AI" className="w-7 h-7 rounded-lg" style={{ background: 'transparent', mixBlendMode: 'screen' }} />
        <h1 className="text-sm font-bold text-white flex-1">CareMetric <span className="text-cyan-400">AI</span></h1>
        <NotificationBell />
      </div>

      {/* Main content */}
      <main ref={mainRef} className="flex-1 overflow-auto bg-[#0f1729] flex flex-col pt-12 lg:pt-0">
        <div className="flex-1">
          {children}
        </div>
        <div className="px-4 sm:px-8 py-2.5 border-t border-slate-800/60 bg-[#0b1120]/80 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6993c62145573ca8a97ad4a9/553986bd4_CareMetric_favicon_256x256.png"
                alt="CareMetric AI"
                className="w-4 h-4 rounded"
                style={{ background: 'transparent', mixBlendMode: 'screen' }}
              />
              <span className="text-[11px] text-slate-500 font-medium">CareMetric AI</span>
              <span className="text-[11px] text-slate-500">•</span>
              <a href="https://www.CareMetric.ai" target="_blank" rel="noopener noreferrer" className="text-[11px] text-cyan-500/70 hover:text-cyan-400 hover:underline">www.CareMetric.ai</a>
            </div>
          </div>
          <p className="text-[9px] text-slate-500 text-center mt-1 leading-relaxed max-w-4xl mx-auto">
            Data Sources: All data is derived from publicly available CMS Medicare datasets and NPPES National Provider files. Insights are estimates based on public data patterns and do not represent confirmed referral relationships.
          </p>
        </div>
      </main>
    </div>
  );
}