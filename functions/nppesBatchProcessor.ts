import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Processes multiple states concurrently via the nppesStateCrawler.
// Actions:
//   batch_start  — kick off a batch of states with configurable concurrency
//   batch_status — get aggregated progress for the current batch
//   batch_stop   — halt the batch

const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
    'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

// Regions for quick selection
const REGIONS = {
    northeast: ['CT','DE','DC','ME','MD','MA','NH','NJ','NY','PA','RI','VT'],
    southeast: ['AL','AR','FL','GA','KY','LA','MS','NC','SC','TN','VA','WV'],
    midwest: ['IL','IN','IA','KS','MI','MN','MO','NE','ND','OH','SD','WI'],
    west: ['AK','AZ','CA','CO','HI','ID','MT','NV','NM','OR','UT','WA','WY'],
    south_central: ['TX','OK','AR','LA'],
};

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Allow service role calls (from automations) or admin users
        let user = null;
        try { user = await base44.auth.me(); } catch (e) { /* service role call */ }
        if (user && user.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const payload = await req.json();
        const {
            action = 'batch_start',
            states = [],                // specific states to process
            region = '',                // alternative: use a region name
            concurrency = 1,            // how many states to process in parallel
            taxonomy_description = '',
            entity_type = '',
            dry_run = false,
            skip_completed = true,      // skip states already completed in previous runs
        } = payload;

        // ---- BATCH_STATUS ----
        if (action === 'batch_status') {
            const crawlBatches = await base44.asServiceRole.entities.ImportBatch.filter(
                { import_type: 'nppes_registry' }, '-created_date', 300
            );
            const batchRecords = crawlBatches.filter(
                b => b.file_name && b.file_name.startsWith('crawler_') && b.file_name !== 'crawler_auto_stop_signal' && b.file_name !== 'crawler_batch_stop_signal'
            );

            // Deduplicate: keep latest batch per state
            const stateLatest = {};
            for (const b of batchRecords) {
                const st = b.file_name.split('_')[1];
                if (!stateLatest[st] || new Date(b.created_date) > new Date(stateLatest[st].created_date)) {
                    stateLatest[st] = b;
                }
            }

            const completed = [], failed = [], processing = [];
            for (const [st, b] of Object.entries(stateLatest)) {
                if (b.status === 'completed') completed.push(st);
                else if (b.status === 'failed') failed.push(st);
                else processing.push(st);
            }

            const stopSignal = crawlBatches.some(
                b => b.file_name === 'crawler_batch_stop_signal' && b.status === 'validating'
            );

            return Response.json({
                total_states: US_STATES.length,
                completed_states: completed,
                failed_states: failed,
                processing_states: processing,
                completed: completed.length,
                failed: failed.length,
                processing: processing.length,
                pending: US_STATES.length - completed.length - failed.length - processing.length,
                batch_stop_active: stopSignal,
                available_regions: Object.keys(REGIONS),
                regions: REGIONS,
            });
        }

        // ---- BATCH_STOP ----
        if (action === 'batch_stop') {
            // Update active batch signal to stopped
            const activeSignals = await base44.asServiceRole.entities.ImportBatch.filter({
                import_type: 'nppes_registry',
                file_name: 'batch_process_active'
            }, '-created_date', 1);

            if (activeSignals.length > 0) {
                await base44.asServiceRole.entities.ImportBatch.update(activeSignals[0].id, {
                    status: 'cancelled',
                    retry_params: {
                        ...(activeSignals[0].retry_params || {}),
                        stopped: true,
                        stopped_at: new Date().toISOString()
                    }
                });
            }
            
            // Also set legacy stop signal for backward compatibility
            const existing = await base44.asServiceRole.entities.ImportBatch.filter(
                { import_type: 'nppes_registry' }, '-created_date', 50
            );
            const activeSignal = existing.find(
                b => b.file_name === 'crawler_batch_stop_signal' && b.status === 'validating'
            );
            if (!activeSignal) {
                await base44.asServiceRole.entities.ImportBatch.create({
                    import_type: 'nppes_registry',
                    file_name: 'crawler_batch_stop_signal',
                    status: 'validating',
                    dry_run: false,
                });
            }
            return Response.json({ success: true, message: 'Batch stop signal set. Running states will complete, but no new states will start.' });
        }

        // ---- BATCH_START ----
        // Resolve which states to process
        let targetStates = [];
        if (states && states.length > 0) {
            targetStates = states.filter(s => US_STATES.includes(s));
        } else if (region && REGIONS[region]) {
            targetStates = REGIONS[region];
        } else {
            // Default: all states
            targetStates = [...US_STATES];
        }

        // Optionally skip already-completed states
        if (skip_completed) {
            const crawlBatches = await base44.asServiceRole.entities.ImportBatch.filter(
                { import_type: 'nppes_registry' }, '-created_date', 300
            );
            const completedSet = new Set();
            for (const b of crawlBatches) {
                if (b.file_name && b.file_name.startsWith('crawler_') && b.status === 'completed') {
                    completedSet.add(b.file_name.split('_')[1]);
                }
            }
            targetStates = targetStates.filter(s => !completedSet.has(s));
        }

        if (targetStates.length === 0) {
            return Response.json({ success: true, message: 'No states to process — all selected states are already completed.', states_queued: 0 });
        }

        // Clear any existing batch stop signal
        const existingSignals = await base44.asServiceRole.entities.ImportBatch.filter(
            { import_type: 'nppes_registry' }, '-created_date', 50
        );
        const activeStop = existingSignals.find(
            b => b.file_name === 'crawler_batch_stop_signal' && b.status === 'validating'
        );
        if (activeStop) {
            await base44.asServiceRole.entities.ImportBatch.update(activeStop.id, { status: 'completed' });
        }

        // Create/Update batch process signal for automation
        const activeBatchSignals = existingSignals.filter(
            b => b.file_name === 'batch_process_active'
        );

        const effectiveConcurrency = Math.min(Math.max(1, concurrency), 2); // cap at 2

        if (activeBatchSignals.length > 0) {
            await base44.asServiceRole.entities.ImportBatch.update(activeBatchSignals[0].id, {
                status: 'processing',
                retry_params: {
                    target_states: targetStates,
                    skip_completed: skip_completed,
                    stopped: false,
                    started_at: new Date().toISOString(),
                    concurrency: effectiveConcurrency
                }
            });
        } else {
            await base44.asServiceRole.entities.ImportBatch.create({
                import_type: 'nppes_registry',
                file_name: 'batch_process_active',
                file_url: 'Automated batch orchestration signal',
                status: 'processing',
                retry_params: {
                    target_states: targetStates,
                    skip_completed: skip_completed,
                    stopped: false,
                    started_at: new Date().toISOString(),
                    concurrency: effectiveConcurrency
                }
            });
        }

        console.log(`[BatchProcessor] Starting batch: ${targetStates.length} states, concurrency=${effectiveConcurrency}`);

        // Process states in concurrent batches
        const results = [];
        let statesCompleted = 0;
        let statesFailed = 0;
        let totalImported = 0;
        let stopped = false;

        for (let i = 0; i < targetStates.length; i += effectiveConcurrency) {
            // Check for stop signal before each wave
            const signals = await base44.asServiceRole.entities.ImportBatch.filter(
                { import_type: 'nppes_registry' }, '-created_date', 20
            );
            const batchStop = signals.find(
                b => b.file_name === 'crawler_batch_stop_signal' && b.status === 'validating'
            );
            if (batchStop) {
                await base44.asServiceRole.entities.ImportBatch.update(batchStop.id, { status: 'completed' });
                stopped = true;
                console.log(`[BatchProcessor] Stop signal detected after ${statesCompleted + statesFailed} states`);
                break;
            }

            const wave = targetStates.slice(i, i + effectiveConcurrency);
            console.log(`[BatchProcessor] Wave ${Math.floor(i / effectiveConcurrency) + 1}: processing ${wave.join(', ')}`);

            // Fire all states in this wave concurrently
            // Use the user-scoped client (which has admin auth) so the nested
            // function call inherits the admin user's authentication
            const wavePromises = wave.map(async (stateCode) => {
                try {
                    // Keep calling nppesStateCrawler until the state is fully done
                    // (it may need multiple invocations if it times out mid-state)
                    let stateResult = null;
                    let invocations = 0;
                    const MAX_INVOCATIONS_PER_STATE = 50; // Safety limit — states with many zip prefixes need more iterations
                    
                    while (invocations < MAX_INVOCATIONS_PER_STATE) {
                        invocations++;
                        const res = await base44.functions.invoke('nppesStateCrawler', {
                            action: 'start',
                            target_state: stateCode,
                            taxonomy_description,
                            entity_type,
                            dry_run,
                        });
                        stateResult = res.data;
                        
                        // If the state is fully done or failed, stop looping
                        if (stateResult.done || !stateResult.resume_next || !stateResult.success) {
                            break;
                        }
                        
                        console.log(`[BatchProcessor] State ${stateCode} needs continuation (invocation ${invocations}). Resuming...`);
                    }
                    
                    if (invocations >= MAX_INVOCATIONS_PER_STATE && stateResult?.resume_next) {
                        console.warn(`[BatchProcessor] State ${stateCode} hit max invocations (${MAX_INVOCATIONS_PER_STATE}). May be incomplete.`);
                    }
                    
                    return { state: stateCode, ...stateResult, invocations };
                } catch (err) {
                    return { state: stateCode, success: false, error: err.message };
                }
            });

            const waveResults = await Promise.all(wavePromises);

            for (const result of waveResults) {
                results.push(result);
                if (result.success) {
                    statesCompleted++;
                    totalImported += (result.imported_providers || 0);
                } else {
                    statesFailed++;
                }
            }

            console.log(`[BatchProcessor] Wave done. Completed: ${statesCompleted}, Failed: ${statesFailed}, Imported: ${totalImported}`);
        }

        const statusText = stopped ? 'stopped by admin' : 'completed';

        // Audit log
        await base44.asServiceRole.entities.AuditEvent.create({
            event_type: 'import',
            user_email: user?.email || 'system',
            details: {
                action: 'NPPES Batch Process',
                entity: 'nppes_registry',
                states_completed: statesCompleted,
                states_failed: statesFailed,
                total_imported: totalImported,
                concurrency: effectiveConcurrency,
                stopped,
                message: `Batch ${statusText}: ${statesCompleted}/${targetStates.length} states, ${totalImported} providers`,
            },
            timestamp: new Date().toISOString(),
        });

        return Response.json({
            success: true,
            stopped,
            states_queued: targetStates.length,
            states_completed: statesCompleted,
            states_failed: statesFailed,
            total_imported: totalImported,
            concurrency: effectiveConcurrency,
            results: results.map(r => ({
                state: r.state,
                success: r.success,
                valid_rows: r.valid_rows || 0,
                imported_providers: r.imported_providers || 0,
                error: r.error || null,
            })),
        });

    } catch (error) {
        console.error('[BatchProcessor] Top-level error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});