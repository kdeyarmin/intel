import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Search, ArrowUpDown, ExternalLink } from 'lucide-react';

export default function DrillDownTable({ providers = [], utilization = [], referrals = [], locations = [] }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('total_medicare_payment');
  const [sortDir, setSortDir] = useState('desc');
  const [stateFilter, setStateFilter] = useState('all');

  const npiState = useMemo(() => {
    const m = {};
    locations.forEach(l => { if (l.is_primary && l.state) m[l.npi] = l.state; });
    return m;
  }, [locations]);

  const states = useMemo(() => {
    const s = new Set(Object.values(npiState));
    return [...s].sort();
  }, [npiState]);

  // Aggregate data per NPI
  const rows = useMemo(() => {
    const utilByNPI = {};
    utilization.forEach(u => {
      if (!utilByNPI[u.npi]) utilByNPI[u.npi] = { total_medicare_payment: 0, total_services: 0, total_medicare_beneficiaries: 0, years: new Set() };
      utilByNPI[u.npi].total_medicare_payment += u.total_medicare_payment || 0;
      utilByNPI[u.npi].total_services += u.total_services || 0;
      utilByNPI[u.npi].total_medicare_beneficiaries += u.total_medicare_beneficiaries || 0;
      if (u.year) utilByNPI[u.npi].years.add(u.year);
    });
    const refByNPI = {};
    referrals.forEach(r => {
      if (!refByNPI[r.npi]) refByNPI[r.npi] = 0;
      refByNPI[r.npi] += r.total_referrals || 0;
    });

    return providers.map(p => {
      const name = p.entity_type === 'Individual' ? `${p.last_name || ''}, ${p.first_name || ''}`.trim() : p.organization_name || p.npi;
      const u = utilByNPI[p.npi] || {};
      return {
        npi: p.npi,
        name,
        entity_type: p.entity_type,
        state: npiState[p.npi] || '',
        total_medicare_payment: u.total_medicare_payment || 0,
        total_services: u.total_services || 0,
        total_medicare_beneficiaries: u.total_medicare_beneficiaries || 0,
        total_referrals: refByNPI[p.npi] || 0,
        year_count: u.years?.size || 0,
      };
    });
  }, [providers, utilization, referrals, npiState]);

  const filtered = useMemo(() => {
    let r = [...rows];
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(x => (x.name || '').toLowerCase().includes(q) || (x.npi || '').includes(q));
    }
    if (stateFilter !== 'all') r = r.filter(x => x.state === stateFilter);
    r.sort((a, b) => sortDir === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]);
    return r.slice(0, 50);
  }, [rows, search, stateFilter, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const fv = (v) => {
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return v.toLocaleString();
  };

  const cols = [
    { key: 'total_medicare_payment', label: 'Payments' },
    { key: 'total_services', label: 'Services' },
    { key: 'total_medicare_beneficiaries', label: 'Beneficiaries' },
    { key: 'total_referrals', label: 'Referrals' },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="text-base">Provider Drill-Down</CardTitle>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input placeholder="Search NPI or name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs w-48" />
            </div>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="w-24 h-8 text-xs"><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {states.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="text-left py-2 font-medium">Provider</th>
                <th className="text-left py-2 font-medium w-12">State</th>
                {cols.map(c => (
                  <th key={c.key} className="text-right py-2 font-medium cursor-pointer hover:text-slate-700 select-none" onClick={() => toggleSort(c.key)}>
                    <span className="flex items-center justify-end gap-1">
                      {c.label}
                      {sortKey === c.key && <ArrowUpDown className="w-3 h-3" />}
                    </span>
                  </th>
                ))}
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.npi} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="py-2">
                    <div>
                      <span className="font-medium text-slate-700">{r.name}</span>
                      <span className="text-slate-400 ml-1.5">{r.npi}</span>
                    </div>
                  </td>
                  <td className="text-slate-500">{r.state || '-'}</td>
                  {cols.map(c => (
                    <td key={c.key} className="text-right text-slate-600 font-mono">{fv(r[c.key])}</td>
                  ))}
                  <td>
                    <Link to={createPageUrl(`ProviderDetail?npi=${r.npi}`)}>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400 hover:text-blue-500" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 50 && <p className="text-[10px] text-slate-400 text-center mt-2">Showing top 50 results</p>}
      </CardContent>
    </Card>
  );
}