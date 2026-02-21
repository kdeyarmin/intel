import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Automated NPPES Batch Orchestrator
// Monitors active batch processes and automatically triggers next states
// Handles skip-completed logic and batch completion

const ALL_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // Check for active batch signals
        const signals = await base44.asServiceRole.entities.ImportBatch.filter({
            import_type: 'nppes_registry',
            file_name: 'batch_process_active'
        }, '-created_date', 1);

        if (signals.length === 0) {
            return Response.json({ message: 'No active batch process found.' });
        }

        const signal = signals[0];
        const metadata = signal.retry_params || {};
        const { target_states = ALL_STATES, skip_completed = true, stopped = false } = metadata;

        // Check if batch was stopped
        if (stopped) {
            return Response.json({ message: 'Batch process is stopped.', batch_id: signal.id });
        }

        // Get all recent crawler batches to determine state status
        const recentBatches = await base44.asServiceRole.entities.ImportBatch.filter(
            { import_type: 'nppes_registry' },
            '-created_date',
            300
        );

        const stateStatus = {};
        for (const state of target_states) {
            const stateBatches = recentBatches
                .filter(b => b.file_name?.startsWith(`crawler_${state}_`))
                .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
            
            if (stateBatches.length > 0) {
                const latest = stateBatches[0];
                stateStatus[state] = latest.status; // 'completed', 'processing', 'failed', etc.
            } else {
                stateStatus[state] = 'pending';
            }
        }

        // Find next state to process
        let nextState = null;
        for (const state of target_states) {
            const status = stateStatus[state];
            
            // Skip if completed and skip_completed is true
            if (status === 'completed' && skip_completed) continue;
            
            // Skip if currently processing
            if (status === 'processing' || status === 'validating') continue;
            
            // Process this state (it's pending, failed, or paused)
            nextState = state;
            break;
        }

        if (!nextState) {
            // All states are either completed or processing - check if we're done
            const allDone = target_states.every(s => 
                stateStatus[s] === 'completed' || 
                (skip_completed && stateStatus[s] === 'completed')
            );

            if (allDone) {
                // Mark batch as complete
                await base44.asServiceRole.entities.ImportBatch.update(signal.id, {
                    status: 'completed',
                    completed_at: new Date().toISOString()
                });

                // Send completion notification
                try {
                    const user = await base44.auth.me();
                    const summary = target_states.map(s => `${s}: ${stateStatus[s]}`).join(', ');
                    
                    await base44.asServiceRole.integrations.Core.SendEmail({
                        to: user?.email || 'admin@caremetric.app',
                        subject: '[CareMetric] NPPES Batch Process Completed',
                        body: `The automated NPPES batch process has completed.\n\nStates processed: ${target_states.length}\n\nStatus:\n${summary}`
                    });
                } catch (e) {
                    console.error('Failed to send completion email:', e);
                }

                return Response.json({ 
                    message: 'Batch process completed.', 
                    batch_id: signal.id,
                    states_processed: target_states.length,
                    summary: stateStatus
                });
            }

            return Response.json({ 
                message: 'No states ready to process. Some may still be running.',
                state_status: stateStatus
            });
        }

        // Trigger next state
        console.log(`[AutoBatch] Triggering state: ${nextState}`);
        
        try {
            await base44.asServiceRole.functions.invoke('nppesStateCrawler', {
                action: 'start',
                target_state: nextState
            });

            // Update signal with progress
            const processed = target_states.filter(s => 
                stateStatus[s] === 'completed'
            ).length;

            await base44.asServiceRole.entities.ImportBatch.update(signal.id, {
                retry_params: {
                    ...metadata,
                    last_triggered_state: nextState,
                    last_triggered_at: new Date().toISOString(),
                    progress: `${processed}/${target_states.length} states completed`
                }
            });

            return Response.json({
                success: true,
                triggered_state: nextState,
                progress: `${processed}/${target_states.length}`,
                next_check_in: '5 minutes'
            });
        } catch (error) {
            console.error(`[AutoBatch] Failed to trigger ${nextState}:`, error);
            return Response.json({ 
                error: `Failed to trigger ${nextState}: ${error.message}`,
                will_retry: true
            }, { status: 500 });
        }

    } catch (error) {
        console.error('[AutoBatch] Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});