import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { directoryAccountKey, normalizePhone } from '@/lib/crmQuality';
import { accountTypeLabel } from '@/lib/marketingReport';

function providerName(provider) {
  if (!provider) return '';
  if (provider.entity_type === 'Organization') return provider.organization_name || '';
  return [provider.first_name, provider.last_name].filter(Boolean).join(' ');
}

export default function AddToMarketingBook({ provider, location }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const npi = provider?.npi || '';
  const { data: existing = [], isLoading } = useQuery({
    queryKey: ['crm-by-npi', npi],
    enabled: Boolean(npi),
    queryFn: () => base44.entities.CrmAccount.filter({ npi }),
  });
  const match = existing[0];
  const name = providerName(provider);
  const type = provider?.entity_type === 'Organization' ? 'other' : 'clinician';

  const add = async () => {
    if (!name || !npi) return;
    setSaving(true);
    try {
      await base44.entities.CrmAccount.create({
        name,
        account_type: type,
        city: location?.city || null,
        phone: normalizePhone(location?.phone || provider?.phone),
        npi,
        source: 'directory',
        stage: 'prospect',
        account_key: directoryAccountKey(npi),
      });
      toast.success(`${name} is on the marketing book.`);
      queryClient.invalidateQueries({ queryKey: ['crm-by-npi', npi] });
      queryClient.invalidateQueries({ queryKey: ['crm'] });
    } catch (e) {
      toast.error(e?.message || 'Could not add that account.');
    } finally {
      setSaving(false);
    }
  };

  if (!npi) return null;
  if (match) {
    return (
      <Button asChild variant="outline" size="sm" className="text-xs h-7 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400">
        <Link to={`/Marketing?account=${match.id}`}>On the marketing book</Link>
      </Button>
    );
  }
  return (
    <Button type="button" variant="outline" size="sm" className="text-xs h-7 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400" onClick={add} disabled={saving || isLoading || !name}>
      {saving ? 'Adding…' : `Add ${accountTypeLabel(type).toLowerCase()} to marketing book`}
    </Button>
  );
}
