import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, Loader2, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { usePageAccess } from '@/hooks/usePageAccess';

const BUSY = new Set(['running', 'queued']);

/** When a section's numbers were computed by the background rollups. */
export function RollupFreshness({ rollup }) {
  if (!rollup) return null;
  let text;
  if (BUSY.has(rollup.status)) text = 'Refreshing…';
  else if (rollup.refreshed_at) text = `Computed ${new Date(rollup.refreshed_at).toLocaleString()}`;
  else if (rollup.status === 'failed') text = 'Not computed: the last refresh failed';
  else text = 'Not computed yet. Analytics refresh in the background once a day.';
  return (
    <p className="flex items-center gap-1 text-[11px] text-slate-400">
      <Clock className="w-3 h-3" aria-hidden="true" />
      {text}
      {rollup.status === 'failed' && rollup.error && <span className="text-red-400"> ({rollup.error})</span>}
    </p>
  );
}

/** Admin-only: recompute the analytics rollups now and refresh the page when they finish. */
export function RefreshRollupsButton({ invalidateKey }) {
  const { isAdmin } = usePageAccess();
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ['rollupStatus'],
    queryFn: async () => (await base44.functions.invoke('getRollupStatus', {})).data,
    enabled: isAdmin,
    refetchInterval: (q) => (q.state.data?.jobs?.some((j) => BUSY.has(j.status)) ? 5000 : false),
  });
  const busy = status?.jobs?.some((j) => BUSY.has(j.status));
  useEffect(() => {
    if (status && !busy) queryClient.invalidateQueries({ queryKey: invalidateKey });
  }, [busy, status, queryClient, invalidateKey]);

  const refresh = useMutation({
    // admin-only: the button renders only for admins (returns null otherwise).
    mutationFn: async () => (await base44.functions.invoke('refreshRollups', {})).data,
    onSuccess: (r) => {
      toast.success(r.started?.length ? 'Refreshing analytics in the background' : 'A refresh is already running');
      queryClient.invalidateQueries({ queryKey: ['rollupStatus'] });
    },
    onError: (e) => toast.error(e.message),
  });

  if (!isAdmin) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy || refresh.isPending}
      onClick={() => refresh.mutate()}
      className="bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800"
    >
      {busy || refresh.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />}
      {busy ? 'Refreshing analytics…' : 'Refresh analytics'}
    </Button>
  );
}
