import React, { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageTabs from '@/components/layout/PageTabs';
import { useUrlState } from '@/hooks/useUrlState';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Info, UserCheck, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { accountTypeLabel } from '@/lib/marketingReport';
import {
  buildTeamReport, mondayOf, monthLabel, shiftMonth, thisMonth, userInitials, userLabel, weekBuckets,
} from '@/lib/teamMarketingReport';

const URL_DEFAULTS = { view: 'overview', month: '', week: '', marketer: '' };
const PAGE = 5000;
const CAP = 50000;
const MARKETER_COLORS = ['#22d3ee', '#fbbf24', '#34d399', '#a78bfa', '#fb7185', '#38bdf8', '#f472b6', '#a3e635'];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pct(n) {
  if (n == null) return '—';
  return `${Math.round(n * 100)}%`;
}

async function listAll(entity, sort) {
  const rows = [];
  for (let offset = 0; offset < CAP; offset += PAGE) {
    const page = await entity.list(sort, PAGE, offset);
    rows.push(...page);
    if (page.length < PAGE) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

async function loadTeam() {
  const [accounts, activities, referrals, me] = await Promise.all([
    listAll(base44.entities.CrmAccount, '-updated_date'),
    listAll(base44.entities.CrmActivity, '-activity_date'),
    listAll(base44.entities.CrmReferral, '-received_on'),
    base44.auth.me().catch(() => null),
  ]);
  // Owners and platform admins may list the organization's people. If that
  // ever fails, the roster falls back to the marketers the data mentions.
  let roster = null;
  try {
    const res = await base44.admin.users.list();
    roster = res.users || [];
  } catch (e) { roster = null; }
  return {
    accounts: accounts.rows, activities: activities.rows, referrals: referrals.rows, me, roster,
    truncated: accounts.truncated || activities.truncated || referrals.truncated,
  };
}

export default function TeamMarketing() {
  const [url, setUrl] = useUrlState(URL_DEFAULTS);
  const month = /^\d{4}-\d{2}$/.test(url.month) ? url.month : thisMonth();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['team-crm'], queryFn: loadTeam, staleTime: 15_000 });

  const roster = useMemo(() => {
    if (data?.roster?.length) return data.roster.map((u) => ({ id: u.id, full_name: u.full_name, email: u.email }));
    const ids = new Set();
    for (const a of data?.activities || []) if (a.user_id != null) ids.add(Number(a.user_id));
    for (const r of data?.referrals || []) if (r.user_id != null) ids.add(Number(r.user_id));
    for (const a of data?.accounts || []) if (a.claimed_by_user_id != null) ids.add(Number(a.claimed_by_user_id));
    const me = data?.me;
    return [...ids].map((id) => (Number(me?.id) === id
      ? { id, full_name: me?.full_name || me?.name, email: me?.email }
      : { id }));
  }, [data]);

  const report = useMemo(() => buildTeamReport({
    accounts: data?.accounts || [], activities: data?.activities || [], referrals: data?.referrals || [], users: roster, month,
  }), [data, roster, month]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['team-crm'] });
  const fail = (e) => toast.error(e?.message || 'Could not save that.');

  const assign = async (account, userId) => {
    try {
      await base44.entities.CrmAccount.update(account.id, { claimedByUserId: userId });
      toast.success(userId == null ? `Released ${account.name} from its book.` : `${account.name} is now on ${userLabel(roster, userId)}'s book.`);
      refresh();
    } catch (e) { fail(e); }
  };

  const empty = !isLoading && (data?.accounts || []).length === 0 && (data?.activities || []).length === 0 && (data?.referrals || []).length === 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4">
      <PageTabs current="TeamMarketing" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Team Marketing</h1>
          <p className="text-sm text-slate-400 mt-1">Each marketer's book of business, whether their sales calls are getting logged, the team calendar, and referrals on their way to becoming admissions.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setUrl({ month: shiftMonth(month, -1) })} aria-label="Previous month"><ChevronLeft className="w-4 h-4" aria-hidden="true" /></Button>
        <span className="text-sm text-slate-200 min-w-24 text-center">{monthLabel(month)} {month.slice(0, 4)}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setUrl({ month: shiftMonth(month, 1) })} aria-label="Next month"><ChevronRight className="w-4 h-4" aria-hidden="true" /></Button>
        <div className="flex gap-1 ml-auto" role="group" aria-label="View">
          {[['overview', 'Overview'], ['book', 'Book of business'], ['calls', 'Calls'], ['referrals', 'Referrals']].map(([id, label]) => (
            <Button key={id} type="button" size="sm" variant={url.view === id ? 'default' : 'outline'} aria-pressed={url.view === id} className={url.view === id ? 'bg-cyan-700 hover:bg-cyan-800' : 'border-slate-700'} onClick={() => setUrl({ view: id })}>{label}</Button>
          ))}
        </div>
      </div>

      {isError && <p className="text-sm text-red-400" role="alert">{error?.message || 'Could not load the team book.'}</p>}
      {data?.truncated && <p className="text-sm text-amber-300" role="status">The data is larger than this page can load, so the totals are incomplete.</p>}
      {isLoading && <p className="text-sm text-slate-400">Loading the team book…</p>}

      {!isLoading && empty && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center">
          <Users className="w-8 h-8 mx-auto text-slate-600" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-slate-100 mt-2">No marketing data yet</h2>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">Marketers log visits, calls, and referrals on the Marketing page. Once they do, this dashboard breaks the whole team's work down by marketer — no setup needed.</p>
        </div>
      )}

      {!isLoading && !empty && url.view === 'overview' && <Overview report={report} month={month} />}
      {!isLoading && !empty && url.view === 'book' && (
        <BookOfBusiness report={report} roster={roster} me={data?.me} month={month} onAssign={assign} />
      )}
      {!isLoading && !empty && url.view === 'calls' && (
        <CallsView report={report} activities={data?.activities || []} accounts={data?.accounts || []} roster={roster} week={url.week} setWeek={(w) => setUrl({ week: w })} />
      )}
      {!isLoading && !empty && url.view === 'referrals' && (
        <ReferralsView report={report} referrals={data?.referrals || []} accounts={data?.accounts || []} roster={roster} month={month} marketer={url.marketer} setMarketer={(m) => setUrl({ marketer: m })} />
      )}
    </div>
  );
}

function Kpi({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-semibold text-slate-100">{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function CompletionBar({ value }) {
  if (value == null) return <span className="text-xs text-slate-500">Nothing scheduled yet</span>;
  const color = value >= 0.8 ? 'bg-emerald-500' : value >= 0.6 ? 'bg-amber-400' : 'bg-rose-400';
  return (
    <span className="flex items-center gap-2">
      <span className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
        <span className={`block h-full ${color}`} style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="text-xs text-slate-300 w-10 text-right">{pct(value)}</span>
    </span>
  );
}

function Overview({ report, month }) {
  const t = report.totals;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Kpi label="Referrals" value={t.referrals} hint={`${monthLabel(month)} received`} />
        <Kpi label="Admissions" value={t.admissions} hint={`${monthLabel(month)} admitted`} />
        <Kpi label="Referrals admitted" value={pct(t.conversionPct)} hint="received, then admitted" />
        <Kpi label="Avg call completion" value={pct(t.avgCompletionPct)} hint="done of calls due so far" />
      </div>

      {(report.alerts.belowTarget.length > 0 || t.staleOpenReferrals > 0 || report.alerts.unclaimedActive.length > 0) && (
        <section aria-label="Needs attention" className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-3 space-y-1.5">
          <h2 className="text-sm font-medium text-amber-200 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" aria-hidden="true" /> Needs attention</h2>
          {report.alerts.belowTarget.map((m) => (
            <p key={m.id} className="text-sm text-slate-300">{m.label} is at {pct(m.completionPct)} call completion ({m.callsOverdue} overdue).</p>
          ))}
          {t.staleOpenReferrals > 0 && (
            <p className="text-sm text-slate-300">{t.staleOpenReferrals} referral{t.staleOpenReferrals === 1 ? ' is' : 's are'} still open after 7+ days — not admissions yet.</p>
          )}
          {report.alerts.unclaimedActive.length > 0 && (
            <p className="text-sm text-slate-300">{report.alerts.unclaimedActive.length} unclaimed account{report.alerts.unclaimedActive.length === 1 ? ' has' : 's have'} recent activity: {report.alerts.unclaimedActive.slice(0, 3).map((a) => a.name).join(', ')}{report.alerts.unclaimedActive.length > 3 ? '…' : ''}.</p>
          )}
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-slate-200 mb-2">Marketers</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {report.marketers.map((m, i) => (
            <div key={m.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-slate-950" style={{ backgroundColor: MARKETER_COLORS[i % MARKETER_COLORS.length] }} aria-hidden="true">{userInitials(m.label)}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-100 truncate">{m.label}</div>
                  <div className="text-xs text-slate-500">{m.bookSize} account{m.bookSize === 1 ? '' : 's'} on book{m.onRoster ? '' : ' · not on roster'}</div>
                </div>
              </div>
              <CompletionBar value={m.completionPct} />
              <div className="text-xs text-slate-400">{m.callsDone} done · {m.callsOverdue} overdue · {m.callsUpcoming} upcoming</div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-amber-300">{m.referralsReceived} referrals</span>
                <span className="text-slate-600">→</span>
                <span className="text-emerald-300">{m.admitted} admitted</span>
                {m.openReferrals > 0 && <span className="text-slate-500">· {m.openReferrals} open</span>}
              </div>
            </div>
          ))}
        </div>
        {(report.legacy.activities > 0 || report.legacy.referrals > 0) && (
          <p className="text-[11px] text-slate-500 mt-2">Includes {report.legacy.activities} activities and {report.legacy.referrals} referrals logged before marketer tracking began — they count in team totals under "Previously logged".</p>
        )}
      </section>
    </div>
  );
}

function BookOfBusiness({ report, roster, me, month, onAssign }) {
  const groups = [
    ...report.marketers.map((m) => ({ key: `m${m.id}`, title: `${m.label}'s book`, accounts: m.book })),
    { key: 'unclaimed', title: 'Unclaimed', accounts: report.unclaimedAccounts },
  ];
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Claiming puts an account on a marketer's book of business. It never moves credit for work already logged — reports attribute every visit, call, and referral to the marketer who logged it, claimed or not.</p>
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="text-sm font-medium text-slate-200 mb-2">{g.title} <span className="text-slate-500">({g.accounts.length})</span></h2>
          {g.accounts.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing here.</p>
          ) : (
            <ul className="space-y-1">
              {g.accounts.map((a) => {
                const s = report.accountStats[a.id] || {};
                const claimedBy = a.claimed_by_user_id == null ? null : userLabel(roster, Number(a.claimed_by_user_id));
                return (
                  <li key={a.id} className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm text-slate-100">{a.name}</div>
                        <div className="text-xs text-slate-500">
                          {accountTypeLabel(a.account_type)}{a.city ? ` · ${a.city}` : ''}{s.lastActivity ? ` · last visit ${s.lastActivity}` : ' · no visits logged'}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          <span className="text-amber-300/90">{s.referrals ?? 0} referrals</span> · <span className="text-emerald-300/90">{s.admissions ?? 0} admitted</span>
                          {(s.openReferrals ?? 0) > 0 && <span> · {s.openReferrals} open</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {g.key === 'unclaimed' && me?.id != null && (
                          <Button type="button" size="sm" variant="outline" className="border-slate-700 h-8" onClick={() => onAssign(a, me.id)}>
                            <UserCheck className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Claim for me
                          </Button>
                        )}
                        <label className="flex items-center gap-1.5 text-xs text-slate-400">
                          Book
                          <select
                            value={a.claimed_by_user_id ?? ''}
                            onChange={(e) => onAssign(a, e.target.value === '' ? null : Number(e.target.value))}
                            aria-label={`Book for ${a.name}`}
                            className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100"
                          >
                            <option value="">Unclaimed</option>
                            {roster.map((u) => (
                              <option key={u.id} value={u.id}>{userLabel(roster, u.id)}{Number(me?.id) === Number(u.id) ? ' (me)' : ''}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                    {claimedBy && g.key !== 'unclaimed' && <div className="text-[11px] text-slate-500 mt-1">On {claimedBy}'s book{a.claimed_at ? ` since ${String(a.claimed_at).slice(0, 10)}` : ''}</div>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function CallsView({ report, activities, accounts, roster, week, setWeek }) {
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : mondayOf(todayStr());
  const days = weekBuckets(activities, roster, weekStart);
  const byAccount = new Map(accounts.map((a) => [a.id, a.name]));
  const weekLabel = `${days[0].date} – ${days[6].date}`;
  return (
    <div className="space-y-4">
      <section>
        <h2 className="text-sm font-medium text-slate-200 mb-2">Call completion · {monthLabel(report.month)}</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
                <th className="px-3 py-2 font-medium">Marketer</th>
                <th className="px-3 py-2 font-medium">Done</th>
                <th className="px-3 py-2 font-medium">Overdue</th>
                <th className="px-3 py-2 font-medium">Upcoming</th>
                <th className="px-3 py-2 font-medium w-56">Completion</th>
              </tr>
            </thead>
            <tbody>
              {report.marketers.map((m) => (
                <tr key={m.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-3 py-2 text-slate-100">{m.label}</td>
                  <td className="px-3 py-2 text-slate-300">{m.callsDone}</td>
                  <td className="px-3 py-2 text-slate-300">{m.callsOverdue > 0 ? <span className="text-rose-300">{m.callsOverdue}</span> : '0'}</td>
                  <td className="px-3 py-2 text-slate-300">{m.callsUpcoming}</td>
                  <td className="px-3 py-2"><CompletionBar value={m.completionPct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-1">Completion is sales calls logged done out of everything that should have happened by now (done + overdue). Upcoming calls are still on the schedule.</p>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-medium text-slate-200 flex items-center gap-1.5"><CalendarDays className="w-4 h-4" aria-hidden="true" /> Team calendar</h2>
          <span className="text-xs text-slate-400">{weekLabel}</span>
          <span className="flex gap-1 ml-auto">
            <Button type="button" variant="outline" size="sm" onClick={() => setWeek(mondayOf(shiftWeek(weekStart, -7)))} aria-label="Previous week"><ChevronLeft className="w-4 h-4" aria-hidden="true" /></Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setWeek(mondayOf(todayStr()))}>This week</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setWeek(mondayOf(shiftWeek(weekStart, 7)))} aria-label="Next week"><ChevronRight className="w-4 h-4" aria-hidden="true" /></Button>
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d, di) => (
            <div key={d.date} className="rounded-lg border border-slate-800 bg-slate-900/40 p-1.5 min-h-28">
              <div className="text-[11px] font-medium text-slate-400 mb-1">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][di]} <span className="text-slate-600">{d.date.slice(5)}</span></div>
              <div className="space-y-1">
                {d.items.map((it) => {
                  const mi = report.marketers.findIndex((m) => m.id === it.user_id);
                  const color = MARKETER_COLORS[(mi < 0 ? report.marketers.length : mi) % MARKETER_COLORS.length];
                  return (
                    <div
                      key={it.id}
                      title={`${it.marketer} · ${it.kind}${it.note ? ` — ${it.note}` : ''}`}
                      className={`text-[11px] rounded px-1.5 py-1 border-l-2 ${it.done ? 'bg-slate-800/60 border-slate-600' : 'bg-slate-800/30 border-dashed border-slate-600'}`}
                      style={{ borderLeftColor: color, borderLeftStyle: 'solid' }}
                    >
                      <span className="font-medium" style={{ color }}>{userInitials(it.marketer)}</span>{' '}
                      <span className={it.done ? 'text-slate-300' : 'text-slate-400'}>{it.kind}</span>{' '}
                      <span className="text-slate-500 truncate block">{byAccount.get(it.account_id) || 'Account'}</span>
                      {!it.done && <span className="text-amber-300/90">scheduled</span>}
                      {it.done && <CheckCircle2 className="w-3 h-3 inline text-emerald-400" aria-label="done" />}
                    </div>
                  );
                })}
                {d.items.length === 0 && <div className="text-[11px] text-slate-700">—</div>}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-1">Solid chips are logged done; dashed chips are still scheduled. Colors match each marketer.</p>
      </section>
    </div>
  );
}

function shiftWeek(weekStart, deltaDays) {
  const d = new Date(`${weekStart}T00:00:00`);
  return todayStr(new Date(d.getTime() + deltaDays * 24 * 60 * 60 * 1000));
}

function ReferralsView({ report, referrals, accounts, roster, month, marketer, setMarketer }) {
  const mId = marketer === '' ? null : Number(marketer);
  const byAccount = new Map(accounts.map((a) => [a.id, a]));
  const inScope = (r) => mId == null || Number(r.user_id) === mId;
  const received = referrals.filter((r) => inScope(r) && r.received_on.slice(0, 7) === month);
  const open = received.filter((r) => r.outcome === 'open').sort((a, b) => a.received_on.localeCompare(b.received_on));
  const admitted = referrals.filter((r) => inScope(r) && r.outcome === 'admitted' && (r.admitted_on || r.received_on).slice(0, 7) === month)
    .sort((a, b) => (b.admitted_on || b.received_on).localeCompare(a.admitted_on || a.received_on));
  const lost = received.filter((r) => r.outcome === 'lost');
  const converted = received.filter((r) => r.outcome === 'admitted').length;

  const cols = [
    { id: 'open', title: 'Open referrals', rows: open, color: 'text-amber-300', note: 'Not admissions yet.' },
    { id: 'admitted', title: 'Admitted', rows: admitted, color: 'text-emerald-300', note: 'Patient under care.' },
    { id: 'lost', title: 'Lost', rows: lost, color: 'text-slate-400', note: 'Did not admit.' },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-sky-900/60 bg-sky-950/25 p-3 flex gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-sky-300" aria-hidden="true" />
        <p className="text-sm text-slate-300">
          <span className="font-medium text-slate-100">Referral vs admission.</span>{' '}
          A referral is a lead an account sent. It becomes an admission <span className="font-medium text-slate-100">only when the patient is taken under your care</span> — the referral is marked Admitted with an admission date. Open referrals are never counted as admissions.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="grid grid-cols-3 gap-2 flex-1 min-w-64">
          <Kpi label="Received" value={received.length} hint={monthLabel(month)} />
          <Kpi label="Admitted" value={admitted.length} hint={monthLabel(month)} />
          <Kpi label="Referrals admitted" value={pct(received.length ? converted / received.length : null)} hint="received, then admitted" />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          Marketer
          <select value={marketer} onChange={(e) => setMarketer(e.target.value)} aria-label="Filter by marketer" className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100">
            <option value="">Everyone</option>
            {report.marketers.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
      </div>

      <div className="grid md:grid-cols-3 gap-2">
        {cols.map((c) => (
          <section key={c.id} aria-label={c.title} className="rounded-lg border border-slate-800 bg-slate-900/40 p-2">
            <h2 className={`text-sm font-medium mb-0.5 ${c.color}`}>{c.title} <span className="text-slate-500">({c.rows.length})</span></h2>
            <p className="text-[11px] text-slate-500 mb-2">{c.note}</p>
            {c.rows.length === 0 ? (
              <p className="text-xs text-slate-600 flex items-center gap-1"><Inbox className="w-3.5 h-3.5" aria-hidden="true" /> None</p>
            ) : (
              <ul className="space-y-1">
                {c.rows.map((r) => {
                  const a = byAccount.get(r.account_id);
                  return (
                    <li key={r.id} className="rounded border border-slate-800 px-2 py-1.5 text-xs">
                      <div className="text-slate-200">{a?.name || 'Account'}</div>
                      <div className="text-slate-500">
                        {r.received_on} · {userLabel(roster, r.user_id == null ? null : Number(r.user_id))}
                        {r.admitted_on && <span className="text-emerald-300/90"> · admitted {r.admitted_on}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>

      <section>
        <h2 className="text-sm font-medium text-slate-200 mb-2">Conversion by marketer · {monthLabel(month)}</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
                <th className="px-3 py-2 font-medium">Marketer</th>
                <th className="px-3 py-2 font-medium">Received</th>
                <th className="px-3 py-2 font-medium">Admitted</th>
                <th className="px-3 py-2 font-medium">Lost</th>
                <th className="px-3 py-2 font-medium">Open</th>
                <th className="px-3 py-2 font-medium">Referrals admitted</th>
              </tr>
            </thead>
            <tbody>
              {report.marketers.map((m) => (
                <tr key={m.id} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-3 py-2 text-slate-100">{m.label}</td>
                  <td className="px-3 py-2 text-slate-300">{m.referralsReceived}</td>
                  <td className="px-3 py-2 text-emerald-300">{m.admitted}</td>
                  <td className="px-3 py-2 text-slate-300">{m.lost}</td>
                  <td className="px-3 py-2 text-amber-300">{m.openReferrals}</td>
                  <td className="px-3 py-2 text-slate-300">{pct(m.conversionPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
