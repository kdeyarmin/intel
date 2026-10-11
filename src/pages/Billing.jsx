import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CreditCard, Check, ExternalLink, Loader2, MapPin, Users, Gauge } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { US_STATES } from '@/lib/usStates';
import { stateOfCounty } from '@/lib/stateFips';
import PageHeader from '@/components/shared/PageHeader';
import PageTabs from '@/components/layout/PageTabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const STATUS = {
  trial: { label: 'Trial', className: 'bg-cyan-900/30 text-cyan-400 border-cyan-500/30' },
  active: { label: 'Active', className: 'bg-emerald-900/30 text-emerald-400 border-emerald-500/30' },
  past_due: { label: 'Payment due', className: 'bg-amber-900/30 text-amber-400 border-amber-500/30' },
  canceled: { label: 'Canceled', className: 'bg-red-900/30 text-red-400 border-red-500/30' },
  pending: { label: 'Pending', className: 'bg-slate-800 text-slate-300 border-slate-600' },
};

const QUOTA_LABELS = { ai_calls: 'AI requests', exports: 'Exports', emails_sent: 'Outreach emails' };

const money = (cents) => (cents == null ? '—' : `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
const date = (iso) => (iso ? new Date(iso).toLocaleDateString() : '—');

function StatusBadge({ status }) {
  const meta = STATUS[status] || STATUS.pending;
  return <span className={`inline-block px-2 py-0.5 rounded border text-xs ${meta.className}`}>{meta.label}</span>;
}

function UsageBar({ kind, used, limit }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const high = limit > 0 && pct >= 90;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-300">{QUOTA_LABELS[kind] || kind}</span>
        <span className={high ? 'text-amber-400' : 'text-slate-400'}>{used.toLocaleString()} / {limit.toLocaleString()} today</span>
      </div>
      <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden" role="progressbar" aria-label={`${QUOTA_LABELS[kind] || kind} used today`} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
        <div className={`h-full rounded-full ${high ? 'bg-amber-500' : 'bg-cyan-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Owners pick the counties of a county pack or the state of a state plan. */
function TerritoryEditor({ scope, maxCounties, territory, onSaved, canEdit }) {
  // A state plan keeps its state; a county pack's state is the one its counties are in (the FIPS prefix).
  const [state, setState] = useState(territory.states[0] || stateOfCounty(territory.county_fips[0]) || 'PA');
  const [selected, setSelected] = useState(new Set(territory.county_fips));
  const { data: countiesData, isFetching } = useQuery({
    queryKey: ['geoCounties', state],
    queryFn: async () => (await base44.functions.invoke('getGeoCounties', { state })).data,
    enabled: scope === 'county_pack' && !!state,
    staleTime: 60 * 60 * 1000,
  });
  const counties = countiesData?.counties ?? [];
  const save = useMutation({
    mutationFn: () => base44.billing.setTerritory(scope === 'state' ? { states: [state], county_fips: [] } : { states: [], county_fips: [...selected] }),
    onSuccess: () => { toast.success('Territory saved. It applies within 30 seconds.'); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const toggle = (fips) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fips)) next.delete(fips);
      else if (next.size < maxCounties) next.add(fips);
      else toast.error(`Your plan covers up to ${maxCounties} counties.`);
      return next;
    });
  };

  if (scope === 'national') {
    return <p className="text-sm text-slate-400">The national plan covers every state and county.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="space-y-1 max-w-xs">
        <Label htmlFor="territory-state" className="text-slate-300">{scope === 'state' ? 'State' : 'State of the counties'}</Label>
        <Select value={state || ''} onValueChange={(next) => { if (next !== state) { setSelected(new Set()); setState(next); } }} disabled={!canEdit}>
          <SelectTrigger id="territory-state" className="bg-slate-800 border-slate-700"><SelectValue placeholder="Pick a state" /></SelectTrigger>
          <SelectContent className="max-h-72">
            {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {scope === 'county_pack' && (
        <div>
          <p className="text-xs text-slate-400 mb-2">{selected.size} of {maxCounties} counties chosen{isFetching ? ' · loading counties…' : ''}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1 max-h-72 overflow-y-auto border border-slate-700/50 rounded-lg p-2" role="group" aria-label="Counties in the plan">
            {counties.map((c) => (
              <label key={c.fips} className="flex items-center gap-2 text-xs text-slate-300 px-1 py-0.5 rounded hover:bg-slate-800/60">
                <input type="checkbox" aria-label={c.name} checked={selected.has(c.fips)} onChange={() => toggle(c.fips)} disabled={!canEdit} className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-700 text-cyan-600" />
                <span className="truncate">{c.name}</span>
              </label>
            ))}
            {!isFetching && counties.length === 0 && <p className="col-span-full text-xs text-slate-400">{countiesData?.message || 'No counties for this state.'}</p>}
          </div>
        </div>
      )}
      {canEdit && (
        <Button type="button" onClick={() => save.mutate()} disabled={save.isPending || (scope === 'state' ? !state : selected.size === 0)} className="bg-cyan-700 hover:bg-cyan-800 text-white">
          {save.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : <MapPin className="w-4 h-4 mr-2" aria-hidden="true" />}
          Save territory
        </Button>
      )}
    </div>
  );
}

export default function Billing() {
  const { user, checkAppState } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['billingStatus'], queryFn: () => base44.billing.status(), retry: false });

  // Back from Stripe: say what happened, then drop the flag from the URL.
  useEffect(() => {
    const outcome = searchParams.get('checkout');
    if (!outcome) return;
    if (outcome === 'success') {
      toast.success('Thanks! Your subscription is being activated.');
      refetch();
      checkAppState?.();
    } else if (outcome === 'canceled') {
      toast.info('Checkout canceled. Your plan is unchanged.');
    }
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    next.delete('session_id');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, refetch, checkAppState]);

  const checkout = useMutation({
    mutationFn: (plan_code) => base44.billing.checkout(plan_code),
    onSuccess: ({ url, changed }) => {
      if (changed) {
        // An organization that already pays changes its subscription in place: no Stripe page, and the
        // new plan arrives with Stripe's next event.
        toast.success('Plan change submitted. It shows here within a minute; your next invoice is prorated.');
        queryClient.invalidateQueries({ queryKey: ['billingStatus'] });
        checkAppState?.();
        return;
      }
      window.location.assign(url);
    },
    onError: (e) => toast.error(e.message),
  });
  const portal = useMutation({
    mutationFn: () => base44.billing.portal(),
    onSuccess: ({ url }) => { window.location.assign(url); },
    onError: (e) => toast.error(e.message),
  });

  const org = data?.organization;
  const plan = data?.plan;
  const isOwner = !!data?.is_owner;
  const territory = useMemo(() => ({ states: org?.territory?.states ?? [], county_fips: org?.territory?.county_fips ?? [] }), [org]);
  const scope = plan?.territory_scope ?? 'county_pack';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <PageTabs current="Billing" />
      <PageHeader
        title="Plan & billing"
        subtitle="Your organization's plan, territory, seats and usage"
        icon={CreditCard}
        breadcrumbs={[{ label: 'Admin Settings', page: 'AdminSettings' }, { label: 'Billing' }]}
      />

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" aria-label="Loading billing" /></div>
      ) : error ? (
        <p className="text-sm text-red-400" role="alert">{error.message}</p>
      ) : !org ? (
        <p className="text-sm text-slate-400">Your account isn't part of an organization yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                  {org.name}
                </CardTitle>
                <CardDescription>
                  {plan ? plan.name : 'No plan yet'} · <StatusBadge status={org.status} />
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div><dt className="text-xs text-slate-400">Status</dt><dd className="text-slate-200 capitalize">{STATUS[org.status]?.label || org.status}</dd></div>
                  <div><dt className="text-xs text-slate-400">{org.status === 'trial' ? 'Trial ends' : 'Current period ends'}</dt><dd className="text-slate-200">{date(org.status === 'trial' ? org.trial_ends_at : org.current_period_end)}</dd></div>
                  <div><dt className="text-xs text-slate-400">Seats</dt><dd className="text-slate-200">{data.seats?.used ?? 0} of {data.seats?.limit ?? plan?.seat_limit ?? '—'}</dd></div>
                  <div><dt className="text-xs text-slate-400">Territory</dt><dd className="text-slate-200">{scope === 'national' ? 'National' : territory.states[0] ? territory.states.join(', ') : `${territory.county_fips.length} count${territory.county_fips.length === 1 ? 'y' : 'ies'}`}</dd></div>
                </dl>
                {data.needs_territory_choice && (
                  <p className="text-amber-400 text-xs" role="status">
                    {isOwner ? 'Choose the places your plan covers below.' : 'An owner needs to choose the places your plan covers.'} Until then, County, Market and Territory views stay locked.
                  </p>
                )}
                {org.status === 'past_due' && (
                  <p className="text-amber-400 text-xs" role="status">A payment failed. Update the payment method in the billing portal to keep access.</p>
                )}
                {org.status === 'canceled' && (
                  <p className="text-red-400 text-xs" role="status">The subscription ended. Choose a plan below to continue.</p>
                )}
                {isOwner && org.has_customer && (
                  <Button type="button" variant="outline" onClick={() => portal.mutate()} disabled={portal.isPending} className="border-slate-600">
                    {portal.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : <ExternalLink className="w-4 h-4 mr-2" aria-hidden="true" />}
                    Payment method & invoices
                  </Button>
                )}
                {!isOwner && <p className="text-xs text-slate-400">Only an owner of the organization can change the plan or billing.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gauge className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                  Usage today
                </CardTitle>
                <CardDescription>Daily limits reset at midnight UTC.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.usage ? Object.keys(QUOTA_LABELS).map((kind) => (
                  <UsageBar key={kind} kind={kind} used={data.usage.used[kind] ?? 0} limit={data.usage.limits[kind] ?? 0} />
                )) : <p className="text-xs text-slate-400">Usage isn't available right now.</p>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                Territory
              </CardTitle>
              <CardDescription>
                {scope === 'state' ? 'A state plan covers one state.' : scope === 'national' ? 'Every state and county.' : `A county pack covers up to ${plan?.max_counties ?? 5} counties.`}
                {' '}County, Market, Territory and referral-source views answer only for this territory.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TerritoryEditor
                key={`${scope}-${territory.states.join(',')}-${territory.county_fips.join(',')}`}
                scope={scope}
                maxCounties={plan?.max_counties ?? 5}
                territory={territory}
                canEdit={isOwner}
                onSaved={() => { queryClient.invalidateQueries({ queryKey: ['billingStatus'] }); checkAppState?.(); }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                Plans
              </CardTitle>
              <CardDescription>
                Billed monthly through Stripe; change or cancel any time.
                {!data.stripe_configured && ' Online checkout isn’t set up yet: contact us to subscribe.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(data.plans || []).map((p) => {
                  const current = p.code === org.plan_code;
                  return (
                    <div key={p.code} className={`rounded-lg border p-4 space-y-3 ${current ? 'border-cyan-500/40 bg-cyan-900/10' : 'border-slate-700/50 bg-slate-800/30'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-slate-100 font-medium">{p.name}</h3>
                          <p className="text-xs text-slate-400">{p.description}</p>
                        </div>
                        {current && <span className="text-[10px] uppercase tracking-wider text-cyan-400 flex items-center gap-1"><Check className="w-3 h-3" aria-hidden="true" />Current</span>}
                      </div>
                      <p className="text-2xl font-semibold text-white">{money(p.monthly_price_cents)}<span className="text-xs text-slate-400 font-normal"> / month</span></p>
                      <ul className="text-xs text-slate-300 space-y-1">
                        <li>{p.territory_scope === 'national' ? 'Every state' : p.territory_scope === 'state' ? 'One state' : `Up to ${p.max_counties ?? 5} counties`}</li>
                        <li>{p.seat_limit} seat{p.seat_limit === 1 ? '' : 's'}</li>
                        {p.quotas && <li>{(p.quotas.ai_calls ?? 0).toLocaleString()} AI requests, {(p.quotas.exports ?? 0).toLocaleString()} exports and {(p.quotas.emails_sent ?? 0).toLocaleString()} emails a day</li>}
                      </ul>
                      {isOwner && (
                        <Button
                          type="button"
                          onClick={() => checkout.mutate(p.code)}
                          disabled={checkout.isPending || !p.checkout_available || (current && org.status === 'active')}
                          className="w-full bg-cyan-700 hover:bg-cyan-800 text-white"
                        >
                          {checkout.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : null}
                          {current && org.status === 'active' ? 'Current plan' : p.checkout_available ? (current ? 'Reactivate' : 'Choose plan') : 'Contact us'}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-[11px] text-slate-400">
                By subscribing you agree to the <a href="/terms" className="text-cyan-400 hover:underline">Terms of Service</a>. Signed in as {user?.email}.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
