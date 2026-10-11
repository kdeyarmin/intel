import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CreditCard, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { canAccessPage } from '@/components/layout/navConfig';

const STATUS = {
  trial: { label: 'Trial', className: 'bg-cyan-500/10 text-cyan-400' },
  active: { label: 'Active', className: 'bg-emerald-500/10 text-emerald-400' },
  past_due: { label: 'Payment due', className: 'bg-amber-500/10 text-amber-400' },
  canceled: { label: 'Canceled', className: 'bg-red-500/10 text-red-400' },
};

function daysUntil(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Number.isNaN(ms) ? null : Math.max(0, Math.ceil(ms / 86_400_000));
}

/**
 * The organization's plan at the bottom of the sidebar: status, trial days
 * left, and today's AI usage against the plan's quota (from /api/billing/status).
 */
export default function BillingStatusWidget({ sidebarOpen }) {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ['billingStatus'],
    queryFn: () => base44.billing.status(),
    enabled: !!user?.orgId,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  if (!user?.orgId || !data?.organization) return null;
  // Billing is the owners' page: a member sees the plan but not a link they can't open.
  const canBill = canAccessPage('Billing', user);

  const org = data.organization;
  const status = STATUS[org.status] || { label: org.status, className: 'bg-slate-700 text-slate-300' };
  const attention = org.status === 'past_due' || org.status === 'canceled';
  const trialDays = org.status === 'trial' ? daysUntil(org.trial_ends_at) : null;
  const ai = data.usage ? { used: data.usage.used.ai_calls ?? 0, limit: data.usage.limits.ai_calls ?? 0 } : null;
  const aiPct = ai && ai.limit > 0 ? Math.min(100, Math.round((ai.used / ai.limit) * 100)) : 0;
  const aiLow = ai && ai.limit > 0 && aiPct >= 90;

  if (!sidebarOpen) {
    return (
      <div className="flex justify-center p-3 border-t border-slate-800/60">
        {canBill ? (
          <Link to="/Billing" aria-label="Plan and billing" title="Plan and billing">
            <CreditCard className={`w-5 h-5 ${attention ? 'text-amber-400' : 'text-slate-400'}`} aria-hidden="true" />
          </Link>
        ) : (
          <span role="img" aria-label={`Plan: ${status.label}`} title={`${data.plan?.name || 'Plan'}: ${status.label}`}>
            <CreditCard className={`w-5 h-5 ${attention ? 'text-amber-400' : 'text-slate-400'}`} aria-hidden="true" />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mx-2 mb-3 mt-2 p-3 rounded-xl bg-slate-800/30 border border-slate-700/50 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        {canBill ? (
          <Link to="/Billing" className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-200 flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5" aria-hidden="true" />
            {data.plan?.name || 'Plan'}
          </Link>
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5" aria-hidden="true" />
            {data.plan?.name || 'Plan'}
          </span>
        )}
        <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-bold ${status.className}`}>{status.label}</span>
      </div>
      <p className="text-[11px] text-slate-400 truncate" title={org.name}>{org.name}</p>
      {trialDays !== null && (
        <p className="text-[11px] text-cyan-400 mt-1">{trialDays === 0 ? 'Trial ends today' : `${trialDays} day${trialDays === 1 ? '' : 's'} left in the trial`}</p>
      )}
      {attention && (
        <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" aria-hidden="true" />
          {org.status === 'past_due' ? 'A payment failed' : 'Subscription ended'}. {canBill ? <Link to="/Billing" className="underline">Fix it</Link> : 'Ask an owner to fix it.'}
        </p>
      )}
      {ai && ai.limit > 0 && (
        <div className="mt-2">
          <div className="flex justify-between text-[10px] mb-1">
            <span className={aiLow ? 'text-amber-400' : 'text-slate-400'}>AI requests today</span>
            <span className="text-slate-400">{ai.used} / {ai.limit}</span>
          </div>
          <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden" role="progressbar" aria-label="AI requests used today" aria-valuemin={0} aria-valuemax={ai.limit} aria-valuenow={ai.used}>
            <div className={`h-full rounded-full ${aiLow ? 'bg-amber-500' : 'bg-cyan-500'}`} style={{ width: `${aiPct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
