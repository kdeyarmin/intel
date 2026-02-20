import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertTriangle, FileWarning, ShieldAlert, Clock, Type, Copy, Wifi, Wrench, HelpCircle,
  Download, ChevronDown, ChevronRight, Database, Lightbulb, ExternalLink
} from 'lucide-react';
import { ERROR_CATEGORIES, groupErrors, downloadErrorCSV } from './errorCategories';

const ICON_MAP = {
  ShieldAlert, FileWarning, Type, Copy, Clock, Wifi, Wrench, HelpCircle, AlertTriangle,
};

export default function ErrorSummaryPanel({ errors, batchName, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  const [expandedSolution, setExpandedSolution] = useState(null);

  const { grouped, sortedCategories, totalErrors } = useMemo(() => groupErrors(errors), [errors]);

  if (totalErrors === 0) return null;

  const top3 = sortedCategories.slice(0, 3);

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-slate-300">{totalErrors} error{totalErrors !== 1 ? 's' : ''} in {sortedCategories.length} categor{sortedCategories.length !== 1 ? 'ies' : 'y'}:</span>
          {top3.map(cat => {
            const config = ERROR_CATEGORIES[cat];
            return (
              <Badge key={cat} className={`${config.badgeColor} text-[10px] py-0`}>
                {config.label} ({grouped[cat].length})
              </Badge>
            );
          })}
          {sortedCategories.length > 3 && (
            <span className="text-[10px] text-slate-500">+{sortedCategories.length - 3} more</span>
          )}
        </div>
        <Button
          variant="ghost" size="sm"
          className="h-6 text-[10px] text-cyan-400 hover:text-cyan-300 px-1"
          onClick={() => downloadErrorCSV(errors, batchName)}
        >
          <Download className="w-3 h-3 mr-1" /> Download failed rows
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-red-400" />
          <span className="text-sm font-semibold text-slate-200">
            Error Analysis — {totalErrors} error{totalErrors !== 1 ? 's' : ''}
          </span>
        </div>
        <Button
          variant="outline" size="sm"
          className="h-7 text-xs gap-1 bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
          onClick={() => downloadErrorCSV(errors, batchName)}
        >
          <Download className="w-3 h-3" /> Download CSV
        </Button>
      </div>

      {/* Error categories with solutions */}
      <Card className="border-red-500/20 bg-red-500/5">
        <CardContent className="py-3 px-4">
          <p className="text-xs font-semibold text-slate-400 mb-2">Error Breakdown</p>
          <div className="space-y-2">
            {top3.map(cat => {
              const config = ERROR_CATEGORIES[cat];
              const Icon = ICON_MAP[config.icon] || AlertTriangle;
              const count = grouped[cat].length;
              const pct = Math.round((count / totalErrors) * 100);
              const sample = grouped[cat][0];
              const isSolutionExpanded = expandedSolution === cat;

              return (
                <div key={cat} className="bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden">
                  <div className="flex items-start gap-3 p-2.5">
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <Badge className={`${config.badgeColor} text-[10px]`}>{config.label}</Badge>
                        <span className="text-xs font-semibold text-slate-300">{count} ({pct}%)</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mb-1">{config.description}</p>
                      <div className="bg-slate-900/50 rounded px-2 py-1 text-[11px] text-slate-400 truncate">
                        <span className="text-slate-500">Sample: </span>
                        {sample?.row != null && <span className="text-slate-500">Row {sample.row} — </span>}
                        {sample?.message || 'No details'}
                      </div>
                      {/* Progress bar */}
                      <div className="mt-1.5 h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${config.color.replace('text-', 'bg-')}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* Solutions toggle */}
                  <button
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left border-t border-slate-700/30 hover:bg-slate-700/20 transition-colors"
                    onClick={() => setExpandedSolution(isSolutionExpanded ? null : cat)}
                  >
                    <Lightbulb className="w-3 h-3 text-yellow-400" />
                    <span className="text-[11px] font-medium text-slate-400">How to fix</span>
                    {isSolutionExpanded
                      ? <ChevronDown className="w-3 h-3 text-slate-500 ml-auto" />
                      : <ChevronRight className="w-3 h-3 text-slate-500 ml-auto" />
                    }
                  </button>

                  {isSolutionExpanded && (
                    <div className="px-3 pb-3 pt-1">
                      <ol className="space-y-1.5">
                        {config.solutions.map((step, i) => (
                          <li key={i} className="text-xs text-slate-400 flex gap-2">
                            <span className="font-semibold text-slate-500 flex-shrink-0">{i + 1}.</span>
                            {step}
                          </li>
                        ))}
                      </ol>
                      {config.docUrl && (
                        <a
                          href={config.docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-2 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {config.docLabel || 'Documentation'}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {sortedCategories.length > 3 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mt-2"
            >
              {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              {sortedCategories.length - 3} more categor{sortedCategories.length - 3 !== 1 ? 'ies' : 'y'}
            </button>
          )}

          {expanded && sortedCategories.slice(3).map(cat => {
            const config = ERROR_CATEGORIES[cat];
            const Icon = ICON_MAP[config.icon] || AlertTriangle;
            const count = grouped[cat].length;
            const pct = Math.round((count / totalErrors) * 100);
            return (
              <div key={cat} className="flex items-center gap-2 mt-2 bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
                <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                <Badge className={`${config.badgeColor} text-[10px]`}>{config.label}</Badge>
                <span className="text-xs text-slate-400">{count} ({pct}%)</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}