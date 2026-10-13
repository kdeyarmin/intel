import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { invokeOrThrow } from '@/api/functionResult';
import { useUrlState } from '@/hooks/useUrlState';
import PageTabs from '@/components/layout/PageTabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClipboardList, Printer, Trash2 } from 'lucide-react';
import { US_STATES } from '@/lib/usStates';
import { fmtCount } from '@/lib/marketFormat';
import { KIND_LABEL, ROSTER_KINDS, SHEET_STATUSES, STATUS_LABEL, filterAccounts, listSheetAccounts, newAccounts, sortAccounts } from '@/lib/callSheet';
import { useConfirm } from '@/components/shared/ConfirmDialog';
import { useBusinessLine } from '@/lib/BusinessLineContext';
import { toast } from 'sonner';

const URL_DEFAULTS = { sheet: '', view: 'all' };
const VIEWS = [
  { id: 'all', label: 'Everyone' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'accounts', label: 'Chart of accounts' },
];
const ADD_CAP = 10000;

export default function CallSheets() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [url, setUrl] = useUrlState(URL_DEFAULTS);
  const [name, setName] = useState('');
  const [state, setState] = useState('PA');
  const [county, setCounty] = useState('');
  const [kinds, setKinds] = useState(() => new Set(['hospital', 'hha', 'hospice', 'snf', 'clinician']));
  const [moreKinds, setMoreKinds] = useState(false);
  const [adding, setAdding] = useState('');
  const { profile, line } = useBusinessLine();
  useEffect(() => {
    setKinds(new Set(profile?.callSheetKinds || ['hospital', 'hha', 'hospice', 'snf', 'clinician']));
    setMoreKinds(false);
  }, [line]);
  const kindChoices = (!profile || moreKinds) ? ROSTER_KINDS : ROSTER_KINDS.filter((k) => profile.callSheetKinds.includes(k.id));

  const { data: sheets = [], isLoading } = useQuery({
    queryKey: ['callSheets'],
    queryFn: () => base44.entities.CallSheet.list('-created_date', 200),
  });
  const sheet = sheets.find((s) => String(s.id) === url.sheet) || null;

  const { data: counties } = useQuery({
    queryKey: ['geoCounties', state],
    queryFn: () => invokeOrThrow('getGeoCounties', { state }),
    enabled: !sheet,
    staleTime: 60 * 60 * 1000,
  });

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ['callSheetAccounts', url.sheet],
    queryFn: () => listSheetAccounts(url.sheet),
    enabled: !!sheet,
  });

  const shown = useMemo(() => sortAccounts(filterAccounts(accounts, url.view), url.view), [accounts, url.view]);
  const countyList = counties?.counties || [];

  async function createSheet(e) {
    e.preventDefault();
    const countyName = countyList.find((c) => c.fips === county)?.name;
    if (!name.trim() || !county) return;
    const created = await base44.entities.CallSheet.create({
      name: name.trim(),
      state,
      county_fips: county,
      county_name: countyName || null,
      account_count: 0,
    });
    await queryClient.invalidateQueries({ queryKey: ['callSheets'] });
    setName('');
    setUrl({ sheet: String(created.id) });
  }

  async function pull() {
    if (!sheet || !kinds.size || adding) return;
    setAdding('the county');
    let added = 0;
    try {
      const have = accounts.slice();
      for (const kind of ROSTER_KINDS.map((k) => k.id).filter((id) => kinds.has(id))) {
        if (added >= ADD_CAP) break;
        setAdding(KIND_LABEL[kind]);
        let offset = 0;
        for (;;) {
          const page = await invokeOrThrow('getMarketRoster', { state: sheet.state, county_fips: sheet.county_fips, kind, limit: 500, offset });
          const fresh = newAccounts(have, page.rows || []);
          if (fresh.length) {
            const chunk = fresh.slice(0, Math.max(0, ADD_CAP - added));
            if (chunk.length) {
              await base44.entities.CallSheetAccount.bulkCreate(chunk.map((row) => ({
                sheet_id: sheet.id,
                account_kind: row.account_kind,
                account_key: row.account_key,
                account_type: row.account_type,
                name: row.name,
                city: row.city,
                phone: row.phone,
                detail: row.detail,
                status: 'new',
              })));
              have.push(...chunk);
              added += chunk.length;
            }
          }
          offset += (page.rows || []).length;
          const capped = added >= ADD_CAP && (page.total || 0) > offset;
          if (capped) toast.message(`${KIND_LABEL[kind]} stopped at ${fmtCount(ADD_CAP)} accounts.`);
          if (!page.rows?.length || offset >= (page.total || 0) || capped) break;
        }
      }
      await base44.entities.CallSheet.update(sheet.id, { account_count: have.length });
      await queryClient.invalidateQueries({ queryKey: ['callSheetAccounts', url.sheet] });
      await queryClient.invalidateQueries({ queryKey: ['callSheets'] });
      toast.success(added ? `Added ${fmtCount(added)}.` : 'Those accounts are already on the sheet.');
    } catch (e) {
      toast.error(e?.message || 'Unable to add those accounts.');
    } finally {
      setAdding('');
    }
  }

  async function saveAccount(row, patch) {
    try {
      await base44.entities.CallSheetAccount.update(row.id, patch);
      queryClient.setQueryData(['callSheetAccounts', url.sheet], (current = []) => current.map((a) => (a.id === row.id ? { ...a, ...patch } : a)));
    } catch (e) {
      toast.error(e?.message || 'Unable to save that.');
    }
  }

  async function removeAccount(row) {
    try {
      await base44.entities.CallSheetAccount.delete(row.id);
      const next = accounts.filter((a) => a.id !== row.id);
      queryClient.setQueryData(['callSheetAccounts', url.sheet], next);
      await base44.entities.CallSheet.update(sheet.id, { account_count: next.length });
      queryClient.invalidateQueries({ queryKey: ['callSheets'] });
    } catch (e) {
      toast.error(e?.message || 'Unable to remove that account.');
    }
  }

  async function removeSheet(row) {
    const ok = await confirm({
      title: `Delete "${row.name}"?`,
      description: 'This removes the call sheet and the notes on it. The providers and facilities stay in the directory.',
      confirmLabel: 'Delete sheet',
      destructive: true,
    });
    if (!ok) return;
    await base44.entities.CallSheet.delete(row.id);
    if (String(row.id) === url.sheet) setUrl({ sheet: '' });
    queryClient.invalidateQueries({ queryKey: ['callSheets'] });
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1000px] mx-auto space-y-6">
      <PageTabs current="CallSheets" />
      <div className="flex items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-cyan-400" aria-hidden="true" />
            Call sheets
          </h1>
          <p className="text-sm text-slate-400 mt-1">Pull the providers and facilities in a county, then keep notes, a visit schedule, and the accounts you are working.</p>
        </div>
        {sheet && (
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1" aria-hidden="true" /> Print
          </Button>
        )}
      </div>

      {!sheet && (
        <div className="space-y-6 print:hidden">
          <form onSubmit={createSheet} className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-200">New call sheet</h2>
            <div className="space-y-1">
              <Label htmlFor="sheet-name">Name</Label>
              <Input id="sheet-name" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Allegheny home health, fall" />
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="space-y-1">
                <Label htmlFor="sheet-state">State</Label>
                <Select value={state} onValueChange={(value) => { setState(value); setCounty(''); }}>
                  <SelectTrigger id="sheet-state" className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>{US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="sheet-county">County</Label>
                <Select value={county || undefined} onValueChange={setCounty}>
                  <SelectTrigger id="sheet-county" className="w-52"><SelectValue placeholder="County" /></SelectTrigger>
                  <SelectContent>{countyList.map((c) => <SelectItem key={c.fips} value={c.fips}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" disabled={!name.trim() || !county}>Create sheet</Button>
          </form>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-300">Saved sheets</h2>
            {isLoading && <p className="text-sm text-slate-400">Loading…</p>}
            {!isLoading && sheets.length === 0 && <p className="text-sm text-slate-500">None yet.</p>}
            {sheets.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 px-3 py-2">
                <button type="button" className="text-left" onClick={() => setUrl({ sheet: String(row.id) })}>
                  <p className="text-sm text-slate-100">{row.name}</p>
                  <p className="text-xs text-slate-500">{[row.county_name, row.state].filter(Boolean).join(', ')} · {fmtCount(row.account_count || 0)} accounts</p>
                </button>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeSheet(row)} aria-label={`Delete ${row.name}`}>
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </section>
        </div>
      )}

      {sheet && (
        <article className="space-y-4" id="call-sheet">
          <header>
            <button type="button" className="text-xs text-cyan-400 hover:underline print:hidden" onClick={() => setUrl({ sheet: '' })}>All sheets</button>
            <h2 className="text-xl font-semibold text-slate-100">{sheet.name}</h2>
            <p className="text-sm text-slate-400">{[sheet.county_name, sheet.state].filter(Boolean).join(', ')} · {fmtCount(accounts.length)} accounts</p>
          </header>

          <div className="rounded-lg border border-slate-800 p-3 space-y-3 print:hidden">
            <p className="text-xs text-slate-400">Add everyone of the selected kinds. Accounts already on the sheet are skipped, and notes you have written stay.</p>
            <div className="flex flex-wrap gap-2">
              {kindChoices.map((kind) => (
                <label key={kind.id} className="flex items-center gap-1.5 text-xs text-slate-200">
                  <input
                    type="checkbox"
                    aria-label={kind.label}
                    checked={kinds.has(kind.id)}
                    onChange={() => setKinds((current) => {
                      const next = new Set(current);
                      if (next.has(kind.id)) next.delete(kind.id); else next.add(kind.id);
                      return next;
                    })}
                  />
                  {kind.label}
                </label>
              ))}
            </div>
            {profile && profile.callSheetKinds.length < ROSTER_KINDS.length && (
              <button type="button" className="text-xs text-cyan-400 hover:underline" onClick={() => setMoreKinds((v) => !v)}>
                {moreKinds ? `Show only ${profile.label}` : 'Show every kind'}
              </button>
            )}
            <Button type="button" onClick={pull} disabled={!!adding || kinds.size === 0}>{adding ? `Adding ${adding}…` : 'Add to this sheet'}</Button>
          </div>

          <div className="flex flex-wrap gap-2 print:hidden">
            {VIEWS.map((view) => (
              <Button key={view.id} type="button" size="sm" variant={url.view === view.id ? 'default' : 'outline'} onClick={() => setUrl({ view: view.id })}>
                {view.label}
              </Button>
            ))}
          </div>
          <p className="hidden print:block text-xs text-slate-600">{VIEWS.find((v) => v.id === url.view)?.label}</p>

          {accountsLoading && <p className="text-sm text-slate-400">Loading accounts…</p>}
          {!accountsLoading && shown.length === 0 && <p className="text-sm text-slate-500">{accounts.length ? 'Nothing in this view.' : 'This sheet is empty. Add the providers and facilities in the county.'}</p>}

          {shown.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-1 pr-3 font-medium">Account</th>
                    <th className="py-1 pr-3 font-medium">Type</th>
                    <th className="py-1 pr-3 font-medium">Phone</th>
                    <th className="py-1 pr-3 font-medium">Status</th>
                    <th className="py-1 pr-3 font-medium">Next</th>
                    <th className="py-1 pr-3 font-medium">Notes</th>
                    <th className="print:hidden" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => (
                    <tr key={row.id} className="border-t border-slate-800 text-slate-200 align-top">
                      <td className="py-2 pr-3">
                        <p>{row.name}</p>
                        {row.city && <p className="text-slate-500">{row.city}</p>}
                        {row.detail && <p className="text-slate-500">{row.detail}</p>}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">{KIND_LABEL[row.account_type] || row.account_type}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{row.phone || '—'}</td>
                      <td className="py-2 pr-3">
                        <span className="hidden print:inline">{STATUS_LABEL[row.status] || row.status}</span>
                        <select aria-label={`Status for ${row.name}`} className="print:hidden bg-slate-900 border border-slate-700 rounded px-1 py-1" value={row.status || 'new'} onChange={(e) => saveAccount(row, { status: e.target.value })}>
                          {SHEET_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </td>
                      <td className="py-2 pr-3">
                        <span className="hidden print:inline">{row.next_date || ''}</span>
                        <input aria-label={`Next date for ${row.name}`} className="print:hidden bg-slate-900 border border-slate-700 rounded px-1 py-1" type="date" value={row.next_date || ''} onChange={(e) => saveAccount(row, { next_date: e.target.value || null })} />
                      </td>
                      <td className="py-2 pr-3 min-w-[12rem]">
                        <p className="hidden print:block whitespace-pre-wrap">{row.notes}</p>
                        <Textarea aria-label={`Notes for ${row.name}`} className="print:hidden min-h-[2.5rem] text-xs" defaultValue={row.notes || ''} key={`${row.id}:${row.notes || ''}`} onBlur={(e) => { if (e.target.value !== (row.notes || '')) saveAccount(row, { notes: e.target.value }); }} />
                      </td>
                      <td className="py-2 print:hidden">
                        <button type="button" className="text-slate-500 hover:text-red-400" onClick={() => removeAccount(row)} aria-label={`Remove ${row.name}`}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      )}
    </div>
  );
}
