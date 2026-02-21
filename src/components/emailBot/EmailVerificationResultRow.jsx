import React from 'react';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, ShieldAlert, ShieldX, AlertCircle } from 'lucide-react';

const statusConfig = {
  valid: { icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Valid' },
  risky: { icon: ShieldAlert, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: 'Risky' },
  invalid: { icon: ShieldX, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', label: 'Invalid' },
  error: { icon: AlertCircle, color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20', label: 'Error' },
  unknown: { icon: AlertCircle, color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20', label: 'Unknown' },
};

export default function EmailVerificationResultRow({ result }) {
  const config = statusConfig[result.status] || statusConfig.unknown;
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-lg border ${config.bg}`}>
      <Icon className={`w-4 h-4 shrink-0 ${config.color}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-200 truncate">{result.name || result.npi}</span>
          <Badge className={`text-[10px] ${config.bg} ${config.color} border`}>{config.label}</Badge>
          {result.score != null && (
            <span className="text-[10px] text-slate-500">Score: {result.score}/100</span>
          )}
        </div>
        <div className="text-xs text-slate-500 truncate">{result.email}</div>
        {result.recommendation && (
          <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{result.recommendation}</p>
        )}
        {result.error && (
          <p className="text-[10px] text-red-400 mt-0.5">{result.error}</p>
        )}
      </div>
      {result.confidence && (
        <Badge className={`text-[10px] shrink-0 ${
          result.confidence === 'high' ? 'bg-emerald-500/15 text-emerald-400' :
          result.confidence === 'medium' ? 'bg-amber-500/15 text-amber-400' :
          'bg-slate-500/15 text-slate-400'
        }`}>
          {result.confidence}
        </Badge>
      )}
    </div>
  );
}