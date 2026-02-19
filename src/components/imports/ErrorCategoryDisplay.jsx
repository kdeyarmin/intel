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
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 border-amber-200',
    badgeColor: 'bg-amber-100 text-amber-800',
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
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 border-orange-200',
    badgeColor: 'bg-orange-100 text-orange-800',
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
    color: 'text-red-600',
    bgColor: 'bg-red-50 border-red-200',
    badgeColor: 'bg-red-100 text-red-800',
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
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 border-blue-200',
    badgeColor: 'bg-blue-100 text-blue-800',
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
    color: 'text-gray-600',
    bgColor: 'bg-gray-50 border-gray-200',
    badgeColor: 'bg-gray-100 text-gray-700',
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
          <span className="text-xs text-gray-500">{errors.length} error{errors.length !== 1 ? 's' : ''}</span>
        </div>
        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Error messages */}
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {errors.map((err, idx) => (
              <div key={idx} className="text-sm bg-white/60 rounded p-2">
                {err.row != null && <span className="text-xs font-medium text-gray-500 mr-1">Row {err.row}:</span>}
                <span className={config.color}>{err.message}</span>
                {err.npi && <span className="text-gray-400 text-xs ml-1">(NPI: {err.npi})</span>}
              </div>
            ))}
          </div>

          {/* Resolution steps */}
          <div className="bg-white/80 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb className="w-3.5 h-3.5 text-yellow-500" />
              <span className="text-xs font-semibold text-gray-700">Suggested Resolution</span>
            </div>
            <ol className="space-y-1">
              {config.resolution.map((step, i) => (
                <li key={i} className="text-xs text-gray-600 flex gap-2">
                  <span className="font-medium text-gray-400 flex-shrink-0">{i + 1}.</span>
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
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <span className="text-sm font-semibold text-gray-800">
          {errors.length} Error{errors.length !== 1 ? 's' : ''} — {sortedCategories.length} Categor{sortedCategories.length !== 1 ? 'ies' : 'y'}
        </span>
      </div>
      {sortedCategories.map(cat => (
        <ErrorGroup key={cat} category={cat} errors={grouped[cat]} />
      ))}
    </div>
  );
}