import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Bot, Play, Loader2, Users, Zap, Square } from 'lucide-react';

export default function EmailBotControls({
  batchSize, setBatchSize,
  skipSearched, setSkipSearched,
  onRunBatch, onRunAll, onStopAll, onRunSingle,
  singleNpi, setSingleNpi,
  isRunning, isRunningAll, stopRequested,
  stats,
  allRunProgress,
}) {
  const remainingForRun = stats ? (skipSearched ? stats.remaining : stats.total - stats.withEmail) : 0;
  const estimatedBatches = remainingForRun > 0 ? Math.ceil(remainingForRun / batchSize) : 0;
  const progressPct = allRunProgress && estimatedBatches > 0
    ? Math.min(100, Math.round((allRunProgress.totalSearched / Math.max(remainingForRun, 1)) * 100))
    : 0;

  return (
    <div className="space-y-5">
      {/* Search All Providers */}
      <Card className="border border-violet-500/20 bg-[#141d30]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 text-slate-200">
            <Zap className="w-4 h-4 text-violet-400" />
            Search All Providers
          </CardTitle>
          <CardDescription className="text-slate-500">
            Automatically search every provider in the database for emails, running in batches of {batchSize}. 
            {remainingForRun > 0 && (
              <span className="font-medium text-violet-400"> ~{remainingForRun} providers remaining ({estimatedBatches} batches).</span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-slate-400">Batch Size</Label>
              <Input
                type="number" min="1" max="500" value={batchSize}
                onChange={e => setBatchSize(Math.min(500, parseInt(e.target.value) || 10))}
                className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-200" disabled={isRunning}
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={skipSearched} onCheckedChange={setSkipSearched} disabled={isRunning} />
              <Label className="text-xs">Skip already searched</Label>
            </div>
          </div>

          {stats && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400">{stats.total} total</Badge>
              <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 text-[10px]">{stats.withEmail} have email</Badge>
              <Badge className="bg-slate-800 text-slate-400 border border-slate-700 text-[10px]">{stats.searched} searched</Badge>
              <Badge className="bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 text-[10px]">{stats.remaining} remaining</Badge>
            </div>
          )}

          {/* Progress bar during Search All */}
          {allRunProgress && isRunningAll && (
            <div className="space-y-1.5">
              <Progress value={progressPct} className="h-2" />
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Batch {allRunProgress.batchNumber} • {allRunProgress.totalSearched} searched • {allRunProgress.totalFound} found</span>
                <span>{progressPct}%</span>
              </div>
            </div>
          )}

          {/* Completed summary */}
          {allRunProgress && !isRunningAll && allRunProgress.status !== 'running' && (
            <div className={`rounded-lg p-3 text-sm ${allRunProgress.status === 'complete' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
              {allRunProgress.status === 'complete'
                ? `✅ Complete — searched ${allRunProgress.totalSearched} providers across ${allRunProgress.batchNumber} batches, found ${allRunProgress.totalFound} emails.`
                : `⏹ Stopped after ${allRunProgress.batchNumber} batches — searched ${allRunProgress.totalSearched}, found ${allRunProgress.totalFound} emails.`
              }
            </div>
          )}

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Single Batch */}
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-slate-200">
              <Users className="w-4 h-4 text-cyan-400" />
              Single Batch Search
            </CardTitle>
            <CardDescription className="text-slate-500">Run one batch of {batchSize} providers</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={onRunBatch}
              disabled={isRunning}
              className="w-full bg-cyan-600 hover:bg-cyan-700"
            >
              {isRunning && !isRunningAll ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Searching...</>
              ) : (
                <><Play className="w-4 h-4 mr-2" /> Run One Batch</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Single NPI */}
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-slate-200">
              <Bot className="w-4 h-4 text-violet-400" />
              Single Provider Search
            </CardTitle>
            <CardDescription className="text-slate-500">Search email for a specific NPI</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-slate-400">Provider NPI</Label>
              <Input
                placeholder="e.g., 1234567890"
                value={singleNpi}
                onChange={e => setSingleNpi(e.target.value)}
                className="h-8 text-sm bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-600"
              />
            </div>
            <Button
              onClick={onRunSingle}
              disabled={isRunning || !singleNpi.trim()}
              variant="outline"
              className="w-full bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-cyan-400"
            >
              {isRunning ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Searching...</>
              ) : (
                <><Bot className="w-4 h-4 mr-2" /> Search This Provider</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}