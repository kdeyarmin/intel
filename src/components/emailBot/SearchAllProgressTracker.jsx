import React, { useMemo } from 'react';
import { Progress } from '@/components/ui/progress';
import { Clock, Zap, TrendingUp, Users } from 'lucide-react';

export default function SearchAllProgressTracker({ allRunProgress, remainingForRun, isRunningAll }) {
  const {
    totalSearched = 0,
    totalFound = 0,
    batchNumber = 0,
    status,
    startTime,
    batchTimes
  } = allRunProgress ?? {};

  const metrics = useMemo(() => {
    if (!allRunProgress) {
      return { throughput: 0, eta: null, avgBatchTime: 0, findRate: 0 };
    }

    if (!startTime || totalSearched === 0) {
      return { throughput: 0, eta: null, avgBatchTime: 0, findRate: 0 };
    }

    const elapsedSec = (Date.now() - startTime) / 1000;
    const throughput = elapsedSec > 0 ? (totalSearched / elapsedSec) : 0;
    const findRate = totalSearched > 0 ? (totalFound / totalSearched) * 100 : 0;

    // Use recent batch times for more accurate ETA
    const recentBatchTimes = (batchTimes || []).slice(-5);
    const avgBatchTime = recentBatchTimes.length > 0
      ? recentBatchTimes.reduce((a, b) => a + b, 0) / recentBatchTimes.length
      : 0;

    const remaining = Math.max(0, remainingForRun - totalSearched);
    let eta = null;
    if (throughput > 0 && remaining > 0) {
      const etaSec = remaining / throughput;
      if (etaSec < 60) eta = `${Math.round(etaSec)}s`;
      else if (etaSec < 3600) eta = `${Math.round(etaSec / 60)}m`;
      else eta = `${Math.floor(etaSec / 3600)}h ${Math.round((etaSec % 3600) / 60)}m`;
    }

    return { throughput, eta, avgBatchTime, findRate };
  }, [totalSearched, totalFound, startTime, batchTimes, remainingForRun]);

  const progressPct = remainingForRun > 0
    ? Math.min(100, Math.round((totalSearched / remainingForRun) * 100))
    : 0;

  const isActive = status === 'running' && isRunningAll;
  const isComplete = status === 'complete';
  const isStopped = status === 'stopped';

  if (!allRunProgress) return null;
  if (!isActive && !isComplete && !isStopped) return null;

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <Progress value={progressPct} className="h-2.5" />
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">
            Batch {batchNumber} • {totalSearched.toLocaleString()} searched • {totalFound.toLocaleString()} emails found
          </span>
          <span className="text-slate-300 font-medium">{progressPct}%</span>
        </div>
      </div>

      {/* Metrics row */}
      {isActive && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-2 text-center">
            <Zap className="w-3 h-3 text-violet-400 mx-auto mb-0.5" />
            <p className="text-sm font-bold text-slate-200">
              {metrics.throughput.toFixed(1)}/s
            </p>
            <p className="text-[9px] text-slate-500">Throughput</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-2 text-center">
            <Clock className="w-3 h-3 text-cyan-400 mx-auto mb-0.5" />
            <p className="text-sm font-bold text-slate-200">
              {metrics.eta || '—'}
            </p>
            <p className="text-[9px] text-slate-500">Est. Remaining</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-2 text-center">
            <TrendingUp className="w-3 h-3 text-emerald-400 mx-auto mb-0.5" />
            <p className="text-sm font-bold text-slate-200">
              {metrics.findRate.toFixed(0)}%
            </p>
            <p className="text-[9px] text-slate-500">Find Rate</p>
          </div>
          <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-2 text-center">
            <Users className="w-3 h-3 text-amber-400 mx-auto mb-0.5" />
            <p className="text-sm font-bold text-slate-200">
              {Math.max(0, remainingForRun - totalSearched).toLocaleString()}
            </p>
            <p className="text-[9px] text-slate-500">Still Remaining</p>
          </div>
        </div>
      )}

      {/* Completed/stopped summary */}
      {!isActive && (isComplete || isStopped) && (
        <div className={`rounded-lg p-3 text-sm ${isComplete
          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
        }`}>
          {isComplete
            ? `✅ Complete — searched ${totalSearched.toLocaleString()} providers across ${batchNumber} batches, found ${totalFound.toLocaleString()} emails (${metrics.findRate.toFixed(0)}% find rate).`
            : `⏹ Stopped after ${batchNumber} batches — searched ${totalSearched.toLocaleString()}, found ${totalFound.toLocaleString()} emails.`
          }
        </div>
      )}
    </div>
  );
}
