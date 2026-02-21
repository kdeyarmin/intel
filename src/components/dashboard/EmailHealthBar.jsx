import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Mail, ShieldCheck, ShieldAlert, ShieldX, Search } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';

export default function EmailHealthBar({ emailStats, totalProviders }) {
  if (!emailStats || totalProviders === 0) return null;

  const coveragePct = Math.round((emailStats.withEmail / totalProviders) * 100);
  const verifiedPct = emailStats.withEmail > 0 ? Math.round(((emailStats.valid + emailStats.risky + emailStats.invalid) / emailStats.withEmail) * 100) : 0;

  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-white">Email Health</span>
          </div>
          <Link to={createPageUrl('EmailSearchBot')}>
            <Button variant="ghost" size="sm" className="text-xs h-6 text-cyan-500 hover:text-cyan-400 gap-1">
              <Search className="w-3 h-3" /> Manage
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Coverage */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Coverage</span>
              <span className="text-white font-medium">{coveragePct}%</span>
            </div>
            <Progress value={coveragePct} className="h-1.5" />
            <p className="text-[10px] text-slate-600 mt-1">{emailStats.withEmail.toLocaleString()} of {totalProviders.toLocaleString()}</p>
          </div>
          {/* Verification */}
          <div>
            <div className="flex justify-between text-[11px] text-slate-400 mb-1">
              <span>Verified</span>
              <span className="text-white font-medium">{verifiedPct}%</span>
            </div>
            <Progress value={verifiedPct} className="h-1.5" />
            <p className="text-[10px] text-slate-600 mt-1">{(emailStats.valid + emailStats.risky + emailStats.invalid).toLocaleString()} of {emailStats.withEmail.toLocaleString()}</p>
          </div>
        </div>

        <div className="flex gap-4 mt-3 pt-3 border-t border-slate-700/50">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span className="text-[11px] text-slate-400">Valid: <span className="text-emerald-400 font-medium">{emailStats.valid.toLocaleString()}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3 h-3 text-amber-400" />
            <span className="text-[11px] text-slate-400">Risky: <span className="text-amber-400 font-medium">{emailStats.risky.toLocaleString()}</span></span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldX className="w-3 h-3 text-red-400" />
            <span className="text-[11px] text-slate-400">Invalid: <span className="text-red-400 font-medium">{emailStats.invalid.toLocaleString()}</span></span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}