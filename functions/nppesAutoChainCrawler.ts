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

        // --- STATUS: just delegate to the underlying crawler ---
        if (action === 'status') {
            const statusRes = await base44.functions.invoke('nppesStateCrawler', { action: 'status' });
            return Response.json(statusRes.data);
        }

        // --- START / CONTINUE: process one state then chain ---

        // Check for stop signal
        const signals = await base44.asServiceRole.entities.ImportBatch.filter(
            { import_type: 'nppes_registry' }, '-created_date', 50
        );
        const stopSignal = signals.find(
            b => b.file_name === 'crawler_auto_stop_signal' && b.status === 'validating'
        );
        if (stopSignal) {
            // Clear the signal so it can be restarted later
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
                action: 'process_next',
                taxonomy_description,
                entity_type,
                dry_run,
            });
            crawlResult = res.data;
        } catch (invokeErr) {
            // The crawler function itself timed out or errored at HTTP level
            console.error('[AutoChain] Crawler invocation failed:', invokeErr.message);
            crawlResult = { success: false, error: invokeErr.message, done: false };
        }

        const stateJustProcessed = crawlResult.state || 'unknown';
        const newStatesProcessed = states_processed + 1;
        const newTotalImported = total_imported + (crawlResult.imported_providers || 0);

        // Log outcome
        console.log(`[AutoChain] State ${stateJustProcessed}: success=${crawlResult.success}, fetched=${crawlResult.total_fetched || 0}, imported=${crawlResult.imported_providers || 0}`);

        // Track failures for circuit breaker
        let newConsecutiveFailures = crawlResult.success ? 0 : consecutive_failures + 1;

        // If this state failed, log it
        if (!crawlResult.success) {
            console.warn(`[AutoChain] State ${stateJustProcessed} FAILED: ${crawlResult.error}`);

            await sendAdminEmail(base44, user.email, `NPPES Crawler Failed — ${stateJustProcessed}`,
                `The NPPES crawler failed on state ${stateJustProcessed}.\n\n` +
                `Error: ${crawlResult.error}\n` +
                `Consecutive failures: ${newConsecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}\n` +
                `The crawler will continue to the next state automatically.`);
        }

        // Check if all states are done
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

        // Chain: invoke ourselves for the next state (fire-and-forget via setTimeout trick)
        // We respond immediately, then trigger the next iteration asynchronously
        const nextPayload = {
            action: 'continue',
            taxonomy_description,
            entity_type,
            dry_run,
            consecutive_failures: newConsecutiveFailures,
            states_processed: newStatesProcessed,
            total_imported: newTotalImported,
        };

        // Fire-and-forget: invoke next iteration without awaiting
        // Small delay to let current response complete cleanly
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