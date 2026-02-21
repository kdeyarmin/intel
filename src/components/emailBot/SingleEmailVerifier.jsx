import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { ShieldCheck, ShieldAlert, ShieldX, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const statusConfig = {
  valid: { icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Valid' },
  risky: { icon: ShieldAlert, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Risky' },
  invalid: { icon: ShieldX, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Invalid' },
};

export default function SingleEmailVerifier({ provider, onVerified }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const verify = async () => {
    setLoading(true);
    try {
      const resp = await base44.functions.invoke('verifyProviderEmail', {
        provider_id: provider.id,
      });
      setResult(resp.data);
      toast.success(`Email verified: ${resp.data.status} (score: ${resp.data.score})`);
      onVerified?.(resp.data);
    } catch (err) {
      toast.error('Verification failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  if (!provider.email) return null;

  const hasExisting = provider.email_analyzed_at;
  const existingStatus = provider.email_validation_status;
  const showReverify = existingStatus === 'risky' || existingStatus === 'invalid';
  const displayResult = result || (hasExisting ? {
    status: existingStatus,
    score: provider.email_quality_score,
    confidence: provider.email_quality_confidence,
    reasons: provider.email_quality_reasons,
    riskFlags: provider.email_quality_risk_flags,
  } : null);

  const config = displayResult ? statusConfig[displayResult.status] || {} : null;
  const Icon = config?.icon;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={showReverify ? 'destructive' : 'outline'}
          onClick={verify}
          disabled={loading}
          className="gap-1.5 text-xs"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> :
            showReverify ? <RefreshCw className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
          {loading ? 'Verifying...' : showReverify ? 'Re-verify' : hasExisting ? 'Re-verify' : 'Verify Email'}
        </Button>

        {displayResult && Icon && (
          <Badge className={`${config.bg} ${config.color} text-[10px] gap-1`}>
            <Icon className="w-3 h-3" />
            {config.label} {displayResult.score != null && `(${displayResult.score})`}
          </Badge>
        )}
      </div>

      {displayResult && displayResult.reasons?.length > 0 && (
        <div className="pl-2 border-l-2 border-slate-700 space-y-0.5">
          {displayResult.reasons.slice(0, 4).map((r, i) => (
            <p key={i} className="text-[10px] text-slate-500">{r}</p>
          ))}
        </div>
      )}

      {displayResult?.riskFlags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {displayResult.riskFlags.slice(0, 5).map((flag, i) => (
            <Badge key={i} className="bg-red-500/10 text-red-400 border border-red-500/20 text-[9px]">{flag}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}