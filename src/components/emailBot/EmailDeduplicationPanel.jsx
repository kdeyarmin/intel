import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Zap } from 'lucide-react';

export default function EmailDeduplicationPanel({ emailGroups, providerId, onGenerateOutreach }) {
  const [expandedGroup, setExpandedGroup] = useState(null);

  if (!emailGroups || emailGroups.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {emailGroups.map((group, idx) => {
        const isExpanded = expandedGroup === idx;
        const primary = group.primary;
        const alternatives = group.alternatives || [];

        return (
          <Card key={idx} className="border-slate-700/40 bg-slate-900/50">
            <div
              className="cursor-pointer"
              onClick={() => setExpandedGroup(isExpanded ? null : idx)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                        Primary
                      </Badge>
                      {primary.quality_score && primary.quality_score >= 75 && (
                        <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">
                          High Quality
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm font-medium text-slate-100 truncate">
                      {primary.email}
                    </div>
                    {group.primary_reason && (
                      <div className="text-xs text-slate-400 mt-1.5">
                        {group.primary_reason}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onGenerateOutreach?.(primary.id, primary.email, 'contact_verification');
                      }}
                      className="h-8 w-8 p-0"
                      title="Generate outreach email"
                    >
                      <Zap className="w-4 h-4 text-amber-400" />
                    </Button>
                    {alternatives.length > 0 && (
                      <button className="p-1.5 hover:bg-slate-800/50 rounded transition-colors">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </CardHeader>
            </div>

            {isExpanded && alternatives.length > 0 && (
              <CardContent className="pt-0 border-t border-slate-700/30">
                <div className="space-y-2 pt-3">
                  <div className="text-xs font-medium text-slate-400 uppercase">Alternatives</div>
                  {alternatives.map((alt, altIdx) => (
                    <div key={altIdx} className="flex items-start gap-3 p-2.5 bg-slate-800/30 rounded">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-200 truncate font-mono">
                          {alt.email}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {alt.reason_duplicate}
                        </div>
                        {alt.confidence && (
                          <Badge variant="outline" className="mt-2 text-xs border-slate-600">
                            {alt.confidence} confidence
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <div className="text-right">
                          <div className="text-xs font-medium text-slate-300">
                            {alt.reliability_score || 0}%
                          </div>
                          <div className="text-xs text-slate-500">Reliability</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}