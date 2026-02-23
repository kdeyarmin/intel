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

        // ---- BATCH_START & RETRY_FAILED ----
        // This is now an orchestrator tick designed to run frequently (e.g. every 5 mins).
        // It checks for a stop signal, and if clear, invokes the crawler ONCE.
        // The crawler handles up to 45-50s of work, and the next tick resumes.
        
        const existingSignals = await base44.asServiceRole.entities.ImportBatch.filter(
            { import_type: 'nppes_registry' }, '-created_date', 50
        );
        const activeStop = existingSignals.find(
            b => b.file_name === 'crawler_batch_stop_signal' && b.status === 'validating'
        );
        if (activeStop) {
            return Response.json({ success: true, message: 'Batch stopped by admin signal. Not starting new crawl tick.' });
        }

        let targetState = undefined;
        if (action === 'retry_failed') {
            const failedBatches = await base44.asServiceRole.entities.ImportBatch.filter(
                { import_type: 'nppes_registry', status: 'failed' }, '-created_date', 100
            );
            const failedStates = [...new Set(failedBatches.map(b => b.file_name?.split('_')[1]).filter(s => s && s.length <= 2))];
            if (failedStates.length > 0) targetState = failedStates[0];
            else return Response.json({ success: true, message: 'No failed states to retry.' });
        } else if (states && states.length > 0) {
            targetState = states[0];
        }

        console.log(`[BatchProcessor] Tick started. Triggering crawler for state: ${targetState || 'auto'}`);

        try {
            const res = await base44.functions.invoke('nppesStateCrawler', {
                action: 'start',
                target_state: targetState,
                taxonomy_description,
                entity_type,
                dry_run,
            });
            
            return Response.json({
                success: true,
                message: 'Crawler tick executed successfully.',
                crawler_result: res.data
            });
        } catch (err) {
            console.error('[BatchProcessor] Error invoking crawler:', err.message);
            return Response.json({ success: false, error: err.message }, { status: 500 });
        }

    } catch (error) {
        console.error('[BatchProcessor] Top-level error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});