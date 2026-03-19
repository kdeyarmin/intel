import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const MAX_EXEC_MS = 45_000;

const US_STATES = [
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS',
    'KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
    'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
];

Deno.serve(async (req) => {
    const startTime = Date.now();
    
    try {
        const base44 = createClientFromRequest(req);
        
        // Allow service role calls (from scheduled automations) or admin users
        let user = null;
        try { user = await base44.auth.me(); } catch (e) { /* service role call */ }
        const isService = user && user.email && user.email.includes('service+');
        if (user && user.role !== 'admin' && !isService) {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const schedules = await base44.asServiceRole.entities.ImportScheduleConfig.filter({ is_active: true });
        const now = new Date();
        const results = [];

        // Process ONE schedule per invocation to avoid timeout cascades
        let processedOne = false;

        for (const schedule of schedules) {
            if (processedOne) break;
            if (Date.now() - startTime > MAX_EXEC_MS) break;

            const nextRun = schedule.next_run_at ? new Date(schedule.next_run_at) : null;
            if (nextRun && nextRun > now) continue;

            processedOne = true;
            console.log(`Running scheduled import: ${schedule.label} (${schedule.import_type})`);

            let runStatus = 'success';
            let runSummary = '';

            try {
                if (schedule.import_type === 'nppes_registry') {
                    const config = schedule.nppes_config || {};
                    const crawlerPayload: any = {
                        action: 'batch_start',
                        dry_run: false,
                        skip_completed: false,
                        taxonomy_description: config.taxonomy_description || '',
                        entity_type: config.entity_type || '',
                    };

                    if (!config.crawl_all_states) {
                        if (!config.state) {
                            throw new Error('Scheduled NPPES crawler runs require a state when crawl_all_states is disabled');
                        }
                        crawlerPayload.states = [config.state];
                    }
                    if (config.city) crawlerPayload.city = config.city;
                    if (config.postal_code) crawlerPayload.postal_code = config.postal_code;

                    const res = await base44.asServiceRole.functions.invoke('nppesCrawler', crawlerPayload);
                    const data = res.data || res;
                    runSummary = data.message || `Queued ${data.states_queued || 0} state(s) for crawling`;
                    runStatus = data.error ? 'failed' : 'success';
                } else {
                    // CMS data import — use triggerImport which has built-in URLs
                    // Resolve aliases: cms_utilization -> provider_service_utilization
                    const ALIASES = { cms_utilization: 'provider_service_utilization' };
                    const resolvedType = ALIASES[schedule.import_type] || schedule.import_type;
                    const res = await base44.asServiceRole.functions.invoke('triggerImport', {
                        import_type: resolvedType,
                        file_url: schedule.api_url || undefined,
                        year: now.getFullYear(),
                        dry_run: false,
                    });
                    const data = res.data?.result || res.data || res;
                    if (data.partial) {
                        runSummary = `Partial: imported ${data.imported_rows || 0} rows, paused at offset ${data.next_offset}. Will resume on next run.`;
                        runStatus = 'partial';
                    } else {
                        runSummary = `Imported ${data.imported_rows || 0} rows, updated ${data.updated_rows || 0}`;
                        runStatus = 'success';
                    }
                }
            } catch (err) {
                console.error(`Failed import ${schedule.import_type}:`, err.message);
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

            // Email notifications disabled per admin request

            results.push({ import_type: schedule.import_type, status: runStatus, summary: runSummary });
        }

        return Response.json({ success: true, results, checked: schedules.length });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});