import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Check, X, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import MatchScoreBars from './MatchScoreBars';

const STATUS_STYLES = {
  suggested: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  override: 'bg-blue-100 text-blue-800',
};

export default function MatchCard({ match, onUpdateStatus, selected, onToggleSelect }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(match.override_notes || '');
  const [saving, setSaving] = useState(false);

  const handleAction = async (status) => {
    setSaving(true);
    await onUpdateStatus(match.id, status, status === 'override' ? notes : match.override_notes);
    setSaving(false);
  };

  const confidenceColor = match.confidence_score >= 75 ? 'text-green-600' : match.confidence_score >= 50 ? 'text-yellow-600' : 'text-red-600';

  return (
    <Card className={`border shadow-sm transition-colors ${selected ? 'bg-blue-500/15 border-blue-500/30' : 'bg-slate-800/40'}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {onToggleSelect && (
              <input
                type="checkbox"
                checked={!!selected}
                onChange={() => onToggleSelect(match.id)}
                className="mt-1.5 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer"
              />
            )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900">{match.provider_name || match.npi}</span>
              <span className="text-gray-400">→</span>
              <span className="text-sm text-gray-600 truncate">{match.location_display || match.location_id}</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Badge className={STATUS_STYLES[match.status]}>{match.status}</Badge>
              <span className={`text-lg font-bold ${confidenceColor}`}>{match.confidence_score}%</span>
              <span className="text-xs text-gray-400">confidence</span>
            </div>
          </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {match.status !== 'approved' && (
              <Button size="sm" variant="ghost" className="text-green-600 hover:bg-green-50" onClick={() => handleAction('approved')} disabled={saving}>
                <Check className="w-4 h-4" />
              </Button>
            )}
            {match.status !== 'rejected' && (
              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => handleAction('rejected')} disabled={saving}>
                <X className="w-4 h-4" />
              </Button>
            )}
            {(match.status === 'approved' || match.status === 'rejected') && (
              <Button size="sm" variant="ghost" className="text-gray-500 hover:bg-gray-50" onClick={() => handleAction('suggested')} disabled={saving}>
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-4 border-t pt-4">
            <MatchScoreBars
              specialization={match.specialization_score}
              proximity={match.proximity_score}
              referral={match.referral_score}
              nameMatch={match.name_match_score}
              addressMatch={match.address_match_score}
            />

            {match.match_reasons?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Match Reasons</p>
                <ul className="text-sm text-gray-700 space-y-1">
                  {match.match_reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-blue-400 mt-0.5">•</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Override Notes</p>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Add notes for manual override..."
                rows={2}
                className="text-sm"
              />
              <Button size="sm" className="mt-2 bg-blue-600 hover:bg-blue-700" onClick={() => handleAction('override')} disabled={saving || !notes.trim()}>
                Save Override
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}