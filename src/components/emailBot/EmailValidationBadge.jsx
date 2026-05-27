import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion } from 'lucide-react';

const config = {
  valid: { icon: ShieldCheck, color: 'bg-emerald-900/15 text-emerald-400 border-emerald-500/20', label: 'Valid' },
  risky: { icon: ShieldAlert, color: 'bg-amber-900/15 text-amber-400 border-amber-500/20', label: 'Risky' },
  invalid: { icon: ShieldX, color: 'bg-red-900/15 text-red-400 border-red-500/20', label: 'Invalid' },
  unknown: { icon: ShieldQuestion, color: 'bg-slate-500/15 text-slate-400 border-slate-500/20', label: 'Unknown' },
};

export default function EmailValidationBadge({ status, reason, source, size = 'default' }) {
  const s = status || 'unknown';
  const c = config[s] || config.unknown;
  const Icon = c.icon;

  // AI-inferred addresses are guesses, not verified contacts. Make that explicit
  // wherever the badge appears so they can't be mistaken for sourced data.
  const isAI = source === 'ai_inferred' || source === 'ai_search';
  const aiNote = isAI ? 'AI-inferred address — unverified, not a confirmed contact.' : '';
  const tooltipText = [reason, aiNote].filter(Boolean).join(' ');

  const badge = (
    <span className="inline-flex items-center gap-1">
      <Badge className={`${c.color} border text-[10px] gap-1 ${size === 'sm' ? 'px-1.5 py-0' : ''}`}>
        <Icon className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
        {c.label}
      </Badge>
      {isAI && (
        <Badge className={`bg-violet-900/15 text-violet-300 border-violet-500/20 border text-[10px] ${size === 'sm' ? 'px-1.5 py-0' : ''}`}>
          AI
        </Badge>
      )}
    </span>
  );

  if (!tooltipText) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {tooltipText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}