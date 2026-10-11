import React, { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Search, MapPin, Star, ChevronRight, Building2, Filter, Loader2 } from 'lucide-react';
import QueryErrorState from '@/components/shared/QueryErrorState';
import { useUrlState } from '@/hooks/useUrlState';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

function formatCurrency(val) {
  if (!val) return '—';
  const num = Number(val);
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${num.toLocaleString()}`;
}

// Search, state and page live in the URL so Back from a facility restores them.
const URL_DEFAULTS = { q: '', state: '', page: 1 };

export default function FacilityListPage({ facilityGroup, title, icon: Icon, color, iconCls, detailPage = 'FacilityDetail' }) {
  const resolvedIconCls = iconCls || "text-cyan-400";
  const [url, setUrl] = useUrlState(URL_DEFAULTS);
  const { q: debouncedSearch, state: selectedState, page } = url;
  const [search, setSearch] = useState(debouncedSearch);
  const setPage = (update) => setUrl((cur) => ({ page: typeof update === 'function' ? update(cur.page) : update }));

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setUrl((cur) => (cur.q === search ? {} : { q: search, page: 1 }));
    }, 400);
    return () => clearTimeout(timer);
  }, [search, setUrl]);
  // Keep the box in sync when Back/Forward changes the URL.
  React.useEffect(() => { setSearch((cur) => (cur === debouncedSearch ? cur : debouncedSearch)); }, [debouncedSearch]);

  const { data, isLoading, isFetching, isPlaceholderData, isError, error, refetch } = useQuery({
    queryKey: ['facilityList', facilityGroup, selectedState, debouncedSearch, page],
    queryFn: () => base44.functions.invoke('listFacilities', {
      facility_group: facilityGroup,
      state: selectedState || undefined,
      search: debouncedSearch || undefined,
      page,
      limit: 50,
    }),
    select: (res) => res.data || res,
    placeholderData: keepPreviousData,
  });

  // A state-licensed home has a capacity and a license, not CMS quality ratings, discharges or payments.
  const licensed = facilityGroup === 'licensed';
  const facilities = data?.facilities || [];
  const total = data?.total || 0;
  const availableStates = data?.available_states || [];
  const totalPages = Math.ceil(total / 50);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <Icon className={`w-6 h-6 ${resolvedIconCls}`} />
          <h1 className="text-xl sm:text-2xl font-bold text-slate-100">{title}</h1>
          <Badge className="bg-slate-700/50 text-slate-400">{total.toLocaleString()} facilities</Badge>
          {/* Previous results stay on screen while the next page/search loads. */}
          {isFetching && isPlaceholderData && (
            <span className="flex items-center gap-1 text-xs text-slate-400" role="status">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating…
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            aria-label={`Search ${title.toLowerCase()}`}
            placeholder={`Search ${title.toLowerCase()}...`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-slate-800/50 border-slate-700/50 text-slate-200 placeholder:text-slate-400"
          />
        </div>
        <Select value={selectedState || 'all'} onValueChange={v => setUrl({ state: v === 'all' ? '' : v, page: 1 })}>
          <SelectTrigger aria-label="Filter by state" className="w-full sm:w-[180px] bg-slate-800/50 border-slate-700/50 text-slate-200">
            <Filter className="w-3.5 h-3.5 mr-2 text-slate-400" />
            <SelectValue placeholder="All States" />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="all" className="text-slate-300">All States</SelectItem>
            {availableStates.map(s => (
              <SelectItem key={s.state} value={s.state} className="text-slate-300">{s.state} ({s.count})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 bg-slate-800" />)}
        </div>
      ) : isError ? (
        <QueryErrorState title={`Couldn't load ${title.toLowerCase()}`} error={error} onRetry={refetch} />
      ) : facilities.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="py-12 text-center">
            <Building2 className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="text-slate-300">No facilities found</p>
            <p className="text-sm text-slate-400 mt-1">Try adjusting your search or filters</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 text-xs text-slate-400 font-medium uppercase tracking-wide">
            <div className="col-span-4">Facility</div>
            <div className={licensed ? 'col-span-6' : 'col-span-3'}>Location</div>
            {licensed ? null : <div className="col-span-1 text-center">Rating</div>}
            {licensed ? null : <div className="col-span-2 text-right">Discharges</div>}
            <div className="col-span-2 text-right">{licensed ? 'Capacity' : 'Payments'}</div>
          </div>
          {facilities.map((f, i) => {
            const rowCls = "grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 bg-slate-800/30 hover:bg-slate-800/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 border border-slate-700/30 rounded-lg px-4 py-3 transition-colors items-center";
            // A state-licensed home has no CMS number, so no detail page to open.
            const Row = f.provider_id ? Link : 'div';
            const rowProps = f.provider_id ? { to: createPageUrl(detailPage) + `?id=${f.provider_id}&group=${facilityGroup}` } : {};
            return (
            <Row
              key={f.provider_id || f.facility_key || i}
              {...rowProps}
              className={rowCls}
            >
              <div className="md:col-span-4 flex items-center gap-3 min-w-0">
                <Building2 className={`w-4 h-4 ${resolvedIconCls} flex-shrink-0`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{f.facility_name || f.provider_id}</p>
                  <p className="text-[10px] text-slate-400 md:hidden">{f.city}, {f.state} {f.zip}</p>
                  {f.license_type ? <p className="text-[10px] text-slate-400">{String(f.license_type).replace(/_/g, ' ')}{f.license_number ? ` · license ${f.license_number}` : ''}{f.status ? ` · ${f.status}` : ''}</p> : null}
                </div>
              </div>
              <div className={`hidden md:flex ${licensed ? 'md:col-span-6' : 'md:col-span-3'} items-center gap-1 text-sm text-slate-400`}>
                <MapPin className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{f.city}, {f.state} {f.zip}</span>
              </div>
              {licensed ? null : (
                <div className="hidden md:flex md:col-span-1 justify-center">
                  {f.quality_rating ? (
                    <Badge className="bg-amber-900/30 text-amber-400 border-amber-500/30 text-xs">
                      <Star className="w-3 h-3 mr-0.5" />{f.quality_rating}
                    </Badge>
                  ) : (
                    <span className="text-slate-400 text-xs">—</span>
                  )}
                </div>
              )}
              {licensed ? null : (
                <div className="hidden md:block md:col-span-2 text-right text-sm text-slate-300">
                  {f.total_discharges ? Number(f.total_discharges).toLocaleString() : '—'}
                </div>
              )}
              <div className="hidden md:flex md:col-span-2 items-center justify-end gap-2">
                <span className="text-sm text-slate-300">{licensed ? (f.capacity != null ? `${Number(f.capacity).toLocaleString()} beds` : '—') : formatCurrency(f.total_payments)}</span>
                {f.provider_id ? <ChevronRight className="w-4 h-4 text-slate-400" /> : null}
              </div>
            </Row>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-slate-400">
            Page {page} of {totalPages} ({total.toLocaleString()} results)
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="border-slate-700 text-slate-300 hover:bg-slate-700">
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="border-slate-700 text-slate-300 hover:bg-slate-700">
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
