import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageTabs from '@/components/layout/PageTabs';
import { useUrlState } from '@/hooks/useUrlState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Printer, TrendingDown, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import {
  ACCOUNT_TYPES, CONTACT_ROLES, accountKey, accountTypeLabel, buildMarketingReport, monthLabel, roleLabel, shiftMonth, thisMonth,
} from '@/lib/marketingReport';
import {
  ACCOUNT_STAGES, accountQuality, directoryAccountKey, engagementScore, findDuplicateGroups, identityKey, normalizePhone, planMerge, tagsToStorage,
} from '@/lib/crmQuality';
import CrmImportDialog from '@/components/marketing/CrmImportDialog';
import SavedFilterBar from '@/components/filters/SavedFilterBar';
import { Checkbox } from '@/components/ui/checkbox';
import { countExport } from '@/components/exports/exportUtils';
import { useConfirm } from '@/components/shared/ConfirmDialog';

const URL_DEFAULTS = { view: 'book', account: '', month: '' };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pct(n) {
  if (n == null) return '—';
  return `${Math.round(n * 100)}%`;
}

const PAGE = 5000;
const CAP = 50000;

async function listAll(entity, sort) {
  const rows = [];
  for (let offset = 0; offset < CAP; offset += PAGE) {
    const page = await entity.list(sort, PAGE, offset);
    rows.push(...page);
    if (page.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function loadBook() {
  const [accounts, contacts, activities, referrals, me] = await Promise.all([
    listAll(base44.entities.CrmAccount, '-updated_date'),
    listAll(base44.entities.CrmContact, '-id'),
    listAll(base44.entities.CrmActivity, '-activity_date'),
    listAll(base44.entities.CrmReferral, '-received_on'),
    base44.auth.me().catch(() => null),
  ]);
  return {
    accounts: accounts.rows, contacts: contacts.rows, activities: activities.rows, referrals: referrals.rows,
    me,
    truncated: accounts.truncated || contacts.truncated || activities.truncated || referrals.truncated,
  };
}

function Bar({ n, max, className, label }) {
  return <span className={`block w-2 rounded-sm ${className}`} style={{ height: `${Math.max(4, (n / max) * 100)}%` }} title={`${n} ${label}`} />;
}

export default function Marketing() {
  const [url, setUrl] = useUrlState(URL_DEFAULTS);
  const month = /^\d{4}-\d{2}$/.test(url.month) ? url.month : thisMonth();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['crm'], queryFn: loadBook, staleTime: 15_000 });
  const report = useMemo(() => buildMarketingReport({ ...(data || {}), month }), [data, month]);
  const account = (data?.accounts || []).find((a) => String(a.id) === String(url.account)) || null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['crm'] });
  const fail = (e) => toast.error(e?.message || 'Could not save that.');

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1000px] mx-auto space-y-4">
      <PageTabs current="Marketing" />
      <div className="flex items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Marketing</h1>
          <p className="text-sm text-slate-400 mt-1">Who you visit, who you know there, and which accounts send referrals that become admissions.</p>
        </div>
        {url.view === 'month' && !account && (
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}><Printer className="w-4 h-4 mr-1" aria-hidden="true" /> Print</Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button type="button" variant="outline" size="sm" onClick={() => setUrl({ month: shiftMonth(month, -1), account: '' })} aria-label="Previous month">←</Button>
        <span className="text-sm text-slate-200 min-w-24 text-center">{monthLabel(month)} {month.slice(0, 4)}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setUrl({ month: shiftMonth(month, 1), account: '' })} aria-label="Next month">→</Button>
        {account ? (
          <Button type="button" variant="ghost" size="sm" className="text-slate-300" onClick={() => setUrl({ account: '' })}><ArrowLeft className="w-4 h-4 mr-1" aria-hidden="true" /> Book</Button>
        ) : (
          <div className="flex gap-1 ml-auto" role="group" aria-label="View">
            {[['book', 'Book'], ['month', 'Month end']].map(([id, label]) => (
              <Button key={id} type="button" size="sm" variant={url.view === id ? 'default' : 'outline'} aria-pressed={url.view === id} className={url.view === id ? 'bg-cyan-700 hover:bg-cyan-800' : 'border-slate-700'} onClick={() => setUrl({ view: id })}>{label}</Button>
            ))}
          </div>
        )}
      </div>

      {isError && <p className="text-sm text-red-400" role="alert">{error?.message || 'Could not load your book.'}</p>}
      {data?.truncated && <p className="text-sm text-amber-300" role="status">The book is larger than this page can load, so the month-end totals are incomplete.</p>}
      {isLoading && <p className="text-sm text-slate-400">Loading your book…</p>}

      {!isLoading && account && (
        <Account
          account={account}
          me={data?.me}
          contacts={(data.contacts || []).filter((c) => c.account_id === account.id)}
          activities={(data.activities || []).filter((a) => a.account_id === account.id)}
          referrals={(data.referrals || []).filter((r) => r.account_id === account.id)}
          onChange={refresh}
          onFail={fail}
        />
      )}
      {!isLoading && !account && url.view === 'month' && <MonthEnd report={report} onOpen={(id) => setUrl({ account: id })} onSchedule={async (row) => {
        try {
          await base44.entities.CrmActivity.create({ account_id: row.id, kind: 'visit', activity_date: `${shiftMonth(month, 1)}-01`, done: false, note: 'From the month-end schedule' });
          toast.success(`Scheduled ${row.name}`);
          refresh();
        } catch (e) { fail(e); }
      }} />}
      {!isLoading && !account && url.view !== 'month' && (
        <Book report={report} activities={data?.activities || []} contacts={data?.contacts || []} referrals={data?.referrals || []} month={month} me={data?.me} rawAccounts={data?.accounts || []} onOpen={(id) => setUrl({ account: id })} onAdded={refresh} onFail={fail} />
      )}
    </div>
  );
}

const EMPTY_FILTERS = { q: '', type: 'all', stage: 'all', quality: 'all', scope: 'all' };

function Book({ report, activities, contacts, referrals, month, me, rawAccounts, onOpen, onAdded, onFail }) {
  const confirm = useConfirm();
  const [name, setName] = useState('');
  const [type, setType] = useState('hospital');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState(() => new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [bulkStage, setBulkStage] = useState('working');
  const upcoming = activities.filter((a) => !a.done && a.activity_date >= `${month}-01`).sort((a, b) => a.activity_date.localeCompare(b.activity_date)).slice(0, 8);
  const byId = new Map(report.accounts.map((a) => [a.id, a]));
  const rawById = new Map((rawAccounts || []).map((a) => [a.id, a]));
  const mine = new Set((rawAccounts || []).filter((a) => a.claimed_by_user_id != null && me?.id != null && Number(a.claimed_by_user_id) === Number(me.id)).map((a) => a.id));
  const qualityById = new Map((rawAccounts || []).map((a) => [a.id, accountQuality({
    account: a,
    contacts: contacts.filter((c) => c.account_id === a.id),
    activities: activities.filter((act) => act.account_id === a.id),
  })]));
  const scoreById = new Map((rawAccounts || []).map((a) => [a.id, engagementScore({
    activities: activities.filter((act) => act.account_id === a.id),
    referrals: referrals.filter((r) => r.account_id === a.id),
    contacts: contacts.filter((c) => c.account_id === a.id),
  })]));
  const q = filters.q.trim().toLowerCase();
  const rows = report.accounts.filter((a) => {
    if (filters.scope === 'mine' && !mine.has(a.id)) return false;
    if (filters.type !== 'all' && a.account_type !== filters.type) return false;
    const stage = rawById.get(a.id)?.stage || 'prospect';
    if (filters.stage !== 'all' && stage !== filters.stage) return false;
    if (filters.quality === 'attention' && (qualityById.get(a.id) || []).length === 0) return false;
    if (q && !`${a.name} ${a.city} ${rawById.get(a.id)?.npi || ''} ${rawById.get(a.id)?.tags || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const duplicates = findDuplicateGroups(rawAccounts || []);

  const add = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const twin = (rawAccounts || []).find((a) => identityKey(a.account_type, a.name, a.city) === identityKey(type, trimmed, city));
    if (twin) {
      onFail(new Error(`${twin.name} is already on the book. Open it instead of adding a second copy.`));
      return;
    }
    setSaving(true);
    try {
      await base44.entities.CrmAccount.create({
        name: trimmed, account_type: type, city: city.trim() || null, phone: phone.trim() || null,
        source: 'manual', stage: 'prospect', account_key: accountKey(type, trimmed, city.trim()),
      });
      setName('');
      setCity('');
      setPhone('');
      onAdded();
    } catch (err) {
      onFail(err?.message?.includes('unique') || err?.message?.includes('duplicate') ? new Error('That account is already on your book.') : err);
    } finally { setSaving(false); }
  };

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const applyStage = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      for (const id of ids) await base44.entities.CrmAccount.update(id, { stage: bulkStage });
      toast.success(`Updated ${ids.length} account${ids.length === 1 ? '' : 's'}.`);
      setSelected(new Set());
      onAdded();
    } catch (err) { onFail(err); }
  };

  const exportBook = async () => {
    const quota = await countExport();
    if (!quota.ok) { toast.error(quota.message); return; }
    const chosen = selected.size ? rows.filter((a) => selected.has(a.id)) : rows;
    const header = ['Account', 'Type', 'City', 'Phone', 'Stage', 'Tags', 'NPI', 'Website', 'Source', 'Engagement', 'Data quality', 'Contacts'];
    const lines = chosen.map((a) => {
      const raw = rawById.get(a.id) || {};
      const people = contacts.filter((c) => c.account_id === a.id).map((c) => [c.name, c.email, c.phone].filter(Boolean).join(' ')).join('; ');
      const flags = (qualityById.get(a.id) || []).map((f) => f.label).join('; ');
      const score = scoreById.get(a.id);
      return [a.name, accountTypeLabel(a.account_type), a.city, raw.phone || '', raw.stage || 'prospect', raw.tags || '', raw.npi || '', raw.domain || '', raw.source || '', score?.label || '', flags, people];
    });
    const csv = [header, ...lines].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const note = 'Source: your organization\'s marketing book in CareMetric (accounts, contacts and activity you logged). Not a CMS publication.';
    const blob = new Blob([`${csv}\n"${note}"\n`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'marketing-book.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async (plan) => {
    setImporting(true);
    const created = new Map();
    let saved = 0;
    try {
      for (const row of plan.preview) {
        if (row.status === 'error') continue;
        let accountId = row.accountId || (row.followsLine ? created.get(row.followsLine) : null);
        if (row.status === 'create') {
          const rec = row.record;
          const account = await base44.entities.CrmAccount.create({
            name: rec.name,
            account_type: rec.account_type,
            city: rec.city,
            phone: rec.phone,
            stage: rec.stage,
            tags: rec.tags,
            npi: rec.npi,
            domain: rec.domain,
            source: rec.source || 'import',
            account_key: rec.npi ? directoryAccountKey(rec.npi) : accountKey(rec.account_type, rec.name, rec.city || ''),
          });
          created.set(row.line, account.id);
          accountId = account.id;
          saved += 1;
        } else if (accountId && row.patch && Object.keys(row.patch).length) {
          await base44.entities.CrmAccount.update(accountId, row.patch);
          saved += 1;
        }
        if (row.addContact && accountId && row.record.contact_name) {
          await base44.entities.CrmContact.create({
            account_id: accountId,
            role: row.record.contact_role || 'other',
            name: row.record.contact_name,
            email: row.record.email,
            phone: row.record.phone,
          });
        }
      }
      toast.success(`Imported ${saved} account${saved === 1 ? '' : 's'}.`);
      setImportOpen(false);
      onAdded();
    } catch (err) {
      onFail(err);
    } finally { setImporting(false); }
  };

  const mergePair = async (survivor, duplicate) => {
    const ok = await confirm({
      title: `Merge ${duplicate.name} into ${survivor.name}?`,
      description: 'Contacts, visits and referrals move onto the account you keep. The duplicate is then removed.',
      confirmLabel: 'Merge',
      destructive: true,
    });
    if (!ok) return;
    try {
      const plan = planMerge(survivor, duplicate, { contacts, activities, referrals });
      for (const id of plan.move.contacts) await base44.entities.CrmContact.update(id, { account_id: survivor.id });
      for (const id of plan.move.activities) await base44.entities.CrmActivity.update(id, { account_id: survivor.id });
      for (const id of plan.move.referrals) await base44.entities.CrmReferral.update(id, { account_id: survivor.id });
      if (Object.keys(plan.fill).length) await base44.entities.CrmAccount.update(survivor.id, plan.fill);
      await base44.entities.CrmAccount.delete(duplicate.id);
      toast.success(`Merged into ${survivor.name}.`);
      onAdded();
    } catch (err) { onFail(err); }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_10rem_8rem_8rem_auto] items-end rounded-lg border border-slate-800 bg-slate-900/40 p-3">
        <label className="block text-xs text-slate-400" htmlFor="crm-account-name">Account
          <Input id="crm-account-name" aria-label="Account name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 bg-slate-950 border-slate-700" placeholder="Facility or physician" required />
        </label>
        <label className="block text-xs text-slate-400">Type
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Account type" className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100">
            {ACCOUNT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label className="block text-xs text-slate-400" htmlFor="crm-account-city">City
          <Input id="crm-account-city" aria-label="City" value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 bg-slate-950 border-slate-700" />
        </label>
        <label className="block text-xs text-slate-400" htmlFor="crm-account-phone">Phone
          <Input id="crm-account-phone" aria-label="Account phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 bg-slate-950 border-slate-700" />
        </label>
        <Button type="submit" disabled={saving} className="bg-cyan-700 hover:bg-cyan-800 text-white">{saving ? 'Adding…' : 'Add'}</Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="border-slate-700" onClick={() => setImportOpen(true)}>Import CSV</Button>
        <Button type="button" variant="outline" size="sm" className="border-slate-700" onClick={exportBook}>Export</Button>
        <SavedFilterBar page="Marketing" currentFilters={filters} onApplyFilter={(f) => setFilters({ ...EMPTY_FILTERS, ...f })} />
      </div>
      <CrmImportDialog open={importOpen} onOpenChange={setImportOpen} accounts={rawAccounts || []} contacts={contacts} onImport={runImport} busy={importing} />

      {upcoming.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-slate-200 mb-2">On the schedule</h2>
          <ul className="space-y-1">
            {upcoming.map((a) => (
              <li key={a.id}>
                <button type="button" className="w-full text-left text-sm rounded border border-slate-800 px-3 py-2 hover:border-slate-600" onClick={() => onOpen(a.account_id)}>
                  <span className="text-slate-400">{a.activity_date}</span> <span className="text-slate-100">{byId.get(a.account_id)?.name || 'Account'}</span> <span className="text-slate-500">{a.kind}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {duplicates.length > 0 && (
        <section className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 space-y-2">
          <h2 className="text-sm font-medium text-amber-200">Possible duplicates</h2>
          <p className="text-xs text-slate-400">Same facility under more than one name, or the same NPI. Merging keeps one account and moves its people, visits and referrals.</p>
          {duplicates.map((group) => (
            <DuplicateGroup key={group.map((a) => a.id).join('-')} group={group} onMerge={mergePair} />
          ))}
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h2 className="text-sm font-medium text-slate-200">Accounts this month</h2>
          <div className="flex gap-1" role="group" aria-label="Scope">
            {[['all', 'All'], ['mine', 'My book']].map(([id, label]) => (
              <Button key={id} type="button" size="sm" variant={filters.scope === id ? 'default' : 'outline'} aria-pressed={filters.scope === id} className={filters.scope === id ? 'bg-cyan-700 hover:bg-cyan-800 text-white h-7 text-xs' : 'border-slate-700 h-7 text-xs'} onClick={() => setFilters((f) => ({ ...f, scope: id }))}>{label}</Button>
            ))}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_9rem_9rem_10rem] mb-2">
          <Input aria-label="Search accounts" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Search name, city, tag or NPI" className="bg-slate-950 border-slate-700" />
          <select aria-label="Filter by type" value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100">
            <option value="all">All types</option>
            {ACCOUNT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select aria-label="Filter by stage" value={filters.stage} onChange={(e) => setFilters((f) => ({ ...f, stage: e.target.value }))} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100">
            <option value="all">All stages</option>
            {ACCOUNT_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select aria-label="Filter by data quality" value={filters.quality} onChange={(e) => setFilters((f) => ({ ...f, quality: e.target.value }))} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100">
            <option value="all">Any data quality</option>
            <option value="attention">Needs attention</option>
          </select>
        </div>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="text-xs text-slate-400">{selected.size} selected</span>
            <select aria-label="Stage for selected accounts" value={bulkStage} onChange={(e) => setBulkStage(e.target.value)} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100">
              {ACCOUNT_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <Button type="button" size="sm" className="bg-cyan-700 hover:bg-cyan-800 text-white h-7" onClick={applyStage}>Set stage</Button>
          </div>
        )}
        {rows.length === 0 ? (filters.scope === 'mine'
          ? <p className="text-sm text-slate-400">Nothing on your book yet. Open an account and claim it, or clear the filters.</p>
          : <p className="text-sm text-slate-400">{(rawAccounts || []).length === 0 ? 'Add the facilities and physicians you work, or import a CSV. Then log the visits and the referrals they send.' : 'No accounts match these filters.'}</p>) : (
          <ul className="space-y-1">
            {rows.map((a) => {
              const flags = qualityById.get(a.id) || [];
              const score = scoreById.get(a.id);
              const stage = rawById.get(a.id)?.stage || 'prospect';
              return (
                <li key={a.id} className="flex items-stretch gap-2">
                  <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggle(a.id)} aria-label={`Select ${a.name}`} className="mt-3 border-slate-600" />
                  <button type="button" className="flex-1 text-left rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 hover:border-slate-600" onClick={() => onOpen(a.id)}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-slate-100">{a.name}</span>
                      <Change n={a.change} />
                    </span>
                    <span className="block text-xs text-slate-500">{accountTypeLabel(a.account_type)}{a.city ? ` · ${a.city}` : ''} · {ACCOUNT_STAGES.find((s) => s.id === stage)?.label || stage} · {a.calls} calls · {a.referrals} referrals{a.next ? ` · next ${a.next}` : ''}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <span className="text-[10px] rounded-full border border-slate-700 px-1.5 py-0.5 text-slate-300">{score?.score == null ? 'No activity' : `${score.label} ${score.score}`}</span>
                      {flags.map((f) => <span key={f.id} className="text-[10px] rounded-full border border-amber-500/30 bg-amber-950/40 px-1.5 py-0.5 text-amber-200">{f.label}</span>)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function DuplicateGroup({ group, onMerge }) {
  const [keep, setKeep] = useState(String(group[0].id));
  const survivor = group.find((a) => String(a.id) === keep) || group[0];
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select aria-label={`Account to keep for ${group[0].name}`} value={keep} onChange={(e) => setKeep(e.target.value)} className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100">
        {group.map((a) => <option key={a.id} value={a.id}>{a.name}{a.city ? ` · ${a.city}` : ''}</option>)}
      </select>
      {group.filter((a) => a.id !== survivor.id).map((dup) => (
        <Button key={dup.id} type="button" size="sm" variant="outline" className="border-amber-700/50 h-7 text-xs" onClick={() => onMerge(survivor, dup)}>Merge {dup.name}</Button>
      ))}
    </div>
  );
}

function Change({ n }) {
  if (!n) return <span className="text-xs text-slate-500">same</span>;
  const up = n > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return <span className={`inline-flex items-center gap-0.5 text-xs ${up ? 'text-emerald-400' : 'text-rose-400'}`}><Icon className="w-3 h-3" aria-hidden="true" /> {up ? `+${n}` : n}</span>;
}

function MonthEnd({ report, onOpen, onSchedule }) {
  const max = Math.max(1, ...report.trend.flatMap((t) => [t.calls, t.referrals, t.admissions]));
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-100 print:block">{monthLabel(report.month)} {report.month.slice(0, 4)}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <Kpi label="Sales calls" value={report.calls} />
        <Kpi label="Referrals" value={report.referrals} />
        <Kpi label="Calls per referral" value={report.callsPerReferral ?? '—'} />
        <Kpi label="Admissions" value={report.admissions} />
        <Kpi label="Referrals admitted" value={pct(report.conversion)} />
      </div>
      <p className="text-[11px] text-slate-500">A sales call is a visit or a call you marked done. Calls per referral is sales calls divided by referrals received. An admission counts in the month you marked it admitted, not the month the referral arrived. The change on each account is referrals this month minus {monthLabel(report.previous)}.</p>

      <section aria-label="Six month trend">
        <div className="flex gap-3 text-[11px] text-slate-400 mb-2">
          <span><i className="inline-block w-2 h-2 bg-cyan-500 mr-1" /> Calls</span>
          <span><i className="inline-block w-2 h-2 bg-amber-400 mr-1" /> Referrals</span>
          <span><i className="inline-block w-2 h-2 bg-emerald-500 mr-1" /> Admissions</span>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {report.trend.map((t) => (
            <div key={t.month} className="text-center">
              <div className="flex items-end justify-center gap-0.5 h-24">
                <Bar n={t.calls} max={max} className="bg-cyan-500" label="calls" />
                <Bar n={t.referrals} max={max} className="bg-amber-400" label="referrals" />
                <Bar n={t.admissions} max={max} className="bg-emerald-500" label="admissions" />
              </div>
              <div className="text-[10px] text-slate-400 mt-1">{monthLabel(t.month)}</div>
              <div className="text-[10px] text-slate-500">{t.calls}/{t.referrals}/{t.admissions}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid sm:grid-cols-2 gap-4">
        <Rank title="Referring more" rows={report.more} empty="No account sent more referrals than last month." onOpen={onOpen} />
        <Rank title="Referring less" rows={report.less} empty="No account sent fewer referrals than last month." onOpen={onOpen} />
      </div>
      <Rank title="Calls with no referral" rows={report.quiet} empty="Every account you called sent at least one referral, or you have not logged a call." onOpen={onOpen} />

      <section>
        <h2 className="text-sm font-medium text-slate-200 mb-2">Put on next month’s schedule</h2>
        <p className="text-xs text-slate-500 mb-2">Accounts that referred less, that referred last month and were not visited, or that referred and have nothing scheduled.</p>
        {report.schedule.length === 0 ? <p className="text-sm text-slate-400">Nothing to add. The book is keeping up with the accounts that refer.</p> : (
          <ul className="space-y-1">
            {report.schedule.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded border border-slate-800 px-3 py-2">
                <button type="button" className="text-left text-sm text-slate-100" onClick={() => onOpen(a.id)}>{a.name}</button>
                <Button type="button" size="sm" variant="outline" className="border-slate-700 print:hidden" onClick={() => onSchedule(a)} disabled={!!a.next}>{a.next ? a.next : 'Schedule'}</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function Rank({ title, rows, empty, onOpen }) {
  return (
    <section>
      <h2 className="text-sm font-medium text-slate-200 mb-2">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-slate-400">{empty}</p> : (
        <ul className="space-y-1">
          {rows.map((a) => (
            <li key={a.id}>
              <button type="button" className="w-full flex items-center justify-between gap-2 text-left rounded border border-slate-800 px-3 py-2 hover:border-slate-600" onClick={() => onOpen(a.id)}>
                <span className="text-sm text-slate-100">{a.name}</span>
                <span className="text-xs text-slate-400">{a.previous} → {a.referrals}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function detailsOf(account) {
  return {
    stage: account.stage || 'prospect',
    tags: account.tags || '',
    npi: account.npi || '',
    domain: account.domain || '',
    phone: account.phone || '',
  };
}

function Account({ account, contacts, activities, referrals, me, onChange, onFail }) {
  const [note, setNote] = useState('');
  const [when, setWhen] = useState(today());
  const [role, setRole] = useState('administrator');
  const [person, setPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [draft, setDraft] = useState(() => detailsOf(account));
  const stamp = `${account.id}:${account.updated_date || ''}`;
  const [seen, setSeen] = useState(stamp);
  if (seen !== stamp) {
    setSeen(stamp);
    setDraft(detailsOf(account));
  }
  const flags = accountQuality({ account, contacts, activities });
  const score = engagementScore({ activities, referrals, contacts });

  const claimedByMe = account.claimed_by_user_id != null && me?.id != null && Number(account.claimed_by_user_id) === Number(me.id);
  const claim = async () => {
    if (me?.id == null) return;
    setClaiming(true);
    try {
      await base44.entities.CrmAccount.update(account.id, { claimedByUserId: claimedByMe ? null : me.id });
      toast.success(claimedByMe ? 'Released from your book.' : 'Claimed — this account is now on your book.');
      onChange();
    } catch (e) { onFail(e); } finally { setClaiming(false); }
  };

  const log = async (kind, done, date) => {
    const day = date || today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      onFail(new Error('Pick a visit date.'));
      return;
    }
    try {
      await base44.entities.CrmActivity.create({ account_id: account.id, kind, activity_date: day, done, note: note.trim() || null });
      setNote('');
      onChange();
    } catch (e) { onFail(e); }
  };
  const refer = async () => {
    try {
      await base44.entities.CrmReferral.create({ account_id: account.id, received_on: today(), outcome: 'open', note: note.trim() || null });
      setNote('');
      onChange();
    } catch (e) { onFail(e); }
  };
  const setOutcome = async (row, outcome) => {
    try {
      await base44.entities.CrmReferral.update(row.id, outcome === 'admitted' ? { outcome, admitted_on: today() } : { outcome, admitted_on: null });
      onChange();
    } catch (e) { onFail(e); }
  };
  const addPerson = async (e) => {
    e.preventDefault();
    if (!person.trim()) return;
    try {
      await base44.entities.CrmContact.create({ account_id: account.id, role, name: person.trim(), phone: phone.trim() || null, email: email.trim() || null });
      setPerson('');
      setPhone('');
      setEmail('');
      onChange();
    } catch (e) { onFail(e); }
  };
  const remove = async (entity, id) => {
    try {
      await base44.entities[entity].delete(id);
      onChange();
    } catch (e) { onFail(e); }
  };

  const who = (userId) => {
    if (userId == null) return '';
    if (me?.id != null && Number(userId) === Number(me.id)) return ' · you';
    return ' · teammate';
  };
  const saveDetails = async (e) => {
    e.preventDefault();
    try {
      await base44.entities.CrmAccount.update(account.id, {
        stage: draft.stage,
        tags: tagsToStorage(draft.tags),
        npi: draft.npi.trim() || null,
        domain: draft.domain.trim() || null,
        phone: normalizePhone(draft.phone),
      });
      onChange();
    } catch (err) { onFail(err); }
  };
  const timeline = [
    ...activities.map((a) => ({ id: `a${a.id}`, date: a.activity_date, text: `${a.done ? '' : 'Scheduled '}${a.kind}${who(a.user_id)}${a.note ? ` — ${a.note}` : ''}`, raw: a })),
    ...referrals.map((r) => ({ id: `r${r.id}`, date: r.received_on, text: `Referral · ${r.outcome}${who(r.user_id)}${r.admitted_on ? ` ${r.admitted_on}` : ''}${r.note ? ` — ${r.note}` : ''}`, referral: r })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">{account.name}</h2>
        <p className="text-sm text-slate-400">{accountTypeLabel(account.account_type)}{account.city ? ` · ${account.city}` : ''}{account.phone ? ` · ${account.phone}` : ''}</p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <span className="text-[10px] rounded-full border border-slate-700 px-1.5 py-0.5 text-slate-300">{score.score == null ? 'No activity' : `${score.label} ${score.score}`}</span>
          {flags.map((f) => <span key={f.id} className="text-[10px] rounded-full border border-amber-500/30 bg-amber-950/40 px-1.5 py-0.5 text-amber-200">{f.label}</span>)}
          {account.npi ? <Link className="text-[10px] rounded-full border border-cyan-800 px-1.5 py-0.5 text-cyan-300" to={`/ProviderDetail?npi=${account.npi}`}>NPI {account.npi}</Link> : null}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          {claimedByMe ? (
            <span className="text-[11px] rounded-full bg-cyan-950 border border-cyan-800 text-cyan-200 px-2 py-0.5">On your book</span>
          ) : account.claimed_by_user_id != null ? (
            <span className="text-[11px] rounded-full bg-slate-800 border border-slate-700 text-slate-400 px-2 py-0.5">Claimed</span>
          ) : null}
          <Button type="button" size="sm" variant="outline" className="border-slate-700 h-7 text-xs" onClick={claim} disabled={claiming || me?.id == null}>
            {claiming ? 'Saving…' : claimedByMe ? 'Release from my book' : 'Claim for my book'}
          </Button>
        </div>
      </div>

      <form onSubmit={saveDetails} className="grid gap-2 sm:grid-cols-3 rounded-lg border border-slate-800 p-3">
        <label className="block text-xs text-slate-400">Stage
          <select aria-label="Stage" value={draft.stage} onChange={(e) => setDraft((d) => ({ ...d, stage: e.target.value }))} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100">
            {ACCOUNT_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="block text-xs text-slate-400" htmlFor="crm-tags">Tags
          <Input id="crm-tags" aria-label="Tags" value={draft.tags} onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))} placeholder="ortho, priority" className="mt-1 bg-slate-950 border-slate-700" />
        </label>
        <label className="block text-xs text-slate-400" htmlFor="crm-phone">Phone
          <Input id="crm-phone" aria-label="Phone" value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} className="mt-1 bg-slate-950 border-slate-700" />
        </label>
        <label className="block text-xs text-slate-400" htmlFor="crm-npi">NPI
          <Input id="crm-npi" aria-label="NPI" value={draft.npi} onChange={(e) => setDraft((d) => ({ ...d, npi: e.target.value }))} className="mt-1 bg-slate-950 border-slate-700" />
        </label>
        <label className="block text-xs text-slate-400" htmlFor="crm-domain">Website
          <Input id="crm-domain" aria-label="Website" value={draft.domain} onChange={(e) => setDraft((d) => ({ ...d, domain: e.target.value }))} className="mt-1 bg-slate-950 border-slate-700" />
        </label>
        <Button type="submit" className="self-end bg-cyan-700 hover:bg-cyan-800 text-white">Save account</Button>
      </form>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-slate-200">People</h3>
        <ul className="space-y-1">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm rounded border border-slate-800 px-3 py-2">
              <span><span className="text-slate-500">{roleLabel(c.role)}</span> <span className="text-slate-100">{c.name}</span> {c.phone && <span className="text-slate-400">{c.phone}</span>} {c.email && <span className="text-slate-400">{c.email}</span>}</span>
              <button type="button" className="text-xs text-slate-500 hover:text-rose-400" onClick={() => remove('CrmContact', c.id)}>Remove</button>
            </li>
          ))}
        </ul>
        <form onSubmit={addPerson} className="grid gap-2 sm:grid-cols-[11rem_1fr_8rem_1fr_auto]">
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" className="rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100">
            {CONTACT_ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <Input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Name" aria-label="Contact name" className="bg-slate-950 border-slate-700" />
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" aria-label="Contact phone" className="bg-slate-950 border-slate-700" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Contact email" className="bg-slate-950 border-slate-700" />
          <Button type="submit" variant="outline" className="border-slate-700">Add</Button>
        </form>
      </section>

      <section className="space-y-2 rounded-lg border border-slate-800 p-3">
        <label className="block text-xs text-slate-400" htmlFor="crm-note">Note (no patient name)
          <textarea id="crm-note" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="bg-cyan-700 hover:bg-cyan-800 text-white" onClick={() => log('visit', true)}>Visited today</Button>
          <Button type="button" variant="outline" className="border-slate-700" onClick={() => log('call', true)}>Called today</Button>
          <Button type="button" variant="outline" className="border-slate-700" onClick={() => log('note', true)}>Save note</Button>
          <Button type="button" className="bg-amber-700 hover:bg-amber-800 text-white" onClick={refer}>Referral today</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Schedule date" className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100" />
          <Button type="button" variant="outline" className="border-slate-700" onClick={() => log('visit', false, when)}>Schedule a visit</Button>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-slate-200 mb-2">Activity</h3>
        {timeline.length === 0 ? <p className="text-sm text-slate-400">Nothing logged yet.</p> : (
          <ul className="space-y-1">
            {timeline.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-2 rounded border border-slate-800 px-3 py-2 text-sm">
                <span><span className="text-slate-500">{row.date}</span> <span className="text-slate-200">{row.text}</span></span>
                {row.referral?.outcome === 'open' && (
                  <span className="flex gap-1 shrink-0">
                    <Button type="button" size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white h-7" onClick={() => setOutcome(row.referral, 'admitted')}>Admitted</Button>
                    <Button type="button" size="sm" variant="outline" className="border-slate-700 h-7" onClick={() => setOutcome(row.referral, 'lost')}>Lost</Button>
                  </span>
                )}
                {row.raw && !row.raw.done && (
                  <Button type="button" size="sm" variant="outline" className="border-slate-700 h-7" onClick={async () => {
                    try { await base44.entities.CrmActivity.update(row.raw.id, { done: true }); onChange(); } catch (e) { onFail(e); }
                  }}>Done</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
