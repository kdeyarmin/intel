import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search, Users, MapPin, Building2, Activity, GitBranch,
  Stethoscope, ListChecks, FileBarChart2
} from 'lucide-react';

const CATEGORY_CONFIG = {
  Provider:     { icon: Users,        color: 'bg-blue-50 text-blue-600' },
  Organization: { icon: Building2,    color: 'bg-indigo-50 text-indigo-600' },
  Location:     { icon: MapPin,       color: 'bg-sky-50 text-sky-600' },
  Utilization:  { icon: Activity,     color: 'bg-teal-50 text-teal-600' },
  Referral:     { icon: GitBranch,    color: 'bg-violet-50 text-violet-600' },
  Taxonomy:     { icon: Stethoscope,  color: 'bg-emerald-50 text-emerald-600' },
  'Lead List':  { icon: ListChecks,   color: 'bg-amber-50 text-amber-600' },
  Page:         { icon: FileBarChart2, color: 'bg-slate-100 text-slate-600' },
};

const PAGES = [
  { name: 'Dashboard', page: 'Dashboard' },
  { name: 'Providers', page: 'Providers' },
  { name: 'Locations', page: 'Locations' },
  { name: 'Utilization', page: 'Utilization' },
  { name: 'Referrals', page: 'Referrals' },
  { name: 'CMS Analytics', page: 'CMSAnalytics' },
  { name: 'Custom Reports', page: 'CustomReports' },
  { name: 'Lead Lists', page: 'LeadLists' },
  { name: 'Data Quality', page: 'DataQuality' },
  { name: 'Data Imports', page: 'DataImports' },
  { name: 'Location Analytics', page: 'LocationAnalytics' },
  { name: 'Scoring Rules', page: 'ScoringRules' },
  { name: 'Audit Log', page: 'AuditLog' },
  { name: 'Error Reports', page: 'ErrorReports' },
];

export default function GlobalSearchDialog({ open, onOpenChange }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  const { data: providers = [] } = useQuery({
    queryKey: ['globalProviders'],
    queryFn: () => base44.entities.Provider.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['globalLocations'],
    queryFn: () => base44.entities.ProviderLocation.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: taxonomies = [] } = useQuery({
    queryKey: ['globalTaxonomies'],
    queryFn: () => base44.entities.ProviderTaxonomy.list('-created_date', 500),
    staleTime: 120000,
  });

  const { data: utilizations = [] } = useQuery({
    queryKey: ['globalUtil'],
    queryFn: () => base44.entities.CMSUtilization.list('-created_date', 300),
    staleTime: 120000,
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ['globalRef'],
    queryFn: () => base44.entities.CMSReferral.list('-created_date', 300),
    staleTime: 120000,
  });

  const { data: leadLists = [] } = useQuery({
    queryKey: ['globalLeadLists'],
    queryFn: () => base44.entities.LeadList.list('-created_date', 100),
    staleTime: 120000,
  });

  useEffect(() => {
    if (!open) { setQuery(''); setActiveCategory('all'); }
  }, [open]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onOpenChange]);

  const allResults = useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const items = [];

    // Pages
    PAGES.forEach(p => {
      if (p.name.toLowerCase().includes(q)) {
        items.push({ type: 'Page', label: p.name, sublabel: 'Navigate to page', url: createPageUrl(p.page) });
      }
    });

    // Providers
    providers.forEach(p => {
      const name = p.entity_type === 'Individual'
        ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
        : p.organization_name || '';
      if (name.toLowerCase().includes(q) || (p.npi || '').includes(q) || (p.credential || '').toLowerCase().includes(q)) {
        const isOrg = p.entity_type === 'Organization';
        items.push({
          type: isOrg ? 'Organization' : 'Provider',
          label: name || p.npi,
          sublabel: `NPI: ${p.npi}${p.credential ? ` • ${p.credential}` : ''}${p.status === 'Deactivated' ? ' • Deactivated' : ''}`,
          url: isOrg ? createPageUrl(`OrganizationDetail?npi=${p.npi}`) : createPageUrl(`ProviderDetail?npi=${p.npi}`),
        });
      }
    });

    // Locations
    locations.forEach(l => {
      const addr = `${l.address_1 || ''} ${l.city || ''} ${l.state || ''} ${l.zip || ''}`.toLowerCase();
      if (addr.includes(q) || (l.npi || '').includes(q)) {
        items.push({
          type: 'Location',
          label: `${l.address_1 || 'Unknown'}, ${l.city || ''} ${l.state || ''}`,
          sublabel: `NPI: ${l.npi} • ${l.location_type || ''} ${l.is_primary ? '• Primary' : ''}`,
          url: createPageUrl(`LocationDetail?id=${l.id}`),
        });
      }
    });

    // Taxonomies
    taxonomies.forEach(t => {
      const desc = (t.taxonomy_description || '').toLowerCase();
      const code = (t.taxonomy_code || '').toLowerCase();
      if (desc.includes(q) || code.includes(q)) {
        items.push({
          type: 'Taxonomy',
          label: t.taxonomy_description || t.taxonomy_code,
          sublabel: `NPI: ${t.npi} • Code: ${t.taxonomy_code || ''}${t.primary_flag ? ' • Primary' : ''}`,
          url: createPageUrl(`ProviderDetail?npi=${t.npi}`),
        });
      }
    });

    // Utilization (search by NPI)
    if (/^\d{4,}$/.test(query)) {
      const seen = new Set();
      utilizations.forEach(u => {
        if ((u.npi || '').includes(q) && !seen.has(u.npi)) {
          seen.add(u.npi);
          items.push({
            type: 'Utilization',
            label: `Utilization for NPI ${u.npi}`,
            sublabel: `${u.year || ''} • ${(u.total_medicare_beneficiaries || 0).toLocaleString()} beneficiaries • $${((u.total_medicare_payment || 0) / 1000).toFixed(0)}K`,
            url: createPageUrl(`ProviderDetail?npi=${u.npi}`),
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
          sublabel: `${ll.provider_count || 0} providers`,
          url: createPageUrl('LeadLists'),
        });
      }
    });

    return items;
  }, [query, providers, locations, taxonomies, utilizations, referrals, leadLists]);

  const categories = useMemo(() => {
    const counts = {};
    allResults.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allResults]);

  const filteredResults = activeCategory === 'all'
    ? allResults.slice(0, 25)
    : allResults.filter(r => r.type === activeCategory).slice(0, 25);

  const goTo = (url) => {
    onOpenChange(false);
    navigate(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search providers, locations, specialties, NPIs..."
            className="border-0 shadow-none focus-visible:ring-0 text-base h-12"
            autoFocus
          />
          <kbd className="text-[10px] text-slate-400 border rounded px-1.5 py-0.5 shrink-0">ESC</kbd>
        </div>

        {/* Category filter pills */}
        {query.length >= 2 && categories.length > 1 && (
          <div className="flex gap-1.5 px-4 py-2 border-b overflow-x-auto">
            <button
              onClick={() => setActiveCategory('all')}
              className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${activeCategory === 'all' ? 'bg-slate-800 text-white border-slate-800' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              All ({allResults.length})
            </button>
            {categories.map(([cat, count]) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${activeCategory === cat ? 'bg-slate-800 text-white border-slate-800' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}
              >
                {cat} ({count})
              </button>
            ))}
          </div>
        )}

        <div className="max-h-[400px] overflow-auto">
          {query.length < 2 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              Type at least 2 characters to search across all entities
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              No results found for "{query}"
            </div>
          ) : (
            <div className="py-1">
              {filteredResults.map((item, idx) => {
                const config = CATEGORY_CONFIG[item.type] || CATEGORY_CONFIG.Page;
                const Icon = config.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => goTo(item.url)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors"
                  >
                    <div className={`p-1.5 rounded-md ${config.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{item.label}</p>
                      <p className="text-xs text-slate-400 truncate">{item.sublabel}</p>
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