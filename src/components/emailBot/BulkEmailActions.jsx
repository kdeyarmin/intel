import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import {
  ShieldCheck, ShieldAlert, ShieldX, Download, RefreshCw,
  Loader2, Search, CheckSquare, Square, Filter
} from 'lucide-react';
import { toast } from 'sonner';

const statusFilters = [
  { value: 'all', label: 'All', icon: Filter, color: 'text-slate-300' },
  { value: 'valid', label: 'Valid', icon: ShieldCheck, color: 'text-emerald-400' },
  { value: 'risky', label: 'Risky', icon: ShieldAlert, color: 'text-amber-400' },
  { value: 'invalid', label: 'Invalid', icon: ShieldX, color: 'text-red-400' },
];

export default function BulkEmailActions({ providers, onRefresh }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isReverifying, setIsReverifying] = useState(false);

  const emailProviders = useMemo(() => {
    return providers.filter(p => p.email && p.email_validation_status != null && p.email_validation_status !== '');
  }, [providers]);

  const filtered = useMemo(() => {
    return emailProviders.filter(p => {
      if (statusFilter !== 'all' && p.email_validation_status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = p.entity_type === 'Individual'
          ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
          : p.organization_name || '';
        if (!name.toLowerCase().includes(q) && !p.email.toLowerCase().includes(q) && !p.npi.includes(q)) return false;
      }
      return true;
    });
  }, [emailProviders, statusFilter, searchQuery]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)));
    }
  };

  const selectedProviders = filtered.filter(p => selectedIds.has(p.id));

  const exportSelected = () => {
    const toExport = selectedProviders.length > 0 ? selectedProviders : filtered;
    if (toExport.length === 0) { toast.error('No emails to export'); return; }

    const headers = ['NPI', 'Name', 'Email', 'Validation Status', 'Confidence', 'Source', 'Reason'];
    const rows = toExport.map(p => {
      const name = p.entity_type === 'Individual'
        ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
        : p.organization_name || '';
      return [p.npi, name, p.email, p.email_validation_status || '', p.email_confidence || '', p.email_source || '', p.email_validation_reason || ''];
    });

    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emails_${statusFilter}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
    toast.success(`Exported ${toExport.length} emails`);
  };

  const reverifySelected = async () => {
    const toVerify = selectedProviders.length > 0 ? selectedProviders : filtered.filter(p => p.email_validation_status === 'risky' || p.email_validation_status === 'invalid');
    if (toVerify.length === 0) { toast.error('No emails selected for re-verification'); return; }

    setIsReverifying(true);
    try {
      const resp = await base44.functions.invoke('bulkVerifyEmails', {
        mode: 'specific_npis',
        npis: toVerify.map(p => p.npi),
        batch_size: toVerify.length,
      });
      toast.success(`Re-verified ${resp.data.verified || 0} emails`);
      onRefresh?.();
    } catch (err) {
      toast.error('Re-verification failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsReverifying(false);
    }
  };

  const statusCounts = useMemo(() => ({
    all: emailProviders.length,
    valid: emailProviders.filter(p => p.email_validation_status === 'valid').length,
    risky: emailProviders.filter(p => p.email_validation_status === 'risky').length,
    invalid: emailProviders.filter(p => p.email_validation_status === 'invalid').length,
  }), [emailProviders]);

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
          Bulk Email Actions
          {selectedIds.size > 0 && (
            <Badge className="bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 text-[10px]">
              {selectedIds.size} selected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filter tabs */}
        <div className="flex flex-wrap gap-1.5">
          {statusFilters.map(sf => {
            const Icon = sf.icon;
            const isActive = statusFilter === sf.value;
            return (
              <button
                key={sf.value}
                onClick={() => { setStatusFilter(sf.value); setSelectedIds(new Set()); }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-all border ${
                  isActive
                    ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                    : 'border-slate-700/50 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                }`}
              >
                <Icon className={`w-3 h-3 ${isActive ? 'text-cyan-400' : sf.color}`} />
                {sf.label}
                <span className="text-[10px] opacity-70">({statusCounts[sf.value]})</span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <Input
            placeholder="Search by name, email, or NPI..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="h-8 text-xs pl-8 bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-500"
          />
        </div>

        {/* Actions bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="ghost" onClick={selectAll} className="gap-1.5 text-xs text-slate-400 hover:text-slate-200 h-7">
            {allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
            {allSelected ? 'Deselect All' : `Select All (${filtered.length})`}
          </Button>

          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={exportSelected}
              disabled={filtered.length === 0}
              className="gap-1.5 text-xs h-7 border-slate-700 text-slate-300 hover:text-cyan-400"
            >
              <Download className="w-3 h-3" />
              Export {selectedIds.size > 0 ? `(${selectedIds.size})` : `All (${filtered.length})`}
            </Button>
            <Button
              size="sm"
              onClick={reverifySelected}
              disabled={isReverifying || filtered.length === 0}
              className="gap-1.5 text-xs h-7 bg-amber-600 hover:bg-amber-700"
            >
              {isReverifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Re-verify {selectedIds.size > 0 ? `(${selectedIds.size})` : 'Filtered'}
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
          {filtered.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-6">No emails match current filters</p>
          )}
          {filtered.map(p => {
            const name = p.entity_type === 'Individual'
              ? `${p.first_name || ''} ${p.last_name || ''}`.trim()
              : p.organization_name || p.npi;
            const isSelected = selectedIds.has(p.id);
            const status = p.email_validation_status;
            const statusColor = status === 'valid' ? 'text-emerald-400' : status === 'risky' ? 'text-amber-400' : status === 'invalid' ? 'text-red-400' : 'text-slate-400';
            const StatusIcon = status === 'valid' ? ShieldCheck : status === 'risky' ? ShieldAlert : status === 'invalid' ? ShieldX : Filter;

            return (
              <div
                key={p.id}
                onClick={() => toggleSelect(p.id)}
                className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition-all border ${
                  isSelected
                    ? 'border-cyan-500/40 bg-cyan-500/5'
                    : 'border-transparent hover:bg-slate-800/40'
                }`}
              >
                <Checkbox checked={isSelected} className="border-slate-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600" />
                <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${statusColor}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-200 truncate">{name}</div>
                  <div className="text-[10px] text-slate-500 truncate">{p.email}</div>
                </div>
                <Badge className={`text-[9px] shrink-0 ${
                  status === 'valid' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' :
                  status === 'risky' ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
                  status === 'invalid' ? 'bg-red-500/15 text-red-400 border-red-500/20' :
                  'bg-slate-500/15 text-slate-400 border-slate-500/20'
                } border`}>
                  {status}
                </Badge>
                <span className="text-[10px] text-slate-500 font-mono shrink-0">{p.npi}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}