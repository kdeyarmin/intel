import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Bot, Loader2, Zap, Square } from 'lucide-react';
import SearchAllProgressTracker from './SearchAllProgressTracker';

export default function EmailBotControls({
  batchSize, setBatchSize,
  skipSearched, setSkipSearched,
  onRunAll, onStopAll, onRunSingle,
  singleNpi, setSingleNpi,
  isRunning, isRunningAll, stopRequested,
  stats,
  allRunProgress,
}) {
  const remainingForRun = stats ? (skipSearched ? stats.remaining : stats.total) : 0;
  const estimatedBatches = remainingForRun > 0 ? Math.ceil(remainingForRun / batchSize) : 0;

  return (
    <div className="space-y-5">
      {/* Search All Providers */}
      <Card className="border border-violet-500/20 bg-[#141d30]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-slate-200">
            <Zap className="w-4 h-4 text-violet-400" />
            Search All Providers
          </CardTitle>
          <CardDescription className="text-slate-400">
            Automatically search every provider for emails, in batches of {batchSize}.
            {remainingForRun > 0 && (
              <span className="font-medium text-violet-400"> ~{remainingForRun.toLocaleString()} providers remaining ({estimatedBatches} batches).</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-300">Batch Size</Label>
              <Input
                type="number" min="1" max="50" value={batchSize}
                onChange={e => setBatchSize(Math.min(50, parseInt(e.target.value) || 5))}
                className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-500" disabled={isRunning}
              />
              <p className="text-[10px] text-slate-500 mt-1">Providers per API call (max 50)</p>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={skipSearched} onCheckedChange={setSkipSearched} disabled={isRunning} />
              <Label className="text-xs text-slate-300">Skip already searched</Label>
            </div>
          </div>

          {/* Granular progress tracker */}
          <SearchAllProgressTracker
            allRunProgress={allRunProgress}
            remainingForRun={remainingForRun}
            isRunningAll={isRunningAll}
          />

          <div className="flex gap-2">
            {!isRunningAll ? (
              <Button
                onClick={onRunAll}
                disabled={isRunning || remainingForRun === 0}
                className="flex-1 bg-violet-600 hover:bg-violet-700"
              >
                <Zap className="w-4 h-4 mr-2" /> Search All Providers
              </Button>
            ) : (
              <Button
                onClick={onStopAll}
                disabled={stopRequested}
                variant="destructive"
                className="flex-1"
              >
                <Square className="w-4 h-4 mr-2" /> {stopRequested ? 'Stopping after current batch...' : 'Stop'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Single NPI Lookup */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-slate-200">
            <Bot className="w-4 h-4 text-violet-400" />
            Single Provider Lookup
          </CardTitle>
          <CardDescription className="text-slate-400">Search email for one specific NPI</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Enter NPI, e.g. 1234567890"
              value={singleNpi}
              onChange={e => setSingleNpi(e.target.value)}
              className="h-9 text-sm bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-500 flex-1"
            />
            <Button
              onClick={onRunSingle}
              disabled={isRunning || !singleNpi.trim()}
              className="bg-cyan-600 hover:bg-cyan-700 h-9"
            >
              {isRunning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Bot className="w-4 h-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}