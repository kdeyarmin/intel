import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
    'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const schedules = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ is_active: true });
        const now = new Date();
        const triggered = [];
        const results = [];

        for (const schedule of schedules) {
            const nextRun = schedule.next_run_at ? new Date(schedule.next_run_at) : null;

            if (nextRun && nextRun > now) continue; // Not due yet

            console.log(`Running scheduled import: ${schedule.label} (${schedule.import_type})`);

            let runStatus = 'success';
            let runSummary = '';

            try {
                if (schedule.import_type === 'nppes_registry') {
                    // NPPES import - use crawler or single-state
                    const config = schedule.nppes_config || {};
                    
                    if (config.crawl_all_states) {
                        // Crawl all states sequentially
                        let totalImported = 0;
                        let totalFetched = 0;
                        let failedStates = [];

                        for (const st of US_STATES) {
                            try {
                                console.log(`[Scheduled] Crawling state: ${st}`);
                                const res = await base44.asServiceRole.functions.invoke('nppesStateCrawler', {
                                    action: 'process_next',
                                    taxonomy_description: config.taxonomy_description || '',
                                    entity_type: config.entity_type || '',
                                    target_state: st,
                                    dry_run: false,
                                });

                                const data = res.data || res;
                                totalFetched += data.total_fetched || 0;
                                totalImported += data.imported_providers || 0;
                            } catch (stateErr) {
                                console.error(`[Scheduled] Failed state ${st}:`, stateErr.message);
                                failedStates.push(st);
                            }
                        }

                        runSummary = `All-state crawl: ${totalFetched} fetched, ${totalImported} imported. ${failedStates.length > 0 ? `Failed: ${failedStates.join(', ')}` : 'All states OK.'}`;
                        runStatus = failedStates.length > 0 ? 'partial' : 'success';
                    } else {
                        // Single criteria import
                        const res = await base44.asServiceRole.functions.invoke('importNPPESRegistry', {
                            state: config.state || '',
                            taxonomy_description: config.taxonomy_description || '',
                            entity_type: config.entity_type || '',
                            city: config.city || '',
                            postal_code: config.postal_code || '',
                            dry_run: false,
                        });

                        const data = res.data || res;
                        runSummary = `${data.valid_rows || 0} valid, ${data.imported_providers || 0} providers imported`;
                        runStatus = 'success';
                    }
                } else {
                    // CMS data import (existing logic)
                    await base44.asServiceRole.functions.invoke('autoImportCMSData', {
                        import_type: schedule.import_type,
                        file_url: schedule.api_url,
                        year: now.getFullYear(),
                        dry_run: false,
                    });
                    runSummary = 'CMS import completed';
                    runStatus = 'success';
                }

                triggered.push(schedule.import_type);
            } catch (err) {
                console.error(`Failed to run import for ${schedule.import_type}:`, err.message);
                runStatus = 'failed';
                runSummary = `Error: ${err.message}`;
            }

            // Calculate next run
            const nextRunDate = new Date(now);
            const [hours, minutes] = (schedule.schedule_time || '02:00').split(':').map(Number);

            if (schedule.schedule_frequency === 'daily') {
                nextRunDate.setDate(nextRunDate.getDate() + 1);
            } else if (schedule.schedule_frequency === 'weekly') {
                nextRunDate.setDate(nextRunDate.getDate() + 7);
            } else if (schedule.schedule_frequency === 'monthly') {
                nextRunDate.setMonth(nextRunDate.getMonth() + 1);
            }
            nextRunDate.setHours(hours, minutes, 0, 0);

            await base44.asServiceRole.entities.ImportScheduleConfig.update(schedule.id, {
                last_run_at: now.toISOString(),
                next_run_at: nextRunDate.toISOString(),
                last_run_status: runStatus,
                last_run_summary: runSummary,
            });

            // Send notification emails
            const shouldNotify = (runStatus === 'success' && schedule.notify_on_complete !== false) ||
                                 (runStatus !== 'success' && schedule.notify_on_failure !== false);

            if (shouldNotify) {
                try {
                    const subject = runStatus === 'failed'
                        ? `⚠️ Scheduled Import Failed: ${schedule.label}`
                        : runStatus === 'partial'
                        ? `⚠️ Scheduled Import Partial: ${schedule.label}`
                        : `✅ Scheduled Import Complete: ${schedule.label}`;

                    const body = `
                        <h2>Scheduled Import Report</h2>
                        <p><strong>Import:</strong> ${schedule.label}</p>
                        <p><strong>Status:</strong> ${runStatus.toUpperCase()}</p>
                        <p><strong>Summary:</strong> ${runSummary}</p>
                        <p><strong>Run Time:</strong> ${now.toLocaleString()}</p>
                        <p><strong>Next Run:</strong> ${nextRunDate.toLocaleString()}</p>
                        <hr/>
                        <p style="color:#888;font-size:12px;">This is an automated notification from CareMetric.</p>
                    `;

                    await base44.asServiceRole.integrations.Core.SendEmail({
                        to: user.email,
                        subject,
                        body,
                    });
                    console.log(`Notification email sent to ${user.email}`);
                } catch (emailErr) {
                    console.error('Failed to send notification email:', emailErr.message);
                }
            }

            results.push({ import_type: schedule.import_type, status: runStatus, summary: runSummary });
        }

        return Response.json({ success: true, triggered, results, checked: schedules.length });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});