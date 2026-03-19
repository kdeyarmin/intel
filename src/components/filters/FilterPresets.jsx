import React from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Stethoscope, Mail, TrendingUp, ShieldCheck, Building } from 'lucide-react';

const PRESETS = [
  {
    id: 'active_mds',
    label: 'Active MDs',
    icon: Stethoscope,
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    filters: { statusFilter: 'Active', credentialFilter: 'M.D.', entityTypeFilter: 'Individual' },
    description: 'Active individual providers with M.D. credential',
  },
  {
    id: 'organizations',
    label: 'Organizations',
    icon: Building,
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    filters: { entityTypeFilter: 'Organization', statusFilter: 'Active' },
    description: 'Active organizations only',
  },
  {
    id: 'has_email',
    label: 'Has Email',
    icon: Mail,
    color: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    filters: { emailFilter: 'has_email' },
    description: 'Providers with an email address found',
  },
  {
    id: 'high_confidence_email',
    label: 'Verified Emails',
    icon: ShieldCheck,
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    filters: { emailFilter: 'high' },
    description: 'High confidence email addresses',
  },
  {
    id: 'needs_enrichment',
    label: 'Needs Enrichment',
    icon: Sparkles,
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    filters: { enrichmentFilter: 'yes' },
    description: 'Providers missing key data',
  },
  {
    id: 'high_scorers',
    label: 'Top Scored',
    icon: TrendingUp,
    color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    filters: { statusFilter: 'Active' },
    sortOverride: { field: 'score', dir: 'desc' },
    description: 'Active providers sorted by highest score',
  },
];

export default function FilterPresets({ onApplyPreset, activePresetId }) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs text-slate-500 uppercase tracking-wider font-medium">Quick Filters</span>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(preset => {
          const Icon = preset.icon;
          const isActive = activePresetId === preset.id;
          return (
            <Button
              key={preset.id}
              variant="outline"
              size="sm"
              onClick={() => onApplyPreset(isActive ? null : preset)}
              title={preset.description}
              className={`h-7 text-xs gap-1 border transition-all ${
                isActive
                  ? preset.color + ' border-current'
                  : 'border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              <Icon className="w-3 h-3" />
              {preset.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export { PRESETS };