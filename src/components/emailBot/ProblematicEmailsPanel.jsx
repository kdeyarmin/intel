import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { ShieldAlert, ShieldX, RefreshCw, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import EmailValidationBadge from './EmailValidationBadge';

export default function ProblematicEmailsPanel({ providers, onRefresh }) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyingId, setVerifyingId] = useState(null);
  
  const problematicProviders = useMemo(() => {
    return providers.filter(p => p.email && (p.email_validation_status === 'risky' || p.email_validation_status === 'invalid'));
  }, [providers]);

  const riskyCount = problematicProviders.filter(p => p.email_validation_status === 'risky').length;
  const invalidCount = problematicProviders.filter(p => p.email_validation_status === 'invalid').length;

  const handleReverifySingle = async (providerId) => {
    setVerifyingId(providerId);
    try {
      await base44.functions.invoke('verifyProviderEmail', { provider_id: providerId });
      toast.success('Email re-verified successfully');
      onRefresh?.();
    } catch (_e) {
      toast.error('Failed to re-verify email');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleReverifyGroup = async (status) => {
    setIsVerifying(true);
    try {
      const _resp = await base44.functions.invoke('bulkVerifyEmails', {
        mode: status, // 'risky' or 'invalid'
        batch_size: 20
      });
      toast.success(`Re-verification started for ${status} emails`);
      onRefresh?.();
    } catch (_e) {
      toast.error(`Failed to re-verify ${status} emails`);
    } finally {
      setIsVerifying(false);
    }
  };

  if (problematicProviders.length === 0) {
    return (
      <Card className="bg-[#141d30] border-slate-700/50">
        <CardContent className="p-8 text-center">
          <ShieldCheck className="w-12 h-12 text-emerald-400/50 mx-auto mb-3" />
          <p className="text-slate-300">No problematic emails found!</p>
          <p className="text-sm text-slate-500 mt-1">All your searched emails look good or haven't been verified yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-[#141d30] border-amber-500/20">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <ShieldAlert className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-400">{riskyCount}</div>
                <div className="text-xs text-amber-500/80">Risky Emails</div>
              </div>
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-2 whitespace-nowrap"
              onClick={() => handleReverifyGroup('risky')}
              disabled={isVerifying || riskyCount === 0}
            >
              {isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Re-verify Risky
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-[#141d30] border-red-500/20">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <ShieldX className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <div className="text-2xl font-bold text-red-400">{invalidCount}</div>
                <div className="text-xs text-red-500/80">Invalid Emails</div>
              </div>
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 gap-2 whitespace-nowrap"
              onClick={() => handleReverifyGroup('invalid')}
              disabled={isVerifying || invalidCount === 0}
            >
              {isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Re-verify Invalid
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
        {problematicProviders.map(p => (
          <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-slate-800/40 rounded-lg border border-slate-700/30 gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-slate-200 truncate">
                  {p.entity_type === 'Individual' ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : p.organization_name || 'Unknown'}
                </span>
                <Badge variant="outline" className="text-[10px] bg-slate-900/50 border-slate-700 text-slate-400">NPI: {p.npi}</Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {p.email}</span>
                <EmailValidationBadge status={p.email_validation_status} reason={p.email_validation_reason} size="sm" />
              </div>
            </div>
            
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 shrink-0"
              onClick={() => handleReverifySingle(p.id)}
              disabled={verifyingId === p.id}
            >
              {verifyingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
              Re-verify
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}