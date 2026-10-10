import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { pagesConfig } from '@/pages.config.js';
import { useAuth } from '@/lib/AuthContext';
import { getVisibleNavSections } from '@/components/layout/navConfig';
import {
  Search, Users, MapPin, Building2, Activity, GitBranch,
  ListChecks, FileBarChart2, ArrowUp, ArrowDown
} from 'lucide-react';

const CATEGORY_CONFIG = {
  Provider:     { icon: Users,        color: 'bg-blue-900/15 text-blue-400' },
  Organization: { icon: Building2,    color: 'bg-indigo-900/15 text-indigo-400' },
  Location:     { icon: MapPin,       color: 'bg-sky-500/15 text-sky-400' },
  Utilization:  { icon: Activity,     color: 'bg-teal-900/15 text-teal-400' },
  Referral:     { icon: GitBranch,    color: 'bg-violet-900/15 text-violet-400' },
  'Lead List':  { icon: ListChecks,   color: 'bg-amber-900/15 text-amber-400' },
  Page:         { icon: FileBarChart2, color: 'bg-slate-500/15 text-slate-400' },
};

// Shortcuts into pre-filtered views (the list pages keep filters in the URL).
const QUICK_LINKS = [
  { label: 'Providers with an email', url: '/Providers?email=has_email' },
  { label: 'Highest-scored providers', url: '/Providers?sort=score&dir=desc' },
  { label: 'Organizations', url: '/Organizations' },
  { label: 'Lead lists', url: '/LeadLists' },
];

const isFullNpi = (q) => /^\d{10}$/.test(q);
// "15213", "15213-1234", "Pittsburgh, PA".
const isPlaceQuery = (q) => /^\d{5}(-?\d{4})?$/.test(q) || /^[A-Za-z .'-]{2,},\s*[A-Za-z]{2}$/.test(q);

export default function GlobalSearchDialog({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const normalizedQuery = query.trim();
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(normalizedQuery), 250);
    return () => clearTimeout(t);
  }, [normalizedQuery]);
  const hasSearchTerm = open && debouncedQuery.length >= 2;
  const npiQuery = hasSearchTerm && isFullNpi(debouncedQuery) ? debouncedQuery : null;

  // Providers are searched on the server across the whole table (this used to
  // filter the newest 500 rows in the browser, so most names returned nothing).
  const { data: providers = [], isFetching: searchingProviders } = useQuery({
    queryKey: ['globalSearchProviders', debouncedQuery],
    queryFn: async () => {
      const res = await base44.functions.invoke('searchProviders', { q: debouncedQuery, limit: 20 });
      return res.data?.providers || [];
    },
    enabled: hasSearchTerm,
    staleTime: 60000,
  });

  // For an exact NPI, also show that provider's locations and CMS records.
  const { data: npiLocations = [], isFetching: fetchingNpiLocations } = useQuery({
    queryKey: ['globalSearchLocations', npiQuery],
    queryFn: () => base44.entities.ProviderLocation.filter({ npi: npiQuery }, undefined, 20),
    enabled: !!npiQuery,
    staleTime: 60000,
  });

  // A ZIP or "City, ST" finds locations there.
  const placeQuery = hasSearchTerm && !npiQuery && isPlaceQuery(debouncedQuery) ? debouncedQuery : null;
  const { data: placeLocations = [], isFetching: fetchingPlaces } = useQuery({
    queryKey: ['globalSearchPlaces', placeQuery],
    queryFn: async () => {
      const res = await base44.functions.invoke('searchLocations', { q: placeQuery, limit: 8 });
      return res.data?.locations || [];
    },
    enabled: !!placeQuery,
    staleTime: 60000,
  });
  const locations = npiQuery ? npiLocations : placeLocations;
  const fetchingLocations = fetchingNpiLocations || fetchingPlaces;

  const { data: utilizations = [], isFetching: fetchingUtil } = useQuery({
    queryKey: ['globalSearchUtil', npiQuery],
    queryFn: async () => {
      const rows = await base44.entities.ProviderServiceUtilization.filter({ npi: npiQuery }, '-data_year', 5);
      return rows.map(r => ({ ...r, year: r.data_year, total_medicare_payment: r.total_medicare_payment_amt || 0, total_medicare_beneficiaries: r.total_unique_benes || 0 }));
    },
    enabled: !!npiQuery,
    staleTime: 60000,
  });

  const { data: referrals = [], isFetching: fetchingReferrals } = useQuery({
    queryKey: ['globalSearchRef', npiQuery],
    queryFn: () => base44.entities.CMSReferral.filter({ npi: npiQuery }, undefined, 5),
    enabled: !!npiQuery,
    staleTime: 60000,
  });

  const { data: leadLists = [], isFetching: fetchingLists } = useQuery({
    queryKey: ['globalLeadLists'],
    queryFn: () => base44.entities.LeadList.list('-created_date', 200),
    enabled: hasSearchTerm,
    staleTime: 120000,
  });

  // "No results" only once every search that's running has answered.
  const searching = searchingProviders || fetchingLocations || fetchingUtil || fetchingReferrals || fetchingLists;

  useEffect(() => {
    if (!open) { setQuery(''); setActiveCategory('all'); setHighlightIdx(-1); }
  }, [open]);

  useEffect(() => { setHighlightIdx(-1); }, [query, activeCategory]);
  useEffect(() => {
    listRef.current?.querySelector('[data-highlighted]')?.scrollIntoView?.({ block: 'nearest' });
  }, [highlightIdx]);

  // Only sidebar pages the user can open: detail pages need an id, alias
  // routes duplicate real pages, and admin pages would just say "Access denied".
  const searchablePages = useMemo(() => (
    getVisibleNavSections(user?.role).flatMap((section) =>
      section.items.map((item) => ({ name: item.name, page: item.page, section: section.label })))
  ), [user?.role]);

  const allResults = useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const items = [];

    // Pages
    searchablePages.forEach(p => {
      if (p.name.toLowerCase().includes(q) || p.section.toLowerCase().includes(q)) {
        items.push({ type: 'Page', label: p.name, sublabel: p.section, url: createPageUrl(p.page), pageName: p.page });
      }
    });

    // Providers
    providers.forEach(p => {
      const name = p.entity_type === 'Individual'
        ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
        : p.organization_name || '';
      {
        const isOrg = p.entity_type === 'Organization';
        items.push({
          type: isOrg ? 'Organization' : 'Provider',
          label: name || p.npi,
          sublabel: `NPI: ${p.npi}${p.credential ? ` • ${p.credential}` : ''}${p.status === 'Deactivated' ? ' • Deactivated' : ''}`,
          url: createPageUrl(`ProviderDetail?npi=${p.npi}`),
          pageName: 'ProviderDetail',
        });
      }
    });

    // Locations
    locations.forEach(l => {
      {
        items.push({
          type: 'Location',
          label: `${l.address_1 || 'Unknown'}, ${l.city || ''} ${l.state || ''}`,
          sublabel: `NPI: ${l.npi} • ${l.location_type || 'Location'}`,
          url: createPageUrl(`LocationDetail?id=${l.id}`),
          pageName: 'LocationDetail',
        });
      }
    });

    // Utilization (search by NPI)
    if (npiQuery) {
      const seen = new Set();
      utilizations.forEach(u => {
        if ((u.npi || '').includes(q) && !seen.has(u.npi)) {
          seen.add(u.npi);
          items.push({
            type: 'Utilization',
            label: `Utilization for NPI ${u.npi}`,
            sublabel: `${u.year || ''} • ${(u.total_medicare_beneficiaries || 0).toLocaleString()} beneficiaries • $${((u.total_medicare_payment || 0) / 1000).toFixed(0)}K`,
            url: createPageUrl(`ProviderDetail?npi=${u.npi}`),
            pageName: 'ProviderDetail',
          });
        }
      });
      const refSeen = new Set();
      referrals.forEach(r => {
        if ((r.npi || '').includes(q) && !refSeen.has(r.npi)) {
          refSeen.add(r.npi);
          items.push({
            type: 'Referral',
            label: `Referrals for NPI ${r.npi}`,
            sublabel: `${r.year || ''} • ${(r.total_referrals || 0).toLocaleString()} total referrals`,
            url: createPageUrl(`ProviderDetail?npi=${r.npi}`),
            pageName: 'ProviderDetail',
          });
        }
      });
    }

    // Lead Lists
    leadLists.forEach(ll => {
      if ((ll.name || '').toLowerCase().includes(q) || (ll.description || '').toLowerCase().includes(q)) {
        items.push({
          type: 'Lead List',
          label: ll.name,
          sublabel: `${ll.member_count || 0} providers`,
          url: `${createPageUrl('LeadLists')}?list=${ll.id}`,
          pageName: 'LeadLists',
        });
      }
    });

    return items;
  }, [query, searchablePages, providers, locations, utilizations, referrals, leadLists, npiQuery]);

  const categories = useMemo(() => {
    const counts = {};
    allResults.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allResults]);

  const filteredResults = activeCategory === 'all'
    ? allResults.slice(0, 25)
    : allResults.filter(r => r.type === activeCategory).slice(0, 25);

  // Recent searches
  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('recentSearches') || '[]'); } catch { return []; }
  });

  const preloadResultPage = (item) => {
    if (item?.pageName) pagesConfig.preloadPage?.(item.pageName);
  };

  const goTo = (url) => {
    if (query && query.length >= 2) {
      const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5);
      setRecentSearches(updated);
      localStorage.setItem('recentSearches', JSON.stringify(updated));
    }
    onOpenChange(false);
    navigate(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (filteredResults.length === 0) return;
              if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(prev => Math.min(prev + 1, filteredResults.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(prev => Math.max(prev - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); goTo(filteredResults[Math.max(highlightIdx, 0)].url); }
            }}
            placeholder="Search providers, organizations, NPIs, lead lists, pages..."
            aria-label="Search"
            className="border-0 shadow-none focus-visible:ring-0 text-base h-12"
            autoFocus
          />
          <div className="flex items-center gap-1 shrink-0">
            <kbd className="text-[10px] text-slate-400 border rounded px-1 py-0.5"><ArrowUp className="w-2.5 h-2.5 inline" /></kbd>
            <kbd className="text-[10px] text-slate-400 border rounded px-1 py-0.5"><ArrowDown className="w-2.5 h-2.5 inline" /></kbd>
            <span className="text-[10px] text-slate-300 mx-0.5">to navigate</span>
            <kbd className="text-[10px] text-slate-400 border rounded px-1.5 py-0.5">ESC</kbd>
          </div>
        </div>

        {/* Category filter pills */}
        {query.length >= 2 && categories.length > 1 && (
          <div className="flex gap-1.5 px-4 py-2 border-b overflow-x-auto">
            <button
              onClick={() => setActiveCategory('all')}
              className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${activeCategory === 'all' ? 'bg-cyan-900/15 text-cyan-400 border-cyan-500/30' : 'text-slate-500 border-slate-700 hover:border-slate-500'}`}
            >
              All ({allResults.length})
            </button>
            {categories.map(([cat, count]) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${activeCategory === cat ? 'bg-cyan-900/15 text-cyan-400 border-cyan-500/30' : 'text-slate-500 border-slate-700 hover:border-slate-500'}`}
              >
                {cat} ({count})
              </button>
            ))}
          </div>
        )}

        <div className="max-h-[400px] overflow-auto">
          {query.length < 2 ? (
            <div className="py-6 px-4 space-y-4">
              {recentSearches.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Recent Searches</p>
                  <div className="flex flex-wrap gap-1.5">
                    {recentSearches.map((s, i) => (
                      <button key={i} onClick={() => setQuery(s)} className="text-xs px-2.5 py-1 rounded-full border border-slate-700 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Jump to</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_LINKS.map((link) => (
                    <Link key={link.url} to={link.url} onClick={() => onOpenChange(false)} className="text-xs px-2.5 py-1 rounded-full border border-slate-700 text-slate-500 hover:text-cyan-400 hover:border-cyan-500/40 transition-colors">
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
              <p className="text-xs text-slate-400 text-center pt-2">Type at least 2 characters to search</p>
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400" role="status">
              {searching || debouncedQuery !== normalizedQuery
                ? 'Searching…'
                : `No results found for "${query}"`}
            </div>
          ) : (
            <div className="py-1" ref={listRef}>
              {filteredResults.map((item, idx) => {
                const config = CATEGORY_CONFIG[item.type] || CATEGORY_CONFIG.Page;
                const Icon = config.icon;
                const isHighlighted = idx === highlightIdx;
                return (
                  <button
                    key={idx}
                    data-highlighted={isHighlighted || undefined}
                    onClick={() => goTo(item.url)}
                    onFocus={() => preloadResultPage(item)}
                    onMouseEnter={() => { setHighlightIdx(idx); preloadResultPage(item); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isHighlighted ? 'bg-cyan-900/10' : 'hover:bg-slate-800/50'}`}
                  >
                    <div className={`p-1.5 rounded-md ${config.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">{item.label}</p>
                      <p className="text-xs text-slate-500 truncate">{item.sublabel}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{item.type}</Badge>
                  </button>
                );
              })}
              {allResults.length > 25 && activeCategory === 'all' && (
                <p className="text-xs text-slate-400 text-center py-2">
                  Showing 25 of {allResults.length} results — use category filters to narrow
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
