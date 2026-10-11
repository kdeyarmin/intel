import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Target, X } from 'lucide-react';
import { US_STATES } from '@/lib/usStates';

const NATIONWIDE = '__nationwide';
const NO_LIST = '__none';

/**
 * Which providers the network is built from: one provider's partners, a lead
 * list, a state, or a nationwide sample (in that order of precedence).
 */
export default function NetworkScopeBar({ state, leadListId, focus, leadLists = [], onChange }) {
  return (
    <Card className="bg-[#141d30] border-slate-700/50">
      <CardContent className="pt-4 pb-3 flex flex-col md:flex-row md:items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="network-state" className="text-xs text-slate-400">Providers practicing in</Label>
          <Select
            value={state || NATIONWIDE}
            onValueChange={(v) => onChange({ state: v === NATIONWIDE ? '' : v, list: '', npi: '' })}
            disabled={!!leadListId || !!focus}
          >
            <SelectTrigger id="network-state" className="w-48 h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NATIONWIDE}>Nationwide sample</SelectItem>
              {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="network-list" className="text-xs text-slate-400">Or the providers on a lead list</Label>
          <Select
            value={leadListId ? String(leadListId) : NO_LIST}
            onValueChange={(v) => onChange({ list: v === NO_LIST ? '' : v, npi: '' })}
            disabled={!!focus}
          >
            <SelectTrigger id="network-list" className="w-64 h-8 text-xs bg-slate-800/50 border-slate-700 text-slate-300"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LIST}>No lead list</SelectItem>
              {leadLists.map((l) => <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {focus && (
          <div className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-900/30 px-3 py-1.5 text-xs text-cyan-400">
            <Target className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Showing {focus.label}'s referral partners</span>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-cyan-400 hover:text-cyan-300" onClick={() => onChange({ npi: '' })} aria-label="Stop focusing on this provider">
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
