import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { base44 } from '@/api/base44Client';
import { ShieldCheck, ShieldAlert, ShieldX, Loader2, RefreshCw, Zap, Info } from 'lucide-react';
import { toast } from 'sonner';
import EmailVerificationResultRow from './EmailVerificationResultRow';

export default function EmailVerificationPanel({ providers, onRefresh }) {
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState('unverified');
  const [batchSize, setBatchSize] = useState(10);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState(null);

  const stats = useMemo(() => {
    const withEmail = providers.filter(p => p.email);
    const analyzed = withEmail.filter(p => p.email_analyzed_at);
    const unanalyzed = withEmail.filter(p => !p.email_analyzed_at);
    const valid = withEmail.filter(p => p.email_validation_status === 'valid');
    const risky = withEmail.filter(p => p.email_validation_status === 'risky');
    const invalid = withEmail.filter(p => p.email_validation_status === 'invalid');
    return { withEmail: withEmail.length, analyzed: analyzed.length, unanalyzed: unanalyzed.length, valid: valid.length, risky: risky.length, invalid: invalid.length };
  }, [providers]);

  const runVerification = async () => {
    setIsRunning(true);
    setResults(null);
    setProgress({ processed: 0, total: batchSize, status: 'running' });

    try {
      const resp = await base44.functions.invoke('bulkVerifyEmails', {
        mode,
        batch_size: batchSize,
      });
      const data = resp.data;
      setResults(data);
      setProgress({ processed: data.batch_processed, total: data.total_candidates, status: 'done' });
      toast.success(`Verified ${data.verified} emails (${data.remaining} remaining)`);
      onRefresh?.();
    } catch (err) {
      toast.error('Verification failed: ' + (err.response?.data?.error || err.message));
      setProgress(null);
    } finally {
      setIsRunning(false);
    }
  };

  const modeOptions = [
    { value: 'unverified', label: 'Unverified', desc: `${stats.unanalyzed} emails never checked`, icon: Zap },
    { value: 'reverify', label: 'Re-verify Risky/Invalid', desc: `${stats.risky + stats.invalid} need re-check`, icon: RefreshCw },
    { value: 'risky', label: 'Risky Only', desc: `${stats.risky} risky emails`, icon: ShieldAlert },
    { value: 'invalid', label: 'Invalid Only', desc: `${stats.invalid} invalid emails`, icon: ShieldX },
  ];

  return (
    <div className="space-y-4">
      {/* Verification Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="p-3 text-center">
            <div className="text-xl font-bold text-white">{stats.withEmail}</div>
            <div className="text-[10px] text-slate-500">Have Email</div>
          </CardContent>
        </Card>
        <Card className="bg-[#141d30] border-emerald-500/20">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-xl font-bold text-emerald-400">{stats.valid}</span>
            </div>
            <div className="text-[10px] text-emerald-500/80">Verified Valid</div>
          </CardContent>
        </Card>
        <Card className="bg-[#141d30] border-amber-500/20">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span className="text-xl font-bold text-amber-400">{stats.risky}</span>
            </div>
            <div className="text-[10px] text-amber-500/80">Risky</div>
          </CardContent>
        </Card>
        <Card className="bg-[#141d30] border-red-500/20">
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1">
              <ShieldX className="w-4 h-4 text-red-400" />
              <span className="text-xl font-bold text-red-400">{stats.invalid}</span>
            </div>
            <div className="text-[10px] text-red-500/80">Invalid</div>
          </CardContent>
        </Card>
      </div>

      {/* Coverage bar */}
      {stats.withEmail > 0 && (
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex justify-between text-xs text-slate-400 mb-1.5">
              <span>Verification Coverage</span>
              <span>{stats.analyzed} / {stats.withEmail} ({stats.withEmail > 0 ? Math.round(stats.analyzed / stats.withEmail * 100) : 0}%)</span>
            </div>
            <Progress value={stats.withEmail > 0 ? (stats.analyzed / stats.withEmail) * 100 : 0} className="h-2" />
            <div className="flex gap-4 mt-2 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> Valid: {stats.valid}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Risky: {stats.risky}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Invalid: {stats.invalid}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-500 inline-block" /> Unchecked: {stats.unanalyzed}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-slate-200">Run Verification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {modeOptions.map(opt => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => setMode(opt.value)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    mode === opt.value
                      ? 'border-cyan-500/50 bg-cyan-500/10'
                      : 'border-slate-700/50 bg-slate-800/30 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon className={`w-3.5 h-3.5 ${mode === opt.value ? 'text-cyan-400' : 'text-slate-500'}`} />
                    <span className={`text-xs font-medium ${mode === opt.value ? 'text-cyan-300' : 'text-slate-300'}`}>{opt.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-500">{opt.desc}</p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-400">Batch size:</label>
            <select
              value={batchSize}
              onChange={e => setBatchSize(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1"
            >
              {[5, 10, 15, 20, 25].map(n => <option key={n} value={n}>{n}</option>)}
            </select>

            <Button
              onClick={runVerification}
              disabled={isRunning}
              className="ml-auto bg-cyan-600 hover:bg-cyan-700 gap-2"
              size="sm"
            >
              {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              {isRunning ? 'Verifying...' : 'Start Verification'}
            </Button>
          </div>

          {isRunning && progress && (
            <div className="flex items-center gap-2 text-xs text-cyan-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Processing... this may take a minute per provider (DNS + AI checks)
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <Card className="bg-[#141d30] border-slate-700/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-200 flex items-center gap-2">
              Verification Results
              <Badge className="bg-cyan-500/15 text-cyan-400 border border-cyan-500/20 text-[10px]">
                {results.verified} verified
              </Badge>
              {results.remaining > 0 && (
                <Badge className="bg-amber-500/15 text-amber-400 border border-amber-500/20 text-[10px]">
                  {results.remaining} remaining
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(results.results || []).map((r, i) => (
                <EmailVerificationResultRow key={i} result={r} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <div className="flex items-start gap-2 bg-slate-800/40 border border-slate-700/30 rounded-lg p-3">
        <Info className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
        <p className="text-[11px] text-slate-500">
          Verification performs 3-phase checks: format & pattern analysis, DNS/MX record validation, and AI deliverability assessment. 
          Provider records are automatically updated with verification results.
        </p>
      </div>
    </div>
  );
}