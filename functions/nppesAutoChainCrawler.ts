import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Orchestrates the NPPES state crawler by processing one state,
// then automatically calling itself to process the next state.
// Includes error handling, admin notifications, circuit-breaker, and graceful stop controls.

const MAX_CONSECUTIVE_FAILURES = 3;

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const payload = await req.json();
        const {
            action = 'start',           // 'start' | 'stop' | 'status'
            taxonomy_description = '',
            entity_type = '',
            dry_run = false,
            consecutive_failures = 0,   // tracked internally for circuit-breaker
            states_processed = 0,       // running total across chain
            total_imported = 0,         // running total of imported providers
        } = payload;

        // --- STOP: set a flag so the chain halts ---
        if (action === 'stop') {
            // We use an ImportBatch record as a "stop signal"
            const existingSignals = await base44.asServiceRole.entities.ImportBatch.filter(
                { import_type: 'nppes_registry' }, '-created_date', 50
            );
            const activeSignal = existingSignals.find(
                b => b.file_name === 'crawler_auto_stop_signal' && b.status === 'validating'
            );
            if (!activeSignal) {
                await base44.asServiceRole.entities.ImportBatch.create({
                    import_type: 'nppes_registry',
                    file_name: 'crawler_auto_stop_signal',
                    status: 'validating',
                    dry_run: false,
                });
            }
            console.log('[AutoChain] Stop signal set — crawler will halt after current state');
            return Response.json({ success: true, message: 'Stop signal set. Crawler will halt after current state completes.' });
        }

        // --- STATUS: query directly ---
        if (action === 'status') {
            const US_STATES = [
                'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
                'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
                'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
            ];
            // Only fetch recent batches (limit 100) for speed
            const crawlBatches = await base44.asServiceRole.entities.ImportBatch.filter(
                { import_type: 'nppes_registry' }, '-created_date', 100
            );
            
            // Deduplicate: keep only the LATEST batch per state
            const stateLatest = {};
            let stopSignalActive = false;
            for (const b of crawlBatches) {
                if (!b.file_name) continue;
                if (b.file_name === 'crawler_auto_stop_signal' && b.status === 'validating') {
                    stopSignalActive = true;
                    continue;
                }
                if (!b.file_name.startsWith('crawler_')) continue;
                const st = b.file_name.split('_')[1];
                if (!st || st.length > 2 || !US_STATES.includes(st)) continue;
                if (!stateLatest[st] || new Date(b.created_date) > new Date(stateLatest[st].created_date)) {
                    stateLatest[st] = b;
                }
            }
            
            const completedStates = [], failedStates = [], processingStates = [];
            for (const [st, b] of Object.entries(stateLatest)) {
                if (b.status === 'completed') completedStates.push(st);
                else if (b.status === 'failed') failedStates.push(st);
                else processingStates.push(st);
            }
            const doneSet = new Set([...completedStates, ...failedStates]);
            const pendingStates = US_STATES.filter(s => !doneSet.has(s));

            return Response.json({
                total_states: US_STATES.length,
                completed: completedStates.length,
                failed: failedStates.length,
                processing: processingStates.length,
                pending: pendingStates.length,
                completed_states: completedStates,
                failed_states: failedStates,
                processing_states: processingStates,
                pending_states: pendingStates,
                auto_chain_active: processingStates.length > 0 && !stopSignalActive,
            });
        }

        // --- START: respond immediately, then fire the crawl chain asynchronously ---
        if (action === 'start') {
            console.log('[AutoChain] START requested — launching crawl chain asynchronously');

            // Fire the actual crawl processing as a "continue" call (fire-and-forget)
            base44.functions.invoke('nppesAutoChainCrawler', {
                action: 'continue',
                taxonomy_description,
                entity_type,
                dry_run,
                consecutive_failures: 0,
                states_processed: 0,
                total_imported: 0,
            }).catch(err => {
                console.error('[AutoChain] Failed to launch chain:', err.message);
            });

            return Response.json({
                success: true,
                message: 'Auto-crawler started. Processing will begin shortly.',
                state_just_processed: 'starting',
            });
        }

        // --- CONTINUE: process one state then chain to next ---

        // Check for stop signal
        const signals = await base44.asServiceRole.entities.ImportBatch.filter(
            { import_type: 'nppes_registry' }, '-created_date', 50
        );
        const stopSignal = signals.find(
            b => b.file_name === 'crawler_auto_stop_signal' && b.status === 'validating'
        );
        if (stopSignal) {
            await base44.asServiceRole.entities.ImportBatch.update(stopSignal.id, { status: 'completed' });
            console.log('[AutoChain] Stop signal detected — halting chain');

            await sendAdminEmail(base44, user.email, 'NPPES Auto-Crawler Stopped',
                `The NPPES auto-crawler was stopped by admin request after processing ${states_processed} states and importing ${total_imported} providers.`);

            return Response.json({
                success: true,
                message: 'Crawler stopped by admin request',
                states_processed,
                total_imported,
            });
        }

        // Circuit breaker — too many consecutive failures
        if (consecutive_failures >= MAX_CONSECUTIVE_FAILURES) {
            console.error(`[AutoChain] Circuit breaker: ${consecutive_failures} consecutive failures — halting`);

            await base44.asServiceRole.entities.ErrorReport.create({
                error_type: 'system_error',
                severity: 'critical',
                source: 'nppesAutoChainCrawler',
                title: 'NPPES Auto-Crawler Circuit Breaker Triggered',
                description: `Crawler halted after ${consecutive_failures} consecutive state failures. ${states_processed} states processed, ${total_imported} providers imported before halt.`,
                context: { consecutive_failures, states_processed, total_imported, taxonomy_description },
                status: 'new',
            });

            await sendAdminEmail(base44, user.email, 'NPPES Auto-Crawler HALTED — Circuit Breaker',
                `The NPPES auto-crawler halted after ${consecutive_failures} consecutive failures.\n\n` +
                `States processed so far: ${states_processed}\n` +
                `Total providers imported: ${total_imported}\n\n` +
                `Please check ErrorReports for details and restart manually once resolved.`);

            return Response.json({
                success: false,
                message: `Circuit breaker triggered after ${consecutive_failures} consecutive failures`,
                states_processed,
                total_imported,
            });
        }

        // Process one state via the existing crawler
        console.log(`[AutoChain] Invoking state crawler (states_processed=${states_processed}, failures=${consecutive_failures})`);

        let crawlResult;
        try {
            const res = await base44.functions.invoke('nppesStateCrawler', {
                action: 'start',
                taxonomy_description,
                entity_type,
                dry_run,
            });
            crawlResult = res.data;
        } catch (invokeErr) {
            console.error('[AutoChain] Crawler invocation failed:', invokeErr.message);
            const isTimeout = /502|504|timeout|ECONNRESET|aborted/i.test(invokeErr.message);
            if (isTimeout) {
                console.warn('[AutoChain] Likely timeout — crawler may still be running in background. Proceeding to next state.');
                crawlResult = { success: true, error: 'timeout_likely', done: false, timeout_assumed: true };
            } else {
                crawlResult = { success: false, error: invokeErr.message, done: false };
            }
        }

        const stateJustProcessed = crawlResult.state || 'unknown';
        const newStatesProcessed = states_processed + 1;
        const newTotalImported = total_imported + (crawlResult.imported_providers || 0);

        console.log(`[AutoChain] State ${stateJustProcessed}: success=${crawlResult.success}, fetched=${crawlResult.total_fetched || 0}, imported=${crawlResult.imported_providers || 0}`);

        let newConsecutiveFailures = crawlResult.success ? 0 : consecutive_failures + 1;

        if (!crawlResult.success) {
            console.warn(`[AutoChain] State ${stateJustProcessed} FAILED: ${crawlResult.error}`);
            await sendAdminEmail(base44, user.email, `NPPES Crawler Failed — ${stateJustProcessed}`,
                `The NPPES crawler failed on state ${stateJustProcessed}.\n\n` +
                `Error: ${crawlResult.error}\n` +
                `Consecutive failures: ${newConsecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}\n` +
                `The crawler will continue to the next state automatically.`);
        }

        if (crawlResult.done) {
            console.log(`[AutoChain] All states processed! Total: ${newStatesProcessed} states, ${newTotalImported} providers`);

            await base44.asServiceRole.entities.AuditEvent.create({
                event_type: 'import',
                user_email: user.email,
                details: {
                    action: 'NPPES Auto-Chain Complete',
                    entity: 'nppes_registry',
                    states_processed: newStatesProcessed,
                    total_imported: newTotalImported,
                    dry_run,
                    message: `Full crawl completed: ${newStatesProcessed} states, ${newTotalImported} providers`,
                },
                timestamp: new Date().toISOString(),
            });

            await sendAdminEmail(base44, user.email, 'NPPES Auto-Crawler Complete',
                `The NPPES auto-crawler has finished processing all states.\n\n` +
                `States processed: ${newStatesProcessed}\n` +
                `Total providers imported: ${newTotalImported}\n` +
                `Dry run: ${dry_run}`);

            return Response.json({
                success: true,
                done: true,
                states_processed: newStatesProcessed,
                total_imported: newTotalImported,
                last_state: stateJustProcessed,
            });
        }

        // Chain to next state (fire-and-forget)
        const nextPayload = {
            action: 'continue',
            taxonomy_description,
            entity_type,
            dry_run,
            consecutive_failures: newConsecutiveFailures,
            states_processed: newStatesProcessed,
            total_imported: newTotalImported,
        };

        base44.functions.invoke('nppesAutoChainCrawler', nextPayload).catch(err => {
            console.error('[AutoChain] Failed to chain next state:', err.message);
        });

        return Response.json({
            success: true,
            done: false,
            state_just_processed: stateJustProcessed,
            state_success: crawlResult.success,
            next_state: crawlResult.next_state,
            states_processed: newStatesProcessed,
            total_imported: newTotalImported,
            consecutive_failures: newConsecutiveFailures,
        });

    } catch (error) {
        console.error('[AutoChain] Top-level error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});

async function sendAdminEmail(base44, adminEmail, subject, body) {
    try {
        await base44.asServiceRole.integrations.Core.SendEmail({
            to: adminEmail,
            subject: `[CareMetric] ${subject}`,
            body,
        });
    } catch (e) {
        console.error('[AutoChain] Failed to send admin email:', e.message);
    }
}