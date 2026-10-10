import React, { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Check, Mail, Phone, MapPin, ListPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import AddToLeadListDialog from '@/components/leadlists/AddToLeadListDialog';

export function providerDisplayName(provider) {
  if (!provider) return '';
  if (provider.entity_type === 'Organization') return provider.organization_name || provider.npi;
  const name = [provider.first_name, provider.last_name].filter(Boolean).join(' ');
  return [name || provider.npi, provider.credential].filter(Boolean).join(', ');
}

export function telHref(phone) {
  const digits = String(phone || '').replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : null;
}

/** Name, key identifiers and quick actions at the top of a provider/organization page. */
export default function ProviderHeader({ provider, specialty, location }) {
  const [copied, setCopied] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const phone = location?.phone || provider.phone;
  const phoneHref = telHref(phone);

  const copyNpi = async () => {
    try {
      await navigator.clipboard.writeText(provider.npi);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy to the clipboard");
    }
  };

  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{providerDisplayName(provider)}</h1>
          {provider.status && provider.status !== 'Active' && (
            <Badge className="bg-red-900/30 text-red-400 border border-red-500/30">{provider.status}</Badge>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
          <span className="flex items-center gap-1">
            <span className="font-mono">NPI {provider.npi}</span>
            <button
              type="button"
              onClick={copyNpi}
              aria-label="Copy NPI"
              title="Copy NPI"
              className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-cyan-400"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </span>
          {specialty && <span>{specialty}</span>}
          {location && (location.city || location.state) && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {[location.city, location.state].filter(Boolean).join(', ')}
            </span>
          )}
          {phoneHref && (
            <a href={phoneHref} className="flex items-center gap-1 hover:text-cyan-400">
              <Phone className="h-3.5 w-3.5" /> {phone}
            </a>
          )}
          {provider.email && (
            <a href={`mailto:${provider.email}`} className="flex items-center gap-1 hover:text-cyan-400">
              <Mail className="h-3.5 w-3.5" /> {provider.email}
            </a>
          )}
        </div>
      </div>
      <Button onClick={() => setListOpen(true)} className="shrink-0 bg-cyan-600 hover:bg-cyan-700">
        <ListPlus className="mr-2 h-4 w-4" /> Add to lead list
      </Button>
      <AddToLeadListDialog open={listOpen} onOpenChange={setListOpen} npis={[provider.npi]} />
    </div>
  );
}
