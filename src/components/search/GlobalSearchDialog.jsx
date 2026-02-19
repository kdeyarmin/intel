import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Users, MapPin, Building2, Activity, GitBranch, Loader2 } from 'lucide-react';

export default function GlobalSearchDialog({ open, onOpenChange }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

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

  // Reset query on close
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // Keyboard shortcut: Cmd/Ctrl + K
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

  const results = useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    const items = [];

    // Search providers
    providers.forEach(p => {
      const name = p.entity_type === 'Individual'
        ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
        : p.organization_name || '';
      if (
        name.toLowerCase().includes(q) ||
        (p.npi || '').includes(q) ||
        (p.credential || '').toLowerCase().includes(q)
      ) {
        items.push({
          type: p.entity_type === 'Organization' ? 'Organization' : 'Provider',
          icon: p.entity_type === 'Organization' ? Building2 : Users,
          label: name || p.npi,
          sublabel: `NPI: ${p.npi}${p.credential ? ` • ${p.credential}` : ''}`,
          url: p.entity_type === 'Organization'
            ? createPageUrl(`OrganizationDetail?npi=${p.npi}`)
            : createPageUrl(`ProviderDetail?npi=${p.npi}`),
        });
      }
    });

    // Search locations
    locations.forEach(l => {
      const addr = `${l.address_1 || ''} ${l.city || ''} ${l.state || ''} ${l.zip || ''}`.toLowerCase();
      if (addr.includes(q) || (l.npi || '').includes(q)) {
        items.push({
          type: 'Location',
          icon: MapPin,
          label: `${l.address_1 || 'Unknown'}, ${l.city || ''} ${l.state || ''}`,
          sublabel: `NPI: ${l.npi} • ${l.location_type || ''}`,
          url: createPageUrl(`LocationDetail?id=${l.id}`),
        });
      }
    });

    return items.slice(0, 20);
  }, [query, providers, locations]);

  const goTo = (url) => {
    onOpenChange(false);
    navigate(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search providers, locations, NPIs..."
            className="border-0 shadow-none focus-visible:ring-0 text-base h-12"
            autoFocus
          />
          <kbd className="text-[10px] text-slate-400 border rounded px-1.5 py-0.5 shrink-0">ESC</kbd>
        </div>
        <div className="max-h-[400px] overflow-auto">
          {query.length < 2 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              Type at least 2 characters to search
            </div>
          ) : results.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              No results found for "{query}"
            </div>
          ) : (
            <div className="py-1">
              {results.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => goTo(item.url)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left transition-colors"
                  >
                    <div className="p-1.5 rounded-md bg-slate-100">
                      <Icon className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{item.label}</p>
                      <p className="text-xs text-slate-400 truncate">{item.sublabel}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{item.type}</Badge>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}