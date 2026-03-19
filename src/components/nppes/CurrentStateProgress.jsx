import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, RefreshCw, FileCheck } from 'lucide-react';

const DEFAULT_QUEUE_ITEMS = 100;

const STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',
  DE:'Delaware',DC:'District of Columbia',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',
  IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',
  MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',
  NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',
  OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',
  TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',
  WI:'Wisconsin',WY:'Wyoming'
};

export default function CurrentStateProgress({ status }) {
  const activeBatch = useMemo(() => {
    if (!status?.batches) return null;
    // Find the most recent batch that is still processing
    return status.batches.find(b => 
      b.status === 'processing' && b.file_name?.startsWith('crawler_')
    );
  }, [status]);

  const stateCode = useMemo(() => {
    if (!activeBatch) {
      // Fallback: check processing_states from status
      if (status?.processing_states?.length > 0) return status.processing_states[0];
      return null;
    }
    return (activeBatch.file_name?.match(/crawler_([A-Z]{2})/) || [null, null])[1];
  }, [activeBatch, status]);

  if (!stateCode) return null;

  const processedPrefixes = activeBatch?.retry_params?.processed_prefixes || [];
  const metricsForState = status?.granular_metrics?.[stateCode];
  const totalPrefixes = metricsForState?.total_queue_items || activeBatch?.retry_params?.total_queue_items || DEFAULT_QUEUE_ITEMS;
  const completedFromMetrics = metricsForState?.completed_items || 0;
  const completedPrefixes = Math.max(processedPrefixes.length, completedFromMetrics);
  const pct = totalPrefixes > 0 ? Math.min(Math.round((completedPrefixes / totalPrefixes) * 100), 100) : 0;
  const filterCity = activeBatch?.retry_params?.city;
  const filterPostalCode = activeBatch?.retry_params?.postal_code;
  const usesDefaultPrefixGrid = totalPrefixes === DEFAULT_QUEUE_ITEMS;

  const imported = activeBatch?.imported_rows || 0;
  const updated = activeBatch?.updated_rows || 0;
  const skipped = activeBatch?.skipped_rows || 0;
  const valid = activeBatch?.valid_rows || 0;

  return (
    <Card className="border-teal-500/30 bg-teal-500/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />
            <span className="text-sm font-semibold text-teal-300">
              Crawling: {STATE_NAMES[stateCode] || stateCode} ({stateCode})
            </span>
          </div>
          <Badge className="bg-teal-500/15 text-teal-400 border border-teal-500/20 text-xs">
            {completedPrefixes} / {totalPrefixes} {usesDefaultPrefixGrid ? 'zip prefixes' : 'queue items'}
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="w-full h-2.5 rounded-full bg-slate-700/80 overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-500 transition-all duration-700"
              style={{ width: `${Math.max(pct, 2)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>{pct}% complete</span>
            {totalPrefixes - completedPrefixes > 0 && (
              <span>{totalPrefixes - completedPrefixes} {usesDefaultPrefixGrid ? `prefix${totalPrefixes - completedPrefixes !== 1 ? 'es' : ''}` : `item${totalPrefixes - completedPrefixes !== 1 ? 's' : ''}`} remaining</span>
            )}
          </div>
        </div>

        {usesDefaultPrefixGrid && processedPrefixes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: DEFAULT_QUEUE_ITEMS }, (_, i) => String(i).padStart(2, '0')).map(prefix => {
              const done = processedPrefixes.includes(prefix);
              return (
                <span
                  key={prefix}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                    done
                      ? 'bg-teal-500/20 text-teal-400 border-teal-500/30'
                      : 'bg-slate-800/50 text-slate-500 border-slate-700/50'
                  }`}
                >
                  {prefix}
                </span>
              );
            })}
          </div>
        )}

        {!usesDefaultPrefixGrid && (filterCity || filterPostalCode) && (
          <div className="flex flex-wrap gap-2 text-[10px] text-slate-300">
            {filterCity && <span className="rounded border border-teal-500/20 bg-teal-500/10 px-2 py-1">City: {filterCity}</span>}
            {filterPostalCode && <span className="rounded border border-teal-500/20 bg-teal-500/10 px-2 py-1">Postal: {filterPostalCode}</span>}
          </div>
        )}

        {/* Stats row */}
        {(valid > 0 || imported > 0) && (
          <div className="flex gap-4 text-xs pt-1 border-t border-teal-500/10">
            <div className="flex items-center gap-1.5">
              <FileCheck className="w-3 h-3 text-slate-400" />
              <span className="text-slate-400">Valid:</span>
              <span className="font-semibold text-slate-200">{valid.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="w-3 h-3 text-emerald-400" />
              <span className="text-slate-400">Imported:</span>
              <span className="font-semibold text-emerald-400">{imported.toLocaleString()}</span>
            </div>
            {updated > 0 && (
              <div className="flex items-center gap-1.5">
                <RefreshCw className="w-3 h-3 text-violet-400" />
                <span className="text-slate-400">Updated:</span>
                <span className="font-semibold text-violet-400">{updated.toLocaleString()}</span>
              </div>
            )}
            {skipped > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Skipped:</span>
                <span className="font-semibold text-slate-300">{skipped.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}