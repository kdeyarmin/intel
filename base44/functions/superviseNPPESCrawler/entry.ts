import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// #6 — Worker supervisor for the NPPES crawler.
//
// Workers are spawned via fire-and-forget invokes; if every worker for a batch
// dies (platform restart, unhandled exception, OOM), the batch sits in
// 'processing' with pending queue items but nobody picks them up. Existing
// in-worker recovery only fires *while* a worker is alive, and the broader
// cancelStalledImports only acts after 1 hour. This function bridges that gap:
// runs on a 1–2 minute cadence, detects abandoned NPPES batches, and respawns
// the worker pool.

// NPPES queue items are typically updated when claimed (status='processing') and again
// on completion/failure. A long-running task can easily exceed 90s without any queue-item
// update, which would cause the supervisor to falsely declare workers dead and pile on
// extra workers (increasing rate-limit pressure). We use a generous 5-minute threshold
// AND require that the parent ImportBatch's updated_date is also stale, since the
// crawler's updateBatchStats refreshes it at every checkpoint. Both signals must agree
// before we conclude the worker pool is gone.
const STALE_QUEUE_ACTIVITY_SECONDS = 5 * 60;
const STALE_BATCH_HEARTBEAT_SECONDS = 5 * 60;
const MAX_RESPAWNS_PER_BATCH = 5;                 // Hard cap so we don't restart forever
const RESPAWN_COOLDOWN_SECONDS = 60;              // Don't respawn faster than this

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        let user = null;
        try { user = await base44.auth.me(); } catch (e) { /* service role */ }
        const isService = user && user.email && user.email.includes('service+');
        if (user && user.role !== 'admin' && !isService) {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const now = Date.now();
        const activeBatches = await base44.asServiceRole.entities.ImportBatch.filter({
            import_type: 'nppes_registry',
            status: 'processing',
        }, '-created_date', 50);

        const decisions = [];
        for (const batch of activeBatches) {
            const retryParams = batch.retry_params || {};
            const respawns = retryParams.supervisor_respawns || 0;
            const lastRespawnAt = retryParams.supervisor_last_respawn_at
                ? new Date(retryParams.supervisor_last_respawn_at).getTime()
                : 0;

            if (respawns >= MAX_RESPAWNS_PER_BATCH) {
                decisions.push({ batch_id: batch.id, action: 'skipped_max_respawns', respawns });
                continue;
            }
            if (now - lastRespawnAt < RESPAWN_COOLDOWN_SECONDS * 1000) {
                decisions.push({ batch_id: batch.id, action: 'skipped_cooldown' });
                continue;
            }

            // Get queue items for this batch and decide whether workers are alive
            const items = await base44.asServiceRole.entities.NPPESQueueItem.filter(
                { batch_id: batch.id },
                '-updated_date',
                500
            ).catch(() => []);

            if (items.length === 0) {
                decisions.push({ batch_id: batch.id, action: 'no_items' });
                continue;
            }

            const pending = items.filter(i => i.status === 'pending' || i.status === 'processing');
            if (pending.length === 0) {
                decisions.push({ batch_id: batch.id, action: 'no_runnable_items' });
                continue;
            }

            // Two heartbeat signals — newest queue-item update AND the batch's own
            // updated_date (refreshed by nppesCrawler.updateBatchStats at every checkpoint).
            // Require both to be stale before respawning, otherwise long-running tasks
            // that haven't yet emitted a queue-item update can be misread as dead.
            const newestActivity = items.reduce((latest, i) => {
                const t = new Date(i.updated_date || i.created_date).getTime();
                return t > latest ? t : latest;
            }, 0);
            const batchActivity = new Date(batch.updated_date || batch.created_date).getTime();

            const secondsSinceQueueActivity = (now - newestActivity) / 1000;
            const secondsSinceBatchActivity = (now - batchActivity) / 1000;
            const queueLooksStale = secondsSinceQueueActivity >= STALE_QUEUE_ACTIVITY_SECONDS;
            const batchLooksStale = secondsSinceBatchActivity >= STALE_BATCH_HEARTBEAT_SECONDS;

            if (!queueLooksStale || !batchLooksStale) {
                decisions.push({
                    batch_id: batch.id,
                    action: 'workers_alive',
                    seconds_since_queue_activity: Math.round(secondsSinceQueueActivity),
                    seconds_since_batch_activity: Math.round(secondsSinceBatchActivity),
                });
                continue;
            }
            const secondsSinceActivity = Math.min(secondsSinceQueueActivity, secondsSinceBatchActivity);

            // Workers look dead. Re-spawn one. nppesCrawler's own loop will fan out.
            try {
                await base44.asServiceRole.functions.invoke('nppesCrawler', {
                    action: 'process_queue',
                    dry_run: batch.dry_run || false,
                });
                await base44.asServiceRole.entities.ImportBatch.update(batch.id, {
                    retry_params: {
                        ...retryParams,
                        supervisor_respawns: respawns + 1,
                        supervisor_last_respawn_at: new Date().toISOString(),
                        supervisor_last_reason: `No queue activity for ${Math.round(secondsSinceActivity)}s, ${pending.length} pending`,
                    },
                });
                decisions.push({
                    batch_id: batch.id,
                    action: 'respawned',
                    respawns: respawns + 1,
                    seconds_since_activity: Math.round(secondsSinceActivity),
                    pending_items: pending.length,
                });
            } catch (e) {
                console.error(`[superviseNPPESCrawler] Failed to respawn for batch ${batch.id}: ${e.message}`);
                decisions.push({ batch_id: batch.id, action: 'respawn_failed', error: e.message });
            }
        }

        const respawnedCount = decisions.filter(d => d.action === 'respawned').length;
        return Response.json({
            success: true,
            checked: activeBatches.length,
            respawned: respawnedCount,
            decisions,
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
