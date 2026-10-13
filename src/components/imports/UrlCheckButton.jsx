import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Link2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { invokeOrThrow, toastFunctionError } from '@/api/functionResult';

const STYLES = {
  success: { icon: CheckCircle2, cls: 'text-emerald-400' },
  warning: { icon: AlertTriangle, cls: 'text-amber-400' },
  failed: { icon: XCircle, cls: 'text-red-400' },
};

/** Checks that a data URL is reachable (server-side, SSRF-guarded) and shows the verdict inline. */
export default function UrlCheckButton({ url }) {
  const [checking, setChecking] = useState(false);
  // The verdict is kept with the URL it was for, so editing the field hides it.
  const [result, setResult] = useState(null);
  const trimmed = (url || '').trim();
  const check = result?.url === trimmed ? result.check : null;

  const run = async () => {
    setChecking(true);
    setResult(null);
    try {
      const data = await invokeOrThrow('testCMSUrl', { url: trimmed });
      setResult({ url: trimmed, check: data.check });
    } catch (err) {
      toastFunctionError(err, "Unable to check the URL");
    } finally {
      setChecking(false);
    }
  };

  const style = check ? STYLES[check.status] || STYLES.failed : null;
  const Icon = style?.icon;
  return (
    <div className="mt-1.5 space-y-1">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={!trimmed || checking} className="h-7 gap-1.5 text-xs">
        {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
        {checking ? 'Checking…' : 'Check URL'}
      </Button>
      {check && (
        <p role="status" className={`flex items-start gap-1.5 text-xs ${style.cls}`}>
          <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{check.message}</span>
        </p>
      )}
    </div>
  );
}
