import React from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, AlertCircle, Shield } from 'lucide-react';

export default function EmailQualityDetails({ analysis, email, compact = false }) {
  if (!analysis) return null;

  const riskFlags = analysis.riskFlags || analysis.risk_flags || [];
  const reasons = analysis.reasons || [];

  if (compact) {
    // Minimal display for inline view
    return (
      <div className="flex items-center gap-2 pt-1.5">
        <Badge className={
          analysis.score >= 75 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' :
          analysis.score >= 50 ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
          'bg-red-500/15 text-red-400 border-red-500/20'
        } title={`${analysis.score}% confidence`}>
          {analysis.confidence} confidence
        </Badge>
        {riskFlags.length > 0 && (
          <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-[9px]">
            {riskFlags.length} risk flag{riskFlags.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>
    );
  }

  const getConfidenceColor = (confidence) => {
    switch (confidence) {
      case 'high': return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
      case 'medium': return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
      case 'low': return 'bg-red-500/15 text-red-400 border-red-500/20';
      default: return 'bg-slate-500/15 text-slate-400 border-slate-500/20';
    }
  };

  const getScoreLabel = (score) => {
    if (score >= 75) return 'Likely Valid';
    if (score >= 50) return 'Questionable';
    return 'High Risk';
  };

  const getScoreIcon = (score) => {
    if (score >= 75) return <CheckCircle2 className="w-4 h-4" />;
    if (score >= 50) return <AlertCircle className="w-4 h-4" />;
    return <AlertTriangle className="w-4 h-4" />;
  };

  return (
    <div className="space-y-3 p-3 bg-slate-800/40 rounded-lg border border-slate-700/50">
      {/* Score and Confidence */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {getScoreIcon(analysis.score)}
          <span className="text-sm font-medium text-slate-200">{getScoreLabel(analysis.score)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`border ${getConfidenceColor(analysis.confidence)}`}>
            {analysis.score}% confidence
          </Badge>
        </div>
      </div>

      {/* Risk Flags */}
      {riskFlags.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-amber-400 flex items-center gap-1.5">
            <Shield className="w-3 h-3" />
            Risk Flags
          </p>
          <div className="space-y-1">
            {riskFlags.map((flag, idx) => (
              <div key={idx} className="text-[11px] text-amber-400/80 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                <span>{flag}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analysis Reasons */}
      {reasons.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-400">Analysis</p>
          <div className="space-y-1">
            {reasons.map((reason, idx) => (
              <div key={idx} className="text-[11px] text-slate-400 flex items-start gap-2">
                <span className="text-slate-500 mt-0.5">→</span>
                <span>{reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pattern Analysis */}
      {analysis.analysis && (
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="space-y-1">
            <p className="text-slate-400">Format:</p>
            <Badge variant="outline" className={analysis.analysis.format ? 'border-emerald-500/30 text-emerald-400' : 'border-red-500/30 text-red-400'}>
              {analysis.analysis.format ? 'Valid' : 'Invalid'}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-slate-400">Type:</p>
            <Badge variant="outline" className={analysis.analysis.isRoleBased ? 'border-amber-500/30 text-amber-400' : 'border-emerald-500/30 text-emerald-400'}>
              {analysis.analysis.isRoleBased ? 'Role-based' : 'Personal'}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-slate-400">Domain:</p>
            <Badge variant="outline" className={
              analysis.analysis.isSpamDomain ? 'border-red-500/30 text-red-400' :
              analysis.analysis.isReputable ? 'border-emerald-500/30 text-emerald-400' :
              'border-slate-500/30 text-slate-400'
            }>
              {analysis.analysis.isSpamDomain ? 'Risky' : analysis.analysis.isReputable ? 'Reputable' : 'Unknown'}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-slate-400">Typos:</p>
            <Badge variant="outline" className={analysis.analysis.hasTypo ? 'border-amber-500/30 text-amber-400' : 'border-emerald-500/30 text-emerald-400'}>
              {analysis.analysis.hasTypo ? 'Detected' : 'None found'}
            </Badge>
          </div>
        </div>
      )}
    </div>
  );
}