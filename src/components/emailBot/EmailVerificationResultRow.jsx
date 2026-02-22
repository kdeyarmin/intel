import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, ShieldAlert, ShieldX, AlertCircle, ChevronDown, ChevronUp, Server, Globe, Mail } from 'lucide-react';

const statusConfig = {
  valid: { icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', label: 'Valid' },
  risky: { icon: ShieldAlert, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', label: 'Risky' },
  invalid: { icon: ShieldX, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', label: 'Invalid' },
  error: { icon: AlertCircle, color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20', label: 'Error' },
  unknown: { icon: AlertCircle, color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20', label: 'Unknown' },
};

export default function EmailVerificationResultRow({ result }) {
  const [expanded, setExpanded] = useState(false);
  const config = statusConfig[result.status] || statusConfig.unknown;
  const Icon = config.icon;

  const hasDetails = result.dns || result.smtp || result.catchAll;

  return (
    <div className={`rounded-lg border ${config.bg}`}>
      <div
        className="flex items-center gap-3 p-2.5 cursor-pointer"
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
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
        <div className="flex items-center gap-1.5 shrink-0">
          {result.confidence && (
            <Badge className={`text-[10px] ${
              result.confidence === 'high' ? 'bg-emerald-500/15 text-emerald-400' :
              result.confidence === 'medium' ? 'bg-amber-500/15 text-amber-400' :
              'bg-slate-500/15 text-slate-400'
            }`}>
              {result.confidence}
            </Badge>
          )}
          {hasDetails && (
            expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          )}
        </div>
      </div>

      {expanded && hasDetails && (
        <div className="px-2.5 pb-2.5 pt-0 border-t border-slate-700/30 mt-0">
          <div className="flex flex-wrap gap-2 pt-2">
            {result.dns && (
              <div className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-800/40 rounded px-2 py-1">
                <Globe className="w-3 h-3" />
                MX: {result.dns.hasMX ? `✓ (${result.dns.mxCount})` : result.dns.hasMX === false ? '✗' : '?'}
              </div>
            )}
            {result.smtp && result.smtp.reachable != null && (
              <div className={`flex items-center gap-1 text-[10px] rounded px-2 py-1 ${
                result.smtp.reachable ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
              }`}>
                <Server className="w-3 h-3" />
                SMTP: {result.smtp.reachable ? 'Reachable' : 'Unreachable'}
              </div>
            )}
            {result.catchAll && (
              <div className={`flex items-center gap-1 text-[10px] rounded px-2 py-1 ${
                result.catchAll.isCatchAll === 'likely' ? 'text-amber-400 bg-amber-500/10' :
                result.catchAll.isCatchAll === 'unlikely' ? 'text-emerald-400 bg-emerald-500/10' :
                'text-slate-400 bg-slate-800/40'
              }`}>
                <Mail className="w-3 h-3" />
                Catch-all: {result.catchAll.isCatchAll}
              </div>
            )}
          </div>
          {result.catchAll?.reason && (
            <p className="text-[9px] text-slate-500 mt-1">{result.catchAll.reason}</p>
          )}
        </div>
      )}
    </div>
  );
}