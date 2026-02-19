import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion } from 'lucide-react';

const config = {
  valid: { icon: ShieldCheck, color: 'bg-green-100 text-green-800 border-green-200', label: 'Valid' },
  risky: { icon: ShieldAlert, color: 'bg-amber-100 text-amber-800 border-amber-200', label: 'Risky' },
  invalid: { icon: ShieldX, color: 'bg-red-100 text-red-800 border-red-200', label: 'Invalid' },
  unknown: { icon: ShieldQuestion, color: 'bg-slate-100 text-slate-600 border-slate-200', label: 'Unknown' },
};

export default function EmailValidationBadge({ status, reason, size = 'default' }) {
  const s = status || 'unknown';
  const c = config[s] || config.unknown;
  const Icon = c.icon;

  const badge = (
    <Badge className={`${c.color} border text-[10px] gap-1 ${size === 'sm' ? 'px-1.5 py-0' : ''}`}>
      <Icon className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {c.label}
    </Badge>
  );

  if (!reason) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {reason}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}