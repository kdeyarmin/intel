import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  AlertTriangle, Clock, ShieldAlert, FileWarning, 
  ChevronDown, ChevronRight, Lightbulb, Wrench
} from 'lucide-react';

const ERROR_CATEGORIES = {
  timeout: {
    label: 'Timeout',
    icon: Clock,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
    badgeColor: 'bg-amber-500/15 text-amber-400',
    keywords: ['timeout', 'timed out', 'stalled', 'execution time', 'too long', 'exceeded'],
    resolution: [
      'Reduce batch size in crawler config (try 100 instead of 200)',
      'Retry with a smaller row range using "Retry Specific Rows"',
      'Increase max_crawl_duration_sec in NPPESCrawlerConfig',
    ],
  },
  validation: {
    label: 'Validation',
    icon: FileWarning,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10 border-orange-500/20',
    badgeColor: 'bg-orange-500/15 text-orange-400',
    keywords: ['invalid', 'validation', 'missing required', 'schema', 'format', 'malformed', 'NPI'],
    resolution: [
      'Check source data format matches expected schema',
      'Review column mapping for misaligned fields',
      'Use "Retry Failed Rows Only" to re-process just the invalid records',
    ],
  },
  processing: {
    label: 'Processing',
    icon: ShieldAlert,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 border-red-500/20',
    badgeColor: 'bg-red-500/15 text-red-400',
    keywords: ['failed to create', 'failed to update', 'bulk', 'insert', 'database', 'duplicate key', 'conflict'],
    resolution: [
      'Check for duplicate NPI records in the source data',
      'Retry with dry_run enabled to validate without writing',
      'Review error samples for specific record-level issues',
    ],
  },
  network: {
    label: 'Network / API',
    icon: AlertTriangle,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
    badgeColor: 'bg-blue-500/15 text-blue-400',
    keywords: ['HTTP', 'fetch', 'network', 'connection', 'rate limit', '429', '500', '503', 'abort'],
    resolution: [
      'Increase api_delay_ms in crawler config to reduce rate limiting',
      'Wait a few minutes and retry — the CMS API may be under load',
      'Increase request_timeout_ms for slow API responses',
    ],
  },
  manual: {
    label: 'Manual Action',
    icon: Wrench,
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10 border-slate-500/20',
    badgeColor: 'bg-slate-500/15 text-slate-400',
    keywords: ['manually', 'cancelled', 'user', 'skipped'],
    resolution: [
      'This batch was manually stopped or marked by a user',
      'Retry if the underlying issue has been resolved',
    ],
  },
};

function categorizeError(message) {
  if (!message) return 'processing';
  const lower = message.toLowerCase();
  for (const [key, config] of Object.entries(ERROR_CATEGORIES)) {
    if (config.keywords.some(kw => lower.includes(kw))) return key;
  }
  return 'processing';
}

function ErrorGroup({ category, errors }) {
  const [expanded, setExpanded] = useState(false);
  const config = ERROR_CATEGORIES[category];
  const Icon = config.icon;

  return (
    <div className={`border rounded-lg ${config.bgColor}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${config.color}`} />
          <Badge className={config.badgeColor}>{config.label}</Badge>
          <span className="text-xs text-slate-500">{errors.length} error{errors.length !== 1 ? 's' : ''}</span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
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

          {/* Resolution steps */}
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-xs font-semibold text-slate-300">Suggested Resolution</span>
            </div>
            <ol className="space-y-1">
              {config.resolution.map((step, i) => (
                <li key={i} className="text-xs text-slate-400 flex gap-2">
                  <span className="font-medium text-slate-500 flex-shrink-0">{i + 1}.</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ErrorCategoryDisplay({ errors }) {
  if (!errors || errors.length === 0) return null;

  // Group errors by category
  const grouped = {};
  for (const err of errors) {
    const cat = categorizeError(err.message);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(err);
  }

  // Sort categories: timeout first, then by count
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    if (a === 'timeout') return -1;
    if (b === 'timeout') return 1;
    return grouped[b].length - grouped[a].length;
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <span className="text-sm font-semibold text-slate-200">
          {errors.length} Error{errors.length !== 1 ? 's' : ''} — {sortedCategories.length} Categor{sortedCategories.length !== 1 ? 'ies' : 'y'}
        </span>
      </div>
      {sortedCategories.map(cat => (
        <ErrorGroup key={cat} category={cat} errors={grouped[cat]} />
      ))}
    </div>
  );
}