import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { campaignAccountResults, touchRoleLabel } from '@/lib/crmAttribution';
import { toast } from 'sonner';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CampaignAccountResults({ campaign }) {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState('');
  const [touchedOn, setTouchedOn] = useState(today);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['crm-campaign-results'],
    queryFn: async () => {
      const [touches, accounts, activities, referrals] = await Promise.all([
        base44.entities.CrmCampaignTouch.list('-touched_on', 5000),
        base44.entities.CrmAccount.list('-updated_date', 5000),
        base44.entities.CrmActivity.list('-activity_date', 5000),
        base44.entities.CrmReferral.list('-received_on', 5000),
      ]);
      return { touches, accounts, activities, referrals };
    },
    enabled: !!campaign?.id,
  });

  const rows = data ? campaignAccountResults({ campaignId: campaign.id, ...data }) : [];
  const linked = new Set(rows.map((row) => String(row.accountId)));
  const available = (data?.accounts || []).filter((account) => !linked.has(String(account.id)));
  const totals = rows.reduce((sum, row) => ({
    visits: sum.visits + row.visits,
    referrals: sum.referrals + row.referrals,
    admissions: sum.admissions + row.admissions,
  }), { visits: 0, referrals: 0, admissions: 0 });

  const link = async (e) => {
    e.preventDefault();
    if (!accountId) return;
    setSaving(true);
    try {
      await base44.entities.CrmCampaignTouch.create({
        account_id: Number(accountId),
        campaign_id: campaign.id,
        touched_on: touchedOn,
      });
      setAccountId('');
      toast.success('Account linked to this campaign.');
      queryClient.invalidateQueries({ queryKey: ['crm-campaign-results'] });
    } catch (err) {
      toast.error(err?.message || 'Could not link that account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardHeader>
        <CardTitle className="text-base text-slate-200">Accounts this campaign touched</CardTitle>
        <p className="text-sm text-slate-400">Visits, referrals and admissions are counted from the touch date forward. Linking an account does not send email.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-slate-400">Loading accounts…</p> : null}
        {!isLoading && rows.length === 0 ? (
          <p className="text-sm text-slate-400">No accounts are linked yet. Add one here, or link this campaign from the account on the marketing book.</p>
        ) : null}
        {rows.length > 0 ? (
          <>
            <p className="text-xs text-slate-400">{rows.length} account{rows.length === 1 ? '' : 's'} · {totals.visits} visits · {totals.referrals} referrals · {totals.admissions} admissions</p>
            <ul className="space-y-1">
              {rows.map((row) => (
                <li key={row.touchId || `${row.accountId}-${row.touchedOn}`} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800 px-3 py-2">
                  <div>
                    <Link className="text-sm text-slate-100 hover:text-cyan-300" to={`/Marketing?account=${row.accountId}`}>{row.accountName}</Link>
                    <p className="text-xs text-slate-400">{row.city ? `${row.city} · ` : ''}{touchRoleLabel(row.role)} · {row.touchedOn}</p>
                  </div>
                  <p className="text-xs text-slate-300">{row.visits} visits · {row.referrals} referrals · {row.admissions} admissions</p>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <form onSubmit={link} className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-slate-400">
            Account
            <select aria-label="Account to link" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="mt-1 block rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100 min-w-52">
              <option value="">Choose an account</option>
              {available.map((account) => <option key={account.id} value={account.id}>{account.name}{account.city ? ` — ${account.city}` : ''}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Touch date
            <input type="date" aria-label="Touch date" value={touchedOn} onChange={(e) => setTouchedOn(e.target.value)} className="mt-1 block rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100" />
          </label>
          <Button type="submit" size="sm" className="bg-cyan-700 hover:bg-cyan-800 text-white" disabled={saving || !accountId}>
            {saving ? 'Linking…' : 'Link account'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
