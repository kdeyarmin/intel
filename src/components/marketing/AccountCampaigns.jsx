import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { roleFor, touchRoleLabel } from '@/lib/crmAttribution';
import { toast } from 'sonner';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AccountCampaigns({ account }) {
  const queryClient = useQueryClient();
  const [campaignId, setCampaignId] = useState('');
  const [touchedOn, setTouchedOn] = useState(today);
  const [saving, setSaving] = useState(false);

  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => base44.entities.OutreachCampaign.list('-created_date', 200),
  });
  const { data: touches = [], isLoading } = useQuery({
    queryKey: ['crm-touches', account.id],
    queryFn: () => base44.entities.CrmCampaignTouch.filter({ account_id: account.id }, 'touched_on', 200),
  });

  const linked = new Set(touches.map((touch) => String(touch.campaign_id)));
  const available = campaigns.filter((campaign) => !linked.has(String(campaign.id)));
  const nameOf = (id) => campaigns.find((campaign) => String(campaign.id) === String(id))?.name || `Campaign ${id}`;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['crm-touches', account.id] });
    queryClient.invalidateQueries({ queryKey: ['crm-campaign-results'] });
  };

  const link = async (e) => {
    e.preventDefault();
    if (!campaignId) return;
    setSaving(true);
    try {
      await base44.entities.CrmCampaignTouch.create({
        account_id: account.id,
        campaign_id: Number(campaignId),
        touched_on: touchedOn,
      });
      setCampaignId('');
      toast.success('Campaign linked.');
      refresh();
    } catch (err) {
      toast.error(err?.message || 'Could not link that campaign.');
    } finally {
      setSaving(false);
    }
  };

  const unlink = async (id) => {
    try {
      await base44.entities.CrmCampaignTouch.delete(id);
      refresh();
    } catch (err) {
      toast.error(err?.message || 'Could not remove that campaign.');
    }
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium text-slate-200">Campaigns</h3>
      <p className="text-xs text-slate-400">The earliest link is first touch and the latest is last touch. Anything between them influenced this account. Linking does not send email.</p>
      {isLoading ? <p className="text-sm text-slate-400">Loading campaigns…</p> : null}
      {!isLoading && touches.length === 0 ? <p className="text-sm text-slate-400">No campaign is linked yet.</p> : null}
      <ul className="space-y-1">
        {touches.map((touch) => {
          const role = roleFor(touches, account.id, touch.campaign_id);
          return (
            <li key={touch.id} className="flex items-center justify-between gap-2 rounded border border-slate-800 px-3 py-2 text-sm">
              <span>
                <Link className="text-slate-100 hover:text-cyan-300" to="/ProviderOutreach">{nameOf(touch.campaign_id)}</Link>
                <span className="text-slate-400"> · {touchRoleLabel(role)} · {touch.touched_on}</span>
              </span>
              <button type="button" className="text-xs text-slate-500 hover:text-rose-400" onClick={() => unlink(touch.id)}>Remove</button>
            </li>
          );
        })}
      </ul>
      <form onSubmit={link} className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-400">
          Campaign
          <select aria-label="Campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="mt-1 block rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-slate-100 min-w-52">
            <option value="">Choose a campaign</option>
            {available.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name || `Campaign ${campaign.id}`}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          Touch date
          <input type="date" aria-label="Campaign touch date" value={touchedOn} onChange={(e) => setTouchedOn(e.target.value)} className="mt-1 block rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100" />
        </label>
        <Button type="submit" size="sm" variant="outline" className="border-slate-700" disabled={saving || !campaignId}>
          {saving ? 'Linking…' : 'Link campaign'}
        </Button>
      </form>
    </section>
  );
}
