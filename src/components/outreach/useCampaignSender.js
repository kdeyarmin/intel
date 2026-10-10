import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { invokeOrThrow, toastFunctionError } from '@/api/functionResult';

const MAX_BATCHES = 200; // 200 × 50 covers the 5,000-recipient cap with room to spare.

const count = (n, one, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/**
 * Sends a campaign in batches (the server sends ≤50 per call) and reports
 * progress. Safe to call again to resume: only pending messages are sent.
 */
export function useCampaignSender() {
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null);

  const send = useCallback(async (campaignId) => {
    setSending(true);
    const totals = { sent: 0, failed: 0, suppressed: 0, remaining: null };
    setProgress({ ...totals });
    try {
      for (let i = 0; i < MAX_BATCHES; i += 1) {
        const data = await invokeOrThrow('sendCampaignMessages', { campaign_id: campaignId, batch_size: 50 });
        const r = data.results || {};
        if (i === 0 && r.messages_created) {
          const skipped = Object.values(r.skipped || {}).reduce((a, b) => a + b, 0);
          toast.info(`${count(r.messages_created, 'message')} prepared${skipped ? ` (${count(skipped, 'recipient')} skipped)` : ''}.`);
        }
        totals.sent += r.sent || 0;
        totals.failed += r.failed || 0;
        totals.suppressed += r.suppressed || 0;
        totals.remaining = r.remaining ?? 0;
        setProgress({ ...totals });
        const handled = (r.sent || 0) + (r.failed || 0) + (r.suppressed || 0);
        if (totals.remaining === 0 || handled === 0) break;
      }
      const parts = [`${totals.sent.toLocaleString()} sent`];
      if (totals.failed) parts.push(`${totals.failed.toLocaleString()} failed`);
      if (totals.suppressed) parts.push(`${totals.suppressed.toLocaleString()} skipped (unsubscribed)`);
      if (totals.remaining) parts.push(`${totals.remaining.toLocaleString()} still queued`);
      (totals.failed ? toast.warning : toast.success)(`Campaign: ${parts.join(', ')}.`);
      return totals;
    } catch (err) {
      toastFunctionError(err, 'Sending failed');
      return null;
    } finally {
      setSending(false);
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaignMetrics', campaignId] });
      queryClient.invalidateQueries({ queryKey: ['messages', campaignId] });
    }
  }, [queryClient]);

  return { send, sending, progress };
}
