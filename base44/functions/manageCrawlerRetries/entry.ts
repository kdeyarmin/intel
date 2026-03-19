import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Scheduled function to monitor failed crawler batches and retry them automatically.
// Checks for:
// 1. Failed batches that are recent (e.g., last 24h)
// 2. Checks if they have been retried already (is there a newer batch for same state?)
// 3. Checks config for max retries and delay
// 4. Triggers retry or escalates

const getTimestamp = (value) => (value ? new Date(value).getTime() : 0);

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        
        // 1. Load Configuration
        let autoRetryEnabled = false;
        let retryDelayMin = 60;
        let maxRetries = 3;
        
        try {
            const configs = await base44.asServiceRole.entities.NPPESCrawlerConfig.filter({ config_key: 'default' });
            if (configs.length > 0) {
                autoRetryEnabled = configs[0].auto_retry_enabled === true;
                retryDelayMin = configs[0].retry_delay_minutes || 60;
                maxRetries = configs[0].max_retries || 3;
            }
        } catch (e) {
            console.warn('[RetryMonitor] Config load failed, using defaults', e);
        }

        if (!autoRetryEnabled) {
            return Response.json({ message: 'Auto-retry is disabled in configuration.' });
        }

        const delayMs = retryDelayMin * 60 * 1000;

        // 2. Find recent failed batches (last 48 hours to be safe)
        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        // Fetch failed nppes_registry batches
        // Note: filtering by import_type and status. 
        // We'll fetch a reasonable number of recent failures.
        const failedBatches = await base44.asServiceRole.entities.ImportBatch.filter(
            { import_type: 'nppes_registry', status: 'failed' }, 
            '-created_date', 
            50
        );

        const crawlerFailures = failedBatches.filter(b => 
            b.file_name && 
            b.file_name.startsWith('crawler_') && 
            new Date(b.created_date) > new Date(twoDaysAgo)
        );

        if (crawlerFailures.length === 0) {
            return Response.json({ message: 'No recent failed batches found.' });
        }

        // 3. Group by state to find the *latest* batch for each state
        // We need to know if a failure has *already* been retried or superseded.
        const stateBatches = {};
        
        // We also need to fetch *all* recent crawler batches (success/processing too) to see if a newer one exists
        const allRecentBatches = await base44.asServiceRole.entities.ImportBatch.filter(
             { import_type: 'nppes_registry' }, 
             '-created_date', 
             200 // Look back enough to cover the failures
        );
        
        for (const b of allRecentBatches) {
            if (!b.file_name?.startsWith('crawler_')) continue;
            const stMatch = b.file_name.match(/crawler_([A-Z]{2})/i);
            if (!stMatch) continue;
            const state = stMatch[1].toUpperCase();
            
            if (!stateBatches[state]) stateBatches[state] = [];
            stateBatches[state].push(b);
        }

        const actionsTaken = [];
        const processedStates = new Set();

        // 4. Analyze each state with a recent failure
        for (const b of crawlerFailures) {
            const stMatch2 = b.file_name.match(/crawler_([A-Z]{2})/i);
            if (!stMatch2) continue;
            const state = stMatch2[1].toUpperCase();
            if (!stateBatches[state] || processedStates.has(state)) continue;
            processedStates.add(state);

            // Sort batches for this state: newest first
            const batches = [...stateBatches[state]].sort((x, y) => getTimestamp(y.created_date) - getTimestamp(x.created_date));
            const latest = batches[0];

            // If the latest batch is NOT this failed batch, it means we already ran (or are running) another attempt.
            // So we ignore this old failure.
            if (latest.id !== b.id) continue;

            // Current state status is FAILED.
            // Check retry eligibility.
            const currentRetryCount = latest.retry_count || 0;
            const failureTime = latest.completed_at || latest.created_date;
            const timeSinceFailure = Date.now() - new Date(failureTime).getTime();
            
            // Check if transient? 
            // We look for ErrorReports linked to this batch
            let isTransient = false;
            let errorReports = [];
            try {
                errorReports = await base44.asServiceRole.entities.ErrorReport.filter({ source: latest.id });
                if (errorReports.length > 0) {
                    isTransient = errorReports.some(e => ['rate_limit', 'api_downtime', 'network_error'].includes(e.error_category));
                } else {
                    // If no error report but failed, might be a crash/timeout -> treat as transient/unknown -> retry
                    isTransient = true; 
                }
            } catch(e) {}

            // Decision Logic
            if (currentRetryCount < maxRetries) {
                // Retry?
                if (timeSinceFailure >= delayMs) {
                    // Trigger Retry
                    console.log(`[RetryMonitor] Retrying state ${state}. Failure was ${Math.round(timeSinceFailure/60000)}m ago. Retry #${currentRetryCount + 1}`);
                    
                    // Reset the failed items in this batch to pending, then invoke the worker directly
                    // (batch_start requires admin auth, which service invocations don't have)
                    try {
                        const failedItems = await base44.asServiceRole.entities.NPPESQueueItem.filter({
                            batch_id: latest.id,
                            status: 'failed'
                        }, undefined, 5000);

                        // Reset items in chunks
                        for (let ci = 0; ci < failedItems.length; ci += 50) {
                            const chunk = failedItems.slice(ci, ci + 50);
                            await Promise.all(chunk.map(item =>
                                base44.asServiceRole.entities.NPPESQueueItem.update(item.id, {
                                    status: 'pending',
                                    retry_count: 0,
                                    error_message: null
                                })
                            ));
                        }

                        // Update batch status and increment retry count
                        await base44.asServiceRole.entities.ImportBatch.update(latest.id, {
                            status: 'processing',
                            retry_count: currentRetryCount + 1,
                            cancel_reason: null
                        });

                        // Check stop flag before invoking worker
                        const latestConfigs = await base44.asServiceRole.entities.NPPESCrawlerConfig.filter({ config_key: 'default' });
                        if (!latestConfigs[0]?.crawler_stopped) {
                            await base44.asServiceRole.functions.invoke('nppesCrawler', { action: 'process_queue' });
                        }

                        actionsTaken.push(`Retried state ${state} (attempt ${currentRetryCount + 1}, ${failedItems.length} items reset)`);
                    } catch(e) {
                        console.error(`[RetryMonitor] Failed to retry state ${state}:`, e);
                    }
                } else {
                    // Waiting for delay
                    actionsTaken.push(`Waiting to retry state ${state} (${Math.round((delayMs - timeSinceFailure)/60000)}m left)`);
                }
            } else {
                // Max retries reached - Escalate
                // Check if we already created an escalation report (to avoid duplicates)
                // We'll assume if the latest batch is failed and max retries reached, we need to alert.
                // But we don't want to alert every time this runs.
                // We can check if an "escalation" ErrorReport exists for this batch id?
                
                // Or maybe just ensure there is a Critical ErrorReport.
                const hasCritical = errorReports.some(e => e.severity === 'critical' && e.title.includes('Max retries'));
                if (!hasCritical) {
                    console.log(`[RetryMonitor] Max retries reached for ${state}. Escalating.`);
                    
                    await base44.asServiceRole.entities.ErrorReport.create({
                        error_type: 'system_error',
                        error_category: 'unknown',
                        severity: 'critical',
                        source: latest.id,
                        title: `NPPES Crawler: Max retries reached for ${state}`,
                        description: `State ${state} has failed ${currentRetryCount} times. Manual review required. Last failure reason: ${errorReports[0]?.description || 'Unknown'}`,
                        status: 'new',
                        context: { state, retry_count: currentRetryCount }
                    });

                    // Email notifications disabled per admin request
                    
                    actionsTaken.push(`Escalated state ${state} (max retries)`);
                }
            }
        }

        return Response.json({ success: true, actions: actionsTaken });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});
