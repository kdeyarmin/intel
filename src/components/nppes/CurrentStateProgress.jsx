import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, RefreshCw, FileCheck } from 'lucide-react';

const STATE_ZIP_PREFIXES = {
  AL: ['35','36'], AK: ['99'], AZ: ['85','86'], AR: ['71','72','75'],
  CA: ['90','91','92','93','94','95','96'], CO: ['80','81'], CT: ['06'],
  DE: ['19'], DC: ['20'], FL: ['32','33','34'], GA: ['30','31','39'],
  HI: ['96'], ID: ['83'], IL: ['60','61','62'], IN: ['46','47'],
  IA: ['50','51','52','68'], KS: ['66','67'], KY: ['40','41','42'],
  LA: ['70','71'], ME: ['03','04'], MD: ['20','21'],
  MA: ['01','02','05'], MI: ['48','49'], MN: ['55','56'],
  MS: ['38','39','71'], MO: ['63','64','65'], MT: ['59'],
  NE: ['68','69'], NV: ['88','89'], NH: ['03'],
  NJ: ['07','08'], NM: ['87','88'], NY: ['06','10','11','12','13','14'],
  NC: ['27','28'], ND: ['58'], OH: ['43','44','45'],
  OK: ['73','74'], OR: ['97'], PA: ['15','16','17','18','19'],
  RI: ['02'], SC: ['29'], SD: ['57'], TN: ['37','38'],
  TX: ['73','75','76','77','78','79','88'], UT: ['84'],
  VT: ['05'], VA: ['20','22','23','24'], WA: ['98','99'],
  WV: ['24','25','26'], WI: ['53','54'], WY: ['82','83']
};

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
      // Fallback: check currently_processing_state or processing_states from status
      if (status?.currently_processing_state) return status.currently_processing_state;
      if (status?.processing_states?.length > 0) return status.processing_states[0];
      return null;
    }
    return activeBatch.file_name?.split('_')[1] || null;
  }, [activeBatch, status]);

  if (!stateCode) return null;

  const totalPrefixes = (STATE_ZIP_PREFIXES[stateCode] || []).length;
  const processedPrefixes = activeBatch?.retry_params?.processed_prefixes || [];
  const completedPrefixes = processedPrefixes.length;
  const pct = totalPrefixes > 0 ? Math.round((completedPrefixes / totalPrefixes) * 100) : 0;

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
            {completedPrefixes} / {totalPrefixes} zip prefixes
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
              <span>{totalPrefixes - completedPrefixes} prefix{totalPrefixes - completedPrefixes !== 1 ? 'es' : ''} remaining</span>
            )}
          </div>
        </div>

        {/* Zip prefix pills */}
        {totalPrefixes > 0 && (
          <div className="flex flex-wrap gap-1">
            {(STATE_ZIP_PREFIXES[stateCode] || []).map(prefix => {
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
                  {prefix}*
                </span>
              );
            })}
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