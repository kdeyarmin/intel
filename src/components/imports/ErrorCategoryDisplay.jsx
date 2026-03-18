import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle, Clock, ShieldAlert, FileWarning, Type, Copy, Wifi, Wrench, HelpCircle,
  ChevronDown, ChevronRight, Lightbulb, ExternalLink
} from 'lucide-react';
import { ERROR_CATEGORIES, groupErrors } from './errorCategories';

const ICON_MAP = {
  ShieldAlert, FileWarning, Type, Copy, Clock, Wifi, Wrench, HelpCircle, AlertTriangle,
};

function ErrorGroup({ categoryKey, errors }) {
  const [expanded, setExpanded] = useState(false);
  const config = ERROR_CATEGORIES[categoryKey];
  const Icon = ICON_MAP[config.icon] || AlertTriangle;

  return (
    <div className={`border rounded-lg ${config.bgColor}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${config.color}`} />
          <Badge className={config.badgeColor}>{config.label}</Badge>
          <span className="text-xs text-slate-400">{errors.length} error{errors.length !== 1 ? 's' : ''}</span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Description */}
          <p className="text-xs text-slate-400 px-1">{config.description}</p>

          {/* Error messages */}
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {errors.map((err, idx) => (
              <div key={idx} className="text-sm bg-slate-800/50 rounded p-2">
                {err.row != null && <span className="text-xs font-medium text-slate-500 mr-1">Row {err.row}:</span>}
                <span className={config.color}>{err.message}</span>
                {err.npi && <span className="text-slate-500 text-xs ml-1">(NPI: {err.npi})</span>}
              </div>
            ))}
          </div>

          {/* Solutions */}
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-xs font-semibold text-slate-300">How to Fix</span>
            </div>
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
                className="inline-flex items-center gap-1 mt-2.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                {config.docLabel || 'Documentation'}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ErrorCategoryDisplay({ errors }) {
  const { grouped, sortedCategories, totalErrors } = useMemo(() => groupErrors(errors), [errors]);

  if (totalErrors === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <span className="text-sm font-semibold text-slate-200">
          {totalErrors} Error{totalErrors !== 1 ? 's' : ''} — {sortedCategories.length} Categor{sortedCategories.length !== 1 ? 'ies' : 'y'}
        </span>
      </div>
      {sortedCategories.map(cat => (
        <ErrorGroup key={cat} categoryKey={cat} errors={grouped[cat]} />
      ))}
    </div>
  );
}